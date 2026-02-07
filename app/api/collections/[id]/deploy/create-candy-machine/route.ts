import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { createUmiInstanceAsync } from '@/lib/solana/umi-config'
import { deployCandyMachineWithMetadata, estimateCandyMachineCost } from '@/lib/solana/candy-machine'
import { publicKey } from '@metaplex-foundation/umi'
import { getPlatformWalletAddress, PLATFORM_FEES } from '@/lib/solana/platform-wallet'

/**
 * POST /api/collections/[id]/deploy/create-candy-machine
 * Step 3: Deploy Core Candy Machine with Candy Guard.
 *
 * Guards enforce:
 * - solPayment → mint price paid to creator wallet
 * - solFixedFee → platform fee paid to platform wallet
 *
 * No setMintAuthority transaction needed! Guards handle everything on-chain.
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

    // Verify platform wallet is configured (for the solFixedFee guard)
    const platformWalletAddress = getPlatformWalletAddress()
    if (!platformWalletAddress) {
      return NextResponse.json({
        error: 'Platform wallet not configured. Set SOLANA_PLATFORM_WALLET in environment.',
      }, { status: 500 })
    }

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

    if (!collection.collection_mint_address) {
      return NextResponse.json({ error: 'Create collection NFT first' }, { status: 400 })
    }

    if (!collection.metadata_uploaded) {
      return NextResponse.json({ error: 'Upload metadata first' }, { status: 400 })
    }

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
      return NextResponse.json({ error: 'No metadata URIs found. Upload metadata first.' }, { status: 400 })
    }

    // Get mint price from collection
    const mintPriceSol = collection.mint_price
      ? parseFloat(String(collection.mint_price))
      : 0

    const platformFeeSol = PLATFORM_FEES.MINT_FEE_SOL

    const costEstimate = estimateCandyMachineCost(metadataUris.length)
    console.log(`🏗️ Deploying Core Candy Machine for ${metadataUris.length} NFTs...`)
    console.log(`💰 Estimated cost: ${costEstimate.totalCost.toFixed(4)} SOL`)
    console.log(`🎯 Mint price: ${mintPriceSol} SOL → creator (${wallet_address.substring(0, 8)}...)`)
    console.log(`🏦 Platform fee: ${platformFeeSol} SOL → platform (${platformWalletAddress.substring(0, 8)}...)`)

    const configLines = metadataUris.map(m => ({
      name: m.nft_name || `NFT #${m.nft_number}`,
      uri: m.metadata_uri,
    }))

    // Create Umi instance (respects database network settings)
    const umi = await createUmiInstanceAsync()

    // Set noop signer for the user (they will sign on frontend)
    const { createNoopSigner, signerIdentity } = await import('@metaplex-foundation/umi')
    const tempSigner = createNoopSigner(publicKey(wallet_address))
    umi.use(signerIdentity(tempSigner))

    // Build Core Candy Machine + Candy Guard with guards
    const config = {
      collectionMint: collection.collection_mint_address,
      collectionUpdateAuthority: wallet_address,
      itemsAvailable: metadataUris.length,
      mintPriceSol,
      creatorWallet: wallet_address,
      platformFeeSol,
      platformWallet: platformWalletAddress,
    }

    const { candyMachine, candyMachineSigner, transactions } =
      await deployCandyMachineWithMetadata(umi, config, configLines)

    // Serialize transactions for frontend
    const serializedTxs = await Promise.all(
      transactions.map(async (tx, index) => {
        const built = await tx.buildWithLatestBlockhash(umi)
        let finalTx = built

        if (index === 0) {
          // Create CM + Guard transaction: partially sign with candy machine keypair
          finalTx = await candyMachineSigner.signTransaction(built)
        }
        // Config line transactions: only user signature needed

        let description: string
        if (index === 0) {
          description = 'Create Candy Machine + Guard'
        } else {
          const batchStart = (index - 1) * 10
          const batchEnd = Math.min(batchStart + 10, configLines.length)
          description = `Add config lines ${batchStart + 1}-${batchEnd}`
        }

        return {
          index,
          transaction: Buffer.from(umi.transactions.serialize(finalTx)).toString('base64'),
          description,
        }
      })
    )

    // Log deployment
    await sql`
      INSERT INTO candy_machine_deployments (
        collection_id, step, status, step_data
      ) VALUES (
        ${collectionId}::uuid,
        'create_candy_machine',
        'pending',
        ${JSON.stringify({
          candyMachine: candyMachine.toString(),
          type: 'core',
          mintPriceSol,
          platformFeeSol,
          platformWallet: platformWalletAddress,
          creatorWallet: wallet_address,
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
      guards: {
        solPayment: mintPriceSol > 0 ? { amountSol: mintPriceSol, destination: wallet_address } : null,
        solFixedFee: platformFeeSol > 0 ? { amountSol: platformFeeSol, destination: platformWalletAddress } : null,
      },
      message: `Sign ${serializedTxs.length} transactions to deploy Core Candy Machine`,
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

    console.log('[Confirm CM] Saving candy_machine_address:', candy_machine_address, 'for collection:', collectionId)

    // Update collection
    const updateResult = await sql`
      UPDATE collections
      SET 
        candy_machine_address = ${candy_machine_address},
        deployment_status = 'deployed'
      WHERE id = ${collectionId}::uuid
      RETURNING id, candy_machine_address, deployment_status
    `

    console.log('[Confirm CM] UPDATE result:', JSON.stringify(updateResult))

    if (!updateResult || (Array.isArray(updateResult) && updateResult.length === 0)) {
      console.error('[Confirm CM] WARNING: UPDATE returned no rows!')
    }

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

    // Verify the write
    const verify = await sql`
      SELECT candy_machine_address, deployment_status, collection_mint_address, metadata_uploaded
      FROM collections WHERE id = ${collectionId}::uuid
    ` as any[]

    const saved = verify?.[0]

    console.log('✅ Core Candy Machine deployed:', candy_machine_address)

    return NextResponse.json({
      success: true,
      candyMachine: candy_machine_address,
      txSignatures: tx_signatures,
      message: 'Core Candy Machine deployed successfully',
      dbVerification: {
        candy_machine_address: saved?.candy_machine_address,
        deployment_status: saved?.deployment_status,
        collection_mint_address: saved?.collection_mint_address,
        metadata_uploaded: saved?.metadata_uploaded,
      }
    })

  } catch (error: any) {
    console.error('[Confirm Candy Machine] Error:', error)
    return NextResponse.json({
      error: error.message || 'Failed to confirm Candy Machine deployment',
    }, { status: 500 })
  }
}
