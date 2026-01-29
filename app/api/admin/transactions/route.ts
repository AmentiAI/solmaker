import { NextRequest, NextResponse } from 'next/server';

import { checkAuthorizationServer } from '@/lib/auth/access-control';
import { sql } from '@/lib/database';



// GET /api/admin/transactions - Get all transactions for admin view
export async function GET(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 });
  }

  try {
    // Check authorization - get wallet address from query params
    const url = new URL(request.url);
    const walletAddress = url.searchParams.get('wallet_address');
    const paymentType = url.searchParams.get('payment_type'); // 'btc', 'sol', or null for all

    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet address required' }, { status: 401 });
    }

    const authResult = await checkAuthorizationServer(request, sql);
    if (!authResult.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized. Admin access only.' }, { status: 403 });
    }

    // Build WHERE clause with optional payment_type filter
    // If payment_type is 'btc', also include NULL values (for backward compatibility with old transactions)
    let paymentTypeFilter = sql``;
    if (paymentType && ['btc', 'sol'].includes(paymentType)) {
      if (paymentType === 'btc') {
        // Bitcoin: include NULL payment_type (old transactions defaulted to BTC)
        paymentTypeFilter = sql`AND (payment_type = ${paymentType} OR payment_type IS NULL)`;
      } else {
        // Solana: only include exact matches
        paymentTypeFilter = sql`AND payment_type = ${paymentType}`;
      }
    }

    // Get all pending payments - only real transactions (exclude expired that were never paid)
    // Real transactions are those that:
    // 1. Have a payment_txid (actual blockchain transaction)
    // 2. Are completed (payment confirmed)
    // 3. Are still pending but not expired (active payment attempts)
    const pendingPayments = await sql`
      SELECT 
        id,
        wallet_address,
        credits_amount,
        bitcoin_amount,
        payment_address,
        status,
        payment_txid,
        confirmations,
        created_at,
        expires_at,
        payment_type
      FROM pending_payments
      WHERE 
        ((status = 'completed' AND payment_txid IS NOT NULL) -- Real completed transactions
        OR (status = 'pending' AND expires_at > NOW()) -- Active pending payments
        OR (status = 'pending' AND payment_txid IS NOT NULL)) -- Pending but has TXID (real transaction)
        ${paymentTypeFilter}
      ORDER BY created_at DESC
    `;

    // Get all credit transactions - these are all real (only created when credits are actually added/deducted)
    const creditTransactions = await sql`
      SELECT 
        id,
        wallet_address,
        amount,
        transaction_type,
        description,
        payment_txid,
        created_at
      FROM credit_transactions
      ORDER BY created_at DESC
    `;

    // Match pending payments with credit transactions to see if they were credited
    interface PendingPaymentRow {
      id: string;
      wallet_address: string;
      credits_amount: number;
      bitcoin_amount: string;
      payment_address: string;
      status: string;
      payment_txid: string | null;
      confirmations: number;
      created_at: string;
      expires_at: string;
      payment_type: string | null;
    }

    interface CreditTransactionRow {
      id: string;
      wallet_address: string;
      amount: number;
      transaction_type: string;
      description: string | null;
      payment_txid: string | null;
      created_at: string;
    }

    const transactionsWithCreditStatus = (pendingPayments as PendingPaymentRow[]).map((payment) => {
      // Check if there's a credit transaction for this payment
      const creditTx = (creditTransactions as CreditTransactionRow[]).find(
        (ct) => 
          ct.payment_txid === payment.payment_txid && 
          ct.transaction_type === 'purchase' &&
          ct.amount > 0
      );

      return {
        ...payment,
        credited: !!creditTx,
        credit_transaction_id: creditTx?.id || null,
        credit_transaction_date: creditTx?.created_at || null,
      };
    });

    return NextResponse.json({
      pending_payments: transactionsWithCreditStatus,
      credit_transactions: creditTransactions,
      summary: {
        total_pending: (pendingPayments as PendingPaymentRow[]).filter((p) => p.status === 'pending').length,
        total_completed: (pendingPayments as PendingPaymentRow[]).filter((p) => p.status === 'completed').length,
        total_expired: (pendingPayments as PendingPaymentRow[]).filter((p) => p.status === 'expired').length,
        total_credited: transactionsWithCreditStatus.filter((t) => t.credited).length,
        total_not_credited: transactionsWithCreditStatus.filter((t) => !t.credited && t.status === 'completed').length,
      }
    });

  } catch (error) {
    console.error('Error fetching admin transactions:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ 
      error: 'Failed to fetch transactions',
      details: errorMessage 
    }, { status: 500 });
  }
}

