import { NextRequest, NextResponse } from 'next/server'
import { PublicKey } from '@solana/web3.js'
import { sql } from '@/lib/database'
import {
  buildReturnToSeller,
  signAndSendWithPlatform,
} from '@/lib/solana/marketplace-transactions'
import { getExplorerUrl } from '@/lib/solana/connection'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { listingId, sellerWallet } = body

    // Validation
    if (!listingId || !sellerWallet) {
      return NextResponse.json(
        { error: 'Missing required fields: listingId, sellerWallet' },
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

    // Verify seller owns the listing
    if (listingData.seller_wallet.toLowerCase() !== sellerWallet.toLowerCase()) {
      return NextResponse.json(
        { error: 'You are not the seller of this listing' },
        { status: 403 }
      )
    }

    // Verify listing can be cancelled
    if (listingData.status !== 'active' && listingData.status !== 'pending') {
      return NextResponse.json(
        { error: `Cannot cancel listing with status: ${listingData.status}` },
        { status: 400 }
      )
    }

    // Get platform wallet
    const platformWallet = process.env.SOLANA_PLATFORM_WALLET
    if (!platformWallet) {
      return NextResponse.json(
        { error: 'Platform wallet not configured' },
        { status: 500 }
      )
    }

    // Build return transaction (escrow → seller)
    let returnTxSignature
    try {
      const { transaction } = await buildReturnToSeller(
        new PublicKey(listingData.mint_address),
        new PublicKey(sellerWallet),
        new PublicKey(platformWallet)
      )

      // Sign and send with platform wallet
      returnTxSignature = await signAndSendWithPlatform(transaction)
    } catch (error) {
      console.error('Error returning NFT to seller:', error)
      return NextResponse.json(
        { error: 'Failed to return NFT', details: (error as Error).message },
        { status: 500 }
      )
    }

    // Update listing status
    await sql`
      UPDATE nft_listings SET
        status = 'cancelled',
        updated_at = NOW()
      WHERE id = ${listingId}
    `

    // Update collection stats
    const metadata = listingData.metadata
    if (metadata && metadata.collection) {
      try {
        await sql`
          UPDATE nft_collections SET
            total_listings = GREATEST(total_listings - 1, 0)
          WHERE symbol = ${metadata.collection.key}
        `

        // Recalculate floor price
        const newFloorResult = await sql`
          SELECT MIN(price_lamports) as floor_price
          FROM nft_listings
          WHERE metadata->>'collection'->>'key' = ${metadata.collection.key}
          AND status = 'active'
        `

        if (newFloorResult.length > 0 && newFloorResult[0].floor_price) {
          await sql`
            UPDATE nft_collections
            SET floor_price_lamports = ${newFloorResult[0].floor_price}
            WHERE symbol = ${metadata.collection.key}
          `
        } else {
          // No more active listings, set floor to null
          await sql`
            UPDATE nft_collections
            SET floor_price_lamports = NULL
            WHERE symbol = ${metadata.collection.key}
          `
        }
      } catch (error) {
        console.warn('Error updating collection stats:', error)
        // Don't fail cancellation if stats update fails
      }
    }

    // Return success
    const explorerUrl = getExplorerUrl(returnTxSignature, 'tx')

    return NextResponse.json({
      success: true,
      txSignature: returnTxSignature,
      explorerUrl,
      message: 'Listing cancelled successfully!',
    })
  } catch (error: any) {
    console.error('Error in POST /api/marketplace/solana/cancel:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
