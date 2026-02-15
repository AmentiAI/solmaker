import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { createUmiInstanceAsync } from '@/lib/solana/umi-config'
import { addCandyMachineConfigLines } from '@/lib/solana/candy-machine'
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
import { getAgentSignerPublicKey } from '@/lib/solana/agent-signer'
import { toWeb3JsTransaction } from '@metaplex-foundation/umi-web3js-adapters'

/**
 * POST /api/collections/[id]/deploy/candy-machine-tx
 * Build a SINGLE candy machine transaction on-demand.
 * Builds with a fresh blockhash right before the user signs,
 * preventing Phantom service worker timeout / auto-reject.
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
    const { wallet_address, transaction_index, candy_machine_address } = body

    console.log(`[CM TX] Building transaction ${transaction_index} for collection ${collectionId}`)

    // Verify collection
    const collections = await sql`
      SELECT * FROM collections WHERE id = ${collectionId}::uuid
    ` as any[]

    if (!collections.length) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 })
    }

    const collection = collections[0]
    const isOwner = collection.wallet_address === wallet_address

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

    if (!isOwner && !isCollaborator) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Get metadata URIs
    const metadataUris = await sql`
      SELECT nft_name, metadata_uri, nft_number
      FROM nft_metadata_uris
      WHERE collection_id = ${collectionId}::uuid
      ORDER BY nft_number
    ` as any[]

    if (!metadataUris.length) {
      return NextResponse.json({ error: 'No metadata URIs found' }, { status: 400 })
    }

    const configLines = metadataUris.map((m: any) => ({
      name: m.nft_name || `NFT #${m.nft_number}`,
      uri: m.metadata_uri,
    }))

    // Create Umi instance with fresh connection
    const umi = await createUmiInstanceAsync()
    umi.use(signerIdentity(createNoopSigner(publicKey(wallet_address))))

    let transactionBuilder
    let candyMachineSigner
    let description: string
    let newCandyMachineAddress: string | null = null

    if (transaction_index === 0) {
      // ---- Transaction 0: Create Candy Machine + Candy Guard ----
      const mintPriceSol = collection.mint_price ? parseFloat(String(collection.mint_price)) : 0
      const platformFeeSol = PLATFORM_FEES.MINT_FEE_SOL
      const platformWalletAddress = getPlatformWalletAddress()

      if (!platformWalletAddress) {
        return NextResponse.json({ error: 'Platform wallet not configured' }, { status: 500 })
      }

      candyMachineSigner = generateSigner(umi)
      newCandyMachineAddress = candyMachineSigner.publicKey.toString()

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

      // thirdPartySigner guard on ALL collections — forces every mint through our API.
      // Without this, anyone who knows the CM address can mint directly on-chain,
      // bypassing phase allocation limits and per-wallet limits.
      try {
        const agentSignerPubkey = getAgentSignerPublicKey()
        guards.thirdPartySigner = some({
          signerKey: publicKey(agentSignerPubkey),
        })
        console.log(`[CM TX] Adding thirdPartySigner guard: ${agentSignerPubkey}`)

        // Save the agent signer pubkey to the collection
        await sql`
          UPDATE collections SET agent_signer_pubkey = ${agentSignerPubkey}
          WHERE id = ${collectionId}::uuid
        `
      } catch (err: any) {
        console.error('[CM TX] Failed to set up agent signer:', err.message)
        return NextResponse.json({ error: 'AGENT_SIGNER_SECRET not configured on server' }, { status: 500 })
      }

      transactionBuilder = await create(umi, {
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

      description = 'Create Candy Machine + Guard'
    } else {
      // ---- Transaction N: Add config lines in batch ----
      if (!candy_machine_address) {
        return NextResponse.json({ error: 'candy_machine_address required for config line transactions' }, { status: 400 })
      }

      // Calculate batch size dynamically based on actual URI lengths.
      // Solana transactions are limited to 1232 bytes. Each config line adds
      // name + uri bytes to the instruction data, plus ~300 bytes of overhead
      // (accounts, signatures, blockhash, instruction discriminator).
      const TX_OVERHEAD = 400 // conservative overhead estimate
      const MAX_TX_SIZE = 1232
      const availableBytes = MAX_TX_SIZE - TX_OVERHEAD

      // Use start_index from body if provided, otherwise calculate from transaction_index
      const startIndex = body.start_index ?? (transaction_index - 1) * 5 // fallback to batch of 5
      const remaining = configLines.slice(startIndex)

      if (!remaining.length) {
        return NextResponse.json({ error: 'No config lines for this start index' }, { status: 400 })
      }

      // Pack as many config lines as will fit in the transaction
      let batchBytes = 0
      let batchCount = 0
      for (const line of remaining) {
        const lineBytes = Buffer.byteLength(line.name, 'utf8') + Buffer.byteLength(line.uri, 'utf8') + 4 // 4 bytes for length prefixes
        if (batchBytes + lineBytes > availableBytes && batchCount > 0) break
        batchBytes += lineBytes
        batchCount++
      }

      const batch = remaining.slice(0, batchCount)
      const nextIndex = startIndex + batchCount

      console.log(`[CM TX] Config lines batch: ${batch.length} items, ~${batchBytes + TX_OVERHEAD} bytes, start=${startIndex}`)

      transactionBuilder = await addCandyMachineConfigLines(
        umi,
        candy_machine_address,
        batch,
        startIndex,
      )

      description = `Add config lines ${startIndex + 1}-${startIndex + batch.length}`

      // Return nextIndex so frontend knows where to continue
      newCandyMachineAddress = null // not used for config line txs
      // We'll add nextIndex to the response below
      ;(body as any)._nextIndex = nextIndex
      ;(body as any)._totalItems = configLines.length
    }

    // Build with latest blockhash and serialize
    const built = await transactionBuilder.buildWithLatestBlockhash(umi)

    // Partially sign with candy machine keypair for transaction 0
    const finalTx = (transaction_index === 0 && candyMachineSigner)
      ? await candyMachineSigner.signTransaction(built)
      : built

    // Convert Umi transaction → web3.js VersionedTransaction → serialize
    // This ensures the wire format matches what VersionedTransaction.deserialize() expects on the frontend.
    // Using umi.transactions.serialize() directly can produce incompatible bytes for certain transaction types.
    const web3JsTx = toWeb3JsTransaction(finalTx)
    const serializedBytes = web3JsTx.serialize()
    const serializedTx = Buffer.from(serializedBytes).toString('base64')

    console.log(`[CM TX] Transaction ${transaction_index} built: ${description} (${serializedBytes.length} bytes, message version: ${finalTx.message.version})`)

    return NextResponse.json({
      success: true,
      transaction: serializedTx,
      description,
      candyMachine: newCandyMachineAddress || candy_machine_address,
      nextIndex: (body as any)._nextIndex ?? null,
      totalItems: (body as any)._totalItems ?? null,
    })

  } catch (error: any) {
    console.error('[CM TX] Error:', error)
    return NextResponse.json({
      error: error.message || 'Failed to build transaction',
      details: error.toString(),
    }, { status: 500 })
  }
}
