import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'

// POST /api/marketplace/listings/[id]/cancel - Cancel/remove a marketplace listing
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const { id: listingId } = await params
    const body = await req.json()
    const { wallet_address } = body

    if (!wallet_address) {
      return NextResponse.json({ error: 'Wallet address required' }, { status: 400 })
    }

    // Get listing and verify ownership
    const listingResult = await sql`
      SELECT ml.*, c.wallet_address as owner_wallet
      FROM collection_marketplace_listings ml
      JOIN collections c ON ml.collection_id = c.id
      WHERE ml.id = ${listingId}
    ` as any[]

    if (listingResult.length === 0) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
    }

    const listing = listingResult[0]

    // Verify the user owns this listing
    if (listing.seller_wallet !== wallet_address && listing.owner_wallet !== wallet_address) {
      return NextResponse.json({ error: 'Not authorized to cancel this listing' }, { status: 403 })
    }

    // Check if listing is already cancelled/sold
    if (listing.status !== 'active') {
      return NextResponse.json({ error: `Listing is already ${listing.status}` }, { status: 400 })
    }

    // Check for pending BTC payments
    const pendingPayments = await sql`
      SELECT id, buyer_wallet, btc_amount, created_at
      FROM marketplace_pending_payments
      WHERE listing_id = ${listingId}
      AND status = 'pending'
      AND expires_at > NOW()
    ` as any[]

    if (pendingPayments.length > 0) {
      return NextResponse.json({
        error: 'Cannot cancel listing - there are pending BTC payments awaiting confirmation',
        pending_count: pendingPayments.length,
        details: 'Wait for pending payments to expire or complete before cancelling.',
      }, { status: 400 })
    }

    // Cancel the listing
    await sql`
      UPDATE collection_marketplace_listings
      SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
      WHERE id = ${listingId}
    `

    // Reset collection marketplace status and set collection_status back to draft
    await sql`
      UPDATE collections
      SET marketplace_status = NULL, 
          marketplace_listing_id = NULL, 
          collection_status = 'draft',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${listing.collection_id}
    `

    return NextResponse.json({
      success: true,
      message: 'Listing cancelled successfully',
    })
  } catch (error: any) {
    console.error('Error cancelling listing:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to cancel listing' },
      { status: 500 }
    )
  }
}

