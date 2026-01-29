import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { createUmiInstance } from '@/lib/solana/umi-config'
import { buildCandyMachineMint } from '@/lib/solana/candy-machine'
import { LAMPORTS_PER_SOL } from '@solana/web3.js'

/**
 * POST /api/launchpad/[collectionId]/mint/build
 * Build a mint transaction for user to sign
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ collectionId: string }> }
) {
  if (!sql) {
    return NextResponse.json({ error: 'Database not available' }, { status: 500 })
  }

  try {
    const { collectionId } = await params
    const body = await request.json()
    const { wallet_address, phase_id, quantity = 1 } = body

    if (!wallet_address) {
      return NextResponse.json({ error: 'wallet_address required' }, { status: 400 })
    }

    // Get collection
    const collections = await sql`
      SELECT * FROM collections 
      WHERE id = ${collectionId}::uuid
      AND collection_status = 'launchpad_live'
      AND candy_machine_address IS NOT NULL
    ` as any[]

    if (!collections.length) {
      return NextResponse.json({ 
        error: 'Collection not found or not live',
        message: 'Collection must be deployed and live to mint'
      }, { status: 404 })
    }

    const collection = collections[0]

    // Check if minting has started
    if (!collection.launched_at || new Date(collection.launched_at) > new Date()) {
      return NextResponse.json({ 
        error: 'Minting has not started yet',
      }, { status: 400 })
    }

    // Get phase info if provided
    let mintPriceLamports = 0
    let phaseValid = true

    if (phase_id) {
      const phases = await sql`
        SELECT * FROM mint_phases 
        WHERE id = ${phase_id}::uuid
        AND collection_id = ${collectionId}::uuid
      ` as any[]

      if (phases.length) {
        const phase = phases[0]
        const now = new Date()
        const startTime = new Date(phase.start_time)
        const endTime = phase.end_time ? new Date(phase.end_time) : null

        if (now < startTime) {
          return NextResponse.json({ error: 'Phase has not started yet' }, { status: 400 })
        }

        if (endTime && now > endTime) {
          return NextResponse.json({ error: 'Phase has ended' }, { status: 400 })
        }

        // Get phase price (convert to lamports)
        mintPriceLamports = phase.mint_price 
          ? Math.floor(parseFloat(String(phase.mint_price)) * LAMPORTS_PER_SOL)
          : 0
      }
    } else {
      // Use collection default price
      mintPriceLamports = collection.mint_price
        ? Math.floor(parseFloat(String(collection.mint_price)) * LAMPORTS_PER_SOL)
        : 0
    }

    // Check supply
    const minted = await sql`
      SELECT COUNT(*) as count 
      FROM solana_nft_mints 
      WHERE collection_id = ${collectionId}::uuid 
      AND mint_status = 'confirmed'
    ` as any[]

    const mintedCount = parseInt(minted[0].count, 10)
    const totalSupply = parseInt(collection.total_supply || '0', 10)

    if (mintedCount >= totalSupply) {
      return NextResponse.json({ 
        error: 'Collection sold out',
      }, { status: 400 })
    }

    // Create mint session
    const sessions = await sql`
      INSERT INTO mint_sessions (
        collection_id,
        wallet_address,
        status,
        session_data
      ) VALUES (
        ${collectionId}::uuid,
        ${wallet_address},
        'pending',
        ${JSON.stringify({ phase_id, quantity })}::jsonb
      )
      RETURNING id
    ` as any[]

    const sessionId = sessions[0].id

    // Build Candy Machine mint transaction
    console.log(`🎨 Building mint transaction for ${wallet_address}...`)
    const umi = createUmiInstance()

    const { builder, nftMint } = await buildCandyMachineMint(umi, {
      candyMachineAddress: collection.candy_machine_address,
      collectionMint: collection.collection_mint_address,
      collectionUpdateAuthority: collection.collection_authority || collection.wallet_address,
      minterPublicKey: wallet_address,
    })

    // Build transaction
    const transaction = await builder.buildWithLatestBlockhash(umi)
    const serialized = Buffer.from(umi.transactions.serialize(transaction)).toString('base64')

    // Create pending mint record
    await sql`
      INSERT INTO solana_nft_mints (
        collection_id,
        candy_machine_address,
        session_id,
        phase_id,
        nft_mint_address,
        minter_wallet,
        mint_price_lamports,
        platform_fee_lamports,
        total_paid_lamports,
        mint_status
      ) VALUES (
        ${collectionId}::uuid,
        ${collection.candy_machine_address},
        ${sessionId}::uuid,
        ${phase_id ? `${phase_id}::uuid` : null},
        ${nftMint.toString()},
        ${wallet_address},
        ${mintPriceLamports},
        0,
        ${mintPriceLamports},
        'awaiting_signature'
      )
      RETURNING id
    ` as any[]

    const mintId = sessions[0].id

    return NextResponse.json({
      success: true,
      mintId,
      sessionId,
      nftMint: nftMint.toString(),
      transaction: serialized,
      mintPrice: mintPriceLamports / LAMPORTS_PER_SOL,
      message: 'Sign this transaction to mint your NFT',
    })

  } catch (error: any) {
    console.error('[Build Mint] Error:', error)
    return NextResponse.json({ 
      error: error.message || 'Failed to build mint transaction',
      details: error.toString()
    }, { status: 500 })
  }
}
