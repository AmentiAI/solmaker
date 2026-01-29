import { NextRequest, NextResponse } from 'next/server';

import { addCredits } from '@/lib/credits/credits';
import { sql } from '@/lib/database';

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

/**
 * Check a Solana transaction status using RPC getSignatureStatuses
 */
async function checkSolanaTransaction(txSignature: string): Promise<{
  signature: string;
  confirmed: boolean;
  finalized: boolean;
  err: any | null;
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
    });

    if (!response.ok) {
      throw new Error(`Solana RPC error: ${response.status}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(`Solana RPC error: ${data.error.message}`);
    }

    const result = data.result?.value?.[0];

    if (!result) {
      return null; // Transaction not found yet
    }

    const confirmationStatus = result.confirmationStatus;
    const err = result.err;

    return {
      signature: txSignature,
      confirmed: confirmationStatus === 'confirmed' || confirmationStatus === 'finalized',
      finalized: confirmationStatus === 'finalized',
      err,
    };
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.error('Solana transaction check timeout:', txSignature);
    } else {
      console.error('Error checking Solana transaction:', error);
    }
    return null;
  }
}

/**
 * Cron job to check pending SOL payments and award credits when finalized
 * This runs automatically via Vercel Cron every 5 minutes
 *
 * GET /api/cron/check-payments - Called by Vercel Cron
 * POST /api/cron/check-payments - Manual trigger (for testing)
 */
async function checkPayments() {
  if (!sql) {
    console.error('[Cron] Database connection not available');
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 });
  }

  try {
    // Get all pending payments that have a tx signature (transactions that have been broadcast)
    // Also check payments without a signature that are recent (in case it wasn't saved yet)
    const pendingPayments = await sql`
      SELECT
        id,
        wallet_address,
        credits_amount,
        payment_txid,
        created_at,
        expires_at
      FROM pending_payments
      WHERE status = 'pending'
        AND expires_at > NOW()
        AND (
          payment_txid IS NOT NULL
          OR created_at > NOW() - INTERVAL '1 hour'
        )
      ORDER BY
        CASE WHEN payment_txid IS NOT NULL THEN 0 ELSE 1 END,
        created_at ASC
      LIMIT 100
    `;

    if (!Array.isArray(pendingPayments) || pendingPayments.length === 0) {
      return NextResponse.json({
        message: 'No pending payments to check',
        processed: 0,
        awarded: 0
      });
    }

    console.log(`[Cron] Checking ${pendingPayments.length} pending SOL payments`);

    let processed = 0;
    let awarded = 0;
    const errors: string[] = [];

    // Process payments in parallel (but limit concurrency)
    const batchSize = 10;
    for (let i = 0; i < pendingPayments.length; i += batchSize) {
      const batch = pendingPayments.slice(i, i + batchSize);

      const results = await Promise.allSettled(
        batch.map(async (payment: any) => {
          try {
            // Skip if no tx signature (will be checked when signature is available)
            if (!payment.payment_txid) {
              return { paymentId: payment.id, status: 'no_txid' };
            }

            // Check Solana transaction status
            const tx = await checkSolanaTransaction(payment.payment_txid);

            if (!tx) {
              // Transaction not found yet, skip
              return { paymentId: payment.id, status: 'not_found' };
            }

            processed++;

            // If the transaction failed on-chain, mark it
            if (tx.err !== null) {
              await sql`
                UPDATE pending_payments
                SET status = 'failed'
                WHERE id = ${payment.id}::uuid
              `;
              console.log(`[Cron] Payment ${payment.id}: Transaction failed on-chain: ${JSON.stringify(tx.err)}`);
              return {
                paymentId: payment.id,
                status: 'tx_failed',
                error: JSON.stringify(tx.err),
              };
            }

            // If finalized with no error, award credits
            if (tx.finalized && tx.err === null) {
              // Re-fetch payment to ensure we have latest status (prevent double crediting)
              const updatedPayment = await sql`
                SELECT * FROM pending_payments
                WHERE id = ${payment.id}::uuid
                  AND status = 'pending'
                LIMIT 1
              ` as any[];

              if (Array.isArray(updatedPayment) && updatedPayment.length > 0) {
                try {
                  // Award credits
                  await addCredits(
                    payment.wallet_address,
                    payment.credits_amount,
                    `Credit purchase - ${payment.credits_amount} credits`,
                    payment.payment_txid
                  );

                  // Mark as completed
                  await sql`
                    UPDATE pending_payments
                    SET status = 'completed'
                    WHERE id = ${payment.id}::uuid
                  `;

                  awarded++;
                  console.log(`[Cron] Awarded ${payment.credits_amount} credits to ${payment.wallet_address} for tx ${payment.payment_txid} (finalized)`);

                  return {
                    paymentId: payment.id,
                    status: 'awarded',
                  };
                } catch (creditError: any) {
                  console.error(`[Cron] Failed to award credits for payment ${payment.id}:`, creditError);
                  return {
                    paymentId: payment.id,
                    status: 'credit_error',
                    error: creditError.message
                  };
                }
              } else {
                // Already processed by another cron run or manual check
                return {
                  paymentId: payment.id,
                  status: 'already_completed'
                };
              }
            } else {
              // Still pending finalization
              return {
                paymentId: payment.id,
                status: 'pending',
                confirmed: tx.confirmed,
                finalized: tx.finalized,
              };
            }
          } catch (error: any) {
            console.error(`[Cron] Error processing payment ${payment.id}:`, error);
            errors.push(`Payment ${payment.id}: ${error.message || 'Unknown error'}`);
            return {
              paymentId: payment.id,
              status: 'error',
              error: error.message
            };
          }
        })
      );

      // Log results
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failedCount = results.filter(r => r.status === 'rejected').length;

      if (failedCount > 0) {
        console.error(`[Cron] Batch ${i / batchSize + 1}: ${failedCount} failed, ${successful} successful`);
      }
    }

    return NextResponse.json({
      message: 'Payment check completed',
      processed,
      awarded,
      total: pendingPayments.length,
      errors: errors.length > 0 ? errors : undefined,
    });

  } catch (error: any) {
    console.error('[Cron] Error checking payments:', error);
    return NextResponse.json(
      {
        error: 'Failed to check payments',
        details: error?.message || String(error)
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  // Vercel Cron sends requests with a specific header
  // For local testing, you can bypass this check
  const isVercelCron = request.headers.get('user-agent')?.includes('vercel-cron') ||
                       request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;

  // Allow manual testing if CRON_SECRET is not set
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && !isVercelCron) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return checkPayments();
}

export async function POST(request: NextRequest) {
  // Allow manual triggering for development/testing
  return checkPayments();
}
