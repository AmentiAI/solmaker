import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/database';
import { getCredits, getOrCreateCredits } from '@/lib/credits/credits';

// GET /api/credits - Get current credits for a wallet
export async function GET(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const walletAddress = searchParams.get('wallet_address');

    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 });
    }

    const credits = await getOrCreateCredits(walletAddress);

    return NextResponse.json({ credits, walletAddress });
  } catch (error) {
    console.error('Error fetching credits:', error);
    return NextResponse.json({ error: 'Failed to fetch credits' }, { status: 500 });
  }
}

