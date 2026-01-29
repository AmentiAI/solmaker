import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { releaseExpiredReservationsBatch } from '@/lib/reservation-utils'

// Force dynamic rendering
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/cron/release-expired-locks - Release expired ordinal locks (called by Vercel Cron)
 * This runs every minute to release locks that are over 2 minutes old
 */
export async function GET(request: NextRequest) {
  // Verify this is a cron request (skip in development if no CRON_SECRET)
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  
  // Only require auth if CRON_SECRET is set (production)
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    // Release expired reservations (locks over 2 minutes old)
    const releasedCount = await releaseExpiredReservationsBatch(100)
    
    console.log(`[Cron] Released ${releasedCount} expired lock(s)`)

    return NextResponse.json({
      success: true,
      released: releasedCount,
      message: `Released ${releasedCount} expired lock(s)`,
    })
  } catch (error: any) {
    console.error('[Cron] Error releasing expired locks:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to release expired locks' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/cron/release-expired-locks - Manual trigger (for testing)
 */
export async function POST(request: NextRequest) {
  return GET(request)
}

