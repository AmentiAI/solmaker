import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { isAdmin } from '@/lib/auth/access-control'

/**
 * GET /api/admin/mints/launchable-collections - Get ALL collections for admin management
 * Returns all collections regardless of status for full admin control
 */
export async function GET(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const adminWallet = searchParams.get('wallet_address')

    if (!adminWallet || !isAdmin(adminWallet)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Get ALL collections with their ordinal counts - no restrictions
    const collections = await sql`
      SELECT 
        c.id,
        c.name,
        c.description,
        c.is_locked,
        c.locked_at,
        c.locked_by,
        c.launch_status,
        c.launched_at,
        c.mint_ended_at,
        c.total_minted,
        c.wallet_address as owner_wallet,
        c.banner_image_url,
        c.mobile_image_url,
        c.extend_last_phase,
        c.created_at,
        c.updated_at,
        (SELECT COUNT(*) FROM generated_ordinals WHERE collection_id = c.id) as total_ordinals,
        (SELECT COUNT(*) FROM generated_ordinals WHERE collection_id = c.id AND is_minted = true) as minted_ordinals,
        (SELECT COUNT(*) FROM mint_phases WHERE collection_id = c.id) as phase_count,
        (SELECT COUNT(*) FROM mint_phases WHERE collection_id = c.id AND is_active = true) as active_phase_count
      FROM collections c
      ORDER BY 
        CASE 
          WHEN c.launch_status = 'active' THEN 1
          WHEN c.launch_status = 'scheduled' THEN 2
          WHEN c.is_locked = true THEN 3
          ELSE 4
        END,
        c.updated_at DESC
    `

    // Cast to array for filtering
    const collectionsArray = (Array.isArray(collections) ? collections : []) as Record<string, any>[]

    // Categorize collections based on new schema
    const active = collectionsArray.filter((c) => c.launch_status === 'active')
    const scheduled = collectionsArray.filter((c) => c.launch_status === 'scheduled')
    const draft = collectionsArray.filter((c) => c.is_locked && (!c.launch_status || c.launch_status === 'draft'))
    const ready = collectionsArray.filter((c) => c.is_locked && !c.launch_status && parseInt(c.total_ordinals) > 0)
    const not_locked = collectionsArray.filter((c) => !c.is_locked)
    const completed = collectionsArray.filter((c) => c.launch_status === 'completed')

    return NextResponse.json({
      success: true,
      // All collections combined for easy access
      all: collectionsArray,
      // Categorized for filtering
      active,
      scheduled,
      draft,
      ready,
      not_locked,
      completed,
      summary: {
        total: collectionsArray.length,
        active: active.length,
        scheduled: scheduled.length,
        draft: draft.length,
        ready: ready.length,
        not_locked: not_locked.length,
        completed: completed.length,
      },
    })
  } catch (error) {
    console.error('Error fetching collections:', error)
    return NextResponse.json({ error: 'Failed to fetch collections' }, { status: 500 })
  }
}

/**
 * POST /api/admin/mints/launchable-collections - Lock a collection for mint launch
 */
export async function POST(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const body = await request.json()
    const { admin_wallet, collection_id, action } = body

    if (!admin_wallet || !isAuthorized(admin_wallet)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    if (!collection_id) {
      return NextResponse.json({ error: 'Collection ID is required' }, { status: 400 })
    }

    // Get collection
    const collectionResult = await sql`
      SELECT * FROM collections WHERE id = ${collection_id}
    `
    const collection = (Array.isArray(collectionResult) ? collectionResult[0] : null) as Record<string, any> | null

    if (!collection) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 })
    }

    let updatedCollection

    switch (action) {
      case 'lock':
        if (collection.is_locked) {
          return NextResponse.json({ error: 'Collection is already locked' }, { status: 400 })
        }

        updatedCollection = await sql`
          UPDATE collections
          SET 
            is_locked = true,
            locked_at = CURRENT_TIMESTAMP,
            locked_by = ${admin_wallet}
          WHERE id = ${collection_id}
          RETURNING *
        `

        // Log activity
        await sql`
          INSERT INTO mint_activity_log (
            actor_wallet,
            actor_type,
            action_type,
            action_data,
            success
          ) VALUES (
            ${admin_wallet},
            'admin',
            'collection_locked',
            ${JSON.stringify({ collection_id, collection_name: collection.name })}::jsonb,
            true
          )
        `
        break

      case 'unlock':
        if (!collection.is_locked) {
          return NextResponse.json({ error: 'Collection is not locked' }, { status: 400 })
        }

        if (collection.active_launch_id) {
          return NextResponse.json({ 
            error: 'Cannot unlock collection with active launch. Cancel or complete the launch first.' 
          }, { status: 400 })
        }

        updatedCollection = await sql`
          UPDATE collections
          SET 
            is_locked = false,
            locked_at = NULL,
            locked_by = NULL
          WHERE id = ${collection_id}
          RETURNING *
        `

        // Log activity
        await sql`
          INSERT INTO mint_activity_log (
            actor_wallet,
            actor_type,
            action_type,
            action_data,
            success
          ) VALUES (
            ${admin_wallet},
            'admin',
            'collection_unlocked',
            ${JSON.stringify({ collection_id, collection_name: collection.name })}::jsonb,
            true
          )
        `
        break

      default:
        return NextResponse.json({ error: 'Invalid action. Use "lock" or "unlock"' }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      collection: Array.isArray(updatedCollection) ? updatedCollection[0] : updatedCollection,
      message: `Collection ${action === 'lock' ? 'locked' : 'unlocked'} successfully`,
    })
  } catch (error) {
    console.error('Error updating collection lock status:', error)
    return NextResponse.json({ error: 'Failed to update collection' }, { status: 500 })
  }
}

