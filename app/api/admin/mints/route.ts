import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { checkAuthorizationServer } from '@/lib/auth/access-control'

/**
 * GET /api/admin/mints - Get mint dashboard overview
 * Returns comprehensive statistics and recent activity
 */
export async function GET(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const adminWallet = searchParams.get('wallet_address')

    if (!adminWallet) {
      return NextResponse.json({ error: 'Wallet address required' }, { status: 401 })
    }
    const authResult = await checkAuthorizationServer(adminWallet, sql)
    if (!authResult.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized. Admin access only.' }, { status: 403 })
    }

    // Get overall statistics
    const statsResult = await sql`
      SELECT
        (SELECT COUNT(*) FROM collection_mint_launches) as total_launches,
        (SELECT COUNT(*) FROM collection_mint_launches WHERE launch_status = 'active') as active_launches,
        (SELECT COUNT(*) FROM collection_mint_launches WHERE launch_status = 'draft') as draft_launches,
        (SELECT COUNT(*) FROM collection_mint_launches WHERE launch_status = 'completed') as completed_launches,
        (SELECT COUNT(*) FROM mint_inscriptions) as total_inscriptions,
        (SELECT COUNT(*) FROM mint_inscriptions WHERE mint_status = 'completed') as completed_inscriptions,
        (SELECT COUNT(*) FROM mint_inscriptions WHERE mint_status = 'pending') as pending_inscriptions,
        (SELECT COUNT(*) FROM mint_inscriptions WHERE mint_status = 'failed') as failed_inscriptions,
        (SELECT COUNT(*) FROM mint_inscriptions WHERE mint_status = 'stuck') as stuck_inscriptions,
        (SELECT COUNT(*) FROM mint_inscriptions WHERE is_test_mint = true) as test_mints,
        (SELECT COUNT(*) FROM mint_inscriptions WHERE flagged_for_review = true) as flagged_for_review,
        (SELECT COALESCE(SUM(total_revenue_sats), 0) FROM collection_mint_launches) as total_revenue_sats,
        (SELECT COALESCE(SUM(total_cost_sats), 0) FROM mint_inscriptions WHERE mint_status = 'completed') as total_fees_spent,
        (SELECT COUNT(DISTINCT minter_wallet) FROM mint_inscriptions) as unique_minters
    `
    const stats = (Array.isArray(statsResult) ? statsResult[0] : {}) as Record<string, any>

    // Get recent inscriptions (last 50)
    const recentInscriptions = await sql`
      SELECT 
        mi.id,
        mi.minter_wallet,
        mi.receiving_wallet,
        mi.mint_status,
        mi.commit_tx_id,
        mi.reveal_tx_id,
        mi.inscription_id,
        mi.fee_rate,
        mi.total_cost_sats,
        mi.is_test_mint,
        mi.is_admin_mint,
        mi.flagged_for_review,
        mi.error_message,
        mi.created_at,
        mi.completed_at,
        c.name as collection_name,
        cml.launch_name
      FROM mint_inscriptions mi
      LEFT JOIN collections c ON mi.collection_id = c.id
      LEFT JOIN collection_mint_launches cml ON mi.launch_id = cml.id
      ORDER BY mi.created_at DESC
      LIMIT 50
    `

    // Get recent activity log
    const recentActivity = await sql`
      SELECT 
        id,
        action_type,
        actor_wallet,
        actor_type,
        action_data,
        success,
        error_message,
        created_at
      FROM mint_activity_log
      ORDER BY created_at DESC
      LIMIT 30
    `

    // Get stuck transactions needing attention
    const stuckTransactions = await sql`
      SELECT 
        st.id,
        st.tx_type,
        st.tx_id,
        st.detected_at,
        st.stuck_duration_minutes,
        st.current_fee_rate,
        st.recommended_fee_rate,
        st.resolution_status,
        mi.minter_wallet,
        mi.total_cost_sats,
        c.name as collection_name
      FROM stuck_transactions st
      JOIN mint_inscriptions mi ON st.mint_inscription_id = mi.id
      LEFT JOIN collections c ON mi.collection_id = c.id
      WHERE st.resolution_status IN ('detected', 'rbf_sent', 'cpfp_sent')
      ORDER BY st.detected_at DESC
      LIMIT 20
    `

    // Get active launches
    const activeLaunches = await sql`
      SELECT 
        cml.id,
        cml.launch_name,
        cml.mint_price_sats,
        cml.total_supply,
        cml.minted_count,
        cml.launch_status,
        cml.scheduled_start,
        cml.actual_start,
        cml.total_revenue_sats,
        cml.unique_minters,
        c.name as collection_name,
        c.id as collection_id
      FROM collection_mint_launches cml
      JOIN collections c ON cml.collection_id = c.id
      WHERE cml.launch_status IN ('active', 'scheduled', 'paused')
      ORDER BY cml.created_at DESC
    `

    return NextResponse.json({
      success: true,
      stats: {
        launches: {
          total: parseInt(stats.total_launches) || 0,
          active: parseInt(stats.active_launches) || 0,
          draft: parseInt(stats.draft_launches) || 0,
          completed: parseInt(stats.completed_launches) || 0,
        },
        inscriptions: {
          total: parseInt(stats.total_inscriptions) || 0,
          completed: parseInt(stats.completed_inscriptions) || 0,
          pending: parseInt(stats.pending_inscriptions) || 0,
          failed: parseInt(stats.failed_inscriptions) || 0,
          stuck: parseInt(stats.stuck_inscriptions) || 0,
          test: parseInt(stats.test_mints) || 0,
          flagged: parseInt(stats.flagged_for_review) || 0,
        },
        revenue: {
          total_sats: parseInt(stats.total_revenue_sats) || 0,
          fees_spent: parseInt(stats.total_fees_spent) || 0,
        },
        unique_minters: parseInt(stats.unique_minters) || 0,
      },
      recent_inscriptions: recentInscriptions,
      recent_activity: recentActivity,
      stuck_transactions: stuckTransactions,
      active_launches: activeLaunches,
    })
  } catch (error) {
    console.error('Error fetching mint dashboard:', error)
    return NextResponse.json({ error: 'Failed to fetch mint dashboard' }, { status: 500 })
  }
}

