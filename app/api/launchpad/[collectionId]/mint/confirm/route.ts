import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { getConnectionAsync } from '@/lib/solana/connection'

/**
 * POST /api/launchpad/[collectionId]/mint/confirm
 * Confirm a mint transaction after user broadcasts it
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
    const { signature, nft_mint_address, wallet_address } = body

    if (!signature || !nft_mint_address) {
      return NextResponse.json({ 
        error: 'signature and nft_mint_address required' 
      }, { status: 400 })
    }

    // Find the mint record
    const mints = await sql`
      SELECT * FROM solana_nft_mints
      WHERE collection_id = ${collectionId}::uuid
      AND nft_mint_address = ${nft_mint_address}
      AND minter_wallet = ${wallet_address}
      AND mint_status = 'awaiting_signature'
    ` as any[]

    if (!mints.length) {
      return NextResponse.json({ 
        error: 'Mint record not found',
      }, { status: 404 })
    }

    const mint = mints[0]

    // Update mint record with signature
    await sql`
      UPDATE solana_nft_mints
      SET 
        mint_tx_signature = ${signature},
        mint_status = 'confirming'
      WHERE id = ${mint.id}::uuid
    `

    // Update session
    if (mint.session_id) {
      await sql`
        UPDATE mint_sessions
        SET status = 'confirming'
        WHERE id = ${mint.session_id}::uuid
      `
    }

    console.log(`⏳ Confirming mint transaction: ${signature}`)

    // Try to verify transaction with retries (tx may take a few seconds to land)
    const connection = await getConnectionAsync()
    const MAX_RETRIES = 8
    let txConfirmed = false

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await connection.getSignatureStatus(signature, { searchTransactionHistory: false })
        const status = result?.value

        if (status) {
          if (status.err) {
            console.log(`❌ Mint transaction failed on-chain: ${JSON.stringify(status.err)}`)
            await sql`
              UPDATE solana_nft_mints
              SET mint_status = 'failed'
              WHERE id = ${mint.id}::uuid
            `
            // Decrement phase_minted counter — slot is released back to the pool
            if (mint.phase_id) {
              await sql`
                UPDATE mint_phases
                SET phase_minted = GREATEST(0, COALESCE(phase_minted, 0) - 1)
                WHERE id = ${mint.phase_id}::uuid
              `
              console.log(`[Confirm Mint] Decremented phase_minted for phase ${mint.phase_id}`)
            }
            return NextResponse.json({
              success: false,
              confirmed: false,
              error: 'Transaction failed on-chain',
              details: status.err,
            }, { status: 400 })
          }

          if (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized') {
            txConfirmed = true
            break
          }
        }

        // Not found yet, wait and retry
        if (attempt < MAX_RETRIES) {
          console.log(`⏳ Attempt ${attempt}/${MAX_RETRIES}: transaction not yet confirmed, waiting...`)
          await new Promise(r => setTimeout(r, 2000)) // 2s between retries
        }
      } catch (pollError: any) {
        console.log(`⏳ Attempt ${attempt}/${MAX_RETRIES}: poll error: ${pollError.message}`)
        if (attempt < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, 2000))
        }
      }
    }

    if (txConfirmed) {
      // Transaction confirmed!
      await sql`
        UPDATE solana_nft_mints
        SET 
          mint_status = 'confirmed',
          confirmed_at = NOW()
        WHERE id = ${mint.id}::uuid
      `

      if (mint.session_id) {
        await sql`
          UPDATE mint_sessions
          SET status = 'completed'
          WHERE id = ${mint.session_id}::uuid
        `
      }

      // Mark ordinal as minted
      if (mint.ordinal_id) {
        await sql`
          UPDATE generated_ordinals
          SET is_minted = true
          WHERE id = ${mint.ordinal_id}::uuid
        `
      } else {
        // No direct link (Core CM mint) - mark the next unminted ordinal
        await sql`
          UPDATE generated_ordinals
          SET is_minted = true
          WHERE id = (
            SELECT id FROM generated_ordinals
            WHERE collection_id = ${collectionId}::uuid
            AND is_minted = false
            ORDER BY ordinal_number ASC
            LIMIT 1
          )
        `
      }

      console.log(`✅ Mint confirmed: ${nft_mint_address}`)

      return NextResponse.json({
        success: true,
        confirmed: true,
        nftMint: nft_mint_address,
        signature,
        message: 'NFT minted successfully!',
      })
    }

    // Still not confirmed after retries - return pending
    console.log(`⏳ Transaction still pending after ${MAX_RETRIES} attempts: ${signature}`)
    return NextResponse.json({
      success: true,
      confirmed: false,
      nftMint: nft_mint_address,
      signature,
      message: 'Transaction submitted. Confirmation pending...',
    })

  } catch (error: any) {
    console.error('[Confirm Mint] Error:', error)
    return NextResponse.json({ 
      error: error.message || 'Failed to confirm mint',
      details: error.toString()
    }, { status: 500 })
  }
}

/**
 * GET /api/launchpad/[collectionId]/mint/confirm?signature=xxx
 * Check status of a pending mint
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ collectionId: string }> }
) {
  if (!sql) {
    return NextResponse.json({ error: 'Database not available' }, { status: 500 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const signature = searchParams.get('signature')
    const nftMint = searchParams.get('nft_mint')

    if (!signature && !nftMint) {
      return NextResponse.json({ 
        error: 'signature or nft_mint parameter required' 
      }, { status: 400 })
    }

    let mints
    if (signature) {
      mints = await sql`
        SELECT * FROM solana_nft_mints
        WHERE mint_tx_signature = ${signature}
      ` as any[]
    } else {
      mints = await sql`
        SELECT * FROM solana_nft_mints
        WHERE nft_mint_address = ${nftMint}
      ` as any[]
    }

    if (!mints.length) {
      return NextResponse.json({ 
        error: 'Mint not found',
      }, { status: 404 })
    }

    const mint = mints[0]
    const { collectionId } = await params

    // If status is still 'confirming', try to confirm on-chain now
    if (mint.mint_status === 'confirming' && mint.mint_tx_signature) {
      try {
        const connection = await getConnectionAsync()
        const result = await connection.getSignatureStatus(mint.mint_tx_signature, { searchTransactionHistory: true })
        const status = result?.value

        if (status && status.err) {
          // Failed on-chain — mark failed and release phase slot
          await sql`
            UPDATE solana_nft_mints SET mint_status = 'failed'
            WHERE id = ${mint.id}::uuid
          `
          if (mint.phase_id) {
            await sql`
              UPDATE mint_phases
              SET phase_minted = GREATEST(0, COALESCE(phase_minted, 0) - 1)
              WHERE id = ${mint.phase_id}::uuid
            `
          }
          return NextResponse.json({
            success: true,
            mint: {
              nftMint: mint.nft_mint_address,
              signature: mint.mint_tx_signature,
              status: 'failed',
              confirmed: false,
              error: status.err,
            },
          })
        }

        if (status && !status.err && (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized')) {
          // Confirmed on-chain! Update DB
          await sql`
            UPDATE solana_nft_mints
            SET mint_status = 'confirmed', confirmed_at = NOW()
            WHERE id = ${mint.id}::uuid
          `

          if (mint.session_id) {
            await sql`
              UPDATE mint_sessions SET status = 'completed'
              WHERE id = ${mint.session_id}::uuid
            `
          }

          // Mark ordinal as minted
          if (mint.ordinal_id) {
            await sql`
              UPDATE generated_ordinals SET is_minted = true
              WHERE id = ${mint.ordinal_id}::uuid
            `
          } else {
            await sql`
              UPDATE generated_ordinals SET is_minted = true
              WHERE id = (
                SELECT id FROM generated_ordinals
                WHERE collection_id = ${collectionId}::uuid
                AND is_minted = false
                ORDER BY ordinal_number ASC
                LIMIT 1
              )
            `
          }

          console.log(`✅ Mint confirmed via poll: ${mint.nft_mint_address}`)

          return NextResponse.json({
            success: true,
            mint: {
              nftMint: mint.nft_mint_address,
              signature: mint.mint_tx_signature,
              status: 'confirmed',
              confirmed: true,
              confirmedAt: new Date().toISOString(),
              createdAt: mint.created_at,
            },
          })
        }
      } catch (pollError) {
        // Ignore poll errors, just return current status
      }
    }

    return NextResponse.json({
      success: true,
      mint: {
        nftMint: mint.nft_mint_address,
        signature: mint.mint_tx_signature,
        status: mint.mint_status,
        confirmed: mint.mint_status === 'confirmed',
        confirmedAt: mint.confirmed_at,
        createdAt: mint.created_at,
      },
    })

  } catch (error: any) {
    console.error('[Check Mint Status] Error:', error)
    return NextResponse.json({ 
      error: error.message || 'Failed to check mint status',
    }, { status: 500 })
  }
}
