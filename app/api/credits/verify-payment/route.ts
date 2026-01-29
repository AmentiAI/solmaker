import { NextRequest, NextResponse } from 'next/server'
import { addCredits } from '@/lib/credits/credits'
import { sql } from '@/lib/database'
import { getPlatformWalletAddress } from '@/lib/solana/platform-wallet'

const SOL_PAYMENT_ADDRESS = getPlatformWalletAddress() // Platform Solana wallet

/**
 * Check Solana transaction using RPC - requires on-chain finality
 */
async function checkSolTransaction(txid: string): Promise<{
  txid: string
  confirmations: number
  confirmed: boolean
  amount?: number
  blockHeight?: number
} | null> {
  try {
    const rpcUrl = process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'

    // Check if transaction is finalized
    const finalizedResponse = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getSignatureStatuses',
        params: [[txid], { searchTransactionHistory: true }],
      }),
      signal: AbortSignal.timeout(10000),
    })

    let isFinalized = false
    if (finalizedResponse.ok) {
      const finalizedData = await finalizedResponse.json()
      if (finalizedData.result?.value?.[0]) {
        const status = finalizedData.result.value[0]
        isFinalized = status?.confirmationStatus === 'finalized' && !status?.err
      }
    }

    // Get transaction details
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'getTransaction',
        params: [txid, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }],
      }),
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) return null

    const data = await response.json()
    if (data.error || !data.result) return null

    const tx = data.result
    if (!tx || !tx.slot) {
      return { txid, confirmations: 0, confirmed: false }
    }

    const confirmed = isFinalized && tx.meta?.err === null

    // Calculate amount sent to our address
    let amount = 0
    const paymentPubkey = SOL_PAYMENT_ADDRESS

    if (tx.meta?.preBalances && tx.meta?.postBalances && tx.transaction?.message?.accountKeys) {
      const accountKeys = tx.transaction.message.accountKeys

      for (let i = 0; i < accountKeys.length; i++) {
        const key = typeof accountKeys[i] === 'string' ? accountKeys[i] : accountKeys[i].pubkey
        if (key === paymentPubkey) {
          const preBalance = tx.meta.preBalances[i] || 0
          const postBalance = tx.meta.postBalances[i] || 0
          const balanceChange = postBalance - preBalance
          if (balanceChange > 0) {
            amount = balanceChange / 1e9
          }
          break
        }
      }

      // Check instructions if not found in balance changes
      if (amount === 0) {
        const allInstructions = [
          ...(tx.transaction?.message?.instructions || []),
          ...(tx.meta?.innerInstructions?.flatMap((ii: any) => ii.instructions || []) || []),
        ]
        for (const instruction of allInstructions) {
          if (instruction.parsed?.type === 'transfer' && instruction.parsed.info?.destination === paymentPubkey) {
            amount = (instruction.parsed.info.lamports || 0) / 1e9
            break
          }
        }
      }
    }

    return {
      txid,
      confirmations: confirmed ? 1 : 0,
      confirmed,
      amount,
      blockHeight: tx.slot,
    }
  } catch (error: any) {
    console.error('Error checking SOL transaction:', error)
    return null
  }
}

/**
 * Award credits with fallback mechanism
 */
async function awardCredits(
  walletAddress: string,
  creditsAmount: number,
  txid: string,
  paymentId: string
): Promise<boolean> {
  try {
    await addCredits(walletAddress, creditsAmount, `Credit purchase - ${creditsAmount} credits (SOL)`, txid)
    return true
  } catch (creditError: any) {
    console.error(`[Payment Verification] Error via addCredits:`, creditError?.message)

    // Fallback: direct SQL
    try {
      const { getOrCreateCredits } = await import('@/lib/credits/credits')
      await getOrCreateCredits(walletAddress)

      const existingTx = await sql`
        SELECT id FROM credit_transactions
        WHERE payment_txid = ${txid} AND wallet_address = ${walletAddress} AND amount > 0
        LIMIT 1
      ` as any[]

      if (existingTx.length > 0) return true

      await sql`
        UPDATE credits SET credits = credits + ${creditsAmount}, updated_at = CURRENT_TIMESTAMP
        WHERE wallet_address = ${walletAddress}
      `
      await sql`
        INSERT INTO credit_transactions (wallet_address, amount, transaction_type, description, payment_txid)
        VALUES (${walletAddress}, ${creditsAmount}, 'purchase', ${`Credit purchase - ${creditsAmount} credits (SOL)`}, ${txid})
      `
      return true
    } catch (fallbackError: any) {
      console.error(`[Payment Verification] Fallback also failed:`, fallbackError?.message)
      return false
    }
  }
}

/**
 * Process a pending payment verification
 */
async function verifyAndProcessPayment(payment: any, walletAddress: string) {
  if (!payment.payment_txid) {
    return { status: 'pending', confirmations: 0, message: 'Waiting for payment...' }
  }

  const tx = await checkSolTransaction(payment.payment_txid)
  if (!tx) {
    return { status: 'pending', confirmations: 0, message: 'Waiting for transaction...' }
  }

  // Update confirmations
  await sql`UPDATE pending_payments SET confirmations = ${tx.confirmations} WHERE id = ${payment.id}::uuid`

  const expectedAmount = parseFloat(payment.payment_amount || payment.bitcoin_amount)
  const receivedAmount = tx.amount || 0
  const amountMatches = receivedAmount >= expectedAmount * 0.99

  if (tx.confirmed && payment.status === 'pending' && (amountMatches || receivedAmount === 0)) {
    // Ensure txid is saved
    if (!payment.payment_txid || payment.payment_txid !== tx.txid) {
      await sql`UPDATE pending_payments SET payment_txid = ${tx.txid} WHERE id = ${payment.id}::uuid`
    }

    const credited = await awardCredits(walletAddress, payment.credits_amount, tx.txid, payment.id)

    await sql`UPDATE pending_payments SET status = 'completed' WHERE id = ${payment.id}::uuid`

    return {
      status: 'completed',
      confirmations: tx.confirmations,
      txid: tx.txid,
      creditsAwarded: payment.credits_amount,
    }
  }

  return {
    status: 'pending',
    confirmations: tx.confirmations,
    txid: tx.txid,
    requiredConfirmations: 1,
    message: tx.confirmations > 0
      ? 'Waiting for finalization...'
      : 'Transaction detected, waiting for confirmation...',
  }
}

// POST /api/credits/verify-payment
export async function POST(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const body = await request.json()
    const { payment_id, wallet_address, txid } = body

    if (!payment_id || !wallet_address) {
      return NextResponse.json({ error: 'Payment ID and wallet address are required' }, { status: 400 })
    }

    const pendingPayments = await sql`
      SELECT * FROM pending_payments
      WHERE id = ${payment_id}::uuid AND wallet_address = ${wallet_address} AND status = 'pending'
      LIMIT 1
    ` as any[]

    if (!Array.isArray(pendingPayments) || pendingPayments.length === 0) {
      return NextResponse.json({ error: 'Payment not found or already processed' }, { status: 404 })
    }

    const payment = pendingPayments[0]

    if (new Date(payment.expires_at) < new Date()) {
      await sql`UPDATE pending_payments SET status = 'expired' WHERE id = ${payment.id}::uuid`
      return NextResponse.json({ error: 'Payment has expired' }, { status: 400 })
    }

    // Save txid if provided
    if (txid && typeof txid === 'string' && !payment.payment_txid) {
      await sql`UPDATE pending_payments SET payment_txid = ${txid} WHERE id = ${payment.id}::uuid`
      payment.payment_txid = txid
    }

    const result = await verifyAndProcessPayment(payment, wallet_address)
    return NextResponse.json(result)
  } catch (error: any) {
    console.error('Error verifying payment:', error)
    return NextResponse.json({ error: error?.message || 'Failed to verify payment' }, { status: 500 })
  }
}

// GET /api/credits/verify-payment
export async function GET(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const payment_id = searchParams.get('payment_id')
    const wallet_address = searchParams.get('wallet_address')

    if (!payment_id || !wallet_address) {
      return NextResponse.json({ error: 'Payment ID and wallet address are required' }, { status: 400 })
    }

    const paymentsResult = await sql`
      SELECT * FROM pending_payments
      WHERE id = ${payment_id}::uuid AND wallet_address = ${wallet_address}
      LIMIT 1
    ` as any[]

    if (!Array.isArray(paymentsResult) || paymentsResult.length === 0) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
    }

    const payment = paymentsResult[0]

    if (payment.status === 'completed') {
      return NextResponse.json({
        status: 'completed',
        confirmations: payment.confirmations || 0,
        txid: payment.payment_txid,
        creditsAwarded: payment.credits_amount,
      })
    }

    if (payment.status === 'pending' && payment.payment_txid) {
      const result = await verifyAndProcessPayment(payment, wallet_address)
      return NextResponse.json(result)
    }

    return NextResponse.json({
      status: payment.status,
      confirmations: payment.confirmations || 0,
      txid: payment.payment_txid,
    })
  } catch (error: any) {
    console.error('Error checking payment status:', error)
    return NextResponse.json({ error: error?.message || 'Failed to check payment status' }, { status: 500 })
  }
}
