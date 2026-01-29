import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { createUmiInstance } from '@/lib/solana/umi-config'
import { deployCandyMachineWithMetadata, estimateCandyMachineCost } from '@/lib/solana/candy-machine'
import { publicKey } from '@metaplex-foundation/umi'

/**
 * POST /api/collections/[id]/deploy/create-candy-machine
 * Step 3: Deploy Candy Machine with all config lines
 * Returns transactions for user to sign
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!sql) {
    return NextResponse.json({ error: 'Database not available' }, { status: 500 })
  }

  try {
    const { id: collectionId } = await params
    const body = await request.json()
    const { wallet_address } = body

    // Verify collection
    const collections = await sql`
      SELECT * FROM collections 
      WHERE id = ${collectionId}::uuid 
      AND wallet_address = ${wallet_address}
    ` as any[]

    if (!collections.length) {
      return NextResponse.json({ error: 'Collection not found or unauthorized' }, { status: 404 })
    }

    const collection = collections[0]

    // Verify prerequisites
    if (!collection.collection_mint_address) {
      return NextResponse.json({ 
        error: 'Create collection NFT first',
      }, { status: 400 })
    }

    if (!collection.metadata_uploaded) {
      return NextResponse.json({ 
        error: 'Upload metadata first',
      }, { status: 400 })
    }

    // Check if already deployed
    if (collection.candy_machine_address) {
      return NextResponse.json({
        error: 'Candy Machine already deployed',
        candyMachine: collection.candy_machine_address,
      }, { status: 400 })
    }

    // Get all metadata URIs
    const metadataUris = await sql`
      SELECT nft_name, metadata_uri, nft_number
      FROM nft_metadata_uris
      WHERE collection_id = ${collectionId}::uuid
      ORDER BY nft_number
    ` as any[]

    if (!metadataUris.length) {
      return NextResponse.json({ 
        error: 'No metadata URIs found',
        message: 'Upload metadata first'
      }, { status: 400 })
    }

    // Estimate costs
    const costEstimate = estimateCandyMachineCost(metadataUris.length)

    console.log(`🏗️ Deploying Candy Machine for ${metadataUris.length} NFTs...`)
    console.log(`💰 Estimated cost: ${costEstimate.totalCost.toFixed(4)} SOL`)

    // Build config lines from metadata URIs
    const configLines = metadataUris.map(m => ({
      name: m.nft_name || `NFT #${m.nft_number}`,
      uri: m.metadata_uri,
    }))

    // Create Umi instance
    const umi = createUmiInstance()

    // Build Candy Machine config
    const config = {
      collectionMint: collection.collection_mint_address,
      collectionUpdateAuthority: wallet_address,
      itemsAvailable: metadataUris.length,
      sellerFeeBasisPoints: collection.royalty_percentage ? collection.royalty_percentage * 100 : 500,
      symbol: collection.symbol || collection.name.substring(0, 10).toUpperCase(),
      maxEditionSupply: 0,
      isMutable: true,
      creators: [{
        address: wallet_address,
        percentageShare: 100,
        verified: true,
      }],
    }

    // Deploy Candy Machine
    const { candyMachine, transactions } = await deployCandyMachineWithMetadata(
      umi,
      config,
      configLines
    )

    // Serialize transactions for frontend
    const serializedTxs = await Promise.all(
      transactions.map(async (tx, index) => {
        const built = await tx.buildWithLatestBlockhash(umi)
        return {
          index,
          transaction: Buffer.from(umi.transactions.serialize(built)).toString('base64'),
          description: index === 0 
            ? 'Create Candy Machine' 
            : `Add config lines ${index * 10}-${Math.min((index + 1) * 10, configLines.length)}`,
        }
      })
    )

    // Log deployment
    await sql`
      INSERT INTO candy_machine_deployments (
        collection_id,
        step,
        status,
        step_data
      ) VALUES (
        ${collectionId}::uuid,
        'create_candy_machine',
        'pending',
        ${JSON.stringify({
          candyMachine: candyMachine.toString(),
          itemsAvailable: metadataUris.length,
          transactionCount: serializedTxs.length,
        })}::jsonb
      )
    `

    return NextResponse.json({
      success: true,
      candyMachine: candyMachine.toString(),
      transactions: serializedTxs,
      estimatedCost: costEstimate,
      message: `Sign ${serializedTxs.length} transactions to deploy Candy Machine`,
    })

  } catch (error: any) {
    console.error('[Create Candy Machine] Error:', error)
    return NextResponse.json({ 
      error: error.message || 'Failed to create Candy Machine',
      details: error.toString()
    }, { status: 500 })
  }
}

/**
 * PUT /api/collections/[id]/deploy/create-candy-machine
 * Confirm Candy Machine deployment after user signs
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!sql) {
    return NextResponse.json({ error: 'Database not available' }, { status: 500 })
  }

  try {
    const { id: collectionId } = await params
    const body = await request.json()
    const { candy_machine_address, tx_signatures, wallet_address } = body

    if (!candy_machine_address || !tx_signatures) {
      return NextResponse.json({ 
        error: 'candy_machine_address and tx_signatures required' 
      }, { status: 400 })
    }

    // Update collection
    await sql`
      UPDATE collections
      SET 
        candy_machine_address = ${candy_machine_address},
        deployment_status = 'deployed',
        deployment_tx_signature = ${tx_signatures[0]},
        deployed_at = NOW(),
        deployed_by = ${wallet_address}
      WHERE id = ${collectionId}::uuid
    `

    // Update deployment log
    await sql`
      UPDATE candy_machine_deployments
      SET 
        status = 'completed',
        tx_signature = ${tx_signatures.join(',')},
        completed_at = NOW()
      WHERE collection_id = ${collectionId}::uuid
      AND step = 'create_candy_machine'
      AND status = 'pending'
    `

    console.log('✅ Candy Machine deployed:', candy_machine_address)

    return NextResponse.json({
      success: true,
      candyMachine: candy_machine_address,
      txSignatures: tx_signatures,
      message: 'Candy Machine deployed successfully',
    })

  } catch (error: any) {
    console.error('[Confirm Candy Machine] Error:', error)
    return NextResponse.json({ 
      error: error.message || 'Failed to confirm Candy Machine deployment',
    }, { status: 500 })
  }
}
