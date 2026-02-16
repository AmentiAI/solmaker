import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { checkAuthorizationServer } from '@/lib/auth/access-control'

/**
 * GET /api/admin/mints/launches - List all mint launches
 */
export async function GET(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const adminWallet = searchParams.get('wallet_address')
    const status = searchParams.get('status')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    if (!adminWallet) {
      return NextResponse.json({ error: 'Wallet address required' }, { status: 401 })
    }
    const authResult = await checkAuthorizationServer(adminWallet, sql)
    if (!authResult.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized. Admin access only.' }, { status: 403 })
    }

    let launches
    if (status) {
      launches = await sql`
        SELECT 
          cml.*,
          c.name as collection_name,
          c.description as collection_description,
          c.is_locked as collection_locked,
          (SELECT COUNT(*) FROM generated_ordinals WHERE collection_id = c.id) as total_ordinals
        FROM collection_mint_launches cml
        JOIN collections c ON cml.collection_id = c.id
        WHERE cml.launch_status = ${status}
        ORDER BY cml.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `
    } else {
      launches = await sql`
        SELECT 
          cml.*,
          c.name as collection_name,
          c.description as collection_description,
          c.is_locked as collection_locked,
          (SELECT COUNT(*) FROM generated_ordinals WHERE collection_id = c.id) as total_ordinals
        FROM collection_mint_launches cml
        JOIN collections c ON cml.collection_id = c.id
        ORDER BY cml.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `
    }

    // Get total count
    const countQueryResult = status
      ? await sql`SELECT COUNT(*) as count FROM collection_mint_launches WHERE launch_status = ${status}`
      : await sql`SELECT COUNT(*) as count FROM collection_mint_launches`
    const countResult = (Array.isArray(countQueryResult) ? countQueryResult[0] : {}) as Record<string, any>
    const launchesArray = Array.isArray(launches) ? launches : []

    return NextResponse.json({
      success: true,
      launches: launchesArray,
      pagination: {
        total: parseInt(countResult?.count || '0'),
        limit,
        offset,
        has_more: offset + launchesArray.length < parseInt(countResult?.count || '0'),
      },
    })
  } catch (error) {
    console.error('Error fetching mint launches:', error)
    return NextResponse.json({ error: 'Failed to fetch mint launches' }, { status: 500 })
  }
}

/**
 * POST /api/admin/mints/launches - Create a new mint launch
 */
export async function POST(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const body = await request.json()
    const {
      admin_wallet,
      collection_id,
      launch_name,
      mint_price_sats = 0,
      max_per_wallet,
      reserved_count = 0,
      creator_wallet,
      platform_fee_wallet,
      platform_fee_percent = 0,
      scheduled_start,
      scheduled_end,
      allow_public_mint = true,
      whitelist_only = false,
      reveal_on_mint = true,
      shuffle_on_mint = true,
      default_fee_rate = 1.0,
      min_fee_rate = 0.5,
      max_fee_rate = 500,
    } = body

    if (!admin_wallet) {
      return NextResponse.json({ error: 'Wallet address required' }, { status: 401 })
    }
    const postAuthResult = await checkAuthorizationServer(admin_wallet, sql)
    if (!postAuthResult.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized. Admin access only.' }, { status: 403 })
    }

    if (!collection_id) {
      return NextResponse.json({ error: 'Collection ID is required' }, { status: 400 })
    }

    if (!creator_wallet) {
      return NextResponse.json({ error: 'Creator wallet is required' }, { status: 400 })
    }

    // Verify collection exists and is locked
    const [collection] = await sql`
      SELECT id, name, is_locked, active_launch_id
      FROM collections
      WHERE id = ${collection_id}
    `

    if (!collection) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 })
    }

    if (collection.active_launch_id) {
      return NextResponse.json({ error: 'Collection already has an active launch' }, { status: 400 })
    }

    // Get total supply from generated ordinals count
    const [supplyResult] = await sql`
      SELECT COUNT(*) as count 
      FROM generated_ordinals 
      WHERE collection_id = ${collection_id}
    `
    const totalSupply = parseInt(supplyResult.count)

    if (totalSupply === 0) {
      return NextResponse.json({ error: 'Collection has no generated ordinals' }, { status: 400 })
    }

    // Create the launch
    const [launch] = await sql`
      INSERT INTO collection_mint_launches (
        collection_id,
        launch_name,
        mint_price_sats,
        max_per_wallet,
        total_supply,
        reserved_count,
        creator_wallet,
        platform_fee_wallet,
        platform_fee_percent,
        launch_status,
        scheduled_start,
        scheduled_end,
        allow_public_mint,
        whitelist_only,
        reveal_on_mint,
        shuffle_on_mint,
        default_fee_rate,
        min_fee_rate,
        max_fee_rate
      )
      VALUES (
        ${collection_id},
        ${launch_name || collection.name + ' Launch'},
        ${mint_price_sats},
        ${max_per_wallet},
        ${totalSupply},
        ${reserved_count},
        ${creator_wallet},
        ${platform_fee_wallet},
        ${platform_fee_percent},
        ${scheduled_start ? 'scheduled' : 'draft'},
        ${scheduled_start || null},
        ${scheduled_end || null},
        ${allow_public_mint},
        ${whitelist_only},
        ${reveal_on_mint},
        ${shuffle_on_mint},
        ${default_fee_rate},
        ${min_fee_rate},
        ${max_fee_rate}
      )
      RETURNING *
    `

    // Log activity
    await sql`
      INSERT INTO mint_activity_log (
        launch_id,
        actor_wallet,
        actor_type,
        action_type,
        action_data,
        success
      ) VALUES (
        ${launch.id},
        ${admin_wallet},
        'admin',
        'launch_created',
        ${JSON.stringify({ launch_name: launch.launch_name, total_supply: totalSupply })}::jsonb,
        true
      )
    `

    return NextResponse.json({
      success: true,
      launch,
      message: `Mint launch created for collection "${collection.name}"`,
    })
  } catch (error) {
    console.error('Error creating mint launch:', error)
    return NextResponse.json({ error: 'Failed to create mint launch' }, { status: 500 })
  }
}

