import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'

/**
 * Admin debug endpoint to view all promotion jobs with full details
 * Shows database state for troubleshooting
 */
export async function GET(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const walletAddress = searchParams.get('wallet_address')
    const limit = parseInt(searchParams.get('limit') || '50')

    // Get all jobs
    const query = walletAddress
      ? sql`
          SELECT
            pj.id,
            pj.wallet_address,
            pj.collection_id,
            c.name as collection_name,
            pj.status,
            pj.flyer_text,
            pj.no_text,
            pj.subject_type,
            pj.subject_count,
            pj.subject_actions,
            pj.aspect_ratio,
            pj.image_url,
            pj.error_message,
            pj.created_at,
            pj.started_at,
            pj.completed_at,
            CASE
              WHEN pj.image_url IS NOT NULL THEN true
              ELSE false
            END as has_image
          FROM promotion_jobs pj
          LEFT JOIN collections c ON c.id = pj.collection_id
          WHERE pj.wallet_address = ${walletAddress}
          ORDER BY pj.created_at DESC
          LIMIT ${limit}
        `
      : sql`
          SELECT
            pj.id,
            pj.wallet_address,
            pj.collection_id,
            c.name as collection_name,
            pj.status,
            pj.flyer_text,
            pj.no_text,
            pj.subject_type,
            pj.subject_count,
            pj.subject_actions,
            pj.aspect_ratio,
            pj.image_url,
            pj.error_message,
            pj.created_at,
            pj.started_at,
            pj.completed_at,
            CASE
              WHEN pj.image_url IS NOT NULL THEN true
              ELSE false
            END as has_image
          FROM promotion_jobs pj
          LEFT JOIN collections c ON c.id = pj.collection_id
          ORDER BY pj.created_at DESC
          LIMIT ${limit}
        `

    const jobs = await query

    // Calculate statistics
    const stats = {
      total: jobs.length,
      by_status: {
        pending: jobs.filter((j: any) => j.status === 'pending').length,
        processing: jobs.filter((j: any) => j.status === 'processing').length,
        completed: jobs.filter((j: any) => j.status === 'completed').length,
        failed: jobs.filter((j: any) => j.status === 'failed').length,
      },
      with_image: jobs.filter((j: any) => j.has_image).length,
      without_image: jobs.filter((j: any) => !j.has_image).length,
    }

    // Also get legacy promotions table data for comparison
    let legacyPromotions: any[] = []
    try {
      const legacyQuery = walletAddress
        ? sql`
            SELECT id, wallet_address, collection_name, image_url, created_at
            FROM promotions
            WHERE wallet_address = ${walletAddress}
            ORDER BY created_at DESC
            LIMIT 20
          `
        : sql`
            SELECT id, wallet_address, collection_name, image_url, created_at
            FROM promotions
            ORDER BY created_at DESC
            LIMIT 20
          `

      legacyPromotions = await legacyQuery
    } catch (e: any) {
      console.log('[admin-debug] Could not fetch legacy promotions:', e.message)
    }

    return NextResponse.json({
      success: true,
      filter: walletAddress ? `wallet: ${walletAddress}` : 'all wallets',
      stats,
      jobs: jobs.map((job: any) => ({
        id: job.id,
        wallet: job.wallet_address,
        collection: job.collection_name || 'N/A',
        status: job.status,
        has_image: job.has_image,
        image_url: job.image_url ? (job.image_url.substring(0, 60) + '...') : null,
        flyer_text: job.flyer_text ? (job.flyer_text.substring(0, 40) + '...') : null,
        subject_type: job.subject_type,
        subject_count: job.subject_count,
        error: job.error_message ? (job.error_message.substring(0, 100) + '...') : null,
        created_at: job.created_at,
        started_at: job.started_at,
        completed_at: job.completed_at,
        full_image_url: job.image_url, // Include full URL for debugging
      })),
      legacy_promotions: {
        count: legacyPromotions.length,
        items: legacyPromotions.map((p: any) => ({
          id: p.id,
          wallet: p.wallet_address,
          collection: p.collection_name,
          has_image: !!p.image_url,
          created_at: p.created_at,
        })),
      },
    })
  } catch (error: any) {
    console.error('[promotion/admin-debug] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch debug info', details: error.message },
      { status: 500 }
    )
  }
}
