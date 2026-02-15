import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { createUmiInstanceAsync } from '@/lib/solana/umi-config'
import { buildCandyMachineMint } from '@/lib/solana/candy-machine'
import { LAMPORTS_PER_SOL, Connection, VersionedTransaction } from '@solana/web3.js'
import { getPlatformWalletAddress, PLATFORM_FEES } from '@/lib/solana/platform-wallet'
import { getConnectionAsync } from '@/lib/solana/connection'
import { getAgentSignerKeypair, verifyAgentChallenge } from '@/lib/solana/agent-signer'
import { toWeb3JsTransaction } from '@metaplex-foundation/umi-web3js-adapters'

/**
 * POST /api/launchpad/[collectionId]/mint/build
 * Build a mint transaction for the user to sign.
 *
 * Core Candy Machine + Candy Guard approach:
 * - Guards enforce fees on-chain (solPayment + solFixedFee)
 * - NO platform wallet signing needed
 * - The user signs the transaction → sends → done
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
    const { wallet_address, phase_id, quantity = 1, agent_challenge, agent_timestamp } = body

    if (!wallet_address) {
      return NextResponse.json({ error: 'wallet_address required' }, { status: 400 })
    }

    const platformWalletAddress = getPlatformWalletAddress()
    if (!platformWalletAddress) {
      return NextResponse.json({ error: 'Platform wallet not configured' }, { status: 500 })
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

    // Agent mint: verify challenge if required
    const isAgentMintType = collection.mint_type === 'agent_only' || collection.mint_type === 'agent_and_human'
    if (isAgentMintType) {
      if (collection.mint_type === 'agent_only' && (!agent_challenge || !agent_timestamp)) {
        return NextResponse.json({ error: 'agent_challenge and agent_timestamp required for agent-only mint' }, { status: 400 })
      }
      if (agent_challenge && agent_timestamp) {
        const challengeResult = verifyAgentChallenge(wallet_address, collectionId, agent_challenge, agent_timestamp)
        if (!challengeResult.valid) {
          return NextResponse.json({ error: challengeResult.error }, { status: 403 })
        }
        console.log(`[Build Mint] Agent challenge verified for ${wallet_address}`)
      }
    }

    // Check if minting has started
    if (!collection.launched_at || new Date(collection.launched_at) > new Date()) {
      return NextResponse.json({ error: 'Minting has not started yet' }, { status: 400 })
    }

    // Expire stale awaiting_signature mints older than 5 minutes
    // This prevents abandoned build requests from permanently consuming allocation
    await sql`
      UPDATE solana_nft_mints
      SET mint_status = 'cancelled'
      WHERE collection_id = ${collectionId}::uuid
      AND mint_status = 'awaiting_signature'
      AND created_at < NOW() - INTERVAL '5 minutes'
    `

    // Get mint price and phase details
    let mintPriceSol = 0
    let activePhase: any = null

    if (phase_id) {
      const phases = await sql`
        SELECT id, phase_name, mint_price_sol, start_time, end_time,
               phase_allocation, phase_minted, max_per_wallet,
               whitelist_only, whitelist_id, is_completed
        FROM mint_phases
        WHERE id = ${phase_id}::uuid
        AND collection_id = ${collectionId}::uuid
      ` as any[]

      if (phases.length) {
        activePhase = phases[0]
        const now = new Date()
        const startTime = new Date(activePhase.start_time)
        const endTime = activePhase.end_time ? new Date(activePhase.end_time) : null

        if (now < startTime) {
          return NextResponse.json({ error: 'Phase has not started yet' }, { status: 400 })
        }
        if (endTime && now > endTime) {
          return NextResponse.json({ error: 'Phase has ended' }, { status: 400 })
        }
        if (activePhase.is_completed) {
          return NextResponse.json({ error: 'Phase is completed' }, { status: 400 })
        }

        mintPriceSol = activePhase.mint_price_sol
          ? parseFloat(String(activePhase.mint_price_sol))
          : 0
      }
    }

    const platformFeeSol = PLATFORM_FEES.MINT_FEE_SOL
    const mintPriceLamports = Math.floor(mintPriceSol * LAMPORTS_PER_SOL)

    // Check supply — count ALL non-failed/non-cancelled mints to prevent race conditions
    const supplyResult = await sql`
      SELECT COUNT(*) as count
      FROM generated_ordinals
      WHERE collection_id = ${collectionId}::uuid
    ` as any[]
    const totalSupply = parseInt(supplyResult[0]?.count || '0', 10)

    const minted = await sql`
      SELECT COUNT(*) as count
      FROM solana_nft_mints
      WHERE collection_id = ${collectionId}::uuid
      AND mint_status NOT IN ('failed', 'cancelled')
    ` as any[]
    const mintedCount = parseInt(minted[0]?.count || '0', 10)

    console.log(`[Build Mint] Supply check: ${mintedCount}/${totalSupply} (including in-flight)`)

    if (totalSupply > 0 && mintedCount >= totalSupply) {
      return NextResponse.json({
        error: 'Collection sold out',
        minted: mintedCount,
        totalSupply,
      }, { status: 400 })
    }

    // Phase allocation check — count mints for this phase (including in-flight)
    if (activePhase && activePhase.phase_allocation) {
      const phaseAllocation = parseInt(String(activePhase.phase_allocation), 10)
      const phaseMintedResult = await sql`
        SELECT COUNT(*) as count
        FROM solana_nft_mints
        WHERE collection_id = ${collectionId}::uuid
        AND phase_id = ${phase_id}::uuid
        AND mint_status NOT IN ('failed', 'cancelled')
      ` as any[]
      const phaseMinted = parseInt(phaseMintedResult[0]?.count || '0', 10)

      console.log(`[Build Mint] Phase allocation check: ${phaseMinted}/${phaseAllocation}`)

      if (phaseMinted >= phaseAllocation) {
        return NextResponse.json({
          error: 'Phase allocation exhausted',
          phase_minted: phaseMinted,
          phase_allocation: phaseAllocation,
        }, { status: 400 })
      }
    }

    // Per-wallet limit check — count this wallet's mints for this phase (including in-flight)
    if (activePhase && activePhase.max_per_wallet) {
      const maxPerWallet = parseInt(String(activePhase.max_per_wallet), 10)
      const walletMintedResult = await sql`
        SELECT COUNT(*) as count
        FROM solana_nft_mints
        WHERE collection_id = ${collectionId}::uuid
        AND minter_wallet = ${wallet_address}
        AND phase_id = ${phase_id}::uuid
        AND mint_status NOT IN ('failed', 'cancelled')
      ` as any[]
      const walletMinted = parseInt(walletMintedResult[0]?.count || '0', 10)

      console.log(`[Build Mint] Per-wallet limit check: ${walletMinted}/${maxPerWallet} for ${wallet_address}`)

      if (walletMinted >= maxPerWallet) {
        return NextResponse.json({
          error: `Wallet mint limit reached. You have ${walletMinted} mint(s) and the maximum is ${maxPerWallet} per wallet.`,
          wallet_minted: walletMinted,
          max_per_wallet: maxPerWallet,
        }, { status: 400 })
      }
    }

    // Create mint session
    const sessions = await sql`
      INSERT INTO mint_sessions (
        collection_id, wallet_address, status, session_data
      ) VALUES (
        ${collectionId}::uuid, ${wallet_address}, 'pending',
        ${JSON.stringify({ phase_id, quantity })}::jsonb
      )
      RETURNING id
    ` as any[]

    const sessionId = sessions[0].id

    // Build Core Candy Machine mint transaction
    console.log(`🎨 Building Core CM mint transaction for ${wallet_address}...`)
    const umi = await createUmiInstanceAsync()

    // Set the minter (user) as identity with noop signer - they sign on frontend
    const { createNoopSigner, signerIdentity, publicKey: umiPublicKey, createSignerFromKeypair } = await import('@metaplex-foundation/umi')
    const minterSigner = createNoopSigner(umiPublicKey(wallet_address))
    umi.use(signerIdentity(minterSigner))

    // Create agent signer if this is an agent mint collection
    let agentSignerUmi: any = undefined
    if (isAgentMintType) {
      try {
        const agentKeypair = getAgentSignerKeypair()
        const umiKeypair = umi.eddsa.createKeypairFromSecretKey(agentKeypair.secretKey)
        agentSignerUmi = createSignerFromKeypair(umi, umiKeypair)
        console.log(`[Build Mint] Agent signer: ${agentSignerUmi.publicKey.toString()}`)
      } catch (err: any) {
        console.error('[Build Mint] Failed to create agent signer:', err.message)
        return NextResponse.json({ error: 'Agent signer not configured on server' }, { status: 500 })
      }
    }

    // Build mint transaction
    const { builder, nftMint, nftMintSigner } = await buildCandyMachineMint(umi, {
      candyMachineAddress: collection.candy_machine_address,
      collectionMint: collection.collection_mint_address,
      minterPublicKey: wallet_address,
      mintPriceSol,
      creatorWallet: collection.wallet_address,
      platformFeeSol,
      platformWallet: platformWalletAddress,
      agentSigner: agentSignerUmi,
    })

    // Build the transaction, partially sign with nftMint keypair
    // and optionally with agent signer (for agent mint collections)
    const built = await builder.buildWithLatestBlockhash(umi)
    let partiallySignedTx = await nftMintSigner.signTransaction(built)
    if (agentSignerUmi) {
      partiallySignedTx = await agentSignerUmi.signTransaction(partiallySignedTx)
      console.log('[Build Mint] Transaction co-signed with agent signer')
    }
    const web3JsTx = toWeb3JsTransaction(partiallySignedTx)
    const serialized = Buffer.from(web3JsTx.serialize()).toString('base64')

    console.log(`[Build Mint] Transaction built. NFT mint: ${nftMint.toString()}`)
    console.log(`[Build Mint] Mint price: ${mintPriceSol} SOL, Platform fee: ${platformFeeSol} SOL`)

    // Server-side simulation to catch errors BEFORE sending to wallet
    let simulationResult: any = null
    try {
      const connection = await getConnectionAsync()
      const txBytes = Buffer.from(serialized, 'base64')
      const web3Tx = VersionedTransaction.deserialize(txBytes)

      const simResult = await connection.simulateTransaction(web3Tx, {
        sigVerify: false,
        replaceRecentBlockhash: true,
      })

      simulationResult = {
        success: simResult.value.err === null,
        error: simResult.value.err,
        logs: simResult.value.logs,
        unitsConsumed: simResult.value.unitsConsumed,
      }

      if (simResult.value.err) {
        console.error('[Build Mint] ❌ SIMULATION FAILED:', JSON.stringify(simResult.value.err))
        console.error('[Build Mint] Simulation logs:', simResult.value.logs?.join('\n'))
      } else {
        console.log(`[Build Mint] ✅ Simulation passed. Units consumed: ${simResult.value.unitsConsumed}`)
      }
    } catch (simError: any) {
      console.error('[Build Mint] Simulation error:', simError.message)
      simulationResult = { success: false, error: simError.message, logs: [] }
    }

    // Create pending mint record
    const platformFeeLamports = Math.floor(platformFeeSol * LAMPORTS_PER_SOL)
    await sql`
      INSERT INTO solana_nft_mints (
        collection_id, candy_machine_address, session_id, phase_id,
        nft_mint_address, minter_wallet, mint_price_lamports,
        platform_fee_lamports, total_paid_lamports, mint_status
      ) VALUES (
        ${collectionId}::uuid, ${collection.candy_machine_address},
        ${sessionId}::uuid, ${phase_id || null},
        ${nftMint.toString()}, ${wallet_address},
        ${mintPriceLamports}, ${platformFeeLamports}, ${mintPriceLamports + platformFeeLamports}, 'awaiting_signature'
      )
      RETURNING id
    ` as any[]

    return NextResponse.json({
      success: true,
      sessionId,
      nftMint: nftMint.toString(),
      transaction: serialized,
      mintPrice: mintPriceSol,
      platformFee: platformFeeSol,
      totalCost: mintPriceSol + platformFeeSol,
      message: 'Sign this transaction to mint your NFT',
      simulation: simulationResult,
      debug: {
        candyMachine: collection.candy_machine_address,
        collectionMint: collection.collection_mint_address,
        minter: wallet_address,
        mintPriceSol,
        platformFeeSol,
        type: 'core',
      },
    })

  } catch (error: any) {
    console.error('[Build Mint] Error:', error)
    return NextResponse.json({
      error: error.message || 'Failed to build mint transaction',
      details: error.toString()
    }, { status: 500 })
  }
}
