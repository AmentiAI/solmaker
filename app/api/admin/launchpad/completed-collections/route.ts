import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { checkAuthorizationServer } from '@/lib/auth/access-control'

/**
 * GET /api/admin/launchpad/completed-collections
 * Returns collections with recent mint activity (actually minted, not just completed phases)
 */
export async function GET(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const authResult = await checkAuthorizationServer(request)
    if (!authResult.isAuthorized || !authResult.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized. Admin access only.' }, { status: 403 })
    }

    // Get collections that have actual mints, ordered by most recent mint activity
    const completedCollections = await sql`
      SELECT 
        c.id,
        c.name,
        c.description,
        c.banner_image_url,
        c.mobile_image_url,
        c.wallet_address as creator_wallet,
        c.mint_ended_at,
        c.is_locked,
        c.collection_status,
        (SELECT COUNT(*) FROM generated_ordinals WHERE collection_id = c.id) as total_supply,
        (
          SELECT COUNT(*) 
          FROM mint_inscriptions 
          WHERE collection_id = c.id 
            AND commit_tx_id IS NOT NULL
            AND LENGTH(TRIM(commit_tx_id)) > 0
            AND is_test_mint = false
        ) as minted_count,
        (
          SELECT COUNT(*) 
          FROM mint_inscriptions 
          WHERE collection_id = c.id 
            AND is_test_mint = true
        ) as test_mint_count,
        (
          SELECT MAX(created_at) 
          FROM mint_inscriptions 
          WHERE collection_id = c.id 
            AND is_test_mint = false
        ) as last_mint_at,
        (SELECT json_agg(json_build_object(
          'id', mp.id,
          'name', mp.phase_name,
          'start_time', mp.start_time,
          'end_time', mp.end_time,
          'is_completed', mp.is_completed,
          'phase_allocation', mp.phase_allocation
        ) ORDER BY mp.phase_order) FROM mint_phases mp WHERE mp.collection_id = c.id) as phases
      FROM collections c
      WHERE EXISTS (
        -- Has at least one real mint (not test)
        SELECT 1 FROM mint_inscriptions mi
        WHERE mi.collection_id = c.id 
          AND mi.commit_tx_id IS NOT NULL
          AND LENGTH(TRIM(mi.commit_tx_id)) > 0
          AND mi.is_test_mint = false
      )
      ORDER BY (
        SELECT MAX(created_at) 
        FROM mint_inscriptions 
        WHERE collection_id = c.id 
          AND is_test_mint = false
      ) DESC NULLS LAST
      LIMIT 100
    ` as any[]

    return NextResponse.json({
      success: true,
      collections: completedCollections || [],
      count: completedCollections?.length || 0,
    })
  } catch (error: any) {
    console.error('Error fetching recently minted collections:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch recently minted collections' },
      { status: 500 }
    )
  }
}

