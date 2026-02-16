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

function findCommonPrefix(strings: string[]): string {
  if (strings.length === 0) return ''
  let prefix = strings[0]
  for (let i = 1; i < strings.length; i++) {
    while (!strings[i].startsWith(prefix)) {
      prefix = prefix.substring(0, prefix.length - 1)
      if (prefix === '') return ''
    }
  }
  return prefix
}

/**
 * Shared auth + collection validation
 */
async function validateCollection(collectionId: string, wallet_address: string) {
  const collections = await sql!`
    SELECT * FROM collections
    WHERE id = ${collectionId}::uuid
  ` as any[]

  if (!collections.length) {
    return { error: 'Collection not found', status: 404 }
  }

  const collection = collections[0]
  const isOwner = collection.wallet_address === wallet_address

  let isCollaborator = false
  if (!isOwner) {
    const collaboratorResult = await sql!`
      SELECT role FROM collection_collaborators
      WHERE collection_id = ${collectionId}::uuid
        AND wallet_address = ${wallet_address.trim()}
        AND status = 'accepted'
        AND role IN ('owner', 'editor')
    ` as any[]
    isCollaborator = Array.isArray(collaboratorResult) && collaboratorResult.length > 0
  }

  if (!isOwner && !isCollaborator) {
    return { error: 'Unauthorized', status: 403 }
  }

  return { collection }
}

/**
 * POST /api/collections/[id]/deploy/create-candy-machine
 *
 * Two-phase deployment to avoid blockhash expiration:
 *   step='create' (default): Build ONLY the CM creation transaction (1 tx)
 *   step='config_lines': Build ONLY config line transactions (fresh blockhash)
 *
 * This ensures each batch of transactions gets a fresh blockhash.
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
    const { wallet_address, step = 'create', candy_machine_address: existingCmAddress } = body

    const validation = await validateCollection(collectionId, wallet_address)
    if ('error' in validation) {
      return NextResponse.json({ error: validation.error }, { status: validation.status })
    }
    const { collection } = validation

    if (!collection.collection_mint_address) {
      return NextResponse.json({ error: 'Create collection NFT first' }, { status: 400 })
    }
    if (!collection.metadata_uploaded) {
      return NextResponse.json({ error: 'Upload metadata first' }, { status: 400 })
    }

    // Get all metadata URIs (needed for both phases)
    const metadataUris = await sql`
      SELECT nft_name, metadata_uri, nft_number
      FROM nft_metadata_uris
      WHERE collection_id = ${collectionId}::uuid
      ORDER BY nft_number
    ` as any[]

    if (!metadataUris.length) {
      return NextResponse.json({ error: 'No metadata URIs found. Upload metadata first.' }, { status: 400 })
    }

    const fullConfigLines = metadataUris.map((m: any) => ({
      name: m.nft_name || `NFT #${m.nft_number}`,
      uri: m.metadata_uri,
    }))

    // Prefix optimization (shared between both phases)
    const allNames = fullConfigLines.map(l => l.name)
    const allUris = fullConfigLines.map(l => l.uri)
    const prefixName = findCommonPrefix(allNames)
    const prefixUri = findCommonPrefix(allUris)
    const maxNameSuffixLen = Math.max(...allNames.map(n => n.length - prefixName.length))
    const maxUriSuffixLen = Math.max(...allUris.map(u => u.length - prefixUri.length))
    const nameLength = Math.min(maxNameSuffixLen + 2, 32)
    const uriLength = Math.min(maxUriSuffixLen + 2, 200)

    const configLines = fullConfigLines.map(l => ({
      name: l.name.substring(prefixName.length),
      uri: l.uri.substring(prefixUri.length),
    }))

    // Batch sizing constants
    const TX_OVERHEAD = 400
    const MAX_TX_SIZE = 1232
    const availableBytes = MAX_TX_SIZE - TX_OVERHEAD
    const bytesPerLine = nameLength + uriLength + 4
    const linesPerBatch = Math.max(1, Math.floor(availableBytes / bytesPerLine))

    // Count total config line batches (used in both phases for info)
    const totalConfigBatches = Math.ceil(configLines.length / linesPerBatch)

    // ============================================
    // PHASE 1: Create Candy Machine (1 transaction)
    // ============================================
    if (step === 'create') {
      if (collection.candy_machine_address) {
        return NextResponse.json({
          error: 'Candy Machine already deployed',
          candyMachine: collection.candy_machine_address,
        }, { status: 400 })
      }

      const platformWalletAddress = getPlatformWalletAddress()
      if (!platformWalletAddress) {
        return NextResponse.json({
          error: 'Platform wallet not configured. Set SOLANA_PLATFORM_WALLET in environment.',
        }, { status: 500 })
      }

      const mintPriceSol = collection.mint_price
        ? parseFloat(String(collection.mint_price))
        : 0
      const platformFeeSol = PLATFORM_FEES.MINT_FEE_SOL
      const costEstimate = estimateCandyMachineCost(metadataUris.length)

      console.log(`[CM Deploy Phase 1] Building CM creation tx for ${metadataUris.length} NFTs...`)
      console.log(`[CM Deploy Phase 1] Prefix: name="${prefixName}" (${prefixName.length}), uri="${prefixUri}" (${prefixUri.length})`)
      console.log(`[CM Deploy Phase 1] nameLength: ${nameLength}, uriLength: ${uriLength}, linesPerBatch: ${linesPerBatch}`)

      const umi = await createUmiInstanceAsync()
      umi.use(signerIdentity(createNoopSigner(publicKey(wallet_address))))

      const candyMachineSigner = generateSigner(umi)
      const candyMachineAddress = candyMachineSigner.publicKey.toString()

      const guards: any = {}
      if (mintPriceSol > 0) {
        guards.solPayment = some({
          lamports: sol(mintPriceSol),
          destination: publicKey(wallet_address),
        })
      }
      // Platform fee is NOT enforced via solFixedFee guard.
      // Instead it's enforced as an explicit SOL transfer in the mint transaction,
      // co-signed by the server (thirdPartySigner). More reliable for all CMs.

      const createCmBuilder = await create(umi, {
        candyMachine: candyMachineSigner,
        collection: publicKey(collection.collection_mint_address),
        collectionUpdateAuthority: createNoopSigner(publicKey(wallet_address)),
        itemsAvailable: metadataUris.length,
        isMutable: true,
        configLineSettings: some({
          prefixName,
          nameLength,
          prefixUri,
          uriLength,
          isSequential: false,
        }),
        guards,
      })

      const built = await createCmBuilder.buildWithLatestBlockhash(umi)
      const web3JsTx = toWeb3JsTransaction(built)
      const serializedBytes = web3JsTx.serialize()

      console.log(`[CM Deploy Phase 1] CM creation tx: ${serializedBytes.length} bytes`)

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
            configLineBatches: totalConfigBatches,
          })}::jsonb
        )
      `

      const cmSignerSecretKey = Buffer.from(candyMachineSigner.secretKey).toString('base64')

      return NextResponse.json({
        success: true,
        phase: 'create',
        candyMachine: candyMachineAddress,
        cmSignerSecretKey,
        transaction: Buffer.from(serializedBytes).toString('base64'),
        totalItems: configLines.length,
        configLineBatches: totalConfigBatches,
        estimatedCost: costEstimate,
        guards: {
          solPayment: mintPriceSol > 0 ? { amountSol: mintPriceSol, destination: wallet_address } : null,
          platformFee: platformFeeSol > 0 ? { amountSol: platformFeeSol, destination: platformWalletAddress, method: 'explicit_transfer' } : null,
        },
        message: 'Sign 1 transaction to create Candy Machine',
      })
    }

    // ============================================
    // PHASE 2: Add config lines (N transactions, fresh blockhash)
    // ============================================
    if (step === 'config_lines') {
      if (!existingCmAddress) {
        return NextResponse.json({ error: 'candy_machine_address required for config_lines step' }, { status: 400 })
      }

      console.log(`[CM Deploy Phase 2] Building config line txs for CM ${existingCmAddress}...`)
      console.log(`[CM Deploy Phase 2] ${configLines.length} lines, ${linesPerBatch} lines/batch = ${totalConfigBatches} txs`)

      const umi = await createUmiInstanceAsync()
      umi.use(signerIdentity(createNoopSigner(publicKey(wallet_address))))

      // Build config line batches
      const configLineBatches: { lines: typeof configLines; startIndex: number }[] = []
      let currentStart = 0
      while (currentStart < configLines.length) {
        const batchCount = Math.min(linesPerBatch, configLines.length - currentStart)
        configLineBatches.push({
          lines: configLines.slice(currentStart, currentStart + batchCount),
          startIndex: currentStart,
        })
        currentStart += batchCount
      }

      // Build config line TransactionBuilders
      const configLineBuilders = await Promise.all(
        configLineBatches.map(batch =>
          addCandyMachineConfigLines(umi, existingCmAddress, batch.lines, batch.startIndex)
        )
      )

      // Serialize with FRESH blockhash
      const serializedTxs: { index: number; transaction: string; description: string }[] = []

      for (let i = 0; i < configLineBuilders.length; i++) {
        const built = await configLineBuilders[i].buildWithLatestBlockhash(umi)
        const web3JsTx = toWeb3JsTransaction(built)
        const serializedBytes = web3JsTx.serialize()
        const batch = configLineBatches[i]
        const description = `Add config lines ${batch.startIndex + 1}-${batch.startIndex + batch.lines.length}`

        console.log(`[CM Deploy Phase 2] TX ${i}: ${description} (${serializedBytes.length} bytes)`)

        serializedTxs.push({
          index: i,
          transaction: Buffer.from(serializedBytes).toString('base64'),
          description,
        })
      }

      return NextResponse.json({
        success: true,
        phase: 'config_lines',
        candyMachine: existingCmAddress,
        transactions: serializedTxs,
        totalItems: configLines.length,
        message: `Sign ${serializedTxs.length} transactions to add config lines`,
      })
    }

    return NextResponse.json({ error: `Unknown step: ${step}` }, { status: 400 })

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
