import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'

// POST /api/marketplace/purchase - Purchase a collection from marketplace
export async function POST(req: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const body = await req.json()
    const { listing_id, buyer_wallet } = body

    if (!listing_id || !buyer_wallet) {
      return NextResponse.json(
        { error: 'listing_id and buyer_wallet are required' },
        { status: 400 }
      )
    }

    // Get listing details
    const listingResult = await sql`
      SELECT ml.*, c.wallet_address as current_owner
      FROM collection_marketplace_listings ml
      JOIN collections c ON ml.collection_id = c.id
      WHERE ml.id = ${listing_id}
    `

    if (listingResult.length === 0) {
      return NextResponse.json(
        { error: 'Listing not found' },
        { status: 404 }
      )
    }

    const listing = listingResult[0]

    if (listing.status !== 'active') {
      return NextResponse.json(
        { error: 'Listing is no longer active' },
        { status: 400 }
      )
    }

    if (listing.seller_wallet === buyer_wallet) {
      return NextResponse.json(
        { error: 'You cannot buy your own listing' },
        { status: 400 }
      )
    }

    // Check for existing pending BTC payments on this listing
    const existingPending = await sql`
      SELECT id, buyer_wallet, status, expires_at
      FROM marketplace_pending_payments
      WHERE listing_id = ${listing_id}
        AND status = 'pending'
        AND expires_at > NOW()
    ` as any[]

    if (existingPending.length > 0) {
      return NextResponse.json(
        { 
          error: 'This listing has a pending BTC payment. Please wait or try again later.',
          pending_buyer: existingPending[0].buyer_wallet.slice(0, 8) + '...',
          expires_at: existingPending[0].expires_at,
        },
        { status: 409 }
      )
    }

    // Check for completed transactions on this listing
    const existingCompleted = await sql`
      SELECT id FROM marketplace_transactions
      WHERE listing_id = ${listing_id}
        AND status = 'completed'
    ` as any[]

    if (existingCompleted.length > 0) {
      return NextResponse.json(
        { error: 'This collection has already been sold' },
        { status: 409 }
      )
    }

    // Get buyer's credit balance
    const buyerCreditsResult = await sql`
      SELECT credits FROM profiles WHERE wallet_address = ${buyer_wallet}
    `

    let buyerCredits = 0
    if (buyerCreditsResult.length > 0) {
      buyerCredits = parseFloat(buyerCreditsResult[0].credits || '0')
    } else {
      // Create profile if it doesn't exist
      await sql`
        INSERT INTO profiles (wallet_address, credits)
        VALUES (${buyer_wallet}, 0)
        ON CONFLICT (wallet_address) DO NOTHING
      `
      buyerCredits = 0
    }

    const priceCredits = parseFloat(listing.price_credits)

    if (buyerCredits < priceCredits) {
      return NextResponse.json(
        {
          error: 'Insufficient credits',
          required: priceCredits,
          available: buyerCredits,
        },
        { status: 400 }
      )
    }

    // Get seller's credit balance
    const sellerCreditsResult = await sql`
      SELECT credits FROM profiles WHERE wallet_address = ${listing.seller_wallet}
    `

    let sellerCredits = 0
    if (sellerCreditsResult.length > 0) {
      sellerCredits = parseFloat(sellerCreditsResult[0].credits || '0')
    } else {
      // Create profile if it doesn't exist
      await sql`
        INSERT INTO profiles (wallet_address, credits)
        VALUES (${listing.seller_wallet}, 0)
        ON CONFLICT (wallet_address) DO NOTHING
      `
      sellerCredits = 0
    }

    // Deduct credits from buyer
    const newBuyerCredits = buyerCredits - priceCredits
    await sql`
      UPDATE profiles
      SET credits = ${newBuyerCredits}, updated_at = CURRENT_TIMESTAMP
      WHERE wallet_address = ${buyer_wallet}
    `

    // Add credits to seller
    const newSellerCredits = sellerCredits + priceCredits
    await sql`
      UPDATE profiles
      SET credits = ${newSellerCredits}, updated_at = CURRENT_TIMESTAMP
      WHERE wallet_address = ${listing.seller_wallet}
    `

    // Transfer collection ownership using the function
    const transferResult = await sql`
      SELECT transfer_collection_ownership(
        ${listing.collection_id}::uuid,
        ${listing.seller_wallet},
        ${buyer_wallet},
        ${listing_id}::uuid
      ) as success
    `

    if (!transferResult[0]?.success) {
      // Rollback credits
      await sql`
        UPDATE profiles
        SET credits = ${buyerCredits}, updated_at = CURRENT_TIMESTAMP
        WHERE wallet_address = ${buyer_wallet}
      `
      await sql`
        UPDATE profiles
        SET credits = ${sellerCredits}, updated_at = CURRENT_TIMESTAMP
        WHERE wallet_address = ${listing.seller_wallet}
      `

      return NextResponse.json(
        { error: 'Failed to transfer collection ownership' },
        { status: 500 }
      )
    }

    // Create transaction record
    const transactionResult = await sql`
      INSERT INTO marketplace_transactions
      (listing_id, collection_id, seller_wallet, buyer_wallet, price_credits,
       seller_credits_before, seller_credits_after, buyer_credits_before, buyer_credits_after,
       status, completed_at)
      VALUES (
        ${listing_id},
        ${listing.collection_id},
        ${listing.seller_wallet},
        ${buyer_wallet},
        ${priceCredits},
        ${sellerCredits},
        ${newSellerCredits},
        ${buyerCredits},
        ${newBuyerCredits},
        'completed',
        CURRENT_TIMESTAMP
      )
      RETURNING id
    ` as any[]
    
    const transactionId = transactionResult?.[0]?.id

    // Create credit transaction records for both parties
    await sql`
      INSERT INTO credit_transactions
      (wallet_address, amount, transaction_type, description, status)
      VALUES
      (
        ${listing.seller_wallet},
        ${priceCredits},
        'marketplace_sale',
        ${'Sold collection on marketplace - Listing #' + listing_id.substring(0, 8)},
        'completed'
      ),
      (
        ${buyer_wallet},
        ${-priceCredits},
        'marketplace_purchase',
        ${'Purchased collection from marketplace - Listing #' + listing_id.substring(0, 8)},
        'completed'
      )
    `

    return NextResponse.json({
      success: true,
      message: 'Collection purchased successfully',
      collection_id: listing.collection_id,
      transaction_id: transactionId,
      listing_id: listing_id,
      seller_wallet: listing.seller_wallet,
      transaction: {
        price_credits: priceCredits,
        buyer_credits_before: buyerCredits,
        buyer_credits_after: newBuyerCredits,
      },
    })
  } catch (error) {
    console.error('Error purchasing collection:', error)
    return NextResponse.json(
      { error: 'Failed to purchase collection' },
      { status: 500 }
    )
  }
}
