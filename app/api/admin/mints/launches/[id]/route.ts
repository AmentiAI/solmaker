import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { isAdmin } from '@/lib/auth/access-control'

/**
 * GET /api/admin/mints/launches/[id] - Get specific launch details
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
    const adminWallet = searchParams.get('wallet_address')

    if (!adminWallet || !isAdmin(adminWallet)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Get launch with collection info
    const [launch] = await sql`
      SELECT 
        cml.*,
        c.name as collection_name,
        c.description as collection_description,
        c.is_locked as collection_locked,
        c.wallet_address as collection_owner
      FROM collection_mint_launches cml
      JOIN collections c ON cml.collection_id = c.id
      WHERE cml.id = ${id}
    `

    if (!launch) {
      return NextResponse.json({ error: 'Launch not found' }, { status: 404 })
    }

    // Get inscription stats for this launch
    const [inscriptionStats] = await sql`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE mint_status = 'completed') as completed,
        COUNT(*) FILTER (WHERE mint_status = 'pending') as pending,
        COUNT(*) FILTER (WHERE mint_status = 'failed') as failed,
        COUNT(*) FILTER (WHERE mint_status = 'stuck') as stuck,
        COUNT(*) FILTER (WHERE is_test_mint = true) as test_mints,
        COALESCE(SUM(total_cost_sats) FILTER (WHERE mint_status = 'completed'), 0) as total_fees,
        COUNT(DISTINCT minter_wallet) as unique_minters
      FROM mint_inscriptions
      WHERE launch_id = ${id}
    `

    // Get recent inscriptions for this launch
    const recentInscriptions = await sql`
      SELECT 
        id,
        minter_wallet,
        mint_status,
        commit_tx_id,
        reveal_tx_id,
        inscription_id,
        fee_rate,
        total_cost_sats,
        is_test_mint,
        error_message,
        created_at,
        completed_at
      FROM mint_inscriptions
      WHERE launch_id = ${id}
      ORDER BY created_at DESC
      LIMIT 20
    `

    // Get whitelist if applicable
    const whitelist = launch.whitelist_only
      ? await sql`
          SELECT 
            wallet_address,
            max_mints,
            mints_used,
            added_at
          FROM mint_whitelist
          WHERE launch_id = ${id}
          ORDER BY added_at DESC
        `
      : []

    // Get activity log for this launch
    const activityLog = await sql`
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
      WHERE launch_id = ${id}
      ORDER BY created_at DESC
      LIMIT 50
    `

    return NextResponse.json({
      success: true,
      launch,
      inscription_stats: {
        total: parseInt(inscriptionStats.total) || 0,
        completed: parseInt(inscriptionStats.completed) || 0,
        pending: parseInt(inscriptionStats.pending) || 0,
        failed: parseInt(inscriptionStats.failed) || 0,
        stuck: parseInt(inscriptionStats.stuck) || 0,
        test_mints: parseInt(inscriptionStats.test_mints) || 0,
        total_fees: parseInt(inscriptionStats.total_fees) || 0,
        unique_minters: parseInt(inscriptionStats.unique_minters) || 0,
      },
      recent_inscriptions: recentInscriptions,
      whitelist,
      activity_log: activityLog,
    })
  } catch (error) {
    console.error('Error fetching launch details:', error)
    return NextResponse.json({ error: 'Failed to fetch launch details' }, { status: 500 })
  }
}

/**
 * PATCH /api/admin/mints/launches/[id] - Update a mint launch
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
    const body = await request.json()
    const { admin_wallet, ...updates } = body

    if (!admin_wallet || !isAuthorized(admin_wallet)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Get current launch
    const [currentLaunch] = await sql`
      SELECT * FROM collection_mint_launches WHERE id = ${id}
    `

    if (!currentLaunch) {
      return NextResponse.json({ error: 'Launch not found' }, { status: 404 })
    }

    // Build update object
    const allowedFields = [
      'launch_name', 'mint_price_sats', 'max_per_wallet', 'reserved_count',
      'creator_wallet', 'platform_fee_wallet', 'platform_fee_percent',
      'launch_status', 'scheduled_start', 'scheduled_end',
      'allow_public_mint', 'whitelist_only', 'reveal_on_mint', 'shuffle_on_mint',
      'default_fee_rate', 'min_fee_rate', 'max_fee_rate'
    ]

    const validUpdates: Record<string, any> = {}
    for (const key of allowedFields) {
      if (updates[key] !== undefined) {
        validUpdates[key] = updates[key]
      }
    }

    // Handle status changes
    if (validUpdates.launch_status) {
      const newStatus = validUpdates.launch_status

      // Validate status transition
      const validTransitions: Record<string, string[]> = {
        'draft': ['scheduled', 'active', 'cancelled'],
        'scheduled': ['active', 'paused', 'cancelled'],
        'active': ['paused', 'completed', 'cancelled'],
        'paused': ['active', 'completed', 'cancelled'],
        'completed': [], // No transitions allowed
        'cancelled': [], // No transitions allowed
      }

      if (!validTransitions[currentLaunch.launch_status]?.includes(newStatus)) {
        return NextResponse.json({
          error: `Cannot transition from ${currentLaunch.launch_status} to ${newStatus}`
        }, { status: 400 })
      }

      // Set actual_start if activating
      if (newStatus === 'active' && !currentLaunch.actual_start) {
        validUpdates.actual_start = new Date().toISOString()

        // Update collection's active_launch_id
        await sql`
          UPDATE collections
          SET active_launch_id = ${id}
          WHERE id = ${currentLaunch.collection_id}
        `
      }

      // Set actual_end if completing or cancelling
      if (['completed', 'cancelled'].includes(newStatus) && !currentLaunch.actual_end) {
        validUpdates.actual_end = new Date().toISOString()

        // Clear collection's active_launch_id
        await sql`
          UPDATE collections
          SET active_launch_id = NULL
          WHERE id = ${currentLaunch.collection_id}
        `
      }
    }

    if (Object.keys(validUpdates).length === 0) {
      return NextResponse.json({ error: 'No valid updates provided' }, { status: 400 })
    }

    // Build dynamic update query
    const setClauses = Object.keys(validUpdates).map(key => `${key} = $${key}`).join(', ')
    
    // Update the launch
    const [updatedLaunch] = await sql`
      UPDATE collection_mint_launches
      SET 
        launch_name = COALESCE(${validUpdates.launch_name}, launch_name),
        mint_price_sats = COALESCE(${validUpdates.mint_price_sats}, mint_price_sats),
        max_per_wallet = COALESCE(${validUpdates.max_per_wallet}, max_per_wallet),
        reserved_count = COALESCE(${validUpdates.reserved_count}, reserved_count),
        creator_wallet = COALESCE(${validUpdates.creator_wallet}, creator_wallet),
        platform_fee_wallet = COALESCE(${validUpdates.platform_fee_wallet}, platform_fee_wallet),
        platform_fee_percent = COALESCE(${validUpdates.platform_fee_percent}, platform_fee_percent),
        launch_status = COALESCE(${validUpdates.launch_status}, launch_status),
        scheduled_start = COALESCE(${validUpdates.scheduled_start}, scheduled_start),
        scheduled_end = COALESCE(${validUpdates.scheduled_end}, scheduled_end),
        actual_start = COALESCE(${validUpdates.actual_start}, actual_start),
        actual_end = COALESCE(${validUpdates.actual_end}, actual_end),
        allow_public_mint = COALESCE(${validUpdates.allow_public_mint}, allow_public_mint),
        whitelist_only = COALESCE(${validUpdates.whitelist_only}, whitelist_only),
        reveal_on_mint = COALESCE(${validUpdates.reveal_on_mint}, reveal_on_mint),
        shuffle_on_mint = COALESCE(${validUpdates.shuffle_on_mint}, shuffle_on_mint),
        default_fee_rate = COALESCE(${validUpdates.default_fee_rate}, default_fee_rate),
        min_fee_rate = COALESCE(${validUpdates.min_fee_rate}, min_fee_rate),
        max_fee_rate = COALESCE(${validUpdates.max_fee_rate}, max_fee_rate),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
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
        ${id},
        ${admin_wallet},
        'admin',
        'launch_updated',
        ${JSON.stringify({ updates: validUpdates, previous_status: currentLaunch.launch_status })}::jsonb,
        true
      )
    `

    return NextResponse.json({
      success: true,
      launch: updatedLaunch,
      message: 'Launch updated successfully',
    })
  } catch (error) {
    console.error('Error updating launch:', error)
    return NextResponse.json({ error: 'Failed to update launch' }, { status: 500 })
  }
}

/**
 * DELETE /api/admin/mints/launches/[id] - Delete a mint launch (draft only)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const adminWallet = searchParams.get('wallet_address')

    if (!adminWallet || !isAdmin(adminWallet)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Get current launch
    const [launch] = await sql`
      SELECT * FROM collection_mint_launches WHERE id = ${id}
    `

    if (!launch) {
      return NextResponse.json({ error: 'Launch not found' }, { status: 404 })
    }

    // Only allow deleting draft launches
    if (launch.launch_status !== 'draft') {
      return NextResponse.json({
        error: 'Can only delete draft launches. Use status update to cancel active launches.'
      }, { status: 400 })
    }

    // Delete the launch
    await sql`DELETE FROM collection_mint_launches WHERE id = ${id}`

    // Log activity
    await sql`
      INSERT INTO mint_activity_log (
        actor_wallet,
        actor_type,
        action_type,
        action_data,
        success
      ) VALUES (
        ${adminWallet},
        'admin',
        'launch_deleted',
        ${JSON.stringify({ launch_id: id, launch_name: launch.launch_name })}::jsonb,
        true
      )
    `

    return NextResponse.json({
      success: true,
      message: 'Launch deleted successfully',
    })
  } catch (error) {
    console.error('Error deleting launch:', error)
    return NextResponse.json({ error: 'Failed to delete launch' }, { status: 500 })
  }
}

