import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'

// Solana connection would be initialized here in production
// const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com'
const LAMPORTS_PER_SOL = 1000000000

export async function POST(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const body = await request.json()

    const {
      collectionId,
      candyMachineAddress,
      quantity = 1,
      walletAddress
    } = body

    // Validate inputs
    if (!collectionId || !walletAddress) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Fetch collection details
    const collectionResult = await sql`
      SELECT * FROM solana_collections
      WHERE id = ${collectionId}
      LIMIT 1
    `

    if (!collectionResult || collectionResult.length === 0) {
      return NextResponse.json(
        { error: 'Collection not found' },
        { status: 404 }
      )
    }

    const collection = collectionResult[0]

    // Check if collection is live
    if (!collection.is_live) {
      return NextResponse.json(
        { error: 'Collection is not live yet' },
        { status: 400 }
      )
    }

    // Check if sold out
    if (collection.minted_count >= collection.total_supply) {
      return NextResponse.json(
        { error: 'Collection is sold out' },
        { status: 400 }
      )
    }

    // Check if quantity is valid
    if (quantity < 1 || quantity > 10) {
      return NextResponse.json(
        { error: 'Invalid quantity (1-10 allowed)' },
        { status: 400 }
      )
    }

    // Check if enough supply left
    if (collection.minted_count + quantity > collection.total_supply) {
      return NextResponse.json(
        { error: `Only ${collection.total_supply - collection.minted_count} NFTs remaining` },
        { status: 400 }
      )
    }

    // Calculate total price
    const totalPrice = collection.mint_price * quantity

    // Create mint record
    const mintRecordResult = await sql`
      INSERT INTO solana_mints (
        collection_id,
        minter_wallet,
        quantity,
        mint_price_lamports,
        mint_status,
        candy_machine_address
      ) VALUES (
        ${collectionId},
        ${walletAddress},
        ${quantity},
        ${totalPrice * LAMPORTS_PER_SOL},
        'pending',
        ${candyMachineAddress}
      )
      RETURNING *
    `

    if (!mintRecordResult || mintRecordResult.length === 0) {
      console.error('Error creating mint record')
      return NextResponse.json(
        { error: 'Failed to create mint record' },
        { status: 500 }
      )
    }

    const mintRecord = mintRecordResult[0]

    // In production, this would interact with the Candy Machine
    // For now, we'll simulate a successful mint
    
    // Simulate transaction signature
    const signature = `mint_${Date.now()}_${Math.random().toString(36).substring(7)}`
    const nftAddress = `nft_${Date.now()}_${Math.random().toString(36).substring(7)}`

    // Update mint record with success
    await sql`
      UPDATE solana_mints
      SET 
        mint_status = 'confirmed',
        mint_tx_signature = ${signature},
        nft_mint_address = ${nftAddress},
        confirmed_at = NOW()
      WHERE id = ${mintRecord.id}
    `

    // Update collection minted count
    await sql`
      UPDATE solana_collections
      SET minted_count = minted_count + ${quantity}
      WHERE id = ${collectionId}
    `

    // Return success response
    return NextResponse.json({
      success: true,
      signature,
      nftAddress,
      mintId: mintRecord.id,
      message: `Successfully minted ${quantity} NFT${quantity > 1 ? 's' : ''}!`
    })

  } catch (error) {
    console.error('Error in Solana mint API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const walletAddress = searchParams.get('wallet')
    const collectionId = searchParams.get('collection')

    let mints
    
    if (walletAddress && collectionId) {
      mints = await sql`
        SELECT 
          sm.*,
          sc.name as collection_name,
          sc.image_url as collection_image_url
        FROM solana_mints sm
        LEFT JOIN solana_collections sc ON sm.collection_id = sc.id
        WHERE sm.minter_wallet = ${walletAddress}
          AND sm.collection_id = ${collectionId}
        ORDER BY sm.created_at DESC
      `
    } else if (walletAddress) {
      mints = await sql`
        SELECT 
          sm.*,
          sc.name as collection_name,
          sc.image_url as collection_image_url
        FROM solana_mints sm
        LEFT JOIN solana_collections sc ON sm.collection_id = sc.id
        WHERE sm.minter_wallet = ${walletAddress}
        ORDER BY sm.created_at DESC
      `
    } else if (collectionId) {
      mints = await sql`
        SELECT 
          sm.*,
          sc.name as collection_name,
          sc.image_url as collection_image_url
        FROM solana_mints sm
        LEFT JOIN solana_collections sc ON sm.collection_id = sc.id
        WHERE sm.collection_id = ${collectionId}
        ORDER BY sm.created_at DESC
      `
    } else {
      mints = await sql`
        SELECT 
          sm.*,
          sc.name as collection_name,
          sc.image_url as collection_image_url
        FROM solana_mints sm
        LEFT JOIN solana_collections sc ON sm.collection_id = sc.id
        ORDER BY sm.created_at DESC
      `
    }

    return NextResponse.json(mints || [])
  } catch (error) {
    console.error('Error fetching Solana mints:', error)
    return NextResponse.json({ error: 'Failed to fetch mints' }, { status: 500 })
  }
}
