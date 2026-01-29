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
    const videoSourceType = String(body?.video_source_type || 'collection').trim()
    const videoScene = String(body?.video_scene || '').trim()
    const videoActions = String(body?.video_actions || '').trim()
    const videoSpeech = String(body?.video_speech || '').trim()
    
    // Validate aspect ratio
    const validAspectRatios = ['square', 'portrait', 'landscape']
    const aspectRatioRaw = String(body?.aspect_ratio || 'square').trim().toLowerCase()
    const aspectRatio = validAspectRatios.includes(aspectRatioRaw) ? aspectRatioRaw : 'square'

    if (!walletAddress) return NextResponse.json({ error: 'wallet_address is required' }, { status: 400 })

    let collectionId: string | null = null
    let ordinalIds: string[] = []
    let uploadedImageUrl: string | null = null
    let flyerId: string | null = null

    // Handle different source types
    if (videoSourceType === 'collection') {
      const collectionIdRaw = String(body?.collection_id || '').trim()
      const ordinalIdsRaw = body?.ordinal_ids

      if (!collectionIdRaw) return NextResponse.json({ error: 'collection_id is required for collection source' }, { status: 400 })
      if (!Array.isArray(ordinalIdsRaw) || ordinalIdsRaw.length === 0) {
        return NextResponse.json({ error: 'ordinal_ids must be a non-empty array' }, { status: 400 })
      }
      if (ordinalIdsRaw.length > 8) {
        return NextResponse.json({ error: 'Maximum 8 images allowed' }, { status: 400 })
      }

      collectionId = collectionIdRaw
      ordinalIds = ordinalIdsRaw.map(id => String(id).trim()).filter(Boolean)

      if (ordinalIds.length === 0) {
        return NextResponse.json({ error: 'No valid ordinal IDs provided' }, { status: 400 })
      }

      // Verify collection ownership/collaboration
      const colRes = await sql`
        SELECT id, name, wallet_address, art_style
        FROM collections
        WHERE id = ${collectionId}::uuid
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
    } else if (videoSourceType === 'flyer') {
      const flyerIdRaw = String(body?.flyer_id || '').trim()
      if (!flyerIdRaw) return NextResponse.json({ error: 'flyer_id is required for flyer source' }, { status: 400 })
      
      // Check if it's a job_ prefixed ID (UUID from promotion_jobs) or regular ID (INTEGER from promotions)
      const isJobId = flyerIdRaw.startsWith('job_')
      const cleanId = isJobId ? flyerIdRaw.replace('job_', '') : flyerIdRaw
      
      let flyer: any = null
      
      if (isJobId) {
        // Try promotion_jobs table first (UUID)
        const jobRes = await sql`
          SELECT id, wallet_address, collection_id, image_url
          FROM promotion_jobs
          WHERE id = ${cleanId}::uuid
            AND wallet_address = ${walletAddress}
          LIMIT 1
        `
        flyer = Array.isArray(jobRes) ? (jobRes[0] as any) : null
      } else {
        // Try promotions table (INTEGER)
        const flyerRes = await sql`
          SELECT id, wallet_address, collection_id, image_url
          FROM promotions
          WHERE id = ${parseInt(cleanId)}
            AND wallet_address = ${walletAddress}
          LIMIT 1
        `
        flyer = Array.isArray(flyerRes) ? (flyerRes[0] as any) : null
        
        // If not found in promotions, try promotion_jobs as fallback (in case it's actually a UUID without prefix)
        if (!flyer) {
          try {
            const jobRes = await sql`
              SELECT id, wallet_address, collection_id, image_url
              FROM promotion_jobs
              WHERE id = ${cleanId}::uuid
                AND wallet_address = ${walletAddress}
              LIMIT 1
            `
            flyer = Array.isArray(jobRes) ? (jobRes[0] as any) : null
          } catch {
            // Ignore if UUID cast fails
          }
        }
      }
      
      if (!flyer || !flyer.image_url) {
        return NextResponse.json({ error: 'Flyer not found or not owned by you' }, { status: 404 })
      }
      
      uploadedImageUrl = flyer.image_url
      collectionId = flyer.collection_id
      flyerId = isJobId ? cleanId : String(flyer.id) // Store the actual ID for later use
    } else if (videoSourceType === 'upload') {
      const uploadedImageUrlRaw = String(body?.uploaded_image_url || '').trim()
      if (!uploadedImageUrlRaw) return NextResponse.json({ error: 'uploaded_image_url is required for upload source' }, { status: 400 })
      uploadedImageUrl = uploadedImageUrlRaw
    } else {
      return NextResponse.json({ error: 'Invalid video_source_type. Must be collection, flyer, or upload' }, { status: 400 })
    }

    // Check credits (4 credits for video)
    const cost = 4
    const ok = await hasEnoughCredits(walletAddress, cost)
    if (!ok) return NextResponse.json({ error: 'Not enough credits' }, { status: 402 })

    const deducted = await deductCredits(walletAddress, cost, `Promotion video for collection ${collectionId}`)
    if (!deducted) return NextResponse.json({ error: 'Not enough credits' }, { status: 402 })

    // Queue a job with the video source data
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
        ${collectionId || null},
        'pending',
        ${null},
        ${true},
        'selected',
        ${videoSourceType === 'collection' ? ordinalIds.length : 1},
        ${JSON.stringify({ 
          video_source_type: videoSourceType,
          ordinal_ids: videoSourceType === 'collection' ? ordinalIds : null,
          flyer_id: videoSourceType === 'flyer' ? flyerId : null,
          uploaded_image_url: videoSourceType === 'upload' ? uploadedImageUrl : null,
          video_scene: videoScene,
          video_actions: videoActions,
          video_speech: videoSpeech,
          content_type: 'video'
        })}::jsonb,
        ${aspectRatio}
      )
      RETURNING id
    `) as any[]

    const jobId = Array.isArray(jobRows) && jobRows[0]?.id ? String(jobRows[0].id) : null
    if (!jobId) return NextResponse.json({ error: 'Failed to queue promotion job' }, { status: 500 })

    return NextResponse.json({ job_id: jobId }, { status: 202 })
  } catch (e) {
    console.error('[promotion/generate-video] Error:', e)
    const msg = e instanceof Error ? e.message : 'Failed to generate video'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

