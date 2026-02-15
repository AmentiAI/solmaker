import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { createUmiInstanceAsync } from '@/lib/solana/umi-config'
import { addCandyMachineConfigLines, estimateCandyMachineCost } from '@/lib/solana/candy-machine'
import {
  publicKey,
  createNoopSigner,
  signerIdentity,
  generateSigner,
  some,
  sol,
} from '@metaplex-foundation/umi'
import { create } from '@metaplex-foundation/mpl-core-candy-machine'
import { getPlatformWalletAddress, PLATFORM_FEES } from '@/lib/solana/platform-wallet'
import { toWeb3JsTransaction } from '@metaplex-foundation/umi-web3js-adapters'

/**
 * POST /api/collections/[id]/deploy/create-candy-machine
 * Build ALL candy machine transactions at once:
 *   - Transaction 0: Create Candy Machine + Candy Guard
 *   - Transactions 1..N: Add config lines (dynamically sized batches)
 *
 * Returns all serialized transactions for a single signAllTransactions call.
 * This avoids Phantom's MV3 service worker going idle between individual signs.
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

    // Verify collection exists and user owns it or is a collaborator
    const collections = await sql`
      SELECT * FROM collections
      WHERE id = ${collectionId}::uuid
    ` as any[]

    if (!collections.length) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 })
    }

    const collection = collections[0]
    const isOwner = collection.wallet_address === wallet_address

    // Check if user is a collaborator with editor/owner role
    let isCollaborator = false
    if (!isOwner) {
      const collaboratorResult = await sql`
        SELECT role FROM collection_collaborators
        WHERE collection_id = ${collectionId}::uuid
          AND wallet_address = ${wallet_address.trim()}
          AND status = 'accepted'
          AND role IN ('owner', 'editor')
      ` as any[]
      isCollaborator = Array.isArray(collaboratorResult) && collaboratorResult.length > 0
    }

    // User must be owner or collaborator
    if (!isOwner && !isCollaborator) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

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
    console.log(`[CM Deploy] Building ALL transactions for ${metadataUris.length} NFTs...`)
    console.log(`[CM Deploy] Mint price: ${mintPriceSol} SOL, Platform fee: ${platformFeeSol} SOL`)

    const configLines = metadataUris.map((m: any) => ({
      name: m.nft_name || `NFT #${m.nft_number}`,
      uri: m.metadata_uri,
    }))

    // Create Umi instance (respects database network settings)
    const umi = await createUmiInstanceAsync()
    umi.use(signerIdentity(createNoopSigner(publicKey(wallet_address))))

    // ===== Transaction 0: Create Candy Machine + Candy Guard =====
    const candyMachineSigner = generateSigner(umi)
    const candyMachineAddress = candyMachineSigner.publicKey.toString()

    const guards: any = {}
    if (mintPriceSol > 0) {
      guards.solPayment = some({
        lamports: sol(mintPriceSol),
        destination: publicKey(wallet_address),
      })
    }
    if (platformFeeSol > 0) {
      guards.solFixedFee = some({
        lamports: sol(platformFeeSol),
        destination: publicKey(platformWalletAddress),
      })
    }

    const createCmBuilder = await create(umi, {
      candyMachine: candyMachineSigner,
      collection: publicKey(collection.collection_mint_address),
      collectionUpdateAuthority: createNoopSigner(publicKey(wallet_address)),
      itemsAvailable: metadataUris.length,
      isMutable: true,
      configLineSettings: some({
        prefixName: '',
        nameLength: 32,
        prefixUri: '',
        uriLength: 200,
        isSequential: false,
      }),
      guards,
    })

    // ===== Transactions 1..N: Add config lines with dynamic batch sizing =====
    // Solana transactions are limited to 1232 bytes. Each config line adds
    // name + uri bytes to the instruction data.
    const TX_OVERHEAD = 400 // conservative overhead (accounts, signatures, blockhash, etc.)
    const MAX_TX_SIZE = 1232
    const availableBytes = MAX_TX_SIZE - TX_OVERHEAD

    const configLineBatches: { lines: typeof configLines; startIndex: number }[] = []
    let currentStart = 0

    while (currentStart < configLines.length) {
      let batchBytes = 0
      let batchCount = 0
      for (let i = currentStart; i < configLines.length; i++) {
        const line = configLines[i]
        const lineBytes = Buffer.byteLength(line.name, 'utf8') + Buffer.byteLength(line.uri, 'utf8') + 4
        if (batchBytes + lineBytes > availableBytes && batchCount > 0) break
        batchBytes += lineBytes
        batchCount++
      }
      configLineBatches.push({
        lines: configLines.slice(currentStart, currentStart + batchCount),
        startIndex: currentStart,
      })
      currentStart += batchCount
    }

    console.log(`[CM Deploy] Will build ${1 + configLineBatches.length} transactions (1 create + ${configLineBatches.length} config line batches)`)

    // Build config line TransactionBuilders
    const configLineBuilders = await Promise.all(
      configLineBatches.map(batch =>
        addCandyMachineConfigLines(umi, candyMachineAddress, batch.lines, batch.startIndex)
      )
    )

    // ===== Serialize ALL transactions =====
    // Build all with the same latest blockhash for consistency.
    // All transactions share one blockhash window (~60-90s).
    const allBuilders = [createCmBuilder, ...configLineBuilders]
    const serializedTxs: { index: number; transaction: string; description: string }[] = []

    for (let i = 0; i < allBuilders.length; i++) {
      const built = await allBuilders[i].buildWithLatestBlockhash(umi)

      // Do NOT partially sign here — frontend will pass the CM keypair as a
      // `signer` to sendTransaction, which lets the wallet adapter handle it properly.
      const web3JsTx = toWeb3JsTransaction(built)
      const serializedBytes = web3JsTx.serialize()

      let description: string
      if (i === 0) {
        description = 'Create Candy Machine + Guard'
      } else {
        const batch = configLineBatches[i - 1]
        description = `Add config lines ${batch.startIndex + 1}-${batch.startIndex + batch.lines.length}`
      }

      console.log(`[CM Deploy] TX ${i}: ${description} (${serializedBytes.length} bytes)`)

      serializedTxs.push({
        index: i,
        transaction: Buffer.from(serializedBytes).toString('base64'),
        description,
      })
    }

    // Log deployment
    await sql`
      INSERT INTO candy_machine_deployments (
        collection_id, step, status, step_data
      ) VALUES (
        ${collectionId}::uuid,
        'create_candy_machine',
        'pending',
        ${JSON.stringify({
          candyMachine: candyMachineAddress,
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

    // Export the CM signer's secret key so the frontend can reconstruct it
    // and pass it to sendTransaction({ signers: [keypair] }) for tx 0
    const cmSignerSecretKey = Buffer.from(candyMachineSigner.secretKey).toString('base64')

    return NextResponse.json({
      success: true,
      candyMachine: candyMachineAddress,
      cmSignerSecretKey,
      transactions: serializedTxs,
      totalItems: configLines.length,
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
