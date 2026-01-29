import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'

export async function GET(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const walletAddress = searchParams.get('wallet_address')

    if (!walletAddress) {
      return NextResponse.json({ error: 'wallet_address is required' }, { status: 400 })
    }

    // Fetch promotion history for this wallet, ordered by most recent first.
    // Be resilient to schema differences (subject_type may not exist).
    let promotions: any[] = []
    try {
      promotions = (await sql`
        SELECT
          id,
          wallet_address,
          collection_id,
          collection_name,
          image_url,
          flyer_text,
          character_count,
          character_actions,
          no_text,
          subject_type,
          created_at
        FROM promotions
        WHERE wallet_address = ${walletAddress}
        ORDER BY created_at DESC
        LIMIT 100
      `) as any[]
    } catch (e: any) {
      const msg = String(e?.message || e || '').toLowerCase()
      if (msg.includes('subject_type') && msg.includes('does not exist')) {
        promotions = (await sql`
          SELECT
            id,
            wallet_address,
            collection_id,
            collection_name,
            image_url,
            flyer_text,
            character_count,
            character_actions,
            no_text,
            created_at
          FROM promotions
          WHERE wallet_address = ${walletAddress}
          ORDER BY created_at DESC
          LIMIT 100
        `) as any[]
      } else {
        throw e
      }
    }

    // Also fetch ALL video job attempts from promotion_jobs table (regardless of status)
    // This includes pending, processing, completed, and failed video jobs
    let videoJobs: any[] = []
    try {
      const jobs = (await sql`
        SELECT
          pj.id,
          pj.wallet_address,
          pj.collection_id,
          c.name as collection_name,
          pj.image_url,
          pj.flyer_text,
          pj.subject_count as character_count,
          pj.subject_actions as character_actions,
          pj.no_text,
          pj.subject_type,
          pj.status,
          pj.error_message,
          pj.created_at,
          pj.started_at,
          pj.completed_at,
          pj.subject_actions::text as subject_actions_json
        FROM promotion_jobs pj
        LEFT JOIN collections c ON c.id = pj.collection_id
        WHERE pj.wallet_address = ${walletAddress}
          AND (
            -- Video jobs: check if subject_actions JSON contains content_type: 'video'
            (pj.subject_actions::text LIKE '%"content_type":"video"%')
            OR (pj.subject_actions::text LIKE '%"content_type": "video"%')
            OR (pj.subject_actions::text LIKE '%content_type%video%')
            OR (pj.subject_actions::jsonb->>'content_type' = 'video')
          )
        ORDER BY pj.created_at DESC
        LIMIT 200
      `) as any[]

      // Transform video jobs to match promotion history format
      videoJobs = jobs.map((job: any) => {
        let actions = job.character_actions
        if (typeof actions === 'string') {
          try {
            actions = JSON.parse(actions)
          } catch {
            actions = []
          }
        }

        return {
          id: `job_${job.id}`, // Prefix to distinguish from promotions table IDs
          wallet_address: job.wallet_address,
          collection_id: job.collection_id,
          collection_name: job.collection_name || 'Unknown Collection',
          image_url: job.image_url || null,
          flyer_text: job.flyer_text || null,
          character_count: job.character_count || 1,
          character_actions: actions,
          no_text: job.no_text || false,
          subject_type: job.subject_type || 'selected',
          created_at: job.created_at,
          // Additional fields for video jobs
          job_status: job.status, // 'pending', 'processing', 'completed', 'failed'
          error_message: job.error_message,
          started_at: job.started_at,
          completed_at: job.completed_at,
          is_video_job: true,
        }
      })
    } catch (e: any) {
      console.error('[promotion/history] Error fetching video jobs:', e)
      // Don't fail the whole request if video jobs query fails
    }

    // Combine and sort by created_at DESC
    const allItems = [...promotions, ...videoJobs].sort((a, b) => {
      const dateA = new Date(a.created_at).getTime()
      const dateB = new Date(b.created_at).getTime()
      return dateB - dateA
    })

    return NextResponse.json({ promotions: allItems })
  } catch (e) {
    console.error('[promotion/history] Error:', e)
    const msg = e instanceof Error ? e.message : 'Failed to fetch promotion history'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
