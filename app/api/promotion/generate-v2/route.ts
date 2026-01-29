import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { deductCredits, hasEnoughCredits } from '@/lib/credits/credits'

export async function POST(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const body = await request.json()
    const walletAddress = String(body?.wallet_address || '').trim()
    const collectionId = String(body?.collection_id || '').trim()
    const ordinalIdsRaw = body?.ordinal_ids
    const scenePrompt = String(body?.scene_prompt || '').trim()
    const text = String(body?.text || '').trim()
    const noText = Boolean(body?.no_text)
    
    // Validate aspect ratio (only OpenAI-supported sizes)
    const validAspectRatios = ['square', 'portrait', 'landscape']
    const aspectRatioRaw = String(body?.aspect_ratio || 'square').trim().toLowerCase()
    const aspectRatio = validAspectRatios.includes(aspectRatioRaw) ? aspectRatioRaw : 'square'

    if (!walletAddress) return NextResponse.json({ error: 'wallet_address is required' }, { status: 400 })
    if (!collectionId) return NextResponse.json({ error: 'collection_id is required' }, { status: 400 })
    if (!noText && !text) return NextResponse.json({ error: 'text is required when no_text is false' }, { status: 400 })

    // Validate ordinal IDs
    if (!Array.isArray(ordinalIdsRaw) || ordinalIdsRaw.length === 0) {
      return NextResponse.json({ error: 'ordinal_ids must be a non-empty array' }, { status: 400 })
    }
    if (ordinalIdsRaw.length > 8) {
      return NextResponse.json({ error: 'Maximum 8 images allowed' }, { status: 400 })
    }
    
    const ordinalIds = ordinalIdsRaw.map(id => String(id).trim()).filter(Boolean)
    if (ordinalIds.length === 0) {
      return NextResponse.json({ error: 'No valid ordinal IDs provided' }, { status: 400 })
    }

    // Verify collection ownership/collaboration
    const colRes = await sql`
      SELECT id, name, wallet_address, art_style
      FROM collections
      WHERE id = ${collectionId}
      LIMIT 1
    `
    const col = Array.isArray(colRes) ? (colRes[0] as any) : (colRes as any)
    if (!col?.id) return NextResponse.json({ error: 'Collection not found' }, { status: 404 })
    
    const isOwner = String(col.wallet_address) === walletAddress
    if (!isOwner) {
      let isAcceptedCollaborator = false
      try {
        const collabRes = await sql`
          SELECT role
          FROM collection_collaborators
          WHERE collection_id::text = ${String(collectionId)}
            AND wallet_address = ${walletAddress}
            AND status = 'accepted'
          LIMIT 1
        `
        isAcceptedCollaborator = Array.isArray(collabRes) && collabRes.length > 0
      } catch {
        isAcceptedCollaborator = false
      }
      if (!isAcceptedCollaborator) {
        return NextResponse.json({ error: 'Not authorized (must be owner or accepted collaborator)' }, { status: 403 })
      }
    }

    // Verify ordinals exist and belong to this collection
    const ordinalsRes = await sql`
      SELECT id, prompt
      FROM generated_ordinals
      WHERE id = ANY(${ordinalIds}::uuid[])
        AND collection_id = ${collectionId}::uuid
    `
    const foundOrdinals = Array.isArray(ordinalsRes) ? ordinalsRes : []
    if (foundOrdinals.length !== ordinalIds.length) {
      return NextResponse.json({ 
        error: `Some selected images were not found. Found ${foundOrdinals.length} of ${ordinalIds.length} images.` 
      }, { status: 400 })
    }

    // Check credits
    const cost = 1
    const ok = await hasEnoughCredits(walletAddress, cost)
    if (!ok) return NextResponse.json({ error: 'Not enough credits' }, { status: 402 })

    const deducted = await deductCredits(walletAddress, cost, `Promotion flyer v2 for collection ${collectionId}`)
    if (!deducted) return NextResponse.json({ error: 'Not enough credits' }, { status: 402 })

    // Queue a job with the specific ordinal IDs
    const jobRows = (await sql`
      INSERT INTO promotion_jobs (
        wallet_address,
        collection_id,
        status,
        flyer_text,
        no_text,
        subject_type,
        subject_count,
        subject_actions,
        aspect_ratio
      ) VALUES (
        ${walletAddress},
        ${collectionId}::uuid,
        'pending',
        ${text},
        ${noText},
        'selected',
        ${ordinalIds.length},
        ${JSON.stringify({ ordinal_ids: ordinalIds, scene_prompt: scenePrompt })}::jsonb,
        ${aspectRatio}
      )
      RETURNING id
    `) as any[]

    const jobId = Array.isArray(jobRows) && jobRows[0]?.id ? String(jobRows[0].id) : null
    if (!jobId) return NextResponse.json({ error: 'Failed to queue promotion job' }, { status: 500 })

    return NextResponse.json({ job_id: jobId }, { status: 202 })
  } catch (e) {
    console.error('[promotion/generate-v2] Error:', e)
    const msg = e instanceof Error ? e.message : 'Failed to generate flyer'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

