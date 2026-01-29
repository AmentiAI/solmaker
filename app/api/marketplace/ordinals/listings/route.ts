import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'

/**
 * GET /api/marketplace/ordinals/listings
 * Fetches all active ordinal listings
 */
export async function GET(req: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status') || 'active'
    const seller_wallet = searchParams.get('seller_wallet')
    const collection_symbol = searchParams.get('collection')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    // Build query
    let listings: any[]

    if (seller_wallet) {
      // Get seller's listings
      listings = await sql`
        SELECT *
        FROM ordinal_listings
        WHERE seller_wallet = ${seller_wallet}
        ${status !== 'all' ? sql`AND status = ${status}` : sql``}
        ORDER BY created_at DESC
        LIMIT ${limit}
        OFFSET ${offset}
      ` as any[]
    } else if (collection_symbol) {
      // Get listings for a specific collection
      listings = await sql`
        SELECT *
        FROM ordinal_listings
        WHERE collection_symbol = ${collection_symbol}
        AND status = ${status}
        ORDER BY price_sats ASC
        LIMIT ${limit}
        OFFSET ${offset}
      ` as any[]
    } else {
      // Get all active listings
      listings = await sql`
        SELECT *
        FROM ordinal_listings
        WHERE status = ${status}
        ORDER BY created_at DESC
        LIMIT ${limit}
        OFFSET ${offset}
      ` as any[]
    }

    // Get total count
    const countResult = await sql`
      SELECT COUNT(*)::int as total
      FROM ordinal_listings
      WHERE status = ${status}
      ${seller_wallet ? sql`AND seller_wallet = ${seller_wallet}` : sql``}
      ${collection_symbol ? sql`AND collection_symbol = ${collection_symbol}` : sql``}
    ` as any[]

    const total = countResult[0]?.total || 0

    return NextResponse.json({
      success: true,
      listings,
      count: listings.length,
      total,
      limit,
      offset,
    })

  } catch (error: any) {
    console.error('Error fetching ordinal listings:', error)
    return NextResponse.json({
      error: 'Failed to fetch listings',
      details: error.message
    }, { status: 500 })
  }
}
