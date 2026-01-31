import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/database';
import { checkAuthorizationServer } from '@/lib/auth/access-control';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const walletAddress = body.wallet_address || null;
    
    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet address required' }, { status: 400 });
    }
    
    if (!sql) {
      return NextResponse.json({ error: 'Database connection not available' }, { status: 500 });
    }
    
    // Check admin status
    const { isAdmin } = await checkAuthorizationServer(walletAddress, sql);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized. Admin access only.' }, { status: 403 });
    }
    
    // Get queued jobs count
    const queuedJobs = await sql`
      SELECT COUNT(*) as count
      FROM generation_jobs
      WHERE status = 'pending'
    `;
    
    const processingJobs = await sql`
      SELECT COUNT(*) as count
      FROM generation_jobs
      WHERE status = 'processing'
    `;
    
    return NextResponse.json({ 
      success: true,
      queued: queuedJobs[0]?.count || 0,
      processing: processingJobs[0]?.count || 0,
      message: 'Ready to process jobs',
      isAdmin,
      walletAddress
    });
    
  } catch (error) {
    console.error('Test endpoint error:', error);
    return NextResponse.json({ 
      error: 'Failed to check status',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
