import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { checkAuthorizationServer } from '@/lib/auth/access-control'

/**
 * GET /api/admin/launchpad/stats
 * Returns comprehensive launchpad statistics for admin dashboard
 * Queries solana_nft_mints (the active Solana mint tracking table)
 *
 * Query params:
 * - wallet_address: Required. Admin wallet address for authorization.
 * - collection_id: Optional. Filter stats for a specific collection.
 */
export async function GET(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const walletAddress = searchParams.get('wallet_address')
    const collectionId = searchParams.get('collection_id')

    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet address required' }, { status: 401 })
    }

    const authResult = await checkAuthorizationServer(request, sql)
    if (!authResult.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized. Admin access only.' }, { status: 403 })
    }

    // Overall stats from solana_nft_mints
    const overallStatsResult = await sql`
      SELECT
        COUNT(*) as total_mints,
        COUNT(CASE WHEN sm.mint_status = 'confirmed' THEN 1 END) as confirmed_mints,
        COUNT(CASE WHEN sm.mint_status = 'failed' THEN 1 END) as failed_mints,
        COUNT(CASE WHEN sm.mint_status IN ('pending', 'building', 'awaiting_signature', 'broadcasting', 'confirming') THEN 1 END) as pending_mints,
        COUNT(CASE WHEN sm.mint_status = 'cancelled' THEN 1 END) as cancelled_mints,
        COUNT(DISTINCT sm.collection_id) as collections_with_mints,
        COUNT(DISTINCT sm.minter_wallet) as unique_minters,
        COALESCE(SUM(CASE WHEN sm.mint_status = 'confirmed' THEN sm.mint_price_lamports ELSE 0 END), 0) as total_revenue_lamports,
        COALESCE(SUM(CASE WHEN sm.mint_status = 'confirmed' THEN sm.platform_fee_lamports ELSE 0 END), 0) as total_platform_fees_lamports
      FROM solana_nft_mints sm
      INNER JOIN collections c ON sm.collection_id = c.id
      WHERE COALESCE(c.collection_status, 'draft') IN ('launchpad', 'launchpad_live')
    ` as any[]

    const stats = overallStatsResult?.[0] || {}

    const overallStats = {
      total_mints: parseInt(stats.total_mints || '0', 10),
      confirmed_mints: parseInt(stats.confirmed_mints || '0', 10),
      failed_mints: parseInt(stats.failed_mints || '0', 10),
      pending_mints: parseInt(stats.pending_mints || '0', 10),
      cancelled_mints: parseInt(stats.cancelled_mints || '0', 10),
      collections_with_mints: parseInt(stats.collections_with_mints || '0', 10),
      unique_minters: parseInt(stats.unique_minters || '0', 10),
      total_revenue_lamports: parseInt(stats.total_revenue_lamports || '0', 10),
      total_platform_fees_lamports: parseInt(stats.total_platform_fees_lamports || '0', 10),
    }

    // Collection-level stats
    let collectionStatsQuery
    if (collectionId) {
      collectionStatsQuery = sql`
        SELECT
          c.id,
          c.name,
          (SELECT COUNT(*) FROM generated_ordinals WHERE collection_id = c.id) as total_supply,
          COUNT(*) as total_mints,
          COUNT(CASE WHEN sm.mint_status = 'confirmed' THEN 1 END) as confirmed_mints,
          COUNT(CASE WHEN sm.mint_status = 'failed' THEN 1 END) as failed_mints,
          COUNT(CASE WHEN sm.mint_status IN ('pending', 'building', 'awaiting_signature', 'broadcasting', 'confirming') THEN 1 END) as pending_mints,
          COUNT(DISTINCT sm.minter_wallet) as unique_minters,
          COALESCE(SUM(CASE WHEN sm.mint_status = 'confirmed' THEN sm.mint_price_lamports ELSE 0 END), 0) as revenue_lamports,
          COALESCE(SUM(CASE WHEN sm.mint_status = 'confirmed' THEN sm.platform_fee_lamports ELSE 0 END), 0) as platform_fees_lamports,
          MIN(sm.created_at) as first_mint_at,
          MAX(sm.created_at) as last_mint_at,
          MAX(sm.confirmed_at) as last_confirmed_at
        FROM collections c
        LEFT JOIN solana_nft_mints sm ON c.id = sm.collection_id
        WHERE c.id = ${collectionId}
          AND COALESCE(c.collection_status, 'draft') IN ('launchpad', 'launchpad_live')
        GROUP BY c.id, c.name
      `
    } else {
      collectionStatsQuery = sql`
        SELECT
          c.id,
          c.name,
          (SELECT COUNT(*) FROM generated_ordinals WHERE collection_id = c.id) as total_supply,
          COUNT(*) as total_mints,
          COUNT(CASE WHEN sm.mint_status = 'confirmed' THEN 1 END) as confirmed_mints,
          COUNT(CASE WHEN sm.mint_status = 'failed' THEN 1 END) as failed_mints,
          COUNT(CASE WHEN sm.mint_status IN ('pending', 'building', 'awaiting_signature', 'broadcasting', 'confirming') THEN 1 END) as pending_mints,
          COUNT(DISTINCT sm.minter_wallet) as unique_minters,
          COALESCE(SUM(CASE WHEN sm.mint_status = 'confirmed' THEN sm.mint_price_lamports ELSE 0 END), 0) as revenue_lamports,
          COALESCE(SUM(CASE WHEN sm.mint_status = 'confirmed' THEN sm.platform_fee_lamports ELSE 0 END), 0) as platform_fees_lamports,
          MIN(sm.created_at) as first_mint_at,
          MAX(sm.created_at) as last_mint_at,
          MAX(sm.confirmed_at) as last_confirmed_at
        FROM collections c
        INNER JOIN solana_nft_mints sm ON c.id = sm.collection_id
        WHERE (c.is_launchpad_collection = TRUE
          OR COALESCE(c.collection_status, 'draft') IN ('launchpad', 'launchpad_live'))
        GROUP BY c.id, c.name
        HAVING COUNT(*) > 0
        ORDER BY last_mint_at DESC NULLS LAST
      `
    }

    const collectionStats = await collectionStatsQuery as any[]

    // Get phase mint counts for each collection
    const collectionIds = (collectionStats || []).map((stat: any) => stat.id)
    let phaseMintCounts: Record<string, Array<{ phase_name: string; mint_count: number; confirmed_count: number; revenue_lamports: number }>> = {}

    if (collectionIds.length > 0) {
      const phaseCountsResult = await sql`
        SELECT
          sm.collection_id,
          sm.phase_id,
          COALESCE(mp.phase_name, 'No Phase') as phase_name,
          COALESCE(mp.phase_order, 999) as phase_order,
          COUNT(*) as mint_count,
          COUNT(CASE WHEN sm.mint_status = 'confirmed' THEN 1 END) as confirmed_count,
          COALESCE(SUM(CASE WHEN sm.mint_status = 'confirmed' THEN sm.mint_price_lamports ELSE 0 END), 0) as revenue_lamports
        FROM solana_nft_mints sm
        LEFT JOIN mint_phases mp ON sm.phase_id = mp.id
        WHERE sm.collection_id = ANY(${collectionIds}::uuid[])
        GROUP BY sm.collection_id, sm.phase_id, mp.phase_name, mp.phase_order
        HAVING COUNT(*) > 0
        ORDER BY sm.collection_id, COALESCE(mp.phase_order, 999)
      ` as any[]

      for (const row of phaseCountsResult || []) {
        const collId = String(row.collection_id)
        if (!phaseMintCounts[collId]) {
          phaseMintCounts[collId] = []
        }
        phaseMintCounts[collId].push({
          phase_name: row.phase_name || 'Unknown Phase',
          mint_count: parseInt(row.mint_count || '0', 10),
          confirmed_count: parseInt(row.confirmed_count || '0', 10),
          revenue_lamports: parseInt(row.revenue_lamports || '0', 10),
        })
      }
    }

    const collectionStatsWithRevenue = (collectionStats || []).map((stat: any) => ({
      ...stat,
      total_mints: parseInt(stat.total_mints || '0', 10),
      confirmed_mints: parseInt(stat.confirmed_mints || '0', 10),
      failed_mints: parseInt(stat.failed_mints || '0', 10),
      pending_mints: parseInt(stat.pending_mints || '0', 10),
      unique_minters: parseInt(stat.unique_minters || '0', 10),
      revenue_lamports: parseInt(stat.revenue_lamports || '0', 10),
      platform_fees_lamports: parseInt(stat.platform_fees_lamports || '0', 10),
      phase_mints: phaseMintCounts[stat.id] || [],
    }))

    // Recent activity from solana_nft_mints
    const recentMints = await sql`
      SELECT
        sm.id,
        sm.collection_id,
        c.name as collection_name,
        sm.minter_wallet,
        sm.mint_status,
        sm.mint_tx_signature,
        sm.nft_mint_address,
        sm.mint_price_lamports,
        sm.platform_fee_lamports,
        sm.created_at,
        sm.confirmed_at
      FROM solana_nft_mints sm
      JOIN collections c ON sm.collection_id = c.id
      WHERE COALESCE(c.collection_status, 'draft') IN ('launchpad', 'launchpad_live')
      ORDER BY sm.created_at DESC
      LIMIT 50
    ` as any[]

    return NextResponse.json({
      success: true,
      overall_stats: overallStats,
      collection_stats: collectionStatsWithRevenue,
      recent_mints: recentMints || [],
    })
  } catch (error) {
    console.error('Error fetching launchpad stats:', error)
    return NextResponse.json({ error: 'Failed to fetch launchpad stats' }, { status: 500 })
  }
}
