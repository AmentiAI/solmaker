import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'

/**
 * Check a Solana transaction status using RPC getSignatureStatuses
 */
async function checkSolanaTransaction(txSignature: string): Promise<{
  signature: string
  confirmed: boolean
  finalized: boolean
  err: any | null
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
      return null // Transaction not found yet
    }

    const confirmationStatus = result.confirmationStatus
    const err = result.err

    return {
      signature: txSignature,
      confirmed: confirmationStatus === 'confirmed' || confirmationStatus === 'finalized',
      finalized: confirmationStatus === 'finalized',
      err,
    }
  } catch (error: any) {
    console.error('Error checking Solana transaction:', error)
    return null
  }
}

/**
 * Cron job to check pending marketplace SOL payments and complete purchases when finalized
 * This runs automatically via Vercel Cron every 5 minutes
 */
async function checkMarketplacePayments() {
  if (!sql) {
    console.error('[Marketplace Cron] Database connection not available')
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    console.log('[Marketplace Cron] ========== Starting Payment Check ==========')
    console.log('[Marketplace Cron] Timestamp:', new Date().toISOString())

    // Get all pending marketplace payments that have a tx signature
    const pendingPayments = await sql`
      SELECT
        mpp.*,
        ml.collection_id,
        ml.price_sol,
        ml.seller_sol_address,
        ml.title as listing_title
      FROM marketplace_pending_payments mpp
      JOIN collection_marketplace_listings ml ON mpp.listing_id = ml.id
      WHERE mpp.status = 'pending'
        AND mpp.payment_txid IS NOT NULL
        AND mpp.expires_at > NOW()
      ORDER BY mpp.created_at ASC
      LIMIT 50
    ` as any[]

    console.log(`[Marketplace Cron] Found ${pendingPayments.length} payments with tx signatures to check`)

    if (pendingPayments.length === 0) {
      // Also check how many are waiting for tx signatures
      const waitingForTx = await sql`
        SELECT COUNT(*) as count FROM marketplace_pending_payments
        WHERE status = 'pending' AND payment_txid IS NULL AND expires_at > NOW()
      ` as any[]
      console.log(`[Marketplace Cron] ${waitingForTx[0]?.count || 0} payments waiting for buyer to submit transaction`)

      return NextResponse.json({
        message: 'No pending marketplace payments to check',
        processed: 0,
        completed: 0,
        waiting_for_tx: waitingForTx[0]?.count || 0,
      })
    }

    console.log(`[Marketplace Cron] Checking ${pendingPayments.length} pending payments`)

    let processed = 0
    let completed = 0
    const errors: string[] = []

    for (const payment of pendingPayments) {
      try {
        if (!payment.payment_txid) continue

        console.log(`[Marketplace Cron] Checking payment ${payment.id} - signature: ${payment.payment_txid}`)

        const tx = await checkSolanaTransaction(payment.payment_txid)

        if (!tx) {
          console.log(`[Marketplace Cron] Payment ${payment.id}: Transaction not found yet`)
          continue
        }

        processed++

        // Check if the transaction failed on-chain
        if (tx.err !== null) {
          console.log(`[Marketplace Cron] Payment ${payment.id}: Transaction failed on-chain: ${JSON.stringify(tx.err)}`)
          await sql`
            UPDATE marketplace_pending_payments
            SET status = 'failed'
            WHERE id = ${payment.id}
          `
          errors.push(`Payment ${payment.id}: Transaction failed on-chain`)
          continue
        }

        // Check if finalized (Solana equivalent of confirmed with enough confirmations)
        if (tx.finalized && tx.err === null) {
          console.log(`[Marketplace Cron] Payment ${payment.id}: Transaction finalized! Processing...`)

          // Re-check payment status to prevent double processing
          const currentPayment = await sql`
            SELECT status FROM marketplace_pending_payments
            WHERE id = ${payment.id} AND status = 'pending'
          ` as any[]

          if (currentPayment.length === 0) {
            console.log(`[Marketplace Cron] Payment ${payment.id} already processed`)
            continue
          }

          // Check that listing is still active
          const listing = await sql`
            SELECT * FROM collection_marketplace_listings
            WHERE id = ${payment.listing_id} AND status = 'active'
          ` as any[]

          if (listing.length === 0) {
            console.error(`[Marketplace Cron] Listing ${payment.listing_id} is no longer active`)
            await sql`
              UPDATE marketplace_pending_payments
              SET status = 'cancelled'
              WHERE id = ${payment.id}
            `
            continue
          }

          // Execute the ownership transfer
          console.log(`[Marketplace Cron] Transferring collection ${payment.collection_id} from ${payment.seller_wallet} to ${payment.buyer_wallet}`)

          const transferResult = await sql`
            SELECT transfer_collection_ownership(
              ${payment.collection_id}::uuid,
              ${payment.seller_wallet},
              ${payment.buyer_wallet},
              ${payment.listing_id}::uuid
            ) as success
          ` as any[]

          if (!transferResult[0]?.success) {
            console.error(`[Marketplace Cron] Failed to transfer collection ${payment.collection_id}`)
            errors.push(`Payment ${payment.id}: Failed to transfer collection`)
            continue
          }

          // Mark payment as completed
          await sql`
            UPDATE marketplace_pending_payments
            SET status = 'completed', completed_at = CURRENT_TIMESTAMP
            WHERE id = ${payment.id}
          `

          // Create transaction record
          await sql`
            INSERT INTO marketplace_transactions
            (listing_id, collection_id, seller_wallet, buyer_wallet, price_credits,
             seller_credits_before, seller_credits_after, buyer_credits_before, buyer_credits_after,
             payment_type, sol_amount, sol_txid, status, completed_at)
            VALUES (
              ${payment.listing_id},
              ${payment.collection_id},
              ${payment.seller_wallet},
              ${payment.buyer_wallet},
              0,
              0, 0, 0, 0,
              'sol',
              ${payment.sol_amount},
              ${payment.payment_txid},
              'completed',
              CURRENT_TIMESTAMP
            )
          `

          completed++
          console.log(`[Marketplace Cron] Completed purchase of collection ${payment.collection_id} - ${listing[0].title}`)
        } else if (tx.confirmed) {
          console.log(`[Marketplace Cron] Payment ${payment.id}: Confirmed, awaiting finalization`)
        }
      } catch (error: any) {
        console.error(`[Marketplace Cron] Error processing payment ${payment.id}:`, error)
        errors.push(`Payment ${payment.id}: ${error.message}`)
      }
    }

    // Expire old pending payments
    const expiredResult = await sql`
      UPDATE marketplace_pending_payments
      SET status = 'expired'
      WHERE status = 'pending' AND expires_at < NOW()
      RETURNING id
    ` as any[]

    if (expiredResult.length > 0) {
      console.log(`[Marketplace Cron] Expired ${expiredResult.length} old pending payments`)
    }

    console.log('[Marketplace Cron] ========== Payment Check Complete ==========')
    console.log(`[Marketplace Cron] Summary: ${completed} completed, ${processed} checked, ${errors.length} errors`)

    return NextResponse.json({
      message: 'Marketplace payment check completed',
      processed,
      completed,
      total: pendingPayments.length,
      expired: expiredResult.length,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error: any) {
    console.error('[Marketplace Cron] Error:', error)
    return NextResponse.json(
      { error: 'Failed to check marketplace payments', details: error?.message },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  return checkMarketplacePayments()
}

export async function POST(request: NextRequest) {
  // Allow manual triggering for development/testing
  return checkMarketplacePayments()
}
