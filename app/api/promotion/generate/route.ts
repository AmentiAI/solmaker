import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { deductCredits, hasEnoughCredits } from '@/lib/credits/credits'

export async function POST(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  const mapSafetyError = (raw: unknown): string => {
    const s = typeof raw === 'string' ? raw : JSON.stringify(raw)
    const lower = s.toLowerCase()
    // Billing/quota/limit issues should be presented as maintenance to users.
    if (
      lower.includes('billing') ||
      lower.includes('hard limit') ||
      lower.includes('insufficient_quota') ||
      lower.includes('insufficient quota') ||
      lower.includes('quota') ||
      lower.includes('exceeded your current quota') ||
      lower.includes('rate limit') ||
      lower.includes('rate_limit') ||
      lower.includes('payment') ||
      lower.includes('please check your plan')
    ) {
      return 'Platform Undergoing Maitnence'
    }
    // Common OpenAI safety/content policy indicators
    if (
      lower.includes('safety_violations') ||
      lower.includes('content policy') ||
      lower.includes('content_policy_violation') ||
      lower.includes('moderation') ||
      lower.includes('safety') ||
      lower.includes('"sexual"') ||
      lower.includes('[sexual]') ||
      lower.includes('sexual')
    ) {
      return 'Content violation'
    }
    return typeof raw === 'string' && raw.trim() ? raw : 'Failed to generate flyer'
  }

  try {
    const body = await request.json()
    const walletAddress = String(body?.wallet_address || '').trim()
    const collectionId = String(body?.collection_id || '').trim()
    const text = String(body?.text || '').trim()
    const characterCountRaw = body?.character_count
    const noText = Boolean(body?.no_text)
    const actionsRaw = body?.actions
    const subjectType = String(body?.subject_type || 'character').trim().toLowerCase() === 'object' ? 'object' : 'character'
    
    // Validate aspect ratio - supported values: square, portrait, landscape, story
    const validAspectRatios = ['square', 'portrait', 'landscape', 'story']
    const aspectRatioRaw = String(body?.aspect_ratio || 'square').trim().toLowerCase()
    const aspectRatio = validAspectRatios.includes(aspectRatioRaw) ? aspectRatioRaw : 'square'

    if (!walletAddress) return NextResponse.json({ error: 'wallet_address is required' }, { status: 400 })
    if (!collectionId) return NextResponse.json({ error: 'collection_id is required' }, { status: 400 })
    if (!noText && !text) return NextResponse.json({ error: 'text is required' }, { status: 400 })

    const characterCount = Math.max(1, Math.min(8, Number(characterCountRaw ?? 1) || 1))
    const actions: string[] = Array.isArray(actionsRaw)
      ? actionsRaw.slice(0, characterCount).map((a) => String(a ?? '').slice(0, 120))
      : []

    const openaiApiKey = process.env.OPENAI_API_KEY
    if (!openaiApiKey) return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 })

    // Load collection settings (must be owner or accepted collaborator)
    const colRes = await sql`
      SELECT id, name, description, wallet_address, art_style, colors_description, lighting_description, border_requirements
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

    // Randomly pick N style seed prompts from this collection's past generations.
    // We intentionally do NOT "edit" an existing image; we generate a brand-new flyer image.
    let seedPrompts: string[] = []
    try {
      const promptRes = await sql`
        SELECT prompt
        FROM generated_ordinals
        WHERE collection_id = ${collectionId}
          AND prompt IS NOT NULL
          AND prompt <> ''
        ORDER BY RANDOM()
        LIMIT ${characterCount}
      `
      const rows = Array.isArray(promptRes) ? promptRes : []
      seedPrompts = rows.map((r: any) => String(r?.prompt || '')).filter(Boolean)
    } catch {}

    // 1 credit per flyer
    const cost = 1
    const ok = await hasEnoughCredits(walletAddress, cost)
    if (!ok) return NextResponse.json({ error: 'Not enough credits' }, { status: 402 })

    const deducted = await deductCredits(walletAddress, cost, `Promotion flyer generation for collection ${collectionId}`)
    if (!deducted) return NextResponse.json({ error: 'Not enough credits' }, { status: 402 })

    if (seedPrompts.length < characterCount) {
      return NextResponse.json(
        {
          error: `Not enough saved prompts found for this collection yet. Need ${characterCount}, found ${seedPrompts.length}. Generate more images first.`,
        },
        { status: 400 }
      )
    }

    // Queue a job; cron will generate the image and persist history.
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
        ${subjectType},
        ${characterCount},
        ${JSON.stringify(actions)},
        ${aspectRatio}
      )
      RETURNING id
    `) as any[]

    const jobId = Array.isArray(jobRows) && jobRows[0]?.id ? String(jobRows[0].id) : null
    if (!jobId) return NextResponse.json({ error: 'Failed to queue promotion job' }, { status: 500 })

    return NextResponse.json({ job_id: jobId }, { status: 202 })
  } catch (e) {
    console.error('[promotion/generate] Error:', e)
    const msg = e instanceof Error ? e.message : 'Failed to generate flyer'
    return NextResponse.json({ error: mapSafetyError(msg) }, { status: 500 })
  }
}


