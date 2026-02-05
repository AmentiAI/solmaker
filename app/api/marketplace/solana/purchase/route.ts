import { NextRequest, NextResponse } from 'next/server'
import { PublicKey } from '@solana/web3.js'
import { sql } from '@/lib/database'
import { buildPurchaseTransaction, calculatePlatformFee } from '@/lib/solana/escrow'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { listingId, buyerWallet } = body

    // Validation
    if (!listingId || !buyerWallet) {
      return NextResponse.json(
        { error: 'Missing required fields: listingId, buyerWallet' },
        { status: 400 }
      )
    }

    // Get listing from database
    const listing = await sql`
      SELECT * FROM nft_listings
      WHERE id = ${listingId}
      LIMIT 1
    `

    if (listing.length === 0) {
      return NextResponse.json(
        { error: 'Listing not found' },
        { status: 404 }
      )
    }

    const listingData = listing[0]

    // Verify listing is active
    if (listingData.status !== 'active') {
      return NextResponse.json(
        { error: `Listing is ${listingData.status}, not available for purchase` },
        { status: 400 }
      )
    }

    // Prevent self-purchase
    if (listingData.seller_wallet.toLowerCase() === buyerWallet.toLowerCase()) {
      return NextResponse.json(
        { error: 'Cannot purchase your own listing' },
        { status: 400 }
      )
    }

    // Calculate fees
    const priceLamports = listingData.price_lamports
    const platformFee = calculatePlatformFee(priceLamports)
    const sellerAmount = priceLamports - platformFee

    // Build payment transaction using existing escrow utility
    let transaction
    try {
      const result = await buildPurchaseTransaction(
        new PublicKey(buyerWallet),
        new PublicKey(listingData.seller_wallet),
        priceLamports
      )
      transaction = result.transaction
    } catch (error) {
      console.error('Error building purchase transaction:', error)
      return NextResponse.json(
        { error: 'Failed to build purchase transaction' },
        { status: 500 }
      )
    }

    // Create pending transaction record
    const txResult = await sql`
      INSERT INTO nft_transactions (
        listing_id,
        mint_address,
        seller_wallet,
        buyer_wallet,
        price_lamports,
        platform_fee_lamports,
        status,
        created_at
      ) VALUES (
        ${listingId},
        ${listingData.mint_address},
        ${listingData.seller_wallet},
        ${buyerWallet},
        ${priceLamports},
        ${platformFee},
        'pending',
        NOW()
      )
      RETURNING id
    `

    const transactionId = txResult[0].id

    // Serialize transaction to base64
    const serialized = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    })
    const transactionBase64 = serialized.toString('base64')

    return NextResponse.json({
      success: true,
      transaction: transactionBase64,
      transactionId,
      platformFee,
      sellerAmount,
      totalPrice: priceLamports,
    })
  } catch (error: any) {
    console.error('Error in POST /api/marketplace/solana/purchase:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
