import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'

// DELETE /api/promotion/delete - Delete a saved promotion
export async function DELETE(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const promotionId = searchParams.get('id')
    const walletAddress = searchParams.get('wallet_address')

    if (!promotionId) {
      return NextResponse.json({ error: 'Promotion ID is required' }, { status: 400 })
    }

    if (!walletAddress) {
      return NextResponse.json({ error: 'wallet_address is required' }, { status: 400 })
    }

    // Check if this is a video job (ID starts with "job_") or a regular promotion
    const isVideoJob = String(promotionId).startsWith('job_')
    
    if (isVideoJob) {
      // Delete from promotion_jobs table
      const jobId = String(promotionId).replace('job_', '')
      
      // Verify the job belongs to this wallet
      const job = await sql`
        SELECT id, wallet_address
        FROM promotion_jobs
        WHERE id = ${jobId}::uuid
        LIMIT 1
      ` as any[]

      if (!job || job.length === 0) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 })
      }

      if (String(job[0].wallet_address) !== walletAddress) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
      }

      // Delete the job
      await sql`
        DELETE FROM promotion_jobs
        WHERE id = ${jobId}::uuid
          AND wallet_address = ${walletAddress}
      `
    } else {
      // Delete from promotions table
      // Verify the promotion belongs to this wallet
      const promotion = await sql`
        SELECT id, wallet_address
        FROM promotions
        WHERE id = ${promotionId}::int
        LIMIT 1
      ` as any[]

      if (!promotion || promotion.length === 0) {
        return NextResponse.json({ error: 'Promotion not found' }, { status: 404 })
      }

      if (String(promotion[0].wallet_address) !== walletAddress) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
      }

      // Delete the promotion
      await sql`
        DELETE FROM promotions
        WHERE id = ${promotionId}::int
          AND wallet_address = ${walletAddress}
      `
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[promotion/delete] Error:', e)
    const msg = e instanceof Error ? e.message : 'Failed to delete promotion'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

