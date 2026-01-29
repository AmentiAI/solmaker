import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { checkAuthorizationServer } from '@/lib/auth/access-control'

// GET /api/marketplace/listings/[id] - Get a specific listing
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const { id: listingId } = await params

    const result = await sql`
      SELECT
        ml.*,
        c.name as collection_name,
        c.description as collection_description,
        c.created_at as collection_created_at,
        (SELECT COUNT(*) FROM generated_ordinals WHERE collection_id = c.id) as ordinal_count,
        (SELECT json_agg(image_url) FROM (
          SELECT image_url FROM generated_ordinals
          WHERE collection_id = c.id
          ORDER BY RANDOM()
          LIMIT 12
        ) samples) as sample_images
      FROM collection_marketplace_listings ml
      JOIN collections c ON ml.collection_id = c.id
      WHERE ml.id = ${listingId}
    ` as any[]

    if (!result || result.length === 0) {
      return NextResponse.json(
        { error: 'Listing not found' },
        { status: 404 }
      )
    }

    const listing = result[0]

    // Check for pending BTC payments on this listing
    const pendingPayment = await sql`
      SELECT id, buyer_wallet, expires_at, payment_txid, confirmations
      FROM marketplace_pending_payments
      WHERE listing_id = ${listingId}
        AND status = 'pending'
        AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1
    ` as any[]

    // Check if already sold
    const completedSale = await sql`
      SELECT id, buyer_wallet, completed_at
      FROM marketplace_transactions
      WHERE listing_id = ${listingId}
        AND status = 'completed'
      LIMIT 1
    ` as any[]

    return NextResponse.json({
      listing,
      pending_payment: pendingPayment.length > 0 ? {
        has_pending: true,
        buyer_wallet: pendingPayment[0].buyer_wallet,
        expires_at: pendingPayment[0].expires_at,
        has_txid: !!pendingPayment[0].payment_txid,
        confirmations: pendingPayment[0].confirmations,
      } : null,
      is_sold: completedSale.length > 0,
      sold_to: completedSale.length > 0 ? completedSale[0].buyer_wallet : null,
    })
  } catch (error) {
    console.error('Error fetching marketplace listing:', error)
    return NextResponse.json(
      { error: 'Failed to fetch marketplace listing' },
      { status: 500 }
    )
  }
}

// PATCH /api/marketplace/listings/[id] - Update a listing
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const { id: listingId } = await params
    const body = await req.json()
    const { seller_wallet, action, price_credits, price_btc, seller_btc_address, payment_type, title, description, included_promo_urls, admin_override } = body

    // Get current listing
    const listingResult = await sql`
      SELECT * FROM collection_marketplace_listings WHERE id = ${listingId}
    ` as any[]

    if (!listingResult || listingResult.length === 0) {
      return NextResponse.json(
        { error: 'Listing not found' },
        { status: 404 }
      )
    }

    const listing = listingResult[0]

    // Check if admin override is enabled
    let isAdmin = false
    if (admin_override && seller_wallet) {
      isAdmin = await checkAuthorizationServer(seller_wallet, sql)
    }

    // If not admin, require seller_wallet and check ownership
    if (!isAdmin) {
      if (!seller_wallet) {
        return NextResponse.json(
          { error: 'seller_wallet is required' },
          { status: 400 }
        )
      }

      if (listing.seller_wallet !== seller_wallet) {
        return NextResponse.json(
          { error: 'You do not own this listing' },
          { status: 403 }
        )
      }
    }

    if (action === 'cancel') {
      // Cancel the listing
      await sql`
        UPDATE collection_marketplace_listings
        SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
        WHERE id = ${listingId}
      `

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
        message: 'Listing cancelled',
      })
    } else {
      // Update listing details
      // Handle price_credits constraint: if payment_type is 'btc' and price_credits is null/0, set to minimal value
      // Need to check both the incoming payment_type and the current listing's payment_type
      const finalPaymentType = payment_type !== undefined ? payment_type : listing.payment_type
      let creditsValue = price_credits
      
      // If payment type is 'btc' (either from update or current), ensure price_credits is not null
      if (finalPaymentType === 'btc' && (price_credits === null || price_credits === undefined || price_credits === 0)) {
        creditsValue = 0.01 // Minimal value to satisfy NOT NULL CHECK constraint
      }
      
      if (payment_type !== undefined) {
        await sql`UPDATE collection_marketplace_listings SET payment_type = ${payment_type}, updated_at = CURRENT_TIMESTAMP WHERE id = ${listingId}`
      }
      if (price_credits !== undefined) {
        await sql`UPDATE collection_marketplace_listings SET price_credits = ${creditsValue}, updated_at = CURRENT_TIMESTAMP WHERE id = ${listingId}`
      }
      if (price_btc !== undefined) {
        await sql`UPDATE collection_marketplace_listings SET price_btc = ${price_btc}, updated_at = CURRENT_TIMESTAMP WHERE id = ${listingId}`
      }
      if (seller_btc_address !== undefined) {
        await sql`UPDATE collection_marketplace_listings SET seller_btc_address = ${seller_btc_address}, updated_at = CURRENT_TIMESTAMP WHERE id = ${listingId}`
      }
      if (title !== undefined) {
        await sql`UPDATE collection_marketplace_listings SET title = ${title}, updated_at = CURRENT_TIMESTAMP WHERE id = ${listingId}`
      }
      if (description !== undefined) {
        await sql`UPDATE collection_marketplace_listings SET description = ${description}, updated_at = CURRENT_TIMESTAMP WHERE id = ${listingId}`
      }
      if (included_promo_urls !== undefined) {
        await sql`UPDATE collection_marketplace_listings SET included_promo_urls = ${included_promo_urls}, updated_at = CURRENT_TIMESTAMP WHERE id = ${listingId}`
      }

      return NextResponse.json({
        success: true,
        message: 'Listing updated',
      })
    }
  } catch (error) {
    console.error('Error updating marketplace listing:', error)
    return NextResponse.json(
      { error: 'Failed to update marketplace listing' },
      { status: 500 }
    )
  }
}

// DELETE /api/marketplace/listings/[id] - Delete a listing (admin only)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const { id: listingId } = await params
    const { searchParams } = new URL(req.url)
    const walletAddress = searchParams.get('wallet_address')

    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Wallet address required' },
        { status: 401 }
      )
    }

    // Check admin authorization
    const isAuthorized = await checkAuthorizationServer(walletAddress, sql)
    if (!isAuthorized) {
      return NextResponse.json(
        { error: 'Unauthorized. Admin access only.' },
        { status: 403 }
      )
    }

    const result = await sql`
      UPDATE collection_marketplace_listings
      SET status = 'removed', updated_at = CURRENT_TIMESTAMP
      WHERE id = ${listingId}
      RETURNING collection_id
    ` as any[]

    if (!result || result.length === 0) {
      return NextResponse.json(
        { error: 'Listing not found' },
        { status: 404 }
      )
    }

    await sql`
      UPDATE collections
      SET marketplace_status = NULL, 
          marketplace_listing_id = NULL, 
          collection_status = 'draft',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${result[0].collection_id}
    `

    return NextResponse.json({
      success: true,
      message: 'Listing removed',
    })
  } catch (error) {
    console.error('Error removing marketplace listing:', error)
    return NextResponse.json(
      { error: 'Failed to remove marketplace listing' },
      { status: 500 }
    )
  }
}
