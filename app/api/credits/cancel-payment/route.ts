import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/database';




/**
 * POST /api/credits/cancel-payment
 * 
 * Cancels a pending payment that hasn't been signed/broadcast yet.
 * This cleans up pending_payments records when user cancels the wallet popup.
 */
export async function POST(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { payment_id, wallet_address } = body;

    if (!payment_id || !wallet_address) {
      return NextResponse.json(
        { error: 'payment_id and wallet_address are required' },
        { status: 400 }
      );
    }

    // Only delete pending payments that:
    // 1. Match the payment_id and wallet_address (security)
    // 2. Have status 'pending' (not already confirming/completed)
    // 3. Have no payment_txid (not yet broadcast)
    const result = await sql`
      DELETE FROM pending_payments
      WHERE id = ${payment_id}
      AND wallet_address = ${wallet_address}
      AND status = 'pending'
      AND payment_txid IS NULL
      RETURNING id
    ` as { id: string }[];

    if (result.length === 0) {
      // Either payment doesn't exist, already has a txid, or belongs to different wallet
      return NextResponse.json({
        success: false,
        message: 'Payment not found or already in progress'
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Payment cancelled successfully',
      cancelledId: result[0].id
    });
  } catch (error: any) {
    console.error('Error cancelling payment:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to cancel payment' },
      { status: 500 }
    );
  }
}

