import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { isAdmin } from '@/lib/auth/access-control'

/**
 * GET /api/admin/mints/inscriptions/[id] - Get specific inscription details
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

    // Get full inscription details
    const inscriptionResult = await sql`
      SELECT 
        mi.*,
        c.name as collection_name,
        c.description as collection_description,
        cml.launch_name,
        cml.mint_price_sats as launch_mint_price,
        go.ordinal_number,
        go.image_url as ordinal_image_url,
        go.thumbnail_url as ordinal_thumbnail,
        go.traits as ordinal_traits
      FROM mint_inscriptions mi
      LEFT JOIN collections c ON mi.collection_id = c.id
      LEFT JOIN collection_mint_launches cml ON mi.launch_id = cml.id
      LEFT JOIN generated_ordinals go ON mi.ordinal_id = go.id
      WHERE mi.id = ${id}
    `
    const inscription = Array.isArray(inscriptionResult) ? inscriptionResult[0] : null

    if (!inscription) {
      return NextResponse.json({ error: 'Inscription not found' }, { status: 404 })
    }

    // Get related stuck transactions
    const stuckTx = await sql`
      SELECT *
      FROM stuck_transactions
      WHERE mint_inscription_id = ${id}
      ORDER BY detected_at DESC
    `

    // Get activity log for this inscription
    const activityLog = await sql`
      SELECT *
      FROM mint_activity_log
      WHERE mint_inscription_id = ${id}
      ORDER BY created_at DESC
    `

    return NextResponse.json({
      success: true,
      inscription,
      stuck_transactions: stuckTx,
      activity_log: activityLog,
    })
  } catch (error) {
    console.error('Error fetching inscription:', error)
    return NextResponse.json({ error: 'Failed to fetch inscription' }, { status: 500 })
  }
}

/**
 * PATCH /api/admin/mints/inscriptions/[id] - Update inscription (admin actions)
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
    const { admin_wallet, action, ...updates } = body

    if (!admin_wallet || !isAuthorized(admin_wallet)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Get current inscription
    const currentResult = await sql`
      SELECT * FROM mint_inscriptions WHERE id = ${id}
    `
    const current = (Array.isArray(currentResult) ? currentResult[0] : null) as Record<string, any> | null

    if (!current) {
      return NextResponse.json({ error: 'Inscription not found' }, { status: 404 })
    }

    let updatedInscription
    let actionType = 'inscription_updated'

    switch (action) {
      case 'flag_for_review':
        updatedInscription = await sql`
          UPDATE mint_inscriptions
          SET flagged_for_review = true, admin_notes = ${updates.admin_notes || current.admin_notes}
          WHERE id = ${id}
          RETURNING *
        `
        actionType = 'flagged_for_review'
        break

      case 'unflag':
        updatedInscription = await sql`
          UPDATE mint_inscriptions
          SET flagged_for_review = false
          WHERE id = ${id}
          RETURNING *
        `
        actionType = 'unflagged'
        break

      case 'mark_stuck':
        updatedInscription = await sql`
          UPDATE mint_inscriptions
          SET mint_status = 'stuck', stuck_since = CURRENT_TIMESTAMP
          WHERE id = ${id}
          RETURNING *
        `
        actionType = 'marked_stuck'
        break

      case 'retry':
        if (current.retry_count >= 5) {
          return NextResponse.json({ error: 'Maximum retry count reached' }, { status: 400 })
        }
        updatedInscription = await sql`
          UPDATE mint_inscriptions
          SET 
            mint_status = 'pending',
            error_message = NULL,
            error_code = NULL,
            retry_count = retry_count + 1,
            last_retry_at = CURRENT_TIMESTAMP
          WHERE id = ${id}
          RETURNING *
        `
        actionType = 'retry_initiated'
        break

      case 'cancel':
        if (!['pending', 'failed', 'stuck'].includes(current.mint_status)) {
          return NextResponse.json({ error: 'Cannot cancel inscription in current status' }, { status: 400 })
        }
        updatedInscription = await sql`
          UPDATE mint_inscriptions
          SET mint_status = 'cancelled', admin_notes = ${updates.admin_notes || 'Cancelled by admin'}
          WHERE id = ${id}
          RETURNING *
        `
        actionType = 'cancelled'
        break

      case 'mark_refunded':
        updatedInscription = await sql`
          UPDATE mint_inscriptions
          SET 
            mint_status = 'refunded',
            refund_status = 'refunded',
            refund_tx_id = ${updates.refund_tx_id},
            refund_amount_sats = ${updates.refund_amount_sats}
          WHERE id = ${id}
          RETURNING *
        `
        actionType = 'refunded'
        break

      case 'add_note':
        const existingNotes = current.admin_notes || ''
        const newNote = `[${new Date().toISOString()}] ${admin_wallet.substring(0, 10)}...: ${updates.note}`
        const combinedNotes = existingNotes ? `${existingNotes}\n${newNote}` : newNote
        
        updatedInscription = await sql`
          UPDATE mint_inscriptions
          SET admin_notes = ${combinedNotes}
          WHERE id = ${id}
          RETURNING *
        `
        actionType = 'note_added'
        break

      default:
        // General update for allowed fields
        const allowedFields = ['admin_notes', 'flagged_for_review']
        const validUpdates: Record<string, any> = {}
        for (const key of allowedFields) {
          if (updates[key] !== undefined) {
            validUpdates[key] = updates[key]
          }
        }

        if (Object.keys(validUpdates).length === 0) {
          return NextResponse.json({ error: 'No valid updates provided' }, { status: 400 })
        }

        updatedInscription = await sql`
          UPDATE mint_inscriptions
          SET 
            admin_notes = COALESCE(${validUpdates.admin_notes}, admin_notes),
            flagged_for_review = COALESCE(${validUpdates.flagged_for_review}, flagged_for_review)
          WHERE id = ${id}
          RETURNING *
        `
    }

    // Log the activity
    await sql`
      INSERT INTO mint_activity_log (
        launch_id,
        mint_inscription_id,
        actor_wallet,
        actor_type,
        action_type,
        action_data,
        success
      ) VALUES (
        ${current.launch_id},
        ${id},
        ${admin_wallet},
        'admin',
        ${actionType},
        ${JSON.stringify({ action, updates, previous_status: current.mint_status })}::jsonb,
        true
      )
    `

    return NextResponse.json({
      success: true,
      inscription: Array.isArray(updatedInscription) ? updatedInscription[0] : updatedInscription,
      message: `Action '${action}' completed successfully`,
    })
  } catch (error) {
    console.error('Error updating inscription:', error)
    return NextResponse.json({ error: 'Failed to update inscription' }, { status: 500 })
  }
}

