import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { checkAuthorizationServer } from '@/lib/auth/access-control'

/**
 * GET /api/admin/collections/manage - Get all collections with filtering, pagination, and sorting
 * Admin-only endpoint for comprehensive collection management
 */
export async function GET(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const walletAddress = searchParams.get('wallet_address')

    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet address required' }, { status: 401 })
    }

    const authResult = await checkAuthorizationServer(request, sql)
    if (!authResult.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized. Admin access only.' }, { status: 403 })
    }
    const search = searchParams.get('search') || ''
    const isLocked = searchParams.get('is_locked')
    const collectionStatus = searchParams.get('collection_status')
    const launchStatus = searchParams.get('launch_status')
    // Note: wallet_address in params is used for auth, but we also support filtering by wallet
    // For filtering, we'd need a separate param like 'filter_wallet' or check if it's different from auth wallet
    // For now, we'll skip wallet filtering to avoid confusion
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const sortBy = searchParams.get('sort_by') || 'created_at'
    const sortOrder = searchParams.get('sort_order') || 'desc'
    const offset = (page - 1) * limit

    // Build WHERE conditions
    const whereConditions: any[] = []
    
    if (search) {
      whereConditions.push(sql`(c.name ILIKE ${`%${search}%`} OR c.description ILIKE ${`%${search}%`} OR c.id::text ILIKE ${`%${search}%`})`)
    }
    
    if (isLocked !== null && isLocked !== '') {
      whereConditions.push(sql`c.is_locked = ${isLocked === 'true'}`)
    }
    
    if (collectionStatus) {
      whereConditions.push(sql`COALESCE(c.collection_status, 'draft') = ${collectionStatus}`)
    }
    
    if (launchStatus) {
      whereConditions.push(sql`c.launch_status = ${launchStatus}`)
    }
    
    // Wallet filtering removed to avoid confusion with auth wallet_address param
    // If needed, add a separate 'filter_wallet' parameter

    // Build WHERE clause
    let whereClause = sql``
    if (whereConditions.length > 0) {
      whereClause = sql`WHERE ${whereConditions[0]}`
      for (let i = 1; i < whereConditions.length; i++) {
        whereClause = sql`${whereClause} AND ${whereConditions[i]}`
      }
    }

    // Validate sort column
    const validSortColumns = [
      'created_at', 'updated_at', 'name', 'is_locked', 'launch_status', 
      'total_ordinals', 'minted_count', 'wallet_address'
    ]
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'created_at'
    const sortDir = sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC'

    // Get total count for pagination
    const countResult = await sql`
      SELECT COUNT(*)::int as total
      FROM collections c
      ${whereClause}
    `
    const total = (countResult as any[])?.[0]?.total || 0

    // Build ORDER BY clause
    let orderByClause = sql``
    if (sortColumn === 'name') {
      orderByClause = sortDir === 'ASC' ? sql`ORDER BY c.name ASC` : sql`ORDER BY c.name DESC`
    } else if (sortColumn === 'created_at') {
      orderByClause = sortDir === 'ASC' ? sql`ORDER BY c.created_at ASC` : sql`ORDER BY c.created_at DESC`
    } else if (sortColumn === 'updated_at') {
      orderByClause = sortDir === 'ASC' ? sql`ORDER BY c.updated_at ASC NULLS LAST` : sql`ORDER BY c.updated_at DESC NULLS LAST`
    } else if (sortColumn === 'wallet_address') {
      orderByClause = sortDir === 'ASC' ? sql`ORDER BY c.wallet_address ASC` : sql`ORDER BY c.wallet_address DESC`
    } else if (sortColumn === 'launch_status') {
      orderByClause = sortDir === 'ASC' ? sql`ORDER BY c.launch_status ASC NULLS LAST` : sql`ORDER BY c.launch_status DESC NULLS LAST`
    } else if (sortColumn === 'is_locked') {
      orderByClause = sortDir === 'ASC' ? sql`ORDER BY c.is_locked ASC` : sql`ORDER BY c.is_locked DESC`
    } else {
      orderByClause = sql`ORDER BY c.created_at DESC`
    }

    // Get collections with related data
    const collectionsResult = await sql`
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
      ${whereClause}
      ${orderByClause}
      LIMIT ${limit} OFFSET ${offset}
    `

    const collections = Array.isArray(collectionsResult) ? collectionsResult : []

    return NextResponse.json({
      success: true,
      collections,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error: any) {
    console.error('Error fetching collections:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch collections' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/admin/collections/manage - Update collection fields (admin only)
 */
export async function PATCH(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
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
    const { collection_id, updates } = body

    if (!collection_id) {
      return NextResponse.json({ error: 'Collection ID required' }, { status: 400 })
    }

    if (!updates || typeof updates !== 'object') {
      return NextResponse.json({ error: 'Updates object required' }, { status: 400 })
    }

    // If trying to set collection_status to launchpad or launchpad_live, verify collection has ordinals
    if (updates.collection_status === 'launchpad' || updates.collection_status === 'launchpad_live') {
      const supplyCheck = await sql`
        SELECT COUNT(*)::int as ordinal_count
        FROM generated_ordinals
        WHERE collection_id = ${collection_id}
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

    const updateFields: string[] = []
    const updateValues: any[] = []

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        updateFields.push(key)
        updateValues.push(value)
      }
    }

    if (updateFields.length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    // Build SQL update using COALESCE pattern (similar to launchpad route)
    // This allows us to update only the fields that are provided
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
      WHERE id = ${collection_id}
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

