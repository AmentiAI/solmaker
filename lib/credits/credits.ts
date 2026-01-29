import { sql } from '@/lib/database'
export { CREDIT_TIERS } from './constants'

/**
 * Get or create credits record for a wallet
 */
export async function getOrCreateCredits(walletAddress: string): Promise<number> {
  if (!sql) {
    throw new Error('Database connection not available')
  }

  // Try to get existing credits
  const existing = await sql`
    SELECT credits FROM credits WHERE wallet_address = ${walletAddress} LIMIT 1
  `

  if (existing.length > 0) {
    return existing[0].credits || 0
  }

  // Create new credits record (using INSERT with ON CONFLICT for safety)
  try {
    await sql`
      INSERT INTO credits (wallet_address, credits)
      VALUES (${walletAddress}, 0)
    `
  } catch (error: any) {
    // If unique constraint violation, just return 0
    if (error?.message?.includes('unique') || error?.message?.includes('duplicate')) {
      const retry = await sql`
        SELECT credits FROM credits WHERE wallet_address = ${walletAddress} LIMIT 1
      `
      if (retry.length > 0) {
        return retry[0].credits || 0
      }
    }
    throw error
  }

  return 0
}

/**
 * Get current credits for a wallet
 */
export async function getCredits(walletAddress: string): Promise<number> {
  if (!sql) {
    throw new Error('Database connection not available')
  }

  const result = await sql`
    SELECT credits FROM credits WHERE wallet_address = ${walletAddress} LIMIT 1
  `

  if (result.length === 0) {
    return 0
  }

  return result[0].credits || 0
}

/**
 * SECURE: Add credits to a wallet (ONLY for verified payments)
 * This function can ONLY be called with a verified payment transaction ID
 * All other credit additions must go through secureAddCreditsForPayment
 */
export async function addCredits(
  walletAddress: string,
  amount: number,
  description: string,
  paymentTxId?: string
): Promise<void> {
  if (!sql) {
    throw new Error('Database connection not available')
  }

  // SECURITY: Only allow credits if paymentTxId is provided AND verified
  if (!paymentTxId) {
    throw new Error('SECURITY: Credits can only be added with verified payment transaction ID. Use secureAddCreditsForPayment instead.')
  }

  // Verify that this payment transaction exists in pending_payments
  // Accept both 'pending' and 'completed' status - we mark as completed after awarding credits
  // Also check by payment_txid OR by searching for any payment with matching wallet and amount
  let paymentCheck = await sql`
    SELECT id, status, wallet_address, credits_amount, payment_txid
    FROM pending_payments
    WHERE payment_txid = ${paymentTxId}
      AND wallet_address = ${walletAddress}
      AND (status = 'completed' OR status = 'pending')
    LIMIT 1
  `

  // If not found by exact txid match, try to find by wallet and amount (in case txid format differs)
  if (paymentCheck.length === 0) {
    console.warn(`[addCredits] Payment not found by exact txid match, searching by wallet and amount...`, {
      paymentTxId,
      walletAddress,
      amount
    });
    
    // Try to find payment by wallet and amount (for cases where txid might have slight differences)
    paymentCheck = await sql`
      SELECT id, status, wallet_address, credits_amount, payment_txid
      FROM pending_payments
      WHERE wallet_address = ${walletAddress}
        AND credits_amount = ${amount}
        AND (status = 'completed' OR status = 'pending')
        AND payment_txid IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 1
    `
    
    if (paymentCheck.length > 0) {
      console.log(`[addCredits] Found payment by wallet/amount match:`, {
        found_txid: paymentCheck[0].payment_txid,
        provided_txid: paymentTxId
      });
      // Update the payment_txid to match what we're using
      if (paymentCheck[0].payment_txid !== paymentTxId) {
        await sql`
          UPDATE pending_payments
          SET payment_txid = ${paymentTxId}
          WHERE id = ${paymentCheck[0].id}::uuid
        `
        console.log(`[addCredits] Updated payment_txid to match transaction`);
      }
    }
  }

  if (paymentCheck.length === 0) {
    const errorMsg = `SECURITY: Payment transaction ${paymentTxId} not found or not verified for wallet ${walletAddress}. Credits can only be added through verified payments.`
    console.error(`[addCredits] ${errorMsg}`);
    // Log all pending payments for this wallet to help debug
    const allPayments = await sql`
      SELECT id, wallet_address, credits_amount, payment_txid, status, payment_type
      FROM pending_payments
      WHERE wallet_address = ${walletAddress}
      ORDER BY created_at DESC
      LIMIT 10
    `
    console.error(`[addCredits] Recent payments for wallet ${walletAddress}:`, allPayments);
    throw new Error(errorMsg)
  }

  const payment = paymentCheck[0]
  
  // Double-check that the amount matches the payment
  if (payment.credits_amount !== amount) {
    throw new Error(`SECURITY: Credit amount ${amount} does not match payment amount ${payment.credits_amount} for transaction ${paymentTxId}`)
  }

  // Check if credits were already awarded for this transaction (prevent double crediting)
  const existingTransaction = await sql`
    SELECT id FROM credit_transactions
    WHERE payment_txid = ${paymentTxId}
      AND wallet_address = ${walletAddress}
      AND amount > 0
    LIMIT 1
  `

  if (existingTransaction.length > 0) {
    throw new Error(`SECURITY: Credits already awarded for transaction ${paymentTxId}. Duplicate credit addition prevented.`)
  }

  // Ensure credits record exists
  await getOrCreateCredits(walletAddress)

  // Add credits
  await sql`
    UPDATE credits
    SET credits = credits + ${amount}, updated_at = CURRENT_TIMESTAMP
    WHERE wallet_address = ${walletAddress}
  `

  // Record transaction
  try {
    const result = await sql`
      INSERT INTO credit_transactions (wallet_address, amount, transaction_type, description, payment_txid)
      VALUES (${walletAddress}, ${amount}, 'purchase', ${description}, ${paymentTxId})
      RETURNING id, created_at
    `
    console.log(`[addCredits] ✅ Transaction record created successfully:`, {
      transaction_id: result[0]?.id,
      walletAddress,
      amount,
      transaction_type: 'purchase',
      payment_txid: paymentTxId,
      created_at: result[0]?.created_at
    })
  } catch (txError: any) {
    console.error(`[addCredits] ❌ Error creating transaction record:`, {
      error: txError,
      message: txError?.message,
      stack: txError?.stack,
      walletAddress,
      amount,
      payment_txid: paymentTxId
    })
    // Re-throw the error so we know transactions aren't being recorded
    // This is important for the transactions page to work
    throw new Error(`Failed to create transaction record: ${txError?.message || 'Unknown error'}`)
  }
}

/**
 * SECURE: Add credits for refunds (only for system-generated refunds)
 * This requires a special environment variable or admin authorization
 */
export async function secureAddCreditsForRefund(
  walletAddress: string,
  amount: number,
  description: string,
  adminSecret?: string
): Promise<void> {
  if (!sql) {
    throw new Error('Database connection not available')
  }

  // SECURITY: Only allow refunds if admin secret matches
  const requiredSecret = process.env.ADMIN_REFUND_SECRET
  if (!requiredSecret || adminSecret !== requiredSecret) {
    throw new Error('SECURITY: Unauthorized refund attempt. Admin secret required.')
  }

  // Ensure credits record exists
  await getOrCreateCredits(walletAddress)

  // Add credits
  await sql`
    UPDATE credits
    SET credits = credits + ${amount}, updated_at = CURRENT_TIMESTAMP
    WHERE wallet_address = ${walletAddress}
  `

  // Record transaction (refund type, no payment_txid)
  await sql`
    INSERT INTO credit_transactions (wallet_address, amount, transaction_type, description, payment_txid)
    VALUES (${walletAddress}, ${amount}, 'refund', ${description}, NULL)
  `
}

/**
 * Deduct credits from a wallet (for usage)
 */
export async function deductCredits(
  walletAddress: string,
  amount: number,
  description: string
): Promise<boolean> {
  if (!sql) {
    throw new Error('Database connection not available')
  }

  // Check if user has enough credits
  const currentCredits = await getCredits(walletAddress)
  if (currentCredits < amount) {
    return false
  }

  // Deduct credits
  await sql`
    UPDATE credits
    SET credits = credits - ${amount}, updated_at = CURRENT_TIMESTAMP
    WHERE wallet_address = ${walletAddress}
  `

  // Record transaction (use negative amount for deduction)
  const negativeAmount = -amount
  try {
    await sql`
      INSERT INTO credit_transactions (wallet_address, amount, transaction_type, description)
      VALUES (${walletAddress}, ${negativeAmount}, 'usage', ${description})
    `
    console.log(`[deductCredits] ✅ Transaction record created:`, {
      walletAddress,
      amount: negativeAmount,
      transaction_type: 'usage'
    })
  } catch (txError: any) {
    console.error(`[deductCredits] ❌ Error creating transaction record:`, {
      error: txError,
      message: txError?.message,
      walletAddress,
      amount: negativeAmount
    })
    // Don't throw - credits were already deducted, just log the error
  }

  return true
}

/**
 * Check if user has enough credits
 */
export async function hasEnoughCredits(walletAddress: string, amount: number): Promise<boolean> {
  const credits = await getCredits(walletAddress)
  return credits >= amount
}

