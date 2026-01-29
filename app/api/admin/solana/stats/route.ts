import { NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { getPlatformWalletBalance, getPlatformWalletAddress } from '@/lib/solana/platform-wallet'

/**
 * GET /api/admin/solana/stats
 * Get overall Solana platform statistics
 */
export async function GET() {
  if (!sql) {
    return NextResponse.json({ error: 'Database not available' }, { status: 500 })
  }

  try {
    // Platform wallet
    const walletBalance = await getPlatformWalletBalance()
    const walletAddress = getPlatformWalletAddress()

    // Collections stats
    const collectionsStats = await sql`
      SELECT 
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE candy_machine_address IS NOT NULL)::int as deployed,
        COUNT(*) FILTER (WHERE deployment_status = 'not_deployed')::int as pending,
        COUNT(*) FILTER (WHERE collection_status = 'launchpad_live')::int as live
      FROM collections
    ` as any[]

    // Mints stats
    const mintsStats = await sql`
      SELECT 
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE mint_status = 'confirmed')::int as confirmed,
        COUNT(*) FILTER (WHERE mint_status IN ('pending', 'confirming'))::int as pending,
        COUNT(*) FILTER (WHERE mint_status = 'failed')::int as failed
      FROM solana_nft_mints
    ` as any[]

    // Users stats
    const usersStats = await sql`
      SELECT 
        COUNT(DISTINCT wallet_address)::int as total,
        COUNT(DISTINCT wallet_address) FILTER (WHERE credits > 0)::int as with_credits
      FROM credits
    ` as any[]

    // Marketplace stats (if table exists)
    let marketplaceStats = { listings: 0, active: 0 }
    try {
      const marketplaceResult = await sql`
        SELECT 
          COUNT(*)::int as listings,
          COUNT(*) FILTER (WHERE status = 'active')::int as active
        FROM marketplace_listings
      ` as any[]
      marketplaceStats = marketplaceResult[0]
    } catch {
      // Table might not exist yet
    }

    return NextResponse.json({
      platformWallet: {
        address: walletAddress,
        balance: walletBalance,
      },
      collections: collectionsStats[0],
      mints: mintsStats[0],
      users: usersStats[0],
      marketplace: marketplaceStats,
    })
  } catch (error: any) {
    console.error('[Admin Stats] Error:', error)
    return NextResponse.json({ 
      error: 'Failed to fetch stats',
      details: error.message 
    }, { status: 500 })
  }
}
