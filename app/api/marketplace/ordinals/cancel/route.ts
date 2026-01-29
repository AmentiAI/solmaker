import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'

/**
 * POST /api/marketplace/ordinals/cancel
 * Cancels an active ordinal listing (only by the seller)
 */
export async function POST(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const body = await request.json()
    const { listing_id, seller_wallet } = body

    if (!listing_id) {
      return NextResponse.json({ error: 'listing_id is required' }, { status: 400 })
    }

    if (!seller_wallet) {
      return NextResponse.json({ error: 'seller_wallet is required' }, { status: 400 })
    }

    // Fetch listing and verify ownership
    const listings = await sql`
      SELECT id, inscription_id, seller_wallet, status
      FROM ordinal_listings
      WHERE id = ${listing_id}
    ` as any[]

    if (listings.length === 0) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
    }

    const listing = listings[0]

    // Verify the caller is the seller
    if (listing.seller_wallet !== seller_wallet) {
      return NextResponse.json({ error: 'Only the seller can cancel this listing' }, { status: 403 })
    }

    // Check if listing can be cancelled
    if (listing.status === 'sold') {
      return NextResponse.json({ error: 'Cannot cancel a sold listing' }, { status: 400 })
    }

    if (listing.status === 'cancelled') {
      return NextResponse.json({ error: 'Listing is already cancelled' }, { status: 400 })
    }

    // Cancel the listing
    await sql`
      UPDATE ordinal_listings
      SET 
        status = 'cancelled',
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${listing_id}
    `

    console.log(`❌ Cancelled listing ${listing_id} (inscription: ${listing.inscription_id})`)

    return NextResponse.json({
      success: true,
      message: 'Listing cancelled successfully',
      listing_id: listing.id,
      inscription_id: listing.inscription_id,
    })

  } catch (error: any) {
    console.error('Error cancelling listing:', error)
    return NextResponse.json({
      error: 'Failed to cancel listing',
      details: error.message
    }, { status: 500 })
  }
}
