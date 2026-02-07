import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { getConnectionAsync } from '@/lib/solana/connection'
import { verifyNftInEscrow } from '@/lib/solana/marketplace-transactions'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { listingId, txSignature } = body

    // Validation
    if (!listingId || !txSignature) {
      return NextResponse.json(
        { error: 'Missing required fields: listingId, txSignature' },
        { status: 400 }
      )
    }

    if (!sql) {
      return NextResponse.json(
        { error: 'Database not available' },
        { status: 500 }
      )
    }

    // Get listing from database
    const listing = await sql`
      SELECT * FROM nft_listings
      WHERE id = ${listingId}
      LIMIT 1
    `

    const listings = Array.isArray(listing) ? listing : []
    if (listings.length === 0) {
      return NextResponse.json(
        { error: 'Listing not found' },
        { status: 404 }
      )
    }

    const listingData = listings[0] as any

    if (listingData.status !== 'pending') {
      return NextResponse.json(
        { error: `Listing is already ${listingData.status}` },
        { status: 400 }
      )
    }

    // Verify transaction on-chain
    const connection = await getConnectionAsync()
    let tx
    try {
      tx = await connection.getTransaction(txSignature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      })
    } catch (error) {
      console.error('Error fetching transaction:', error)
      return NextResponse.json(
        { error: 'Transaction not found on-chain. Please wait and try again.' },
        { status: 404 }
      )
    }

    if (!tx || !tx.meta) {
      return NextResponse.json(
        { error: 'Transaction not found or not confirmed' },
        { status: 404 }
      )
    }

    if (tx.meta.err) {
      return NextResponse.json(
        { error: 'Transaction failed on-chain' },
        { status: 400 }
      )
    }

    // Verify NFT is in escrow
    const platformWallet = process.env.SOLANA_PLATFORM_WALLET
    if (!platformWallet) {
      return NextResponse.json(
        { error: 'Platform wallet not configured' },
        { status: 500 }
      )
    }

    const nftInEscrow = await verifyNftInEscrow(listingData.mint_address, platformWallet)
    if (!nftInEscrow) {
      return NextResponse.json(
        { error: 'NFT not found in escrow account' },
        { status: 400 }
      )
    }

    // Update listing to active
    await sql`
      UPDATE nft_listings SET
        status = 'active',
        listing_tx_signature = ${txSignature}
      WHERE id = ${listingId}
    `

    // Update collection stats if collection exists
    const metadata = listingData.metadata
    if (metadata && metadata.collection) {
      try {
        await sql`
          INSERT INTO nft_collections (
            symbol,
            name,
            image_url,
            total_listings,
            created_at
          ) VALUES (
            ${metadata.collection.key},
            ${metadata.collection.key},
            ${metadata.image || ''},
            1,
            NOW()
          )
          ON CONFLICT (symbol) DO UPDATE SET
            total_listings = nft_collections.total_listings + 1
        `

        // Update floor price if this is lower
        await sql`
          UPDATE nft_collections
          SET floor_price_lamports = ${listingData.price_lamports}
          WHERE symbol = ${metadata.collection.key}
          AND (floor_price_lamports IS NULL OR floor_price_lamports > ${listingData.price_lamports})
        `
      } catch (error) {
        console.warn('Error updating collection stats:', error)
        // Don't fail the listing if collection update fails
      }
    }

    // Return success
    const updatedListing = await sql`
      SELECT id, mint_address, price_sol, price_lamports, status, title, image_url
      FROM nft_listings
      WHERE id = ${listingId}
      LIMIT 1
    `

    const updatedListings = Array.isArray(updatedListing) ? updatedListing : []

    return NextResponse.json({
      success: true,
      listing: updatedListings[0],
    })
  } catch (error: any) {
    console.error('Error in POST /api/marketplace/solana/confirm-listing:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
