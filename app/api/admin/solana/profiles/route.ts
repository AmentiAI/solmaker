import { NextResponse } from 'next/server'
import { sql } from '@/lib/database'

/**
 * GET /api/admin/solana/profiles
 * Get user profiles with credits and activity
 */
export async function GET(request: Request) {
  if (!sql) {
    return NextResponse.json({ error: 'Database not available' }, { status: 500 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '100')

    const profiles = await sql`
      SELECT 
        cr.wallet_address,
        cr.credits,
        cr.created_at,
        cr.updated_at,
        (SELECT COUNT(*)::int FROM collections WHERE wallet_address = cr.wallet_address) as collections_count,
        (SELECT COUNT(*)::int FROM solana_nft_mints WHERE minter_wallet = cr.wallet_address) as mints_count,
        (SELECT COUNT(*)::int FROM generated_ordinals WHERE collection_id IN (
          SELECT id FROM collections WHERE wallet_address = cr.wallet_address
        )) as ordinals_count,
        (SELECT SUM(amount)::int FROM credit_transactions WHERE wallet_address = cr.wallet_address AND amount > 0) as credits_purchased,
        (SELECT SUM(ABS(amount))::int FROM credit_transactions WHERE wallet_address = cr.wallet_address AND amount < 0) as credits_spent
      FROM credits cr
      WHERE cr.credits > 0 OR 
            EXISTS (SELECT 1 FROM collections WHERE wallet_address = cr.wallet_address) OR
            EXISTS (SELECT 1 FROM solana_nft_mints WHERE minter_wallet = cr.wallet_address)
      ORDER BY cr.credits DESC, cr.updated_at DESC
      LIMIT ${limit}
    ` as any[]

    return NextResponse.json(profiles)
  } catch (error: any) {
    console.error('[Admin Profiles] Error:', error)
    return NextResponse.json({ 
      error: 'Failed to fetch profiles',
      details: error.message 
    }, { status: 500 })
  }
}
