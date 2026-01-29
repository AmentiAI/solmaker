import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { isAdmin } from '@/lib/auth/access-control'

/**
 * Check Bitcoin transaction status using Mempool API
 */
async function checkTransaction(txid: string): Promise<{
  txid: string
  confirmations: number
  confirmed: boolean
  blockHeight?: number
  exists: boolean
  tx?: any // Full transaction data
} | null> {
  try {
    const response = await fetch(`https://mempool.space/api/tx/${txid}`, {
      signal: AbortSignal.timeout(10000),
    })

    if (response.status === 404) {
      return {
        txid,
        confirmations: 0,
        confirmed: false,
        exists: false,
      }
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch transaction: ${response.status}`)
    }

    const tx = await response.json()

    // Get transaction status for confirmations
    const statusResponse = await fetch(`https://mempool.space/api/tx/${txid}/status`, {
      signal: AbortSignal.timeout(10000),
    })

    let confirmations = 0
    let blockHeight: number | undefined
    let confirmed = false

    if (statusResponse.ok) {
      const status = await statusResponse.json()
      if (status.block_height && status.block_height > 0) {
        blockHeight = status.block_height
        confirmed = true
        // Get current block height to calculate confirmations
        const tipResponse = await fetch('https://mempool.space/api/blocks/tip/height', {
          signal: AbortSignal.timeout(10000),
        })
        if (tipResponse.ok) {
          const currentHeight = await tipResponse.json()
          confirmations = Math.max(0, currentHeight - status.block_height + 1)
        }
      }
    }

    return {
      txid: tx.txid,
      confirmations,
      confirmed: confirmed && confirmations > 0,
      blockHeight,
      exists: true,
      tx, // Include full transaction data
    }
  } catch (error: any) {
    console.error(`Error checking transaction ${txid}:`, error)
    return null
  }
}

/**
 * Check if creator payment wallet received payment in transaction
 */
function checkCreatorPayment(tx: any, creatorPaymentWallet: string | null): {
  paid: boolean
  amount?: number
  outputIndex?: number
} {
  if (!creatorPaymentWallet || !tx || !tx.vout) {
    return { paid: false }
  }

  // Check all outputs for the creator payment wallet
  for (let i = 0; i < tx.vout.length; i++) {
    const output = tx.vout[i]
    if (output.scriptpubkey_address === creatorPaymentWallet) {
      return {
        paid: true,
        amount: output.value,
        outputIndex: i,
      }
    }
  }

  return { paid: false }
}

/**
 * POST /api/admin/launchpad/transactions/check - Manually check transaction status
 * Works even for completed transactions (unlike cron job)
 */
export async function POST(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const body = await request.json()
    const { wallet_address, transaction_id, check_type } = body

    if (!wallet_address || !isAdmin(wallet_address)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    if (!transaction_id) {
      return NextResponse.json({ error: 'transaction_id is required' }, { status: 400 })
    }

    // Get transaction with collection and phase info
    const [transaction] = await sql`
      SELECT 
        mi.id, 
        mi.commit_tx_id, 
        mi.reveal_tx_id, 
        mi.commit_confirmed_at, 
        mi.reveal_confirmed_at,
        mi.mint_status,
        mi.collection_id,
        mi.phase_id,
        c.creator_royalty_wallet,
        c.wallet_address as collection_owner_wallet,
        mp.creator_payment_wallet as phase_payment_wallet
      FROM mint_inscriptions mi
      JOIN collections c ON mi.collection_id = c.id
      LEFT JOIN mint_phases mp ON mi.phase_id = mp.id
      WHERE mi.id = ${transaction_id}
    ` as any[]

    if (!transaction) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    }

    // Determine creator payment wallet (phase > collection > owner)
    const creatorPaymentWallet = transaction.phase_payment_wallet || 
                                 transaction.creator_royalty_wallet || 
                                 transaction.collection_owner_wallet

    const results: any = {}

    // Check commit transaction if requested or if not confirmed
    if (check_type === 'commit' || (!check_type && transaction.commit_tx_id)) {
      if (!transaction.commit_tx_id) {
        results.commit = { error: 'No commit transaction ID' }
      } else {
        const txStatus = await checkTransaction(transaction.commit_tx_id)
        
        if (!txStatus) {
          results.commit = { error: 'Failed to check transaction' }
        } else if (!txStatus.exists) {
          // Transaction not found - RBF'd or dropped
          await sql`
            UPDATE mint_inscriptions
            SET 
              mint_status = 'failed',
              error_message = 'Commit transaction was RBF''d or dropped from mempool',
              error_code = 'TX_NOT_FOUND',
              commit_last_checked_at = NOW()
            WHERE id = ${transaction_id}
          `
          results.commit = { 
            status: 'not_found',
            message: 'Transaction not found (RBF\'d/dropped)',
            updated: true
          }
        } else if (txStatus.confirmed) {
          // Transaction confirmed
          await sql`
            UPDATE mint_inscriptions
            SET 
              commit_confirmed_at = NOW(),
              commit_confirmations = ${txStatus.confirmations},
              commit_last_checked_at = NOW(),
              mint_status = CASE 
                WHEN reveal_tx_id IS NOT NULL THEN mint_status
                ELSE 'commit_confirmed'
              END
            WHERE id = ${transaction_id}
          `
          
          // Check if creator payment wallet received payment
          const paymentCheck = txStatus.tx ? checkCreatorPayment(txStatus.tx, creatorPaymentWallet) : { paid: false }
          
          // Store payment verification status in database (if columns exist)
          try {
            await sql`
              UPDATE mint_inscriptions
              SET 
                creator_payment_verified = ${paymentCheck.paid},
                creator_payment_amount = ${paymentCheck.amount || null},
                creator_payment_output_index = ${paymentCheck.outputIndex || null},
                creator_payment_wallet = ${creatorPaymentWallet}
              WHERE id = ${transaction_id}
            `
          } catch (e: any) {
            // Columns might not exist yet - log but don't fail
            if (e?.message?.includes('does not exist') || e?.message?.includes('column')) {
              console.warn('Creator payment verification columns not found - run migration 055_add_creator_payment_verification.sql')
            } else {
              throw e
            }
          }
          
          results.commit = {
            status: 'confirmed',
            confirmations: txStatus.confirmations,
            blockHeight: txStatus.blockHeight,
            updated: true,
            creator_payment: {
              wallet: creatorPaymentWallet,
              paid: paymentCheck.paid,
              amount: paymentCheck.amount,
              outputIndex: paymentCheck.outputIndex,
            }
          }
        } else {
          // Still unconfirmed - just update last checked
          await sql`
            UPDATE mint_inscriptions
            SET commit_last_checked_at = NOW()
            WHERE id = ${transaction_id}
          `
          results.commit = {
            status: 'unconfirmed',
            confirmations: 0,
            updated: true
          }
        }
      }
    }

    // Check reveal transaction if requested or if exists and not confirmed
    if (check_type === 'reveal' || (!check_type && transaction.reveal_tx_id)) {
      if (!transaction.reveal_tx_id) {
        results.reveal = { error: 'No reveal transaction ID' }
      } else {
        const txStatus = await checkTransaction(transaction.reveal_tx_id)
        
        if (!txStatus) {
          results.reveal = { error: 'Failed to check transaction' }
        } else if (!txStatus.exists) {
          // Transaction not found - RBF'd or dropped
          await sql`
            UPDATE mint_inscriptions
            SET 
              mint_status = 'failed',
              error_message = 'Reveal transaction was RBF''d or dropped from mempool',
              error_code = 'TX_NOT_FOUND',
              reveal_last_checked_at = NOW()
            WHERE id = ${transaction_id}
          `
          results.reveal = {
            status: 'not_found',
            message: 'Transaction not found (RBF\'d/dropped)',
            updated: true
          }
        } else if (txStatus.confirmed) {
          // Transaction confirmed - mark as completed
          await sql`
            UPDATE mint_inscriptions
            SET 
              reveal_confirmed_at = NOW(),
              reveal_confirmations = ${txStatus.confirmations},
              reveal_last_checked_at = NOW(),
              mint_status = 'completed',
              completed_at = NOW()
            WHERE id = ${transaction_id}
          `
          
          // Check if creator payment wallet received payment (check commit tx, not reveal)
          // Payment is in commit transaction, not reveal
          let paymentCheck = { paid: false }
          if (transaction.commit_tx_id) {
            const commitTxStatus = await checkTransaction(transaction.commit_tx_id)
            if (commitTxStatus?.tx) {
              paymentCheck = checkCreatorPayment(commitTxStatus.tx, creatorPaymentWallet)
            }
          }
          
          // Store payment verification status in database (if columns exist)
          try {
            await sql`
              UPDATE mint_inscriptions
              SET 
                creator_payment_verified = ${paymentCheck.paid},
                creator_payment_amount = ${paymentCheck.amount || null},
                creator_payment_output_index = ${paymentCheck.outputIndex || null},
                creator_payment_wallet = ${creatorPaymentWallet}
              WHERE id = ${transaction_id}
            `
          } catch (e: any) {
            // Columns might not exist yet - log but don't fail
            if (e?.message?.includes('does not exist') || e?.message?.includes('column')) {
              console.warn('Creator payment verification columns not found - run migration 055_add_creator_payment_verification.sql')
            } else {
              throw e
            }
          }
          
          results.reveal = {
            status: 'confirmed',
            confirmations: txStatus.confirmations,
            blockHeight: txStatus.blockHeight,
            updated: true,
            creator_payment: {
              wallet: creatorPaymentWallet,
              paid: paymentCheck.paid,
              amount: paymentCheck.amount,
              outputIndex: paymentCheck.outputIndex,
            }
          }
        } else {
          // Still unconfirmed - just update last checked
          await sql`
            UPDATE mint_inscriptions
            SET reveal_last_checked_at = NOW()
            WHERE id = ${transaction_id}
          `
          results.reveal = {
            status: 'unconfirmed',
            confirmations: 0,
            updated: true
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      results,
      checked_at: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Error checking transaction:', error)
    return NextResponse.json({ 
      error: 'Failed to check transaction',
      details: error.message 
    }, { status: 500 })
  }
}

