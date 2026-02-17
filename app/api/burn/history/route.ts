import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/database';

export async function GET(req: NextRequest) {
  const limit = Number(req.nextUrl.searchParams.get('limit') || '50');
  const offset = Number(req.nextUrl.searchParams.get('offset') || '0');

  const cycles = await sql`
    SELECT * FROM burn_cycles
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const stats = await sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'complete') as total_cycles,
      COALESCE(SUM(fees_claimed_sol) FILTER (WHERE status = 'complete'), 0) as total_sol_claimed,
      COALESCE(SUM(tokens_burned) FILTER (WHERE status = 'complete'), 0) as total_tokens_burned,
      COALESCE(SUM(tokens_burned) FILTER (WHERE status = 'complete' AND created_at > NOW() - INTERVAL '24 hours'), 0) as burned_24h,
      COALESCE(SUM(fees_claimed_sol) FILTER (WHERE status = 'complete' AND created_at > NOW() - INTERVAL '24 hours'), 0) as sol_claimed_24h
    FROM burn_cycles
  `;

  // Latest fee snapshot from the most recent cycle
  const latestFees = await sql`
    SELECT pending_bc_fees, pending_swap_fees, wallet_balance, created_at
    FROM burn_cycles
    ORDER BY created_at DESC
    LIMIT 1
  `;

  const pendingFees = latestFees[0]
    ? {
        bondingCurveFees: Number(latestFees[0].pending_bc_fees),
        pumpSwapFees: Number(latestFees[0].pending_swap_fees),
        totalPending: Number(latestFees[0].pending_bc_fees) + Number(latestFees[0].pending_swap_fees),
        walletBalance: Number(latestFees[0].wallet_balance),
        snapshotAt: latestFees[0].created_at,
      }
    : null;

  return NextResponse.json({ cycles, stats: stats[0], pendingFees });
}
