import { NextRequest, NextResponse } from 'next/server';

import { checkAuthorizationServer } from '@/lib/auth/access-control';
import { sql } from '@/lib/database';



// GET /api/admin/generation-jobs - Get all generation jobs (admin only)
export async function GET(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 });
  }

  try {
    // Check authorization
    const url = new URL(request.url);
    const walletAddress = url.searchParams.get('wallet_address');
    const status = url.searchParams.get('status'); // Optional filter: pending, processing, completed, failed

    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet address required' }, { status: 401 });
    }

    const authResult = await checkAuthorizationServer(request, sql);
    if (!authResult.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized. Admin access only.' }, { status: 403 });
    }

    // Build query with optional status filter
    let jobs;
    if (status && ['pending', 'processing', 'completed', 'failed'].includes(status)) {
      jobs = await sql`
        SELECT 
          j.id,
          j.collection_id,
          j.ordinal_number,
          j.trait_overrides,
          j.status,
          j.created_at,
          j.started_at,
          j.completed_at,
          j.error_message,
          c.name as collection_name,
          c.wallet_address as collection_owner
        FROM generation_jobs j
        LEFT JOIN collections c ON j.collection_id = c.id
        WHERE j.status = ${status}
        ORDER BY j.created_at DESC
        LIMIT 500
      ` as any[];
    } else {
      jobs = await sql`
        SELECT 
          j.id,
          j.collection_id,
          j.ordinal_number,
          j.trait_overrides,
          j.status,
          j.created_at,
          j.started_at,
          j.completed_at,
          j.error_message,
          c.name as collection_name,
          c.wallet_address as collection_owner
        FROM generation_jobs j
        LEFT JOIN collections c ON j.collection_id = c.id
        ORDER BY j.created_at DESC
        LIMIT 500
      ` as any[];
    }

    // Get summary counts
    const summaryResult = await sql`
      SELECT 
        status,
        COUNT(*) as count
      FROM generation_jobs
      GROUP BY status
    ` as any[];

    const summary: Record<string, number> = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      total: 0
    };

    if (Array.isArray(summaryResult)) {
      summaryResult.forEach((row: any) => {
        const status = row.status || 'unknown';
        const count = parseInt(String(row.count || 0));
        if (status in summary) {
          summary[status] = count;
        }
        summary.total += count;
      });
    }

    return NextResponse.json({
      jobs: Array.isArray(jobs) ? jobs : [],
      summary
    });

  } catch (error) {
    console.error('Error fetching generation jobs:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ 
      error: 'Failed to fetch generation jobs',
      details: errorMessage 
    }, { status: 500 });
  }
}

