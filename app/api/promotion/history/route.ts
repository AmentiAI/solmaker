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
    // Be resilient to schema differences (subject_type and collection_name may not exist).
    let promotions: any[] = []
    try {
      // Join with collections to get collection_name
      promotions = (await sql`
        SELECT
          p.id,
          p.wallet_address,
          p.collection_id,
          c.name as collection_name,
          p.image_url,
          p.flyer_text,
          p.character_count,
          p.character_actions,
          p.no_text,
          p.subject_type,
          p.created_at
        FROM promotions p
        LEFT JOIN collections c ON c.id = p.collection_id
        WHERE p.wallet_address = ${walletAddress}
        ORDER BY p.created_at DESC
        LIMIT 100
      `) as any[]
    } catch (e: any) {
      const msg = String(e?.message || e || '').toLowerCase()
      if (msg.includes('subject_type') && msg.includes('does not exist')) {
        promotions = (await sql`
          SELECT
            p.id,
            p.wallet_address,
            p.collection_id,
            c.name as collection_name,
            p.image_url,
            p.flyer_text,
            p.character_count,
            p.character_actions,
            p.no_text,
            p.created_at
          FROM promotions p
          LEFT JOIN collections c ON c.id = p.collection_id
          WHERE p.wallet_address = ${walletAddress}
          ORDER BY p.created_at DESC
          LIMIT 100
        `) as any[]
      } else if (msg.includes('does not exist')) {
        // Promotions table might be empty or not exist - that's ok
        console.log('[promotion/history] Promotions table issue:', msg)
        promotions = []
      } else {
        throw e
      }
    }

    // Fetch ALL promotion jobs from promotion_jobs table (flyers AND videos, regardless of status)
    // This includes pending, processing, completed, and failed jobs
    let promotionJobs: any[] = []
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
          pj.completed_at
        FROM promotion_jobs pj
        LEFT JOIN collections c ON c.id = pj.collection_id
        WHERE pj.wallet_address = ${walletAddress}
        ORDER BY pj.created_at DESC
        LIMIT 200
      `) as any[]

      // Transform promotion jobs to match promotion history format
      promotionJobs = jobs.map((job: any) => {
        let actions = job.character_actions
        let actionsStr = ''

        if (typeof actions === 'string') {
          actionsStr = actions
          try {
            actions = JSON.parse(actions)
          } catch {
            actions = []
          }
        } else if (typeof actions === 'object') {
          actionsStr = JSON.stringify(actions)
        }

        // Detect if it's a video job by checking content_type in subject_actions
        const isVideoJob =
          (typeof actions === 'object' && actions?.content_type === 'video') ||
          (actionsStr.includes('"content_type":"video"')) ||
          (actionsStr.includes('"content_type": "video"'))

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
          // Additional fields for jobs
          job_status: job.status, // 'pending', 'processing', 'completed', 'failed'
          error_message: job.error_message,
          started_at: job.started_at,
          completed_at: job.completed_at,
          is_video_job: isVideoJob,
        }
      })
    } catch (e: any) {
      console.error('[promotion/history] Error fetching promotion jobs:', e)
      // Don't fail the whole request if jobs query fails
      promotionJobs = []
    }

    // Combine and sort by created_at DESC
    const allItems = [...promotions, ...promotionJobs].sort((a, b) => {
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
