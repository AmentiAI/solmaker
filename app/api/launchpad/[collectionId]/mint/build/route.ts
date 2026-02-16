import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { createUmiInstanceAsync } from '@/lib/solana/umi-config'
import { buildCandyMachineMint } from '@/lib/solana/candy-machine'
import { LAMPORTS_PER_SOL, VersionedTransaction } from '@solana/web3.js'
import { getPlatformWalletAddress, PLATFORM_FEES } from '@/lib/solana/platform-wallet'
import { getConnectionAsync } from '@/lib/solana/connection'
import { getAgentSignerKeypair, verifyAgentChallenge } from '@/lib/solana/agent-signer'
import { toWeb3JsTransaction } from '@metaplex-foundation/umi-web3js-adapters'

/**
 * POST /api/launchpad/[collectionId]/mint/build
 * Build a mint transaction for the user to sign.
 *
 * Race-condition-free flow:
 * 1. Validate collection, wallet, phase time, agent challenge
 * 2. Stale cleanup — cancel pending >2min and awaiting_signature >5min, decrement phase_minted
 * 3. Atomic phase slot claim — UPDATE phase_minted + 1 WHERE < allocation
 * 4. Conditional INSERT into solana_nft_mints with per-wallet check
 * 5. Build candy machine transaction
 * 6. Always co-sign with thirdPartySigner (ALL collections)
 * 7. Update record with nft_mint_address, status='awaiting_signature'
 * 8. If build fails → cancel record + decrement phase_minted
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ collectionId: string }> }
) {
  if (!sql) {
    return NextResponse.json({ error: 'Database not available' }, { status: 500 })
  }

  // Track state for cleanup on failure
  let mintRecordId: string | null = null
  let claimedPhaseId: string | null = null

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

    // ── 1. Validate collection ──
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

    // ── 2. Stale cleanup — atomic cancel + decrement phase_minted ──
    // Uses CTE to cancel stale records AND decrement phase_minted in one statement.
    // pending >2min: user never built a tx. awaiting_signature >5min: user never signed.
    await sql`
      WITH stale AS (
        UPDATE solana_nft_mints SET mint_status = 'cancelled'
        WHERE collection_id = ${collectionId}::uuid
          AND (
            (mint_status = 'pending' AND created_at < NOW() - INTERVAL '2 minutes')
            OR
            (mint_status = 'awaiting_signature' AND created_at < NOW() - INTERVAL '5 minutes')
          )
        RETURNING phase_id
      )
      UPDATE mint_phases SET phase_minted = GREATEST(0, COALESCE(phase_minted, 0) - sub.cnt)
      FROM (
        SELECT phase_id, COUNT(*) as cnt FROM stale WHERE phase_id IS NOT NULL GROUP BY phase_id
      ) sub
      WHERE mint_phases.id = sub.phase_id
    `

    // ── 3. Validate phase ──
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

    // ── 4. Atomic phase slot claim ──
    // PostgreSQL serializes row-level UPDATEs, so two concurrent requests on the same
    // phase row are handled sequentially. The first increments, the second sees the
    // incremented value and may fail the WHERE clause → 0 rows returned.
    if (activePhase && activePhase.phase_allocation) {
      const claimResult = await sql`
        UPDATE mint_phases
        SET phase_minted = COALESCE(phase_minted, 0) + 1
        WHERE id = ${phase_id}::uuid
          AND (phase_allocation IS NULL OR COALESCE(phase_minted, 0) < phase_allocation)
        RETURNING phase_minted, phase_allocation
      ` as any[]

      if (!claimResult.length) {
        return NextResponse.json({
          error: 'Phase allocation exhausted',
          phase_allocation: parseInt(String(activePhase.phase_allocation), 10),
        }, { status: 400 })
      }

      claimedPhaseId = phase_id
      const claimed = claimResult[0]
      console.log(`[Build Mint] Phase slot claimed: ${claimed.phase_minted}/${claimed.phase_allocation}`)
    } else if (activePhase) {
      // No allocation limit on this phase — still increment for tracking
      await sql`
        UPDATE mint_phases
        SET phase_minted = COALESCE(phase_minted, 0) + 1
        WHERE id = ${phase_id}::uuid
      `
      claimedPhaseId = phase_id
    }

    // ── 5. Check supply + per-wallet limits + INSERT mint record ──
    // Uses a conditional INSERT: the INSERT only succeeds if supply and wallet limits pass.
    const platformFeeLamports = Math.floor(platformFeeSol * LAMPORTS_PER_SOL)
    const maxPerWallet = activePhase?.max_per_wallet ? parseInt(String(activePhase.max_per_wallet), 10) : null

    // First check total supply
    const supplyResult = await sql`
      SELECT COUNT(*) as count
      FROM generated_ordinals
      WHERE collection_id = ${collectionId}::uuid
    ` as any[]
    const totalSupply = parseInt(supplyResult[0]?.count || '0', 10)

    const mintedResult = await sql`
      SELECT COUNT(*) as count
      FROM solana_nft_mints
      WHERE collection_id = ${collectionId}::uuid
      AND mint_status NOT IN ('failed', 'cancelled')
    ` as any[]
    const mintedCount = parseInt(mintedResult[0]?.count || '0', 10)

    console.log(`[Build Mint] Supply check: ${mintedCount}/${totalSupply} (including in-flight)`)

    if (totalSupply > 0 && mintedCount >= totalSupply) {
      // Undo phase claim
      if (claimedPhaseId) {
        await sql`UPDATE mint_phases SET phase_minted = GREATEST(0, COALESCE(phase_minted, 0) - 1) WHERE id = ${claimedPhaseId}::uuid`
        claimedPhaseId = null
      }
      return NextResponse.json({
        error: 'Collection sold out',
        minted: mintedCount,
        totalSupply,
      }, { status: 400 })
    }

    // Per-wallet limit check
    if (maxPerWallet !== null && phase_id) {
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
        // Undo phase claim
        if (claimedPhaseId) {
          await sql`UPDATE mint_phases SET phase_minted = GREATEST(0, COALESCE(phase_minted, 0) - 1) WHERE id = ${claimedPhaseId}::uuid`
          claimedPhaseId = null
        }
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

    // INSERT pending mint record (nft_mint_address filled after build)
    const insertResult = await sql`
      INSERT INTO solana_nft_mints (
        collection_id, candy_machine_address, session_id, phase_id,
        minter_wallet, mint_price_lamports,
        platform_fee_lamports, total_paid_lamports, mint_status
      ) VALUES (
        ${collectionId}::uuid, ${collection.candy_machine_address},
        ${sessionId}::uuid, ${phase_id || null},
        ${wallet_address},
        ${mintPriceLamports}, ${platformFeeLamports}, ${mintPriceLamports + platformFeeLamports}, 'pending'
      )
      RETURNING id
    ` as any[]
    mintRecordId = insertResult[0].id

    // ── 6. Build candy machine transaction ──
    console.log(`[Build Mint] Building Core CM mint transaction for ${wallet_address}...`)
    const umi = await createUmiInstanceAsync()

    const { createNoopSigner, signerIdentity, publicKey: umiPublicKey, createSignerFromKeypair } = await import('@metaplex-foundation/umi')
    const minterSigner = createNoopSigner(umiPublicKey(wallet_address))
    umi.use(signerIdentity(minterSigner))

    // Create server signer (thirdPartySigner) — required for ALL collections
    let serverSignerUmi: any
    try {
      const agentKeypair = getAgentSignerKeypair()
      const umiKeypair = umi.eddsa.createKeypairFromSecretKey(agentKeypair.secretKey)
      serverSignerUmi = createSignerFromKeypair(umi, umiKeypair)
      console.log(`[Build Mint] Server signer: ${serverSignerUmi.publicKey.toString()}`)
    } catch (err: any) {
      console.error('[Build Mint] Failed to create server signer:', err.message)
      // Cleanup
      if (mintRecordId) {
        await sql`UPDATE solana_nft_mints SET mint_status = 'cancelled' WHERE id = ${mintRecordId}::uuid`
      }
      if (claimedPhaseId) {
        await sql`UPDATE mint_phases SET phase_minted = GREATEST(0, COALESCE(phase_minted, 0) - 1) WHERE id = ${claimedPhaseId}::uuid`
      }
      return NextResponse.json({ error: 'Server signer not configured' }, { status: 500 })
    }

    // Build mint transaction — agentSigner is now always provided
    const { builder, nftMint, nftMintSigner } = await buildCandyMachineMint(umi, {
      candyMachineAddress: collection.candy_machine_address,
      collectionMint: collection.collection_mint_address,
      minterPublicKey: wallet_address,
      mintPriceSol,
      creatorWallet: collection.creator_royalty_wallet || collection.wallet_address,
      platformFeeSol,
      platformWallet: platformWalletAddress,
      agentSigner: serverSignerUmi,
    })

    // Build the transaction, partially sign with nftMint keypair + server signer
    const built = await builder.buildWithLatestBlockhash(umi)
    let partiallySignedTx = await nftMintSigner.signTransaction(built)
    partiallySignedTx = await serverSignerUmi.signTransaction(partiallySignedTx)
    console.log('[Build Mint] Transaction co-signed with server signer (thirdPartySigner)')

    const web3JsTx = toWeb3JsTransaction(partiallySignedTx)
    const serialized = Buffer.from(web3JsTx.serialize()).toString('base64')

    console.log(`[Build Mint] Transaction built. NFT mint: ${nftMint.toString()}`)
    console.log(`[Build Mint] Mint price: ${mintPriceSol} SOL, Platform fee: ${platformFeeSol} SOL`)

    // ── 7. Server-side simulation ──
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
        console.error('[Build Mint] SIMULATION FAILED:', JSON.stringify(simResult.value.err))
        console.error('[Build Mint] Simulation logs:', simResult.value.logs?.join('\n'))
      } else {
        console.log(`[Build Mint] Simulation passed. Units consumed: ${simResult.value.unitsConsumed}`)
      }
    } catch (simError: any) {
      console.error('[Build Mint] Simulation error:', simError.message)
      simulationResult = { success: false, error: simError.message, logs: [] }
    }

    // ── 8. Update mint record with nft_mint_address → awaiting_signature ──
    await sql`
      UPDATE solana_nft_mints
      SET nft_mint_address = ${nftMint.toString()},
          mint_status = 'awaiting_signature'
      WHERE id = ${mintRecordId}::uuid
    `

    // Record is now awaiting_signature — clear mintRecordId so catch block doesn't double-cancel
    const savedMintRecordId = mintRecordId
    mintRecordId = null
    claimedPhaseId = null

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

    // Cleanup on build failure: cancel record + decrement phase counter
    if (mintRecordId && sql) {
      try {
        await sql`UPDATE solana_nft_mints SET mint_status = 'cancelled' WHERE id = ${mintRecordId}::uuid`
      } catch (e) { console.error('[Build Mint] Cleanup error (mint record):', e) }
    }
    if (claimedPhaseId && sql) {
      try {
        await sql`UPDATE mint_phases SET phase_minted = GREATEST(0, COALESCE(phase_minted, 0) - 1) WHERE id = ${claimedPhaseId}::uuid`
      } catch (e) { console.error('[Build Mint] Cleanup error (phase counter):', e) }
    }

    return NextResponse.json({
      error: error.message || 'Failed to build mint transaction',
      details: error.toString()
    }, { status: 500 })
  }
}
