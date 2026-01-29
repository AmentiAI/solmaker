import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'

/**
 * POST /api/marketplace/ordinals/confirm-purchase
 * Confirms a purchase after the buyer broadcasts the transaction
 *
 * This is called after the buyer signs and broadcasts the PSBT
 * We update the listing status and create a transaction record
 */
export async function POST(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const body = await request.json()
    const {
      listing_id,
      buyer_wallet,
      tx_id,
      tx_hex,
    } = body

    if (!listing_id) {
      return NextResponse.json({ error: 'listing_id is required' }, { status: 400 })
    }

    if (!buyer_wallet) {
      return NextResponse.json({ error: 'buyer_wallet is required' }, { status: 400 })
    }

    if (!tx_id) {
      return NextResponse.json({ error: 'tx_id is required' }, { status: 400 })
    }

    // Fetch listing
    const listings = await sql`
      SELECT *
      FROM ordinal_listings
      WHERE id = ${listing_id}
      AND status = 'active'
    ` as any[]

    if (listings.length === 0) {
      return NextResponse.json({
        error: 'Listing not found or already sold'
      }, { status: 404 })
    }

    const listing = listings[0]

    // Check if transaction already exists (prevent double-purchase)
    const existingTx = await sql`
      SELECT id FROM ordinal_transactions
      WHERE listing_id = ${listing_id}
      OR tx_id = ${tx_id}
    ` as any[]

    if (existingTx.length > 0) {
      return NextResponse.json({
        error: 'This listing has already been purchased',
        transaction_id: existingTx[0].id
      }, { status: 409 })
    }

    // Update listing status
    await sql`
      UPDATE ordinal_listings
      SET
        status = 'sold',
        sold_to_wallet = ${buyer_wallet},
        sold_tx_id = ${tx_id},
        sold_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${listing_id}
    `

    // Create transaction record
    const txResult = await sql`
      INSERT INTO ordinal_transactions (
        listing_id,
        inscription_id,
        seller_wallet,
        buyer_wallet,
        price_sats,
        price_btc,
        platform_fee_sats,
        tx_id,
        tx_hex,
        status
      ) VALUES (
        ${listing_id},
        ${listing.inscription_id},
        ${listing.seller_wallet},
        ${buyer_wallet},
        ${listing.price_sats},
        ${listing.price_btc},
        ${listing.platform_fee_sats || Math.max(330, Math.floor(listing.price_sats * 0.02))},
        ${tx_id},
        ${tx_hex || null},
        'pending'
      )
      RETURNING id
    ` as any[]

    const transaction = txResult[0]

    console.log(`✅ Confirmed purchase of listing ${listing_id}, tx: ${tx_id}`)

    return NextResponse.json({
      success: true,
      message: 'Purchase confirmed! The ordinal will be transferred once the transaction confirms.',
      listing_id: listing.id,
      inscription_id: listing.inscription_id,
      transaction_id: transaction.id,
      tx_id,
      buyer_wallet,
      seller_wallet: listing.seller_wallet,
    })

  } catch (error: any) {
    console.error('Error confirming purchase:', error)
    return NextResponse.json({
      error: 'Failed to confirm purchase',
      details: error.message
    }, { status: 500 })
  }
}
