import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'

/**
 * Get launch_status - use database value if set, otherwise return null
 * The database launch_status should be the source of truth, not computed from phase times
 */
function getLaunchStatus(dbLaunchStatus: string | null | undefined): string {
  // Return the database value if it's a valid status
  if (dbLaunchStatus && ['draft', 'upcoming', 'active', 'completed'].includes(dbLaunchStatus)) {
    return dbLaunchStatus
  }
  // Default to 'active' for live collections without explicit status
  return 'active'
}

/**
 * GET /api/launchpad - Get launchpad data (public)
 * Returns upcoming launches, active mints, and completed mints
 */
export async function GET(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    // TypeScript: sql can be null at type-level; after the guard above it's safe.
    const db = sql as NonNullable<typeof sql>

    const { searchParams } = new URL(request.url)
    const section = searchParams.get('section') || 'all' // all, upcoming, active, completed

    const fetchData = async (opts: { includeBannerVideo: boolean }) => {
      const { includeBannerVideo } = opts

      // Get upcoming launches (locked collections with phases that start in the future)
      // Criteria: Earliest phase start_time > current time
      const upcomingResult = await db`
      SELECT 
        c.id,
        c.name,
        c.description,
        c.banner_image_url,
        ${includeBannerVideo ? db`c.banner_video_url,` : db``}
        c.mobile_image_url,
        c.audio_url,
        c.video_url,
        c.is_locked,
        c.wallet_address as creator_wallet,
        c.created_at,
        c.launch_status as db_launch_status,
        (SELECT COUNT(*) FROM generated_ordinals WHERE collection_id = c.id) as total_supply,
        -- Use is_minted flag as source of truth (not transaction count)
        (SELECT COUNT(*) FROM generated_ordinals WHERE collection_id = c.id AND is_minted = true) as minted_count,
        (SELECT MIN(start_time) FROM mint_phases WHERE collection_id = c.id) as launch_date,
        (SELECT json_agg(json_build_object(
          'id', mp.id,
          'name', mp.phase_name,
          'start_time', mp.start_time,
          'end_time', mp.end_time,
          'mint_price_sats', mp.mint_price_sats,
          'mint_price_lamports', mp.mint_price_sats,
          'whitelist_only', mp.whitelist_only,
          'phase_allocation', mp.phase_allocation,
          'phase_minted', COALESCE((
            SELECT COUNT(DISTINCT go.id)
            FROM generated_ordinals go
            WHERE go.collection_id = c.id
              AND go.is_minted = true
              AND (
                EXISTS (
                  SELECT 1 FROM ordinal_reservations r
                  WHERE r.ordinal_id = go.id
                    AND r.phase_id = mp.id
                    AND r.status = 'completed'
                )
                OR
                EXISTS (
                  SELECT 1 FROM mint_inscriptions mi
                  WHERE mi.ordinal_id = go.id
                    AND mi.phase_id = mp.id
              AND mi.is_test_mint = false
              AND mi.mint_status != 'failed'
                )
              )
          ), 0),
          'is_completed', mp.is_completed
        ) ORDER BY mp.phase_order) FROM mint_phases mp WHERE mp.collection_id = c.id) as phases
      FROM collections c
      WHERE COALESCE(c.collection_status, 'draft') = 'launchpad_live' 
      AND c.launched_at IS NOT NULL  -- Only show collections that have been properly launched
      AND COALESCE(c.launch_status, 'draft') != 'draft'  -- Exclude draft launches
      AND (
        -- Earliest phase start_time > current time (hasn't started yet)
        -- Check all phases, not just non-completed ones
        (SELECT MIN(start_time) FROM mint_phases WHERE collection_id = c.id) > NOW()
      )
      AND (
        -- No phase is currently active (all are in the future)
        NOT EXISTS (
          SELECT 1 FROM mint_phases mp
          WHERE mp.collection_id = c.id
            AND mp.start_time <= NOW()
            AND (mp.end_time IS NULL OR mp.end_time > NOW())
        )
      )
      ORDER BY (SELECT MIN(start_time) FROM mint_phases WHERE collection_id = c.id) ASC
      LIMIT 20
    `
      const upcoming = Array.isArray(upcomingResult) ? upcomingResult : []

      // Get active mints (collections where we're between first phase start and last phase end)
      // Criteria: First phase has started AND (last phase hasn't ended OR has no end time)
      // This includes gaps between phases - if you're after phase 1 but before phase 2, still shows as active
      const activeResult = await db`
      SELECT 
        c.id,
        c.name,
        c.description,
        c.banner_image_url,
        ${includeBannerVideo ? db`c.banner_video_url,` : db``}
        c.mobile_image_url,
        c.audio_url,
        c.video_url,
        c.wallet_address as creator_wallet,
        c.launch_status as db_launch_status,
        (SELECT COUNT(*) FROM generated_ordinals WHERE collection_id = c.id) as total_supply,
        -- Use is_minted flag as source of truth
        (SELECT COUNT(*) FROM generated_ordinals WHERE collection_id = c.id AND is_minted = true) as minted_count,
        (SELECT json_agg(json_build_object(
          'id', mp.id,
          'name', mp.phase_name,
          'start_time', mp.start_time,
          'end_time', mp.end_time,
          'mint_price_sats', mp.mint_price_sats,
          'mint_price_lamports', mp.mint_price_sats,
          'whitelist_only', mp.whitelist_only,
          'phase_allocation', mp.phase_allocation,
          'phase_minted', COALESCE((
            SELECT COUNT(*)
            FROM mint_inscriptions mi
            WHERE mi.phase_id = mp.id
              AND mi.is_test_mint = false
              AND mi.commit_tx_id IS NOT NULL
              AND LENGTH(TRIM(mi.commit_tx_id)) > 0
              AND mi.mint_status NOT IN ('failed', 'expired')
          ), 0),
          'is_active', (mp.is_active = true OR (
            mp.start_time <= NOW()
            AND (mp.end_time IS NULL OR mp.end_time > NOW())
          )),
          'is_completed', mp.is_completed,
          'max_per_wallet', mp.max_per_wallet,
          'suggested_fee_rate', mp.suggested_fee_rate
        ) ORDER BY mp.phase_order) FROM mint_phases mp WHERE mp.collection_id = c.id) as phases
      FROM collections c
      WHERE COALESCE(c.collection_status, 'draft') = 'launchpad_live' 
      AND c.launched_at IS NOT NULL  -- Only show collections that have been properly launched
      AND COALESCE(c.launch_status, 'draft') != 'draft'  -- Exclude draft launches
      AND EXISTS (SELECT 1 FROM mint_phases WHERE collection_id = c.id AND is_completed = false)
      AND (SELECT MIN(start_time) FROM mint_phases WHERE collection_id = c.id AND is_completed = false) <= NOW()
      AND (
        EXISTS (SELECT 1 FROM mint_phases WHERE collection_id = c.id AND is_completed = false AND end_time IS NULL)
        OR COALESCE((SELECT MAX(end_time) FROM mint_phases WHERE collection_id = c.id AND is_completed = false), NOW() + INTERVAL '100 years') > NOW()
      )
      ORDER BY c.launched_at DESC NULLS LAST
      LIMIT 50
    `
      const active = Array.isArray(activeResult) ? activeResult : []

      // Get recently completed mints
      // Criteria: All phases have end_time < current_time (based on time, not DB flag)
      const completedResult = await db`
      SELECT 
        c.id,
        c.name,
        c.description,
        c.banner_image_url,
        ${includeBannerVideo ? db`c.banner_video_url,` : db``}
        c.mobile_image_url,
        c.wallet_address as creator_wallet,
        c.mint_ended_at,
        c.launch_status as db_launch_status,
        (SELECT COUNT(*) FROM generated_ordinals WHERE collection_id = c.id) as total_supply,
        -- Use is_minted flag as source of truth
        (SELECT COUNT(*) FROM generated_ordinals WHERE collection_id = c.id AND is_minted = true) as minted_count,
        (SELECT json_agg(json_build_object(
          'id', mp.id,
          'name', mp.phase_name,
          'start_time', mp.start_time,
          'end_time', mp.end_time,
          'mint_price_sats', mp.mint_price_sats,
          'mint_price_lamports', mp.mint_price_sats,
          'whitelist_only', mp.whitelist_only,
          'phase_allocation', mp.phase_allocation,
          'phase_minted', COALESCE((
            SELECT COUNT(*)
            FROM mint_inscriptions mi
            WHERE mi.phase_id = mp.id
              AND mi.is_test_mint = false
              AND mi.commit_tx_id IS NOT NULL
              AND LENGTH(TRIM(mi.commit_tx_id)) > 0
              AND mi.mint_status NOT IN ('failed', 'expired')
          ), 0),
          'is_completed', mp.is_completed,
          'max_per_wallet', mp.max_per_wallet,
          'suggested_fee_rate', mp.suggested_fee_rate
        ) ORDER BY mp.phase_order) FROM mint_phases mp WHERE mp.collection_id = c.id) as phases
      FROM collections c
      WHERE COALESCE(c.collection_status, 'draft') = 'launchpad_live'
      AND c.launched_at IS NOT NULL  -- Only show collections that have been properly launched
      AND COALESCE(c.launch_status, 'draft') != 'draft'  -- Exclude draft launches
      AND (
        -- All phases have end_time < current_time (no phase is currently active)
        -- AND at least one phase exists (has started)
        EXISTS (
          SELECT 1 FROM mint_phases mp
          WHERE mp.collection_id = c.id
          AND mp.start_time <= NOW()
        )
        AND NOT EXISTS (
          SELECT 1 FROM mint_phases mp
          WHERE mp.collection_id = c.id
          AND mp.start_time <= NOW()
          AND (mp.end_time IS NULL OR mp.end_time > NOW())
        )
      )
      ORDER BY COALESCE(c.mint_ended_at, (SELECT MAX(end_time) FROM mint_phases WHERE collection_id = c.id)) DESC
      LIMIT 20
    `
      const completed = Array.isArray(completedResult) ? completedResult : []

      // Get featured/spotlight collection (most recent active-by-time-window with banner)
      // Uses same criteria as active mints
      const spotlightResult = await db`
      SELECT 
        c.id,
        c.name,
        c.description,
        c.banner_image_url,
        ${includeBannerVideo ? db`c.banner_video_url,` : db``}
        c.mobile_image_url,
        c.audio_url,
        c.video_url,
        c.wallet_address as creator_wallet,
        c.launch_status as db_launch_status,
        (SELECT COUNT(*) FROM generated_ordinals WHERE collection_id = c.id) as total_supply,
        -- Use is_minted flag as source of truth
        (SELECT COUNT(*) FROM generated_ordinals WHERE collection_id = c.id AND is_minted = true) as minted_count,
        (SELECT json_agg(json_build_object(
          'id', mp.id,
          'name', mp.phase_name,
          'mint_price_sats', mp.mint_price_sats,
          'mint_price_lamports', mp.mint_price_sats,
          'is_active', (mp.is_active = true OR (
            mp.is_completed = false
            AND mp.start_time <= NOW()
            AND (mp.end_time IS NULL OR mp.end_time > NOW())
          )),
          'is_completed', mp.is_completed
        ) ORDER BY mp.phase_order) FROM mint_phases mp WHERE mp.collection_id = c.id) as phases
      FROM collections c
      WHERE COALESCE(c.collection_status, 'draft') = 'launchpad_live'
      AND c.launched_at IS NOT NULL  -- Only show collections that have been properly launched
      AND COALESCE(c.launch_status, 'draft') != 'draft'  -- Exclude draft launches
      AND (
        c.banner_image_url IS NOT NULL
        ${includeBannerVideo ? db`OR c.banner_video_url IS NOT NULL` : db``}
      )
      AND (
        -- At least one phase is currently active by time window
        EXISTS (
          SELECT 1 FROM mint_phases mp
          WHERE mp.collection_id = c.id
            AND mp.start_time <= NOW()
            AND (mp.end_time IS NULL OR mp.end_time > NOW())
        )
      )
      ORDER BY c.launched_at DESC
      LIMIT 1
    `
      const spotlight = Array.isArray(spotlightResult) ? spotlightResult[0] : null

      return { upcoming, active, completed, spotlight }
    }

    let data: { upcoming: any[]; active: any[]; completed: any[]; spotlight: any | null }
    try {
      data = await fetchData({ includeBannerVideo: true })
    } catch (e) {
      const msg = String(e instanceof Error ? e.message : e || '')
      // If the DB hasn't been migrated yet, banner_video_url will not exist.
      if (msg && typeof msg === 'string' && msg.includes('banner_video_url') && msg.toLowerCase().includes('does not exist')) {
        data = await fetchData({ includeBannerVideo: false })
      } else {
        throw e
      }
    }

    const { upcoming, active, completed, spotlight } = data

    // Get current server time for client-side comparisons
    const currentTimeResult = await db`SELECT NOW() as current_time`
    const currentTime = Array.isArray(currentTimeResult) && currentTimeResult[0] 
      ? (currentTimeResult[0] as any).current_time 
      : new Date().toISOString()

    // Add launch_status from database (use db_launch_status field)
    const addLaunchStatus = (items: any[]) => {
      return items.map((item: any) => ({
        ...item,
        launch_status: getLaunchStatus(item.db_launch_status)
      }))
    }

    // Map collections with their database launch_status
    const activeWithStatus = addLaunchStatus(active)
    const completedWithStatus = addLaunchStatus(completed)
    const upcomingWithStatus = addLaunchStatus(upcoming)

    return NextResponse.json({
      success: true,
      current_time: currentTime,
      spotlight: spotlight ? { ...spotlight, launch_status: getLaunchStatus(spotlight.db_launch_status) } : null,
      upcoming: upcomingWithStatus,
      active: activeWithStatus,
      completed: completedWithStatus,
      stats: {
        upcoming_count: upcomingWithStatus.length,
        active_count: activeWithStatus.length,
        completed_count: completedWithStatus.length,
      },
    })
  } catch (error) {
    console.error('Error fetching launchpad data:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: msg || 'Failed to fetch launchpad data' }, { status: 500 })
  }
}

