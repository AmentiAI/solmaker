import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { checkAuthorizationServer } from '@/lib/auth/access-control'

const MINT_FEE_SATS = 2500 // Platform fee per mint

/**
 * GET /api/admin/launchpad/stats
 * Returns comprehensive launchpad statistics for admin dashboard
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

    // Overall stats - only launchpad mints (from launchpad collections)
    // Only count mints that have a commit_tx_id (actually initiated)
    const overallStatsResult = await sql`
      SELECT 
        COUNT(DISTINCT CASE WHEN mi.commit_tx_id IS NOT NULL AND LENGTH(TRIM(mi.commit_tx_id)) > 0 THEN mi.id END) as total_mints,
        COUNT(DISTINCT CASE WHEN mi.mint_status = 'completed' THEN mi.id END) as completed_mints,
        COUNT(DISTINCT CASE WHEN mi.mint_status = 'failed' THEN mi.id END) as failed_mints,
        COUNT(DISTINCT CASE WHEN mi.commit_tx_id IS NOT NULL AND LENGTH(TRIM(mi.commit_tx_id)) > 0 AND mi.reveal_tx_id IS NULL THEN mi.id END) as pending_reveals,
        COUNT(DISTINCT CASE WHEN mi.commit_tx_id IS NOT NULL AND LENGTH(TRIM(mi.commit_tx_id)) > 0 AND mi.commit_confirmed_at IS NULL THEN mi.id END) as unconfirmed_commits,
        COUNT(DISTINCT CASE WHEN mi.reveal_tx_id IS NOT NULL AND mi.reveal_confirmed_at IS NULL THEN mi.id END) as unconfirmed_reveals,
        COUNT(DISTINCT CASE WHEN mi.commit_tx_id IS NOT NULL AND LENGTH(TRIM(mi.commit_tx_id)) > 0 THEN mi.collection_id END) as collections_with_mints,
        COUNT(DISTINCT CASE WHEN mi.commit_tx_id IS NOT NULL AND LENGTH(TRIM(mi.commit_tx_id)) > 0 THEN mi.minter_wallet END) as unique_minters
      FROM mint_inscriptions mi
      INNER JOIN collections c ON mi.collection_id = c.id
      WHERE mi.is_test_mint = false
        AND COALESCE(c.collection_status, 'draft') IN ('launchpad', 'launchpad_live')
    ` as any[]
    
    // Calculate revenue from completed mints
    const completedMints = parseInt(overallStatsResult?.[0]?.completed_mints || '0', 10)
    const totalRevenueSats = completedMints * MINT_FEE_SATS
    
    const stats = overallStatsResult?.[0] || {}
    
    const overallStats = {
      total_mints: parseInt(stats.total_mints || '0', 10),
      completed_mints: parseInt(stats.completed_mints || '0', 10),
      failed_mints: parseInt(stats.failed_mints || '0', 10),
      pending_reveals: parseInt(stats.pending_reveals || '0', 10),
      unconfirmed_commits: parseInt(stats.unconfirmed_commits || '0', 10),
      unconfirmed_reveals: parseInt(stats.unconfirmed_reveals || '0', 10),
      collections_with_mints: parseInt(stats.collections_with_mints || '0', 10),
      unique_minters: parseInt(stats.unique_minters || '0', 10),
      total_revenue_sats: totalRevenueSats,
    }

    // Collection-level stats - only launchpad collections
    let collectionStatsQuery
    if (collectionId) {
      collectionStatsQuery = sql`
        SELECT 
          c.id,
          c.name,
          (SELECT COUNT(*) FROM generated_ordinals WHERE collection_id = c.id) as total_supply,
          COUNT(DISTINCT CASE WHEN mi.commit_tx_id IS NOT NULL AND LENGTH(TRIM(mi.commit_tx_id)) > 0 THEN mi.id END) as total_mints,
          COUNT(DISTINCT CASE WHEN mi.mint_status = 'completed' THEN mi.id END) as completed_mints,
          COUNT(DISTINCT CASE WHEN mi.mint_status = 'failed' THEN mi.id END) as failed_mints,
          COUNT(DISTINCT CASE WHEN mi.commit_tx_id IS NOT NULL AND LENGTH(TRIM(mi.commit_tx_id)) > 0 AND mi.reveal_tx_id IS NULL THEN mi.id END) as pending_reveals,
          COUNT(DISTINCT CASE WHEN mi.mint_status = 'commit_confirmed' THEN mi.id END) as commit_confirmed,
          COUNT(DISTINCT CASE WHEN mi.mint_status = 'reveal_broadcast' THEN mi.id END) as reveal_broadcast,
          COUNT(DISTINCT mi.minter_wallet) as unique_minters,
          MIN(mi.created_at) as first_mint_at,
          MAX(mi.created_at) as last_mint_at,
          MAX(mi.completed_at) as last_completed_at
        FROM collections c
        LEFT JOIN mint_inscriptions mi ON c.id = mi.collection_id AND mi.is_test_mint = false
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
          COUNT(DISTINCT CASE WHEN mi.commit_tx_id IS NOT NULL AND LENGTH(TRIM(mi.commit_tx_id)) > 0 THEN mi.id END) as total_mints,
          COUNT(DISTINCT CASE WHEN mi.mint_status = 'completed' THEN mi.id END) as completed_mints,
          COUNT(DISTINCT CASE WHEN mi.mint_status = 'failed' THEN mi.id END) as failed_mints,
          COUNT(DISTINCT CASE WHEN mi.commit_tx_id IS NOT NULL AND LENGTH(TRIM(mi.commit_tx_id)) > 0 AND mi.reveal_tx_id IS NULL THEN mi.id END) as pending_reveals,
          COUNT(DISTINCT CASE WHEN mi.mint_status = 'commit_confirmed' THEN mi.id END) as commit_confirmed,
          COUNT(DISTINCT CASE WHEN mi.mint_status = 'reveal_broadcast' THEN mi.id END) as reveal_broadcast,
          COUNT(DISTINCT mi.minter_wallet) as unique_minters,
          MIN(mi.created_at) as first_mint_at,
          MAX(mi.created_at) as last_mint_at,
          MAX(mi.completed_at) as last_completed_at
        FROM collections c
        LEFT JOIN mint_inscriptions mi ON c.id = mi.collection_id AND mi.is_test_mint = false
        WHERE c.is_launchpad_collection = TRUE
          OR COALESCE(c.collection_status, 'draft') IN ('launchpad', 'launchpad_live')
        GROUP BY c.id, c.name
        HAVING COUNT(DISTINCT CASE WHEN mi.commit_tx_id IS NOT NULL AND LENGTH(TRIM(mi.commit_tx_id)) > 0 THEN mi.id END) > 0
        ORDER BY last_mint_at DESC NULLS LAST
      `
    }

    const collectionStats = await collectionStatsQuery as any[]
    
    // Get phase mint counts and revenue for each collection
    const collectionIds = (collectionStats || []).map((stat: any) => stat.id)
    let phaseMintCounts: Record<string, Array<{ phase_name: string; mint_count: number; revenue_sats: number }>> = {}
    
    if (collectionIds.length > 0) {
      // Count mints per phase - start from mint_inscriptions to ensure we count all mints
      // Use same logic as transactions page: check mi.phase_id first, then ordinal_reservations
      const phaseCountsResult = await sql`
        SELECT 
          mi.collection_id,
          COALESCE(mi.phase_id, r.phase_id) as phase_id,
          COALESCE(mp.phase_name, 'No Phase') as phase_name,
          COALESCE(mp.mint_price_sats, 0) as mint_price_sats,
          COALESCE(mp.phase_order, 999) as phase_order,
          COUNT(DISTINCT CASE WHEN mi.commit_tx_id IS NOT NULL AND LENGTH(TRIM(mi.commit_tx_id)) > 0 THEN mi.id END) as mint_count,
          COUNT(DISTINCT CASE WHEN mi.mint_status = 'completed' THEN mi.id END) as completed_count,
          COALESCE(SUM(CASE WHEN mi.mint_status = 'completed' THEN mi.mint_price_paid ELSE 0 END), 0) as total_revenue_sats
        FROM mint_inscriptions mi
        LEFT JOIN LATERAL (
          SELECT phase_id 
          FROM ordinal_reservations 
          WHERE ordinal_id = mi.ordinal_id 
            AND phase_id IS NOT NULL
          ORDER BY CASE status WHEN 'completed' THEN 0 ELSE 1 END, reserved_at DESC
          LIMIT 1
        ) r ON true
        LEFT JOIN mint_phases mp ON COALESCE(mi.phase_id, r.phase_id) = mp.id
        WHERE mi.collection_id = ANY(${collectionIds}::uuid[])
          AND mi.is_test_mint = false
          AND mi.commit_tx_id IS NOT NULL
          AND LENGTH(TRIM(mi.commit_tx_id)) > 0
        GROUP BY mi.collection_id, COALESCE(mi.phase_id, r.phase_id), mp.phase_name, mp.mint_price_sats, mp.phase_order
        HAVING COUNT(DISTINCT CASE WHEN mi.commit_tx_id IS NOT NULL AND LENGTH(TRIM(mi.commit_tx_id)) > 0 THEN mi.id END) > 0
        ORDER BY mi.collection_id, COALESCE(mp.phase_order, 999)
      ` as any[]
      
      // Group by collection_id
      phaseMintCounts = {}
      for (const row of phaseCountsResult || []) {
        const collId = String(row.collection_id)
        if (!phaseMintCounts[collId]) {
          phaseMintCounts[collId] = []
        }
        // Use actual revenue from completed mints if available, otherwise calculate from phase price
        const completedCount = parseInt(row.completed_count || '0', 10)
        const actualRevenue = parseInt(row.total_revenue_sats || '0', 10)
        const phasePrice = parseInt(row.mint_price_sats || '0', 10)
        // Use actual revenue if we have it, otherwise fall back to phase_price * completed_count
        const revenueSats = actualRevenue > 0 ? actualRevenue : (completedCount * phasePrice)
        
        phaseMintCounts[collId].push({
          phase_name: row.phase_name || 'Unknown Phase',
          mint_count: parseInt(row.mint_count || '0', 10),
          revenue_sats: revenueSats,
        })
      }
    }
    
    // Calculate revenue for each collection
    const collectionStatsWithRevenue = (collectionStats || []).map((stat: any) => {
      const completedMints = parseInt(stat.completed_mints || '0', 10)
      const revenueSats = completedMints * MINT_FEE_SATS
      return {
        ...stat,
        revenue_sats: revenueSats,
        total_mints: parseInt(stat.total_mints || '0', 10),
        completed_mints: parseInt(stat.completed_mints || '0', 10),
        failed_mints: parseInt(stat.failed_mints || '0', 10),
        pending_reveals: parseInt(stat.pending_reveals || '0', 10),
        commit_confirmed: parseInt(stat.commit_confirmed || '0', 10),
        reveal_broadcast: parseInt(stat.reveal_broadcast || '0', 10),
        unique_minters: parseInt(stat.unique_minters || '0', 10),
        phase_mints: phaseMintCounts[stat.id] || [],
      }
    })

    // Recent activity - only from launchpad collections
    const recentMints = await sql`
      SELECT 
        mi.id,
        mi.collection_id,
        c.name as collection_name,
        mi.minter_wallet,
        mi.mint_status,
        mi.commit_tx_id,
        mi.reveal_tx_id,
        mi.inscription_id,
        mi.created_at,
        mi.completed_at
      FROM mint_inscriptions mi
      JOIN collections c ON mi.collection_id = c.id
      WHERE mi.is_test_mint = false
        AND COALESCE(c.collection_status, 'draft') IN ('launchpad', 'launchpad_live')
      ORDER BY mi.created_at DESC
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
