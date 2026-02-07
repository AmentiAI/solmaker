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
    
    // Ensure price_lamports is a number
    const priceLamports = parseInt(listingData.price_lamports)
    
    console.log('Purchase debug:', {
      listingId,
      price_lamports_raw: listingData.price_lamports,
      price_lamports_parsed: priceLamports,
      mint_address: listingData.mint_address
    })

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

    // Calculate fees (using the parsed priceLamports from above)
    const platformFee = calculatePlatformFee(priceLamports)
    const sellerAmount = priceLamports - platformFee

    // Build payment transaction using existing escrow utility
    let transaction, needsTokenAccount
    try {
      const result = await buildPurchaseTransaction(
        new PublicKey(buyerWallet),
        new PublicKey(listingData.seller_wallet),
        priceLamports,
        listingData.mint_address // Pass mint address so token account can be created
      )
      transaction = result.transaction
      needsTokenAccount = result.needsTokenAccount
    } catch (error) {
      console.error('Error building purchase transaction:', error)
      return NextResponse.json(
        { error: 'Failed to build purchase transaction' },
        { status: 500 }
      )
    }
    
    // Simulate the transaction to catch issues early
    try {
      const { getConnectionAsync } = await import('@/lib/solana/connection')
      const { LAMPORTS_PER_SOL } = await import('@solana/web3.js')
      const connection = await getConnectionAsync()
      
      const simulationResult = await connection.simulateTransaction(transaction)
      
      if (simulationResult.value.err) {
        console.error('Transaction simulation failed:', simulationResult.value)
        
        // Check if it's an insufficient funds error
        const err = simulationResult.value.err as any
        if (err.InsufficientFundsForRent || (typeof err === 'object' && 'InsufficientFundsForRent' in err)) {
          // Calculate how much the buyer actually needs
          const minAccountBalance = 890880 // lamports
          const networkFee = 5000 // lamports  
          const tokenAccountRent = needsTokenAccount ? 2039280 : 0
          const totalNeeded = priceLamports + tokenAccountRent + networkFee + minAccountBalance
          
          // Get buyer's current balance
          const buyerBalance = await connection.getBalance(new PublicKey(buyerWallet))
          const shortfall = totalNeeded - buyerBalance
          
          return NextResponse.json(
            { 
              error: `Insufficient SOL balance. You need ${(totalNeeded / LAMPORTS_PER_SOL).toFixed(4)} SOL total but only have ${(buyerBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL. Please add ${(shortfall / LAMPORTS_PER_SOL).toFixed(4)} SOL to your wallet.`,
              details: {
                required: totalNeeded,
                current: buyerBalance,
                shortfall,
                breakdown: {
                  nftPrice: priceLamports / LAMPORTS_PER_SOL,
                  tokenAccountRent: tokenAccountRent / LAMPORTS_PER_SOL,
                  networkFee: networkFee / LAMPORTS_PER_SOL,
                  minAccountBalance: minAccountBalance / LAMPORTS_PER_SOL,
                }
              }
            },
            { status: 400 }
          )
        }
        
        return NextResponse.json(
          { 
            error: 'Transaction simulation failed', 
            details: JSON.stringify(simulationResult.value.err),
            logs: simulationResult.value.logs,
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
      needsTokenAccount,
      tokenAccountRent: 0, // Token account is created by platform during delivery, not in purchase tx
    })
  } catch (error: any) {
    console.error('Error in POST /api/marketplace/solana/purchase:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
