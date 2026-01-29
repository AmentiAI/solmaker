import { NextRequest, NextResponse } from 'next/server';

import { checkAuthorizationServer } from '@/lib/auth/access-control';
import { sql } from '@/lib/database';



// GET /api/admin/collections - Get all collections (admin only)
export async function GET(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 });
  }

  try {
    // Check authorization
    const url = new URL(request.url);
    const walletAddress = url.searchParams.get('wallet_address');

    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet address required' }, { status: 401 });
    }

    const authResult = await checkAuthorizationServer(request, sql);
    if (!authResult.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized. Admin access only.' }, { status: 403 });
    }

    // Ensure hidden_from_homepage column exists for collections
    try {
      await sql`
        ALTER TABLE collections 
        ADD COLUMN IF NOT EXISTS hidden_from_homepage BOOLEAN DEFAULT FALSE
      `
      await sql`
        ALTER TABLE collections
        ADD COLUMN IF NOT EXISTS force_show_on_homepage_ticker BOOLEAN DEFAULT FALSE
      `
    } catch (error) {
      // Column might already exist - ignore
    }

    // Get all collections
    const result = await sql`
      SELECT 
        id,
        name,
        hidden_from_homepage,
        force_show_on_homepage_ticker
      FROM collections
      ORDER BY name ASC
    ` as any[];

    const collections = Array.isArray(result) ? result : [];

    return NextResponse.json({
      collections,
    });
  } catch (error: any) {
    console.error('[Admin Collections API] Error:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch collections',
      details: error?.message 
    }, { status: 500 });
  }
}

