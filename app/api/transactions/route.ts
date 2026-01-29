import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/database';

/**
 * GET /api/transactions?wallet_address=...
 * 
 * Fetches transaction history for a wallet address
 * Only includes completed transactions - pending payments are excluded from the list
 * pendingCount is returned separately for informational purposes (alert banner)
 */
export async function GET(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 });
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const wallet_address = searchParams.get('wallet_address');
    const transaction_type = searchParams.get('transaction_type');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const offset = (page - 1) * limit;

    if (!wallet_address) {
      return NextResponse.json(
        { error: 'Wallet address is required' },
        { status: 400 }
      );
    }

    // Fetch pending payments count (for informational banner only - not shown in transaction list)
    const pendingPayments = await sql`
      SELECT 
        id,
        wallet_address,
        credits_amount as amount,
        status,
        payment_type,
        confirmations,
        expires_at
      FROM pending_payments
      WHERE wallet_address = ${wallet_address}
      AND status IN ('pending', 'confirming')
      ORDER BY created_at DESC
    `;

    // Build the query with optional type filter for completed transactions
    const hasTypeFilter = transaction_type && ['purchase', 'usage', 'refund'].includes(transaction_type);
    
    // Get total count for pagination (completed transactions only - pending payments are excluded)
    const countResult = hasTypeFilter
      ? await sql`
          SELECT COUNT(*) as total
          FROM credit_transactions
          WHERE wallet_address = ${wallet_address}
          AND transaction_type = ${transaction_type}
        `
      : await sql`
          SELECT COUNT(*) as total
          FROM credit_transactions
          WHERE wallet_address = ${wallet_address}
        `;
    
    const total = Number((countResult as any[])[0]?.total || 0);
    const pendingCount = (pendingPayments as any[]).length;
    // Note: total does NOT include pending payments - only completed transactions
    
    // Fetch paginated completed transactions
    const creditTransactions = hasTypeFilter
      ? await sql`
          SELECT 
            id,
            wallet_address,
            amount,
            transaction_type,
            description,
            payment_txid,
            created_at
          FROM credit_transactions
          WHERE wallet_address = ${wallet_address}
          AND transaction_type = ${transaction_type}
          ORDER BY created_at DESC
          LIMIT ${limit}
          OFFSET ${offset}
        `
      : await sql`
          SELECT 
            id,
            wallet_address,
            amount,
            transaction_type,
            description,
            payment_txid,
            created_at
          FROM credit_transactions
          WHERE wallet_address = ${wallet_address}
          ORDER BY created_at DESC
          LIMIT ${limit}
          OFFSET ${offset}
        `;

    // Format completed transactions only
    // Pending payments are NOT included in the transaction list
    const transactions = (creditTransactions as any[]).map((tx: any) => ({
      id: tx.id,
      walletAddress: tx.wallet_address,
      amount: tx.amount,
      transactionType: tx.transaction_type,
      description: tx.description,
      paymentTxId: tx.payment_txid,
      createdAt: tx.created_at,
      status: 'completed',
    }));
    
    return NextResponse.json({
      transactions,
      total,
      pendingCount,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error: any) {
    console.error('Error fetching transactions:', error);
    return NextResponse.json(
      { 
        error: error?.message || 'Failed to fetch transactions',
        transactions: [],
        total: 0
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/transactions
 * 
 * Deletes one or more transactions for a wallet address
 * Body: { transaction_ids: string[], wallet_address: string } or { wallet_address: string, delete_all: true }
 */
export async function DELETE(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { transaction_ids, wallet_address, delete_all } = body;

    if (!wallet_address) {
      return NextResponse.json(
        { error: 'Wallet address is required' },
        { status: 400 }
      );
    }

    if (delete_all) {
      // Delete all transactions for this wallet
      const result = await sql`
        DELETE FROM pending_payments
        WHERE wallet_address = ${wallet_address}
        RETURNING id
      `;

      return NextResponse.json({
        success: true,
        message: `Deleted ${(result as any[]).length} transaction(s)`,
        deletedCount: (result as any[]).length,
      });
    } else if (transaction_ids && Array.isArray(transaction_ids) && transaction_ids.length > 0) {
      // Delete specific transactions (with wallet address verification for security)
      const result = await sql`
        DELETE FROM pending_payments
        WHERE id = ANY(${transaction_ids}::uuid[])
        AND wallet_address = ${wallet_address}
        RETURNING id
      `;

      if ((result as any[]).length === 0) {
        return NextResponse.json(
          { error: 'No transactions found or you do not have permission to delete them' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        message: `Deleted ${(result as any[]).length} transaction(s)`,
        deletedCount: (result as any[]).length,
      });
    } else {
      return NextResponse.json(
        { error: 'Either transaction_ids array or delete_all flag is required' },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error('Error deleting transactions:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to delete transactions' },
      { status: 500 }
    );
  }
}
