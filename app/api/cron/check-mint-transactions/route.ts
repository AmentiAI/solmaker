import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'

/**
 * Check Solana transaction status using RPC getSignatureStatuses
 * Returns confirmation status for a given transaction signature.
 */
async function checkSolanaTransaction(txSignature: string): Promise<{
  signature: string
  confirmed: boolean
  finalized: boolean
  err: any | null
  exists: boolean
} | null> {
  try {
    const response = await fetch(SOLANA_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getSignatureStatuses',
        params: [[txSignature], { searchTransactionHistory: true }],
      }),
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) {
      throw new Error(`Solana RPC error: ${response.status}`)
    }

    const data = await response.json()

    if (data.error) {
      throw new Error(`Solana RPC error: ${data.error.message}`)
    }

    const result = data.result?.value?.[0]

    if (!result) {
      // Transaction not found in recent or historical records
      return {
        signature: txSignature,
        confirmed: false,
        finalized: false,
        err: null,
        exists: false,
      }
    }

    const confirmationStatus = result.confirmationStatus
    const err = result.err

    return {
      signature: txSignature,
      confirmed: confirmationStatus === 'confirmed' || confirmationStatus === 'finalized',
      finalized: confirmationStatus === 'finalized',
      err,
      exists: true,
    }
  } catch (error: any) {
    console.error(`Error checking Solana transaction ${txSignature}:`, error)
    return null
  }
}

/**
 * Cron job to:
 * 1. Clean up abandoned mint_nfts (no tx_signature after 60 seconds)
 * 2. Release expired reservations (1 min if not signed)
 * 3. Check unconfirmed Solana mint transactions
 * 4. Update confirmation statuses
 * 5. Cleanup failed transactions (err !== null)
 *
 * Runs every 2 minutes
 */
export async function GET(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const now = new Date()
    console.log(`[Mint Transaction Checker] Running at ${now.toISOString()}`)

    // 1. Clean up abandoned mint_nfts (no tx_signature after 60 seconds)
    const abandonedMints = await sql`
      SELECT id, ordinal_id, collection_id, minter_wallet
      FROM mint_nfts
      WHERE tx_signature IS NULL
        AND created_at < NOW() - INTERVAL '60 seconds'
        AND created_at > NOW() - INTERVAL '10 minutes'
        AND is_test_mint = false
      LIMIT 100
    ` as any[]

    if (abandonedMints.length > 0) {
      console.log(`[Mint Transaction Checker] Found ${abandonedMints.length} abandoned mint(s) to clean up`)

      for (const mint of abandonedMints) {
        // Delete the abandoned mint_nfts record
        await sql`
          DELETE FROM mint_nfts
          WHERE id = ${mint.id}
        `

        // Mark ordinal as available ONLY if no other user has successfully minted it
        if (mint.ordinal_id) {
          const otherSuccessfulMint = await sql`
            SELECT id FROM mint_nfts
            WHERE ordinal_id = ${mint.ordinal_id}
              AND id != ${mint.id}
              AND mint_status IN ('completed', 'confirmed', 'submitted')
              AND is_test_mint = false
            LIMIT 1
          ` as any[]

          if (!otherSuccessfulMint || otherSuccessfulMint.length === 0) {
            await sql`
              UPDATE generated_ordinals
              SET is_minted = false
              WHERE id = ${mint.ordinal_id}
            `
          }
        }

        console.log(`  Cleaned up abandoned mint ${mint.id} (ordinal: ${mint.ordinal_id})`)
      }
    }

    // 2. Release expired reservations (using simplified utility)
    const { releaseExpiredReservationsBatch } = await import('@/lib/reservation-utils')
    const expiredCount = await releaseExpiredReservationsBatch(100)

    if (expiredCount > 0) {
      console.log(`[Mint Transaction Checker] Released ${expiredCount} expired reservation(s)`)
    }

    // 3. Find unconfirmed Solana mint transactions that need checking
    // Skip if checked within last 30 seconds (Solana is fast)
    // Skip already failed/completed/expired
    const unconfirmedMints = await sql`
      SELECT id, tx_signature, collection_id, ordinal_id, mint_status
      FROM mint_nfts
      WHERE tx_signature IS NOT NULL
        AND mint_status NOT IN ('failed', 'completed', 'expired')
        AND (last_checked_at IS NULL OR last_checked_at < NOW() - INTERVAL '30 seconds')
        AND is_test_mint = false
      ORDER BY created_at ASC
      LIMIT 50
    ` as any[]

    console.log(`[Mint Transaction Checker] Checking ${unconfirmedMints.length} unconfirmed Solana transaction(s)`)

    let confirmed = 0
    let failed = 0

    // Check each transaction
    for (const mint of unconfirmedMints) {
      const txStatus = await checkSolanaTransaction(mint.tx_signature)

      if (!txStatus) {
        // RPC error - skip for now
        continue
      }

      if (!txStatus.exists) {
        // Transaction not found - check how old it is before marking as failed
        // Solana transactions expire if not included within ~60 seconds
        const mintAge = await sql`
          SELECT EXTRACT(EPOCH FROM (NOW() - created_at)) as age_seconds
          FROM mint_nfts
          WHERE id = ${mint.id}
        ` as any[]

        const ageSeconds = mintAge[0]?.age_seconds || 0

        if (ageSeconds > 120) {
          // Transaction is old and not found - likely expired/dropped
          console.log(`  Transaction ${mint.tx_signature} not found (expired/dropped)`)

          await sql`
            UPDATE mint_nfts
            SET
              mint_status = 'failed',
              error_message = 'Transaction not found - likely expired or dropped',
              error_code = 'TX_NOT_FOUND',
              last_checked_at = NOW()
            WHERE id = ${mint.id}
          `

          // Mark ordinal as available ONLY if no other user has successfully minted it
          if (mint.ordinal_id) {
            const otherSuccessfulMint = await sql`
              SELECT id FROM mint_nfts
              WHERE ordinal_id = ${mint.ordinal_id}
                AND id != ${mint.id}
                AND mint_status IN ('completed', 'confirmed', 'submitted')
                AND is_test_mint = false
              LIMIT 1
            ` as any[]

            if (!otherSuccessfulMint || otherSuccessfulMint.length === 0) {
              await sql`
                UPDATE generated_ordinals
                SET is_minted = false
                WHERE id = ${mint.ordinal_id}
              `
              console.log(`  Marked ordinal ${mint.ordinal_id} as available (no other mints)`)
            } else {
              console.log(`  NOT resetting ordinal ${mint.ordinal_id} - another user has minted it`)
            }
          }

          // Cancel any associated reservation
          await sql`
            UPDATE ordinal_reservations
            SET status = 'cancelled'
            WHERE ordinal_id = ${mint.ordinal_id}
              AND status = 'reserved'
          `

          failed++
        } else {
          // Transaction is recent, might still land - just update last checked
          await sql`
            UPDATE mint_nfts
            SET last_checked_at = NOW()
            WHERE id = ${mint.id}
          `
        }
      } else if (txStatus.err !== null) {
        // Transaction exists but failed on-chain
        console.log(`  Transaction ${mint.tx_signature} failed on-chain: ${JSON.stringify(txStatus.err)}`)

        await sql`
          UPDATE mint_nfts
          SET
            mint_status = 'failed',
            error_message = ${`Transaction failed on-chain: ${JSON.stringify(txStatus.err)}`},
            error_code = 'TX_FAILED',
            last_checked_at = NOW()
          WHERE id = ${mint.id}
        `

        // Mark ordinal as available ONLY if no other user has successfully minted it
        if (mint.ordinal_id) {
          const otherSuccessfulMint = await sql`
            SELECT id FROM mint_nfts
            WHERE ordinal_id = ${mint.ordinal_id}
              AND id != ${mint.id}
              AND mint_status IN ('completed', 'confirmed', 'submitted')
              AND is_test_mint = false
            LIMIT 1
          ` as any[]

          if (!otherSuccessfulMint || otherSuccessfulMint.length === 0) {
            await sql`
              UPDATE generated_ordinals
              SET is_minted = false
              WHERE id = ${mint.ordinal_id}
            `
            console.log(`  Marked ordinal ${mint.ordinal_id} as available (tx failed on-chain)`)
          }
        }

        // Cancel any associated reservation
        await sql`
          UPDATE ordinal_reservations
          SET status = 'cancelled'
          WHERE ordinal_id = ${mint.ordinal_id}
            AND status = 'reserved'
        `

        failed++
      } else if (txStatus.finalized) {
        // Transaction finalized successfully
        console.log(`  Transaction ${mint.tx_signature} finalized`)

        await sql`
          UPDATE mint_nfts
          SET
            mint_status = 'completed',
            confirmed_at = NOW(),
            completed_at = NOW(),
            last_checked_at = NOW()
          WHERE id = ${mint.id}
        `

        // Mark the ordinal as minted to prevent duplicate mints
        if (mint.ordinal_id) {
          await sql`
            UPDATE generated_ordinals
            SET is_minted = true
            WHERE id = ${mint.ordinal_id}
          `
          console.log(`  Marked ordinal ${mint.ordinal_id} as minted`)
        }

        confirmed++
      } else if (txStatus.confirmed) {
        // Transaction confirmed but not yet finalized - update status
        console.log(`  Transaction ${mint.tx_signature} confirmed (awaiting finalization)`)

        await sql`
          UPDATE mint_nfts
          SET
            mint_status = 'confirmed',
            confirmed_at = COALESCE(confirmed_at, NOW()),
            last_checked_at = NOW()
          WHERE id = ${mint.id}
        `
      } else {
        // Still processing - just update last checked
        await sql`
          UPDATE mint_nfts
          SET last_checked_at = NOW()
          WHERE id = ${mint.id}
        `
      }

      // Rate limiting - wait 100ms between checks (Solana RPC is faster than mempool)
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    return NextResponse.json({
      message: 'Mint transaction check completed',
      timestamp: now.toISOString(),
      abandoned_mints_cleaned: abandonedMints.length,
      expired_reservations: expiredCount,
      transactions_checked: unconfirmedMints.length,
      transactions_confirmed: confirmed,
      transactions_failed: failed,
    })
  } catch (error: any) {
    console.error('[Mint Transaction Checker] Error:', error)
    return NextResponse.json(
      { error: 'Failed to check mint transactions', details: error?.message },
      { status: 500 }
    )
  }
}
