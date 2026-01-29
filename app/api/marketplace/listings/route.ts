import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { requireWalletAuth } from '@/lib/auth/signature-verification'

// GET /api/marketplace/listings - Get all active marketplace listings
export async function GET(req: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status') || 'active'
    const sellerWallet = searchParams.get('seller_wallet')

    // Optimized query: Use LEFT JOIN with aggregation instead of nested subqueries
    let listings
    if (sellerWallet) {
      listings = await sql`
        SELECT
          ml.*,
          c.name as collection_name,
          c.description as collection_description,
          c.created_at as collection_created_at,
          COALESCE(counts.ordinal_count, 0) as ordinal_count,
          samples.sample_image,
          pending.has_pending_payment,
          pending.pending_buyer_wallet
        FROM collection_marketplace_listings ml
        JOIN collections c ON ml.collection_id = c.id
        LEFT JOIN (
          SELECT collection_id, COUNT(*)::int as ordinal_count
          FROM generated_ordinals
          GROUP BY collection_id
        ) counts ON counts.collection_id = c.id
        LEFT JOIN LATERAL (
          SELECT COALESCE(compressed_image_url, image_url) as sample_image
          FROM generated_ordinals
          WHERE collection_id = c.id 
            AND (compressed_image_url IS NOT NULL OR image_url IS NOT NULL)
          LIMIT 1
        ) samples ON true
        LEFT JOIN LATERAL (
          SELECT 
            true as has_pending_payment,
            buyer_wallet as pending_buyer_wallet
          FROM marketplace_pending_payments
          WHERE listing_id = ml.id 
            AND status = 'pending' 
            AND expires_at > NOW()
          LIMIT 1
        ) pending ON true
        WHERE ml.status = ${status}
        AND ml.seller_wallet = ${sellerWallet}
        ORDER BY ml.created_at DESC
        LIMIT 50
      `
    } else {
      listings = await sql`
        SELECT
          ml.*,
          c.name as collection_name,
          c.description as collection_description,
          c.created_at as collection_created_at,
          COALESCE(counts.ordinal_count, 0) as ordinal_count,
          samples.sample_image,
          pending.has_pending_payment,
          pending.pending_buyer_wallet
        FROM collection_marketplace_listings ml
        JOIN collections c ON ml.collection_id = c.id
        LEFT JOIN (
          SELECT collection_id, COUNT(*)::int as ordinal_count
          FROM generated_ordinals
          GROUP BY collection_id
        ) counts ON counts.collection_id = c.id
        LEFT JOIN LATERAL (
          SELECT COALESCE(compressed_image_url, image_url) as sample_image
          FROM generated_ordinals
          WHERE collection_id = c.id 
            AND (compressed_image_url IS NOT NULL OR image_url IS NOT NULL)
          LIMIT 1
        ) samples ON true
        LEFT JOIN LATERAL (
          SELECT 
            true as has_pending_payment,
            buyer_wallet as pending_buyer_wallet
          FROM marketplace_pending_payments
          WHERE listing_id = ml.id 
            AND status = 'pending' 
            AND expires_at > NOW()
          LIMIT 1
        ) pending ON true
        WHERE ml.status = ${status}
        ORDER BY ml.created_at DESC
        LIMIT 50
      `
    }

    return NextResponse.json({
      listings: listings,
      count: listings.length,
    })
  } catch (error) {
    console.error('Error fetching marketplace listings:', error)
    return NextResponse.json(
      { error: 'Failed to fetch marketplace listings' },
      { status: 500 }
    )
  }
}

// POST /api/marketplace/listings - Create a new marketplace listing
export async function POST(req: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    // SECURITY: Require signature verification - prevents anyone from listing collections as another user
    const auth = await requireWalletAuth(req, true) // Require signature
    if (!auth.isValid || !auth.walletAddress) {
      return NextResponse.json({ 
        error: auth.error || 'Authentication required',
        details: 'Please sign the request with your wallet to verify ownership'
      }, { status: 401 })
    }
    
    const body = await req.json()
    const {
      collection_id,
      seller_wallet,
      price_credits,
      price_btc,
      seller_btc_address,
      payment_type = 'credits', // 'credits', 'btc', or 'both'
      title,
      description,
      included_promo_urls,
      terms_accepted,
    } = body

    // Validation
    if (!collection_id || !seller_wallet || !title) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Verify authenticated wallet matches seller_wallet
    if (auth.walletAddress.toLowerCase() !== seller_wallet.toLowerCase()) {
      return NextResponse.json(
        { error: 'Authenticated wallet does not match seller wallet' },
        { status: 403 }
      )
    }

    // Validate payment type and pricing
    if (payment_type === 'credits' || payment_type === 'both') {
      if (!price_credits || price_credits <= 0) {
        return NextResponse.json(
          { error: 'Credit price is required for this payment type' },
          { status: 400 }
        )
      }
    }

    if (payment_type === 'btc' || payment_type === 'both') {
      if (!price_btc || price_btc <= 0) {
        return NextResponse.json(
          { error: 'BTC price is required for this payment type' },
          { status: 400 }
        )
      }
      if (!seller_btc_address) {
        return NextResponse.json(
          { error: 'Your BTC address is required to receive BTC payments' },
          { status: 400 }
        )
      }
    }

    if (!terms_accepted) {
      return NextResponse.json(
        { error: 'You must accept the terms and conditions to list your collection' },
        { status: 400 }
      )
    }

    // Check if collection exists and is owned by seller
    const collectionCheck = await sql`
      SELECT wallet_address, collection_status, marketplace_status
      FROM collections
      WHERE id = ${collection_id}
    `

    if (collectionCheck.length === 0) {
      return NextResponse.json(
        { error: 'Collection not found' },
        { status: 404 }
      )
    }

    const collection = collectionCheck[0]

    if (collection.wallet_address !== seller_wallet) {
      return NextResponse.json(
        { error: 'You do not own this collection' },
        { status: 403 }
      )
    }

    // Check that collection status is 'marketplace'
    if (collection.collection_status !== 'marketplace') {
      return NextResponse.json(
        { error: 'Collection must have marketplace status before listing. Please finalize the collection status first.' },
        { status: 400 }
      )
    }

    if (collection.marketplace_status === 'listed') {
      return NextResponse.json(
        { error: 'Collection is already listed on marketplace' },
        { status: 400 }
      )
    }

    if (collection.marketplace_status === 'sold') {
      return NextResponse.json(
        { error: 'Collection has already been sold' },
        { status: 400 }
      )
    }

    // Create the listing
    // For BTC-only listings, we need to handle price_credits differently
    // If payment_type is 'btc', we'll use a minimal value (0.01) to satisfy the NOT NULL constraint
    // TODO: Consider making price_credits nullable in a future migration
    const creditsValue = (payment_type === 'btc') 
      ? 0.01  // Minimal value to satisfy NOT NULL CHECK constraint
      : (price_credits || 0)
    
    const listing = await sql`
      INSERT INTO collection_marketplace_listings
      (collection_id, seller_wallet, price_credits, price_btc, seller_btc_address, payment_type, title, description, included_promo_urls, terms_accepted, terms_accepted_at, status)
      VALUES (
        ${collection_id},
        ${seller_wallet},
        ${creditsValue},
        ${price_btc || null},
        ${seller_btc_address || null},
        ${payment_type},
        ${title},
        ${description || null},
        ${included_promo_urls || []},
        ${terms_accepted},
        CURRENT_TIMESTAMP,
        'active'
      )
      RETURNING *
    `

    // Update collection status
    await sql`
      UPDATE collections
      SET marketplace_status = 'listed',
          marketplace_listing_id = ${listing[0].id},
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${collection_id}
    `

    return NextResponse.json({
      success: true,
      listing: listing[0],
    })
  } catch (error) {
    console.error('Error creating marketplace listing:', error)
    return NextResponse.json(
      { error: 'Failed to create marketplace listing' },
      { status: 500 }
    )
  }
}
