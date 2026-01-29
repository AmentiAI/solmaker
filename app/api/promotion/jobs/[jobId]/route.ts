import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'

// GET /api/promotion/jobs/[jobId] - fetch job status/result
export async function GET(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  if (!sql) return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })

  try {
    const { jobId } = await params
    const { searchParams } = new URL(request.url)
    const walletAddress = String(searchParams.get('wallet_address') || '').trim()
    if (!walletAddress) return NextResponse.json({ error: 'wallet_address is required' }, { status: 400 })

    const rows = (await sql`
      SELECT
        id,
        wallet_address,
        collection_id,
        status,
        error_message,
        created_at,
        started_at,
        completed_at,
        image_url
      FROM promotion_jobs
      WHERE id = ${jobId}::uuid
      LIMIT 1
    `) as any[]

    const job = Array.isArray(rows) ? rows[0] : null
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    if (String(job.wallet_address) !== walletAddress) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    return NextResponse.json({ job })
  } catch (e) {
    console.error('[promotion/jobs] Error:', e)
    const msg = e instanceof Error ? e.message : 'Failed to fetch job'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}


