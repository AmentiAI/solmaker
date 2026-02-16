import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { checkAuthorizationServer } from '@/lib/auth/access-control'

/**
 * Check Bitcoin transaction status using Mempool API
 */
async function checkTransaction(txid: string): Promise<{
  txid: string
  confirmations: number
  confirmed: boolean
  blockHeight?: number
  exists: boolean
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
    }
  } catch (error: any) {
    console.error(`Error checking transaction ${txid}:`, error)
    return null
  }
}

/**
 * POST /api/admin/launchpad/bulk-operations - Perform bulk operations on transactions
 * Operations: check, update_status, mark_completed
 */
export async function POST(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const body = await request.json()
    const { wallet_address, operation, transaction_ids, updates } = body

    if (!wallet_address) {
      return NextResponse.json({ error: 'Wallet address required' }, { status: 401 })
    }
    const authResult = await checkAuthorizationServer(wallet_address, sql)
    if (!authResult.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized. Admin access only.' }, { status: 403 })
    }

    if (!operation || !transaction_ids || !Array.isArray(transaction_ids)) {
      return NextResponse.json({ error: 'operation and transaction_ids array required' }, { status: 400 })
    }

    const results: any = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      errors: [],
    }

    if (operation === 'check') {
      // Bulk check transactions
      for (const transactionId of transaction_ids) {
        try {
          const [transaction] = await sql`
            SELECT id, commit_tx_id, reveal_tx_id, commit_confirmed_at, reveal_confirmed_at
            FROM mint_inscriptions
            WHERE id = ${transactionId}
          ` as any[]

          if (!transaction) {
            results.errors.push({ transaction_id: transactionId, error: 'Not found' })
            results.failed++
            continue
          }

          // Check commit if exists and not confirmed
          if (transaction.commit_tx_id && !transaction.commit_confirmed_at) {
            const txStatus = await checkTransaction(transaction.commit_tx_id)
            if (txStatus) {
              if (txStatus.confirmed) {
                await sql`
                  UPDATE mint_inscriptions
                  SET 
                    commit_confirmed_at = NOW(),
                    commit_confirmations = ${txStatus.confirmations},
                    commit_last_checked_at = NOW()
                  WHERE id = ${transactionId}
                `
              } else {
                await sql`
                  UPDATE mint_inscriptions
                  SET commit_last_checked_at = NOW()
                  WHERE id = ${transactionId}
                `
              }
            }
          }

          // Check reveal if exists and not confirmed
          if (transaction.reveal_tx_id && !transaction.reveal_confirmed_at) {
            const txStatus = await checkTransaction(transaction.reveal_tx_id)
            if (txStatus) {
              if (txStatus.confirmed) {
                await sql`
                  UPDATE mint_inscriptions
                  SET 
                    reveal_confirmed_at = NOW(),
                    reveal_confirmations = ${txStatus.confirmations},
                    reveal_last_checked_at = NOW(),
                    mint_status = 'completed',
                    completed_at = NOW()
                  WHERE id = ${transactionId}
                `
              } else {
                await sql`
                  UPDATE mint_inscriptions
                  SET reveal_last_checked_at = NOW()
                  WHERE id = ${transactionId}
                `
              }
            }
          }

          results.succeeded++
          results.processed++

          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 500))
        } catch (error: any) {
          results.errors.push({ transaction_id: transactionId, error: error.message })
          results.failed++
          results.processed++
        }
      }
    } else if (operation === 'update_status') {
      // Bulk update status
      if (!updates || !updates.mint_status) {
        return NextResponse.json({ error: 'updates.mint_status required' }, { status: 400 })
      }

      await sql`
        UPDATE mint_inscriptions
        SET mint_status = ${updates.mint_status}
        WHERE id = ANY(${transaction_ids}::uuid[])
      `

      results.succeeded = transaction_ids.length
      results.processed = transaction_ids.length
    } else if (operation === 'mark_completed') {
      // Bulk mark as completed
      await sql`
        UPDATE mint_inscriptions
        SET 
          mint_status = 'completed',
          completed_at = NOW()
        WHERE id = ANY(${transaction_ids}::uuid[])
      `

      results.succeeded = transaction_ids.length
      results.processed = transaction_ids.length
    } else {
      return NextResponse.json({ error: 'Invalid operation' }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      results,
    })
  } catch (error: any) {
    console.error('Error in bulk operation:', error)
    return NextResponse.json({ 
      error: 'Failed to perform bulk operation',
      details: error.message 
    }, { status: 500 })
  }
}

