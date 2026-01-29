import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'

/**
 * POST /api/marketplace/ordinals/confirm-listing
 * Confirms a listing by storing the seller-signed partial PSBT
 *
 * After seller signs the PSBT (Input 0 = ordinal), they send it back here
 * We update the listing status to 'active' so buyers can purchase it
 */
export async function POST(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const body = await request.json()
    const {
      listing_id,
      seller_wallet,
      signed_psbt_base64,
    } = body

    if (!listing_id) {
      return NextResponse.json({ error: 'listing_id is required' }, { status: 400 })
    }

    if (!seller_wallet) {
      return NextResponse.json({ error: 'seller_wallet is required' }, { status: 400 })
    }

    if (!signed_psbt_base64) {
      return NextResponse.json({ error: 'signed_psbt_base64 is required' }, { status: 400 })
    }

    // Fetch listing
    const listings = await sql`
      SELECT *
      FROM ordinal_listings
      WHERE id = ${listing_id}
      AND seller_wallet = ${seller_wallet}
    ` as any[]

    if (listings.length === 0) {
      return NextResponse.json({
        error: 'Listing not found or you are not the seller'
      }, { status: 404 })
    }

    const listing = listings[0]

    if (listing.status === 'active') {
      return NextResponse.json({
        error: 'Listing is already active',
        listing_id: listing.id
      }, { status: 400 })
    }

    // Update listing with signed PSBT and activate it
    await sql`
      UPDATE ordinal_listings
      SET
        partial_psbt_base64 = ${signed_psbt_base64},
        partial_psbt_hex = ${Buffer.from(signed_psbt_base64, 'base64').toString('hex')},
        status = 'active',
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${listing_id}
    `

    console.log(`✅ Activated listing ${listing_id}`)

    return NextResponse.json({
      success: true,
      listing_id: listing.id,
      inscription_id: listing.inscription_id,
      price_sats: listing.price_sats,
      status: 'active',
      message: 'Listing is now active and visible to buyers',
    })

  } catch (error: any) {
    console.error('Error confirming listing:', error)
    return NextResponse.json({
      error: 'Failed to confirm listing',
      details: error.message
    }, { status: 500 })
  }
}
