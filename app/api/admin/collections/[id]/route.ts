import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { checkAuthorizationServer } from '@/lib/auth/access-control'

/**
 * GET /api/admin/collections/[id] - Get a single collection with full details (admin only)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const walletAddress = searchParams.get('wallet_address')

    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet address required' }, { status: 401 })
    }

    const authResult = await checkAuthorizationServer(request, sql)
    if (!authResult.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized. Admin access only.' }, { status: 403 })
    }

    // Get collection with all fields
    const collectionResult = await sql`
      SELECT 
        c.id,
        c.name,
        c.description,
        c.wallet_address,
        c.is_locked,
        c.locked_at,
        c.locked_by,
        COALESCE(c.collection_status, 'draft') as collection_status,
        c.launch_status,
        c.launched_at,
        c.mint_ended_at,
        c.banner_image_url,
        c.mobile_image_url,
        c.banner_video_url,
        c.audio_url,
        c.video_url,
        c.extend_last_phase,
        c.creator_royalty_wallet,
        c.creator_royalty_percent,
        c.hidden_from_homepage,
        c.force_show_on_homepage_ticker,
        c.twitter_url,
        c.discord_url,
        c.telegram_url,
        c.website_url,
        c.created_at,
        c.updated_at,
        (SELECT COUNT(*)::int FROM generated_ordinals WHERE collection_id = c.id) as total_ordinals,
        (SELECT COUNT(*)::int FROM generated_ordinals WHERE collection_id = c.id AND is_minted = true) as minted_ordinals,
        (
          SELECT COUNT(*)::int 
          FROM mint_inscriptions 
          WHERE collection_id = c.id 
            AND commit_tx_id IS NOT NULL
            AND LENGTH(TRIM(commit_tx_id)) > 0
            AND is_test_mint = false
        ) as minted_count,
        (SELECT COUNT(*)::int FROM mint_phases WHERE collection_id = c.id) as phase_count,
        (SELECT COUNT(*)::int FROM layers WHERE collection_id = c.id) as layer_count
      FROM collections c
      WHERE c.id = ${id}
      LIMIT 1
    ` as any[]

    if (!collectionResult || collectionResult.length === 0) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 })
    }

    const collection = collectionResult[0]

    // Get mint phases with minted counts
    const phasesResult = await sql`
      SELECT 
        mp.id,
        mp.collection_id,
        mp.phase_name,
        mp.start_time,
        mp.end_time,
        mp.mint_price_sats,
        mp.min_fee_rate,
        mp.max_fee_rate,
        mp.suggested_fee_rate,
        mp.max_per_wallet,
        mp.max_per_transaction,
        mp.whitelist_only,
        mp.whitelist_id,
        mp.end_on_allocation,
        mp.phase_allocation,
        mp.description,
        mp.is_active,
        mp.is_completed,
        mp.created_at,
        mp.updated_at,
        (
          SELECT COUNT(*)::int 
          FROM generated_ordinals go
          WHERE go.collection_id = mp.collection_id
            AND go.is_minted = true
            AND (
              EXISTS (
                SELECT 1 FROM mint_inscriptions mi
                WHERE mi.ordinal_id = go.id
                  AND mi.phase_id = mp.id
                  AND mi.is_test_mint = false
                  AND mi.mint_status != 'failed'
              )
              OR
              EXISTS (
                SELECT 1 FROM ordinal_reservations r
                WHERE r.ordinal_id = go.id
                  AND r.phase_id = mp.id
                  AND r.status = 'completed'
              )
            )
        ) as phase_minted
      FROM mint_phases mp
      WHERE mp.collection_id = ${id}
      ORDER BY mp.created_at ASC
    ` as any[]

    // Get whitelists
    const whitelistsResult = await sql`
      SELECT 
        id,
        collection_id,
        name,
        description,
        created_at,
        updated_at
      FROM mint_phase_whitelists
      WHERE collection_id = ${id}
      ORDER BY created_at ASC
    ` as any[]

    // Get whitelist addresses for each whitelist
    const whitelistsWithAddresses = await Promise.all(
      whitelistsResult.map(async (whitelist: any) => {
        const addressesResult = await sql`
          SELECT wallet_address
          FROM whitelist_addresses
          WHERE whitelist_id = ${whitelist.id}
        ` as any[]
        return {
          ...whitelist,
          addresses: addressesResult.map((a: any) => a.wallet_address),
        }
      })
    )

    return NextResponse.json({
      success: true,
      collection,
      phases: phasesResult || [],
      whitelists: whitelistsWithAddresses || [],
    })
  } catch (error: any) {
    console.error('Error fetching collection:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch collection' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/admin/collections/[id] - Update collection (admin only)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const walletAddress = searchParams.get('wallet_address')

    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet address required' }, { status: 401 })
    }

    const authResult = await checkAuthorizationServer(request, sql)
    if (!authResult.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized. Admin access only.' }, { status: 403 })
    }

    const body = await request.json()
    const { updates } = body

    if (!updates || typeof updates !== 'object') {
      return NextResponse.json({ error: 'Updates object required' }, { status: 400 })
    }

    // If trying to set collection_status to launchpad or launchpad_live, verify collection has ordinals
    if (updates.collection_status === 'launchpad' || updates.collection_status === 'launchpad_live') {
      const supplyCheck = await sql`
        SELECT COUNT(*)::int as ordinal_count
        FROM generated_ordinals
        WHERE collection_id = ${id}
      ` as any[]
      
      const ordinalCount = supplyCheck?.[0]?.ordinal_count || 0
      
      if (ordinalCount === 0) {
        return NextResponse.json({ 
          error: 'Cannot launch collection with 0 supply. Generate ordinals first.',
          details: 'A launchpad collection must have at least 1 ordinal in supply.'
        }, { status: 400 })
      }
    }

    // Build dynamic update query
    const allowedFields = [
      'name', 'description', 'is_locked', 'collection_status', 'launch_status',
      'banner_image_url', 'mobile_image_url', 'banner_video_url', 'audio_url', 'video_url',
      'extend_last_phase', 'creator_royalty_wallet', 'creator_royalty_percent',
      'hidden_from_homepage', 'force_show_on_homepage_ticker',
      'twitter_url', 'discord_url', 'telegram_url', 'website_url'
    ]

    // Build SQL update using COALESCE pattern
    await sql`
      UPDATE collections SET
        name = COALESCE(${updates.name ?? null}, name),
        description = COALESCE(${updates.description ?? null}, description),
        is_locked = COALESCE(${updates.is_locked ?? null}, is_locked),
        collection_status = COALESCE(${updates.collection_status ?? null}, collection_status),
        launch_status = COALESCE(${updates.launch_status ?? null}, launch_status),
        banner_image_url = COALESCE(${updates.banner_image_url ?? null}, banner_image_url),
        mobile_image_url = COALESCE(${updates.mobile_image_url ?? null}, mobile_image_url),
        banner_video_url = COALESCE(${updates.banner_video_url ?? null}, banner_video_url),
        audio_url = COALESCE(${updates.audio_url ?? null}, audio_url),
        video_url = COALESCE(${updates.video_url ?? null}, video_url),
        extend_last_phase = COALESCE(${updates.extend_last_phase ?? null}, extend_last_phase),
        creator_royalty_wallet = ${updates.creator_royalty_wallet ?? null},
        creator_royalty_percent = COALESCE(${updates.creator_royalty_percent ?? null}, creator_royalty_percent),
        hidden_from_homepage = COALESCE(${updates.hidden_from_homepage ?? null}, hidden_from_homepage),
        force_show_on_homepage_ticker = COALESCE(${updates.force_show_on_homepage_ticker ?? null}, force_show_on_homepage_ticker),
        twitter_url = COALESCE(${updates.twitter_url ?? null}, twitter_url),
        discord_url = COALESCE(${updates.discord_url ?? null}, discord_url),
        telegram_url = COALESCE(${updates.telegram_url ?? null}, telegram_url),
        website_url = COALESCE(${updates.website_url ?? null}, website_url),
        updated_at = NOW()
      WHERE id = ${id}
    `

    return NextResponse.json({
      success: true,
      message: 'Collection updated successfully',
    })
  } catch (error: any) {
    console.error('Error updating collection:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update collection' },
      { status: 500 }
    )
  }
}
