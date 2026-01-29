import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { isAdmin } from '@/lib/auth/access-control'

/**
 * GET /api/admin/mints/inscriptions - List all inscriptions with filters
 */
export async function GET(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const adminWallet = searchParams.get('wallet_address')
    const status = searchParams.get('status')
    const launchId = searchParams.get('launch_id')
    const collectionId = searchParams.get('collection_id')
    const minterWallet = searchParams.get('minter_wallet')
    const isTest = searchParams.get('is_test')
    const isFlagged = searchParams.get('is_flagged')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    if (!adminWallet || !isAdmin(adminWallet)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Build query with filters
    let whereConditions: string[] = []
    let queryParams: any[] = []

    if (status) {
      whereConditions.push(`mi.mint_status = '${status}'`)
    }
    if (launchId) {
      whereConditions.push(`mi.launch_id = '${launchId}'`)
    }
    if (collectionId) {
      whereConditions.push(`mi.collection_id = '${collectionId}'`)
    }
    if (minterWallet) {
      whereConditions.push(`mi.minter_wallet = '${minterWallet}'`)
    }
    if (isTest === 'true') {
      whereConditions.push(`mi.is_test_mint = true`)
    }
    if (isFlagged === 'true') {
      whereConditions.push(`mi.flagged_for_review = true`)
    }

    // Query with or without filters
    let inscriptions
    if (whereConditions.length > 0) {
      const whereClause = whereConditions.join(' AND ')
      inscriptions = await sql`
        SELECT 
          mi.id,
          mi.launch_id,
          mi.collection_id,
          mi.ordinal_id,
          mi.minter_wallet,
          mi.payment_wallet,
          mi.receiving_wallet,
          mi.commit_tx_id,
          mi.commit_output_value,
          mi.commit_fee_sats,
          mi.commit_broadcast_at,
          mi.commit_confirmed_at,
          mi.commit_confirmations,
          mi.reveal_tx_id,
          mi.reveal_fee_sats,
          mi.reveal_broadcast_at,
          mi.reveal_confirmed_at,
          mi.reveal_confirmations,
          mi.inscription_id,
          mi.inscription_number,
          mi.original_image_url,
          mi.compressed_image_url,
          mi.content_size_bytes,
          mi.content_type,
          mi.fee_rate,
          mi.total_cost_sats,
          mi.mint_price_paid,
          mi.mint_status,
          mi.error_message,
          mi.error_code,
          mi.retry_count,
          mi.is_test_mint,
          mi.is_admin_mint,
          mi.flagged_for_review,
          mi.admin_notes,
          mi.stuck_since,
          mi.recovery_attempted,
          mi.refund_status,
          mi.created_at,
          mi.updated_at,
          mi.completed_at,
          c.name as collection_name,
          cml.launch_name,
          go.ordinal_number,
          go.thumbnail_url as ordinal_thumbnail
        FROM mint_inscriptions mi
        LEFT JOIN collections c ON mi.collection_id = c.id
        LEFT JOIN collection_mint_launches cml ON mi.launch_id = cml.id
        LEFT JOIN generated_ordinals go ON mi.ordinal_id = go.id
        WHERE ${sql.unsafe(whereClause)}
        ORDER BY mi.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `
    } else {
      inscriptions = await sql`
        SELECT 
          mi.id,
          mi.launch_id,
          mi.collection_id,
          mi.ordinal_id,
          mi.minter_wallet,
          mi.payment_wallet,
          mi.receiving_wallet,
          mi.commit_tx_id,
          mi.commit_output_value,
          mi.commit_fee_sats,
          mi.commit_broadcast_at,
          mi.commit_confirmed_at,
          mi.commit_confirmations,
          mi.reveal_tx_id,
          mi.reveal_fee_sats,
          mi.reveal_broadcast_at,
          mi.reveal_confirmed_at,
          mi.reveal_confirmations,
          mi.inscription_id,
          mi.inscription_number,
          mi.original_image_url,
          mi.compressed_image_url,
          mi.content_size_bytes,
          mi.content_type,
          mi.fee_rate,
          mi.total_cost_sats,
          mi.mint_price_paid,
          mi.mint_status,
          mi.error_message,
          mi.error_code,
          mi.retry_count,
          mi.is_test_mint,
          mi.is_admin_mint,
          mi.flagged_for_review,
          mi.admin_notes,
          mi.stuck_since,
          mi.recovery_attempted,
          mi.refund_status,
          mi.created_at,
          mi.updated_at,
          mi.completed_at,
          c.name as collection_name,
          cml.launch_name,
          go.ordinal_number,
          go.thumbnail_url as ordinal_thumbnail
        FROM mint_inscriptions mi
        LEFT JOIN collections c ON mi.collection_id = c.id
        LEFT JOIN collection_mint_launches cml ON mi.launch_id = cml.id
        LEFT JOIN generated_ordinals go ON mi.ordinal_id = go.id
        ORDER BY mi.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `
    }

    // Get total count
    const [countResult] = whereConditions.length > 0
      ? await sql`SELECT COUNT(*) as count FROM mint_inscriptions mi WHERE ${sql.unsafe(whereConditions.join(' AND '))}`
      : await sql`SELECT COUNT(*) as count FROM mint_inscriptions`

    return NextResponse.json({
      success: true,
      inscriptions,
      pagination: {
        total: parseInt(countResult.count),
        limit,
        offset,
        has_more: offset + inscriptions.length < parseInt(countResult.count),
      },
    })
  } catch (error) {
    console.error('Error fetching inscriptions:', error)
    return NextResponse.json({ error: 'Failed to fetch inscriptions' }, { status: 500 })
  }
}

