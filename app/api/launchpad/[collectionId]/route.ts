import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { isAuthorized } from '@/lib/auth/access-control'
import { calculatePublicPhaseRemaining } from '@/lib/minting-utils'
import { requireWalletAuth } from '@/lib/auth/signature-verification'

/**
 * Get launch_status - use database value directly
 * The database launch_status is the source of truth, not computed from phase times
 */
function getLaunchStatus(dbLaunchStatus: string | null | undefined): string {
  // Return the database value if it's a valid status
  if (dbLaunchStatus && ['draft', 'upcoming', 'active', 'completed'].includes(dbLaunchStatus)) {
    return dbLaunchStatus
  }
  // Default to 'draft' if not set
  return 'draft'
}

/**
 * GET /api/launchpad/[collectionId] - Get collection launch details
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

    // Get collection details including marketplace info
    // For launchpad mints, count from mint_inscriptions where commit_tx_id IS NOT NULL AND commit_tx_id != ''
    // For self-inscribed mints, count from generated_ordinals where is_minted = true
    const collectionResult = await sql`
      SELECT 
        c.*,
        (SELECT COUNT(*) FROM generated_ordinals WHERE collection_id = c.id) as total_supply,
        -- Use is_minted flag as source of truth (not transaction count)
        (SELECT COUNT(*) FROM generated_ordinals WHERE collection_id = c.id AND is_minted = true) as minted_count,
        (SELECT COUNT(*) FROM generated_ordinals WHERE collection_id = c.id AND is_minted = false) as available_count,
        (
          SELECT COALESCE(AVG(COALESCE(compressed_size_kb, 50)), 50)::numeric(10,2)
          FROM generated_ordinals 
          WHERE collection_id = c.id 
            AND is_minted = false
          LIMIT 100
        ) as avg_ordinal_size_kb,
        ml.id as marketplace_listing_id,
        ml.status as marketplace_listing_status,
        ml.price_credits as marketplace_price_credits,
        ml.price_btc as marketplace_price_btc,
        ml.payment_type as marketplace_payment_type
      FROM collections c
      LEFT JOIN collection_marketplace_listings ml ON ml.collection_id = c.id AND ml.status = 'active'
      WHERE c.id = ${collectionId}
    `
    const collection = Array.isArray(collectionResult) ? collectionResult[0] : null

    if (!collection) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 })
    }

    // Check if collection is live - if not, return limited info
    const cStatus = (collection as any)?.collection_status || 'draft'
    const isLive = cStatus === 'launchpad_live'
    const isLaunchpadReady = cStatus === 'launchpad' || cStatus === 'launchpad_live'
    const isSelfInscribe = cStatus === 'self_inscribe' || cStatus === 'draft'
    const isMarketplace = cStatus === 'marketplace'
    
    // Allow draft, self_inscribe, and marketplace collections
    // Only block if it's not launchpad, launchpad_live, draft, self_inscribe, or marketplace
    if (!isLaunchpadReady && !isSelfInscribe && !isMarketplace) {
      return NextResponse.json({ 
        error: 'Collection not available',
        message: 'This collection is not currently available on the launchpad.',
        collection_status: cStatus
      }, { status: 404 })
    }

    // Get phases with recalculated phase_minted from generated_ordinals.is_minted
    // Count ordinals that are minted and belong to this phase (via ordinal_reservations or mint_inscriptions)
    const phasesResult = await sql`
      SELECT 
        mp.*,
        w.name as whitelist_name,
        w.entries_count as whitelist_entries,
        COALESCE((
          SELECT COUNT(DISTINCT go.id)
          FROM generated_ordinals go
          WHERE go.collection_id = ${collectionId}
            AND go.is_minted = true
            AND (
              -- Check if ordinal was minted in this phase via reservation
              EXISTS (
                SELECT 1 FROM ordinal_reservations r
                WHERE r.ordinal_id = go.id
                  AND r.phase_id = mp.id
                  AND r.status = 'completed'
              )
              OR
              -- Check if ordinal was minted in this phase via mint_inscription
              EXISTS (
                SELECT 1 FROM mint_inscriptions mi
                WHERE mi.ordinal_id = go.id
                  AND mi.phase_id = mp.id
            AND mi.is_test_mint = false
            AND mi.mint_status != 'failed'
              )
            )
        ), 0) as phase_minted
      FROM mint_phases mp
      LEFT JOIN mint_phase_whitelists w ON mp.whitelist_id = w.id
      WHERE mp.collection_id = ${collectionId}
      ORDER BY mp.phase_order ASC
    `
    const phases = Array.isArray(phasesResult) ? phasesResult : []

    // Get whitelists for this collection
    const whitelistsResult = await sql`
      SELECT * FROM mint_phase_whitelists
      WHERE collection_id = ${collectionId}
      ORDER BY created_at DESC
    `
    const whitelists = Array.isArray(whitelistsResult) ? whitelistsResult : []

    // Check if user is owner
    const cAny = collection as any
    const isOwner = walletAddress && cAny?.wallet_address === walletAddress

    // Check if user is a collaborator with editor/owner role
    let isCollaborator = false
    if (walletAddress && !isOwner) {
      const collaboratorResult = await sql`
        SELECT role FROM collection_collaborators
        WHERE collection_id = ${collectionId}
          AND wallet_address = ${walletAddress.trim()}
          AND status = 'accepted'
          AND role IN ('owner', 'editor')
      ` as any[]
      isCollaborator = Array.isArray(collaboratorResult) && collaboratorResult.length > 0
    }

    // Get user's whitelist status if logged in
    let userWhitelistStatus = null
    if (walletAddress) {
      const statusResult = await sql`
        SELECT 
          we.whitelist_id,
          we.allocation,
          we.minted_count,
          w.name as whitelist_name,
          mp.id as phase_id,
          mp.phase_name
        FROM whitelist_entries we
        JOIN mint_phase_whitelists w ON we.whitelist_id = w.id
        LEFT JOIN mint_phases mp ON mp.whitelist_id = w.id
        WHERE we.wallet_address = ${walletAddress}
        AND w.collection_id = ${collectionId}
      `
      userWhitelistStatus = Array.isArray(statusResult) ? statusResult : []
    }

    // Get current time for phase status computation
    const currentTimeResult = await sql`SELECT NOW() as current_time`
    const currentTime = Array.isArray(currentTimeResult) && currentTimeResult[0] 
      ? (currentTimeResult[0] as any).current_time 
      : new Date().toISOString()
    const currentTimeDate = new Date(currentTime)
    
    // Compute is_active for each phase based on time, not just DB flag
    const phasesWithComputedStatus = phases.map((phase: any) => {
      const now = currentTimeDate
      const startTime = new Date(phase.start_time)
      const endTime = phase.end_time ? new Date(phase.end_time) : null
      
      // Compute is_active based on time window (ignore DB is_completed flag if time says it's active)
      const isActiveByTime = !phase.is_completed && 
        startTime <= now && 
        (endTime === null || endTime > now)
      
      // Remove max_per_transaction from response (it's now a global system setting of 10)
      const { max_per_transaction, ...phaseWithoutMaxPerTx } = phase
      
      return {
        ...phaseWithoutMaxPerTx,
        is_active: phase.is_active || isActiveByTime, // Use DB flag OR computed time-based status
        mint_price_lamports: parseInt(phase.mint_price_sats || '0', 10), // Alias for Solana frontend
      }
    })
    
    // Get current active phase (based on computed status)
    const activePhase = phasesWithComputedStatus.find((p: any) => p.is_active)
    
    // Use database launch_status as source of truth
    const dbLaunchStatus = getLaunchStatus(cAny?.launch_status)

    console.log(
      `[Launchpad API] Collection ${collectionId}: ${phases.length} phases found, active: ${
        (activePhase as any)?.phase_name || 'none'
      }, db_launch_status: ${dbLaunchStatus}`
    )

    // Get user mint status for public phases (if wallet provided and active phase exists)
    let userMintStatus = null
    if (walletAddress && activePhase && !activePhase.whitelist_only) {
      const remainingResult = await calculatePublicPhaseRemaining(
        walletAddress,
        collectionId,
        activePhase.id,
        activePhase.max_per_wallet
      )

      if (remainingResult) {
        userMintStatus = {
          minted_count: remainingResult.mintedCount,
          max_per_wallet: remainingResult.maxAllowed ?? 1, // Keep for backwards compatibility
          remaining: remainingResult.remaining,
        }
        
        console.log(`[Launchpad API] User ${walletAddress.slice(0,8)}... has ${remainingResult.mintedCount}/${remainingResult.maxAllowed ?? 'unlimited'} mints for phase ${activePhase.phase_name}`)
        console.log(`[Launchpad API] Returning user_mint_status:`, userMintStatus)
      }
    } else {
      if (walletAddress) {
        console.log(`[Launchpad API] Not calculating user_mint_status. Wallet: ${walletAddress.slice(0,8)}..., Active phase: ${activePhase?.id || 'none'}, Whitelist only: ${activePhase?.whitelist_only || false}`)
      }
    }

    // Calculate mint counts - only launchpad mints
    const totalMinted = parseInt(cAny?.minted_count || '0', 10)
    const totalSupply = parseInt(cAny?.total_supply || '0', 10)
    const capSupply = cAny?.cap_supply !== null && cAny?.cap_supply !== undefined 
      ? parseInt(String(cAny.cap_supply), 10) 
      : null
    // Use cap_supply if set, otherwise use total_supply
    const maxSupply = capSupply !== null ? capSupply : totalSupply

    // Return only fields needed for launchpad mint page
    const cleanCollection = {
      id: cAny?.id,
      name: cAny?.name,
      description: cAny?.description || null,
      banner_image_url: cAny?.banner_image_url || null,
      banner_video_url: cAny?.banner_video_url || null,
      mobile_image_url: cAny?.mobile_image_url || null,
      audio_url: cAny?.audio_url || null,
      video_url: cAny?.video_url || null,
      total_supply: totalSupply,
      cap_supply: capSupply,
      max_supply: maxSupply, // Effective max (cap_supply if set, otherwise total_supply)
      total_minted: totalMinted,
      available_count: Math.max(0, maxSupply - totalMinted), // Available based on cap, not total supply
      creator_wallet: cAny?.wallet_address,
      creator_royalty_wallet: cAny?.creator_royalty_wallet || null,
      creator_royalty_percent: cAny?.creator_royalty_percent || null,
      is_owner: isOwner,
      is_collaborator: isCollaborator,
      is_locked: cAny?.is_locked || false,
      locked_at: cAny?.locked_at || null,
      launch_status: dbLaunchStatus,
      collection_status: cAny?.collection_status || 'draft',
      extend_last_phase: cAny?.extend_last_phase || false,
      phases: phasesWithComputedStatus,
      twitter_url: cAny?.twitter_url || null,
      discord_url: cAny?.discord_url || null,
      telegram_url: cAny?.telegram_url || null,
      website_url: cAny?.website_url || null,
      mint_type: cAny?.mint_type || 'hidden', // Default to 'hidden' for backward compatibility
      // Compression settings
      compression_quality: cAny?.compression_quality ?? null,
      compression_dimensions: cAny?.compression_dimensions ?? null,
      compression_format: cAny?.compression_format || null,
      compression_target_kb: cAny?.compression_target_kb ?? null,
      // Average ordinal size for cost estimation (in KB)
      avg_ordinal_size_kb: parseFloat(cAny?.avg_ordinal_size_kb || '50'),
    }

    return NextResponse.json({
      success: true,
      current_time: currentTime,
      collection: cleanCollection,
      whitelists,
      active_phase: activePhase || null,
      user_whitelist_status: userWhitelistStatus,
      user_mint_status: userMintStatus,
      is_live: isLive, // true only if collection_status === 'launchpad_live'
      is_preview: !isLive && isLaunchpadReady, // true if 'launchpad' but not 'launchpad_live'
    })
  } catch (error: any) {
    console.error('Error fetching collection launch details:', error)
    const errorMessage = error?.message || String(error)
    const errorCode = error?.code || 'UNKNOWN'
    const errorDetail = error?.detail || null
    
    return NextResponse.json({ 
      error: 'Failed to fetch collection details',
      details: errorMessage,
      errorCode: errorCode,
      errorDetail: errorDetail,
      hint: errorMessage.includes('does not exist') ? 'Database column or table missing. Run database migration scripts.' : null
    }, { status: 500 })
  }
}

/**
 * POST /api/launchpad/[collectionId] - Lock/unlock collection for launch (owner only)
 * SECURITY: Requires wallet signature verification
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ collectionId: string }> }
) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const { collectionId } = await params
    
    // SECURITY: Require signature verification
    const auth = await requireWalletAuth(request, true)
    if (!auth.isValid || !auth.walletAddress) {
      return NextResponse.json({ 
        error: auth.error || 'Authentication required',
        details: 'Please sign the request with your wallet to verify ownership'
      }, { status: 401 })
    }
    
    const wallet_address = auth.walletAddress
    const body = await request.clone().json()
    const { action, launch_status } = body

    // Handle launch action (sets collection_status to launchpad_live)
    if (launch_status === 'live' || action === 'launch') {
      // Verify ownership or admin
      const collectionResult = await sql`
        SELECT wallet_address FROM collections WHERE id = ${collectionId}
      `
      const collection = Array.isArray(collectionResult) ? collectionResult[0] : null

      if (!collection) {
        return NextResponse.json({ error: 'Collection not found' }, { status: 404 })
      }

      const isAdmin = isAuthorized(wallet_address)
      const cAny = collection as any
      if (cAny?.wallet_address !== wallet_address && !isAdmin) {
        return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
      }

      // Check if collection has ordinals (supply > 0)
      const supplyResult = await sql`
        SELECT COUNT(*) as count FROM generated_ordinals WHERE collection_id = ${collectionId}
      `
      const supplyCount = (supplyResult as any)?.[0]?.count || 0
      if (supplyCount === 0) {
        return NextResponse.json({ 
          error: 'Collection must have at least one ordinal in supply before launching',
          details: 'Generate ordinals for your collection first, then try launching again.'
        }, { status: 400 })
      }

      // Check if collection has phases
      const phasesResult = await sql`
        SELECT COUNT(*) as count FROM mint_phases WHERE collection_id = ${collectionId}
      `
      const phaseCount = (phasesResult as any)?.[0]?.count || 0
      if (phaseCount === 0) {
        return NextResponse.json({ error: 'Collection must have at least one mint phase before launching' }, { status: 400 })
      }

      // Set collection_status to launchpad_live and launch_status to active
      await sql`
        UPDATE collections SET 
          collection_status = 'launchpad_live',
          launch_status = 'active',
          launched_at = COALESCE(launched_at, NOW()),
          updated_at = NOW()
        WHERE id = ${collectionId}
      `

      // Reset all phases to is_completed = false when launching
      await sql`
        UPDATE mint_phases SET
          is_completed = false,
          updated_at = NOW()
        WHERE collection_id = ${collectionId}
      `
      console.log(`[Launchpad POST] Reset is_completed = false for all phases in collection ${collectionId}`)

      return NextResponse.json({ 
        success: true, 
        message: 'Collection launched successfully!',
        collection_status: 'launchpad_live'
      })
    }

    if (!action || !['lock', 'unlock'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    // Verify ownership or admin
    const collectionResult = await sql`
      SELECT wallet_address, is_locked FROM collections WHERE id = ${collectionId}
    `
    const collection = Array.isArray(collectionResult) ? collectionResult[0] : null

    if (!collection) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 })
    }

    const isAdmin = isAuthorized(wallet_address)
    const cAny = collection as any
    if (cAny?.wallet_address !== wallet_address && !isAdmin) {
      return NextResponse.json({ error: 'Not authorized - only collection owner or admin can lock/unlock' }, { status: 403 })
    }

    if (action === 'lock') {
      // First, assign ordinal_numbers to all ordinals in this collection (1, 2, 3, ...)
      // Order by id to ensure consistent ordering
      await sql`
        WITH numbered AS (
          SELECT id, ROW_NUMBER() OVER (ORDER BY id) as row_num
          FROM generated_ordinals
          WHERE collection_id = ${collectionId}
        )
        UPDATE generated_ordinals g
        SET ordinal_number = n.row_num
        FROM numbered n
        WHERE g.id = n.id
      `
      
      // Get count of ordinals that were numbered
      const countResult = await sql`
        SELECT COUNT(*) as count FROM generated_ordinals 
        WHERE collection_id = ${collectionId} AND ordinal_number IS NOT NULL
      `
      const numberedCount = (countResult as any)?.[0]?.count || 0
      console.log(`[Lock] Assigned ordinal_numbers 1-${numberedCount} to collection ${collectionId}`)
      
      // Then lock the collection
      await sql`
        UPDATE collections SET 
          is_locked = true,
          locked_at = NOW(),
          locked_by = ${wallet_address},
          launch_status = COALESCE(launch_status, 'draft'),
          updated_at = NOW()
        WHERE id = ${collectionId}
      `
    } else {
      await sql`
        UPDATE collections SET 
          is_locked = false,
          locked_at = NULL,
          locked_by = NULL,
          updated_at = NOW()
        WHERE id = ${collectionId}
      `
    }

    // Get final count of numbered ordinals
    const finalCount = await sql`
      SELECT COUNT(*) as count FROM generated_ordinals 
      WHERE collection_id = ${collectionId} AND ordinal_number IS NOT NULL
    `
    const totalNumbered = (finalCount as any)?.[0]?.count || 0
    
    return NextResponse.json({ 
      success: true, 
      message: action === 'lock' 
        ? `Collection locked! Assigned numbers #1-${totalNumbered} to ${totalNumbered} ordinals.`
        : `Collection unlocked successfully`,
      is_locked: action === 'lock',
      ordinals_numbered: action === 'lock' ? totalNumbered : undefined
    })
  } catch (error: any) {
    console.error('Error locking/unlocking collection:', error)
    const errorMessage = error?.message || String(error)
    const errorCode = error?.code || 'UNKNOWN'
    
    return NextResponse.json({ 
      error: 'Failed to update collection',
      details: errorMessage,
      errorCode: errorCode,
      hint: errorMessage.includes('does not exist') ? 'Database column or table missing. Run database migration scripts.' : null
    }, { status: 500 })
  }
}

/**
 * PATCH /api/launchpad/[collectionId] - Update collection launch settings
 * SECURITY: Requires wallet signature verification
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ collectionId: string }> }
) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const { collectionId } = await params
    
    // SECURITY: Require signature verification
    const auth = await requireWalletAuth(request, true)
    if (!auth.isValid || !auth.walletAddress) {
      return NextResponse.json({ 
        error: auth.error || 'Authentication required',
        details: 'Please sign the request with your wallet to verify ownership'
      }, { status: 401 })
    }
    
    const wallet_address = auth.walletAddress
    const body = await request.clone().json()
    const { 
      description,
      banner_image_url,
      banner_video_url,
      mobile_image_url,
      audio_url,
      video_url,
      extend_last_phase,
      launch_status,
      launched_at,
      mint_ended_at,
      creator_royalty_wallet,
      creator_royalty_percent,
      collection_status,
      is_launchpad_collection, // Keep for backward compatibility, but prefer collection_status
      twitter_url,
      discord_url,
      telegram_url,
      website_url,
      cap_supply,
      mint_type,
    } = body

    // Verify collection exists and get owner
    const collectionResult = await sql`
      SELECT wallet_address FROM collections WHERE id = ${collectionId}
    ` as any[]
    const collection = collectionResult?.[0] || null

    if (!collection) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 })
    }

    // Check if user is owner, collaborator with editor role, or admin
    const isAdmin = isAuthorized(wallet_address)
    const isOwner = wallet_address.trim() === collection.wallet_address
    let hasPermission = isOwner || isAdmin

    if (!hasPermission) {
      const collaboratorResult = await sql`
        SELECT role
        FROM collection_collaborators
        WHERE collection_id = ${collectionId}
          AND wallet_address = ${wallet_address.trim()}
          AND status = 'accepted'
          AND role IN ('owner', 'editor')
      ` as any[]

      hasPermission = Array.isArray(collaboratorResult) && collaboratorResult.length > 0
    }

    if (!hasPermission) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    // Build update dynamically
    const updates: string[] = []
    const values: any[] = []
    
    if (banner_image_url !== undefined) {
      updates.push('banner_image_url')
      values.push(banner_image_url)
    }
    if (description !== undefined) {
      updates.push('description')
      values.push(description)
    }
    if (banner_video_url !== undefined) {
      updates.push('banner_video_url')
      values.push(banner_video_url)
    }
    if (mobile_image_url !== undefined) {
      updates.push('mobile_image_url')
      values.push(mobile_image_url)
    }
    if (audio_url !== undefined) {
      updates.push('audio_url')
      values.push(audio_url)
    }
    if (video_url !== undefined) {
      updates.push('video_url')
      values.push(video_url)
    }
    if (extend_last_phase !== undefined) {
      updates.push('extend_last_phase')
      values.push(extend_last_phase)
    }
    if (launch_status !== undefined) {
      updates.push('launch_status')
      values.push(launch_status)
    }
    if (launched_at !== undefined) {
      updates.push('launched_at')
      values.push(launched_at)
    }
    if (mint_ended_at !== undefined) {
      updates.push('mint_ended_at')
      values.push(mint_ended_at)
    }

    // Update collection with explicit values
    // Ensure all parameters are properly typed to avoid PostgreSQL type inference issues
    const descriptionValue = description !== undefined ? description : null
    const bannerImageUrlValue = banner_image_url !== undefined ? banner_image_url : null
    const bannerVideoUrlValue = banner_video_url !== undefined ? banner_video_url : null
    const mobileImageUrlValue = mobile_image_url !== undefined ? mobile_image_url : null
    const audioUrlValue = audio_url !== undefined ? audio_url : null
    const videoUrlValue = video_url !== undefined ? video_url : null
    const extendLastPhaseValue = extend_last_phase !== undefined ? extend_last_phase : null
    const launchStatusValue = launch_status !== undefined ? launch_status : null
    const launchedAtValue = launched_at !== undefined ? launched_at : null
    const mintEndedAtValue = mint_ended_at !== undefined ? mint_ended_at : null
    const creatorRoyaltyWalletValue = creator_royalty_wallet !== undefined ? creator_royalty_wallet : null
    const creatorRoyaltyPercentValue = creator_royalty_percent !== undefined ? creator_royalty_percent : null
    const collectionStatusValue = collection_status !== undefined ? collection_status : null
    const isLaunchpadCollectionValue = is_launchpad_collection !== undefined ? is_launchpad_collection : null
    const twitterUrlValue = twitter_url !== undefined ? twitter_url : null
    const discordUrlValue = discord_url !== undefined ? discord_url : null
    const telegramUrlValue = telegram_url !== undefined ? telegram_url : null
    const websiteUrlValue = website_url !== undefined ? website_url : null
    const capSupplyValue = cap_supply !== undefined ? (cap_supply === null ? null : parseInt(String(cap_supply), 10)) : null
    const mintTypeValue = mint_type !== undefined ? mint_type : null

    // Determine is_launchpad_collection value based on collection_status or explicit value
    let isLaunchpadCollectionFinal: boolean | null = null
    if (collectionStatusValue !== null) {
      isLaunchpadCollectionFinal = collectionStatusValue === 'launchpad' || collectionStatusValue === 'launchpad_live'
    } else if (isLaunchpadCollectionValue !== null) {
      isLaunchpadCollectionFinal = isLaunchpadCollectionValue
    }

    // Update social links if provided (try to update, but don't fail if columns don't exist)
    if (twitter_url !== undefined || discord_url !== undefined || telegram_url !== undefined || website_url !== undefined) {
      try {
        const socialUpdates: string[] = []
        const socialValues: any[] = []
        
        if (twitter_url !== undefined) {
          socialUpdates.push('twitter_url')
          socialValues.push(twitterUrlValue)
        }
        if (discord_url !== undefined) {
          socialUpdates.push('discord_url')
          socialValues.push(discordUrlValue)
        }
        if (telegram_url !== undefined) {
          socialUpdates.push('telegram_url')
          socialValues.push(telegramUrlValue)
        }
        if (website_url !== undefined) {
          socialUpdates.push('website_url')
          socialValues.push(websiteUrlValue)
        }
        
        if (socialUpdates.length > 0) {
          // Update social links individually to avoid sql.unsafe parameter issues
          if (twitterUrlValue !== null) {
            await sql`UPDATE collections SET twitter_url = ${twitterUrlValue}, updated_at = NOW() WHERE id = ${collectionId}`
          }
          if (discordUrlValue !== null) {
            await sql`UPDATE collections SET discord_url = ${discordUrlValue}, updated_at = NOW() WHERE id = ${collectionId}`
          }
          if (telegramUrlValue !== null) {
            await sql`UPDATE collections SET telegram_url = ${telegramUrlValue}, updated_at = NOW() WHERE id = ${collectionId}`
          }
          if (websiteUrlValue !== null) {
            await sql`UPDATE collections SET website_url = ${websiteUrlValue}, updated_at = NOW() WHERE id = ${collectionId}`
          }
        }
      } catch (error: any) {
        // If columns don't exist, log but don't fail (migration needed)
        if (error?.message?.includes('does not exist') || error?.message?.includes('column')) {
          console.warn('[Launchpad PATCH] Social link columns may not exist in database. Migration may be needed.')
        } else {
          console.error('[Launchpad PATCH] Error updating social links:', error)
          // Don't throw - allow other updates to succeed
        }
      }
    }

    await sql`
      UPDATE collections SET
        description = COALESCE(${descriptionValue}, description),
        banner_image_url = COALESCE(${bannerImageUrlValue}, banner_image_url),
        banner_video_url = COALESCE(${bannerVideoUrlValue}, banner_video_url),
        mobile_image_url = COALESCE(${mobileImageUrlValue}, mobile_image_url),
        audio_url = COALESCE(${audioUrlValue}, audio_url),
        video_url = COALESCE(${videoUrlValue}, video_url),
        extend_last_phase = COALESCE(${extendLastPhaseValue}, extend_last_phase),
        launch_status = COALESCE(${launchStatusValue}, launch_status),
        launched_at = COALESCE(${launchedAtValue}, launched_at),
        mint_ended_at = COALESCE(${mintEndedAtValue}, mint_ended_at),
        creator_royalty_wallet = ${creatorRoyaltyWalletValue},
        creator_royalty_percent = COALESCE(${creatorRoyaltyPercentValue}, creator_royalty_percent),
        collection_status = COALESCE(${collectionStatusValue}, collection_status),
        is_launchpad_collection = COALESCE(${isLaunchpadCollectionFinal}, is_launchpad_collection),
        cap_supply = COALESCE(${capSupplyValue}, cap_supply),
        mint_type = COALESCE(${mintTypeValue}, mint_type),
        updated_at = NOW()
      WHERE id = ${collectionId}
    `

    // If collection is being marked as completed, mark all phases as completed too
    if (launch_status === 'completed') {
      await sql`
        UPDATE mint_phases SET
          is_completed = true,
          is_active = false,
          updated_at = NOW()
        WHERE collection_id = ${collectionId}
          AND is_completed = false
      `
      console.log(`[Launchpad PATCH] Marked all phases as completed for collection ${collectionId}`)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating collection launch settings:', error)
    const msg = String(error instanceof Error ? error.message : error || '')
    // Common local/dev issue: migration not applied yet
    if (msg && typeof msg === 'string' && msg.includes('banner_video_url') && msg.toLowerCase().includes('does not exist')) {
      return NextResponse.json(
        {
          error:
            'Database is missing banner_video_url column. Run migration scripts/migrations/034_add_banner_video_url.sql and try again.',
        },
        { status: 400 }
      )
    }
    return NextResponse.json({ error: msg || 'Failed to update settings' }, { status: 500 })
  }
}

