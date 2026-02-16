import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { checkAuthorizationServer } from '@/lib/auth/access-control'

/**
 * GET /api/admin/launchpad/completed-collections
 * Returns collections with recent Solana mint activity
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
          FROM solana_nft_mints
          WHERE collection_id = c.id
            AND mint_status = 'confirmed'
        ) as minted_count,
        (
          SELECT COUNT(*)
          FROM solana_nft_mints
          WHERE collection_id = c.id
            AND mint_status IN ('pending', 'building', 'awaiting_signature', 'broadcasting', 'confirming')
        ) as pending_count,
        (
          SELECT MAX(created_at)
          FROM solana_nft_mints
          WHERE collection_id = c.id
        ) as last_mint_at,
        (SELECT json_agg(json_build_object(
          'id', mp.id,
          'name', mp.phase_name,
          'start_time', mp.start_time,
          'end_time', mp.end_time,
          'is_completed', mp.is_completed,
          'phase_allocation', mp.phase_allocation,
          'phase_minted', mp.phase_minted
        ) ORDER BY mp.phase_order) FROM mint_phases mp WHERE mp.collection_id = c.id) as phases
      FROM collections c
      WHERE EXISTS (
        SELECT 1 FROM solana_nft_mints sm
        WHERE sm.collection_id = c.id
      )
      ORDER BY (
        SELECT MAX(created_at)
        FROM solana_nft_mints
        WHERE collection_id = c.id
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
