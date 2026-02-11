import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'

/**
 * Debug endpoint to check promotion_jobs table
 * Shows pending, processing, completed, and failed jobs for a wallet
 */
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

    // Get all jobs for this wallet
    const jobs = await sql`
      SELECT
        id,
        wallet_address,
        collection_id,
        status,
        flyer_text,
        no_text,
        subject_type,
        subject_count,
        subject_actions,
        image_url,
        error_message,
        created_at,
        started_at,
        completed_at
      FROM promotion_jobs
      WHERE wallet_address = ${walletAddress}
      ORDER BY created_at DESC
      LIMIT 50
    `

    // Count by status
    const statusCounts = {
      pending: jobs.filter((j: any) => j.status === 'pending').length,
      processing: jobs.filter((j: any) => j.status === 'processing').length,
      completed: jobs.filter((j: any) => j.status === 'completed').length,
      failed: jobs.filter((j: any) => j.status === 'failed').length,
    }

    return NextResponse.json({
      total: jobs.length,
      statusCounts,
      jobs: jobs.map((job: any) => ({
        ...job,
        subject_actions: typeof job.subject_actions === 'string'
          ? JSON.parse(job.subject_actions)
          : job.subject_actions
      }))
    })
  } catch (error: any) {
    console.error('[promotion/debug-jobs] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch debug info', details: error.message },
      { status: 500 }
    )
  }
}
