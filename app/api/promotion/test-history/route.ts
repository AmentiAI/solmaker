import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'

/**
 * Simple test endpoint to verify what's being returned from promotion_jobs table
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

    console.log('[test-history] Fetching for wallet:', walletAddress)

    // Get raw promotion_jobs data
    const jobs = await sql`
      SELECT
        id,
        wallet_address,
        collection_id,
        status,
        image_url,
        flyer_text,
        subject_count,
        subject_actions,
        created_at,
        completed_at
      FROM promotion_jobs
      WHERE wallet_address = ${walletAddress}
      ORDER BY created_at DESC
      LIMIT 50
    `

    console.log('[test-history] Found jobs:', jobs.length)
    console.log('[test-history] Jobs:', JSON.stringify(jobs, null, 2))

    // Get legacy promotions
    let legacyPromotions: any[] = []
    try {
      legacyPromotions = await sql`
        SELECT
          id,
          wallet_address,
          collection_name,
          image_url,
          flyer_text,
          character_count,
          created_at
        FROM promotions
        WHERE wallet_address = ${walletAddress}
        ORDER BY created_at DESC
        LIMIT 50
      `
      console.log('[test-history] Found legacy promotions:', legacyPromotions.length)
    } catch (e: any) {
      console.log('[test-history] No legacy promotions table or error:', e.message)
    }

    return NextResponse.json({
      wallet: walletAddress,
      jobs: {
        count: jobs.length,
        items: jobs,
      },
      legacy_promotions: {
        count: legacyPromotions.length,
        items: legacyPromotions,
      },
      combined: {
        count: jobs.length + legacyPromotions.length,
        should_show: jobs.length + legacyPromotions.length > 0,
      }
    })
  } catch (error: any) {
    console.error('[test-history] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch', details: error.message },
      { status: 500 }
    )
  }
}
