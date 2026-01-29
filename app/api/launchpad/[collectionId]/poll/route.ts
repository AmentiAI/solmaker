import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { calculateWhitelistRemaining, calculatePublicPhaseRemaining } from '@/lib/minting-utils'

/**
 * GET /api/launchpad/[collectionId]/poll - Optimized polling endpoint
 * Returns minimal data needed for real-time updates on launchpad mint page
 * Optimized for high traffic (1000+ concurrent users)
 * 
 * Optimizations:
 * - Single combined query for counts
 * - Optimized phase query with proper indexes
 * - Conditional user queries (only if wallet provided)
 * - Short cache headers for non-user data
 * - Efficient phase_minted calculation
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ collectionId: string }> }
) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const { collectionId } = await params
    
    // Validate UUID format to prevent database errors from invalid IDs
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!collectionId || !uuidRegex.test(collectionId)) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 })
    }
    
    const { searchParams } = new URL(request.url)
    const walletAddress = searchParams.get('wallet_address')

    // OPTIMIZATION: Single combined query for all counts (reduces round trips)
    const countsResult = await sql`
      SELECT
        (SELECT COUNT(*) FROM generated_ordinals WHERE collection_id = ${collectionId}) as total_supply,
        -- Use is_minted flag as source of truth (not transaction count)
        (SELECT COUNT(*) FROM generated_ordinals WHERE collection_id = ${collectionId} AND is_minted = true) as total_minted,
        (
          SELECT COUNT(*)
          FROM generated_ordinals
          WHERE collection_id = ${collectionId}
            AND is_minted = false
        ) as available_count,
        NOW() as current_time
    ` as any[]
    const counts = countsResult?.[0] || {}
    const currentTime = counts.current_time || new Date().toISOString()

    // OPTIMIZATION: Optimized active phase query with proper index usage
    // Uses idx_mint_phases_active_collection index
    const activePhaseResult = await sql`
      SELECT 
        mp.id,
        mp.phase_name,
        mp.start_time,
        mp.end_time,
        mp.mint_price_sats,
        mp.whitelist_only,
        -- Use generated_ordinals.is_minted as source of truth (not mint_inscriptions)
        COALESCE((
          SELECT COUNT(DISTINCT go.id)
          FROM generated_ordinals go
          WHERE go.collection_id = ${collectionId}
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
        ), 0) as phase_minted,
        mp.phase_allocation,
        mp.max_per_wallet,
        mp.is_active,
        mp.is_completed,
        w.id as whitelist_id
      FROM mint_phases mp
      LEFT JOIN mint_phase_whitelists w ON mp.whitelist_id = w.id
      WHERE mp.collection_id = ${collectionId}
        AND mp.is_completed = false
        AND mp.start_time <= NOW()
        AND (mp.end_time IS NULL OR mp.end_time > NOW())
      ORDER BY mp.phase_order ASC
      LIMIT 1
    ` as any[]
    const activePhase = activePhaseResult?.[0] || null

    // OPTIMIZATION: Only query user data if wallet provided (saves DB load)
    let userWhitelistStatus = null
    let userMintStatus = null
    
    if (walletAddress && activePhase) {
      if (activePhase.whitelist_only && activePhase.whitelist_id) {
        // Whitelist phase - optimized query using indexes
        // Use phase's max_per_wallet, not whitelist allocation
        const remainingResult = await calculateWhitelistRemaining(
          walletAddress,
          collectionId,
          activePhase.id,
          activePhase.whitelist_id,
          activePhase.max_per_wallet
        )

        if (remainingResult) {
          userWhitelistStatus = {
            is_whitelisted: true,
            allocation: remainingResult.maxAllowed!,
            minted_count: remainingResult.mintedCount,
            remaining_allocation: remainingResult.remaining,
          }
        } else {
          userWhitelistStatus = {
            is_whitelisted: false,
            allocation: null,
            minted_count: 0,
            remaining_allocation: null,
          }
        }
      } else {
        // Public phase - optimized query using indexes
        const remainingResult = await calculatePublicPhaseRemaining(
          walletAddress,
          collectionId,
          activePhase.id,
          activePhase.max_per_wallet
        )

        if (remainingResult) {
          userMintStatus = {
            minted_count: remainingResult.mintedCount,
            max_per_wallet: remainingResult.maxAllowed ?? 1,
            remaining: remainingResult.remaining,
          }
        }
      }
    }

    // Build response
    const response = NextResponse.json({
      success: true,
      current_time: currentTime,
      counts: {
        total_supply: parseInt(counts.total_supply || '0', 10),
        total_minted: parseInt(counts.total_minted || '0', 10),
        available_count: parseInt(counts.available_count || '0', 10),
      },
      active_phase: activePhase ? {
        id: activePhase.id,
        phase_name: activePhase.phase_name,
        start_time: activePhase.start_time,
        end_time: activePhase.end_time,
        mint_price_sats: parseInt(activePhase.mint_price_sats || '0', 10),
        whitelist_only: activePhase.whitelist_only,
        phase_minted: parseInt(activePhase.phase_minted || '0', 10),
        phase_allocation: activePhase.phase_allocation ? parseInt(activePhase.phase_allocation, 10) : null,
        max_per_wallet: activePhase.max_per_wallet,
        is_active: activePhase.is_active,
        is_completed: activePhase.is_completed,
      } : null,
      user_whitelist_status: userWhitelistStatus,
      user_mint_status: userMintStatus,
    })

    // OPTIMIZATION: Set cache headers for non-user-specific data
    // Short TTL (1 second) allows caching but ensures fresh data
    // User-specific data is never cached
    if (!walletAddress) {
      response.headers.set('Cache-Control', 'public, s-maxage=1, stale-while-revalidate=2')
    } else {
      // No cache for user-specific data (always fresh)
      response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate')
    }

    return response
  } catch (error) {
    console.error('Error in launchpad poll endpoint:', error)
    return NextResponse.json({ error: 'Failed to fetch poll data' }, { status: 500 })
  }
}
