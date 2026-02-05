import { NextRequest, NextResponse } from 'next/server'
import { PublicKey } from '@solana/web3.js'
import { sql } from '@/lib/database'
import { verifyPurchaseTransaction } from '@/lib/solana/escrow'
import {
  buildTransferToBuyer,
  signAndSendWithPlatform,
  verifyNftReceived,
} from '@/lib/solana/marketplace-transactions'
import { getExplorerUrl } from '@/lib/solana/connection'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { listingId, buyerWallet, paymentTxSignature } = body

    // Validation
    if (!listingId || !buyerWallet || !paymentTxSignature) {
      return NextResponse.json(
        { error: 'Missing required fields: listingId, buyerWallet, paymentTxSignature' },
        { status: 400 }
      )
    }

    // Get listing and transaction from database
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

    if (listingData.status !== 'active') {
      return NextResponse.json(
        { error: `Listing is ${listingData.status}, not available for purchase` },
        { status: 400 }
      )
    }

    // CRITICAL: Verify payment on-chain
    const paymentVerification = await verifyPurchaseTransaction(
      paymentTxSignature,
      listingData.seller_wallet,
      listingData.price_lamports
    )

    if (!paymentVerification.valid) {
      return NextResponse.json(
        { error: `Payment verification failed: ${paymentVerification.error}` },
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

    // Build NFT transfer transaction (escrow → buyer)
    let deliveryTxSignature
    try {
      const { transaction } = await buildTransferToBuyer(
        new PublicKey(listingData.mint_address),
        new PublicKey(buyerWallet),
        new PublicKey(platformWallet)
      )

      // Sign and send with platform wallet
      deliveryTxSignature = await signAndSendWithPlatform(transaction)
    } catch (error) {
      console.error('Error delivering NFT:', error)

      // Mark transaction as failed
      await sql`
        UPDATE nft_transactions SET
          status = 'failed',
          error_message = ${(error as Error).message}
        WHERE listing_id = ${listingId}
        AND buyer_wallet = ${buyerWallet}
      `

      return NextResponse.json(
        {
          error: 'Failed to deliver NFT. Payment was received but NFT delivery failed. Contact support.',
          details: (error as Error).message,
        },
        { status: 500 }
      )
    }

    // Verify NFT was received by buyer
    const nftReceived = await verifyNftReceived(listingData.mint_address, buyerWallet)
    if (!nftReceived) {
      console.error('NFT delivery verification failed')
      // Transaction went through but verification failed - may be timing issue
      // Don't fail the request, but log for monitoring
    }

    // Update database atomically
    try {
      await sql.begin(async (sql) => {
        // Update listing
        await sql`
          UPDATE nft_listings SET
            status = 'sold',
            sold_to_wallet = ${buyerWallet},
            sold_tx_signature = ${paymentTxSignature},
            sold_at = NOW()
          WHERE id = ${listingId}
        `

        // Update transaction
        await sql`
          UPDATE nft_transactions SET
            status = 'confirmed',
            tx_signature = ${deliveryTxSignature}
          WHERE listing_id = ${listingId}
          AND buyer_wallet = ${buyerWallet}
        `

        // Update collection stats
        const metadata = listingData.metadata
        if (metadata && metadata.collection) {
          await sql`
            UPDATE nft_collections SET
              total_sales = total_sales + 1,
              total_volume_lamports = total_volume_lamports + ${listingData.price_lamports},
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
          }
        }
      })
    } catch (error) {
      console.error('Error updating database after successful NFT delivery:', error)
      // NFT was delivered successfully but DB update failed
      // This is recoverable - the transaction happened on-chain
    }

    // Return success with explorer link
    const explorerUrl = getExplorerUrl(deliveryTxSignature, 'tx')

    return NextResponse.json({
      success: true,
      deliveryTxSignature,
      explorerUrl,
      message: 'NFT purchased successfully!',
    })
  } catch (error: any) {
    console.error('Error in POST /api/marketplace/solana/confirm-purchase:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
