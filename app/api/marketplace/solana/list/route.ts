import { NextRequest, NextResponse } from 'next/server'
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { sql } from '@/lib/database'
import { buildTransferToEscrow } from '@/lib/solana/marketplace-transactions'
import { getNftMetadata, verifyNftOwnership } from '@/lib/solana/nft-fetcher'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { mintAddress, price, sellerWallet, title, description } = body

    // Validation
    if (!mintAddress || !price || !sellerWallet) {
      return NextResponse.json(
        { error: 'Missing required fields: mintAddress, price, sellerWallet' },
        { status: 400 }
      )
    }

    if (price <= 0) {
      return NextResponse.json(
        { error: 'Price must be greater than 0' },
        { status: 400 }
      )
    }

    // Verify wallet ownership (should check signature in production)
    // For now, we'll verify on-chain ownership
    const ownsNft = await verifyNftOwnership(mintAddress, sellerWallet)
    if (!ownsNft) {
      return NextResponse.json(
        { error: 'Seller does not own this NFT' },
        { status: 403 }
      )
    }

    // Check if NFT is already listed
    const existingListing = await sql`
      SELECT id FROM nft_listings
      WHERE mint_address = ${mintAddress}
      AND status = 'active'
      LIMIT 1
    `

    if (existingListing.length > 0) {
      return NextResponse.json(
        { error: 'NFT is already listed' },
        { status: 409 }
      )
    }

    // Fetch NFT metadata
    let metadata
    try {
      metadata = await getNftMetadata(mintAddress)
    } catch (error) {
      console.error('Error fetching metadata:', error)
      return NextResponse.json(
        { error: 'Failed to fetch NFT metadata' },
        { status: 500 }
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

    // Build transfer-to-escrow transaction
    let transaction, escrowTokenAccount
    try {
      const result = await buildTransferToEscrow(
        new PublicKey(mintAddress),
        new PublicKey(sellerWallet),
        new PublicKey(platformWallet)
      )
      transaction = result.transaction
      escrowTokenAccount = result.escrowTokenAccount
    } catch (error) {
      console.error('Error building transaction:', error)
      return NextResponse.json(
        { error: `Failed to build transaction: ${error.message}` },
        { status: 500 }
      )
    }
    
    // Simulate the transaction before sending to user
    try {
      const { getConnection } = await import('@/lib/solana/connection')
      const connection = getConnection()
      
      const simulationResult = await connection.simulateTransaction(transaction)
      
      if (simulationResult.value.err) {
        console.error('Transaction simulation failed:', simulationResult.value)
        return NextResponse.json(
          { 
            error: 'Transaction simulation failed', 
            details: JSON.stringify(simulationResult.value.err),
            logs: simulationResult.value.logs 
          },
          { status: 400 }
        )
      }
    } catch (simError: any) {
      console.error('Simulation error:', simError)
      return NextResponse.json(
        { error: 'Transaction simulation error', details: simError.message },
        { status: 400 }
      )
    }

    // Create pending listing in database
    const priceLamports = Math.floor(price * LAMPORTS_PER_SOL)

    const listingResult = await sql`
      INSERT INTO nft_listings (
        mint_address,
        seller_wallet,
        price_lamports,
        price_sol,
        title,
        description,
        image_url,
        metadata,
        escrow_token_account,
        status,
        created_at
      ) VALUES (
        ${mintAddress},
        ${sellerWallet},
        ${priceLamports},
        ${price},
        ${title || metadata.name},
        ${description || ''},
        ${metadata.image || ''},
        ${JSON.stringify(metadata)},
        ${escrowTokenAccount.toBase58()},
        'pending',
        NOW()
      )
      RETURNING id
    `

    const listingId = listingResult[0].id

    // Serialize transaction to base64
    const serialized = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    })
    const transactionBase64 = serialized.toString('base64')

    return NextResponse.json({
      success: true,
      transaction: transactionBase64,
      listingId,
      escrowTokenAccount: escrowTokenAccount.toBase58(),
    })
  } catch (error: any) {
    console.error('Error in POST /api/marketplace/solana/list:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
