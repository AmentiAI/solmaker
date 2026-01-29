import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { isAdmin } from '@/lib/auth/access-control'

/**
 * GET /api/admin/launchpad/pending-reveals - Get all pending reveal transactions for launchpad mints
 * Returns mint_inscriptions that have commit_tx_id but no reveal_tx_id
 */
export async function GET(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const adminWallet = searchParams.get('wallet_address')
    const collectionId = searchParams.get('collection_id')
    const limit = parseInt(searchParams.get('limit') || '100')
    const offset = parseInt(searchParams.get('offset') || '0')

    if (!adminWallet || !isAdmin(adminWallet)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Get pending reveals: have commit_tx_id but no reveal_tx_id
    // These are launchpad mints (not test mints)
    let query
    if (collectionId) {
      query = sql`
        SELECT 
          mi.id,
          mi.ordinal_id,
          mi.session_id,
          mi.collection_id,
          mi.commit_tx_id,
          mi.commit_output_index,
          mi.commit_output_value,
          mi.reveal_tx_id,
          mi.inscription_id,
          mi.mint_status,
          mi.error_message,
          mi.commit_broadcast_at,
          mi.reveal_broadcast_at,
          mi.completed_at,
          mi.created_at,
          mi.minter_wallet,
          mi.receiving_wallet,
          c.name as collection_name,
          go.ordinal_number
        FROM mint_inscriptions mi
        JOIN collections c ON mi.collection_id = c.id
        LEFT JOIN generated_ordinals go ON mi.ordinal_id = go.id
        WHERE mi.commit_tx_id IS NOT NULL
          AND mi.reveal_tx_id IS NULL
          AND mi.is_test_mint = false
          AND mi.collection_id = ${collectionId}
        ORDER BY mi.commit_broadcast_at DESC NULLS LAST, mi.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `
    } else {
      query = sql`
        SELECT 
          mi.id,
          mi.ordinal_id,
          mi.session_id,
          mi.collection_id,
          mi.commit_tx_id,
          mi.commit_output_index,
          mi.commit_output_value,
          mi.reveal_tx_id,
          mi.inscription_id,
          mi.mint_status,
          mi.error_message,
          mi.commit_broadcast_at,
          mi.reveal_broadcast_at,
          mi.completed_at,
          mi.created_at,
          mi.minter_wallet,
          mi.receiving_wallet,
          c.name as collection_name,
          go.ordinal_number
        FROM mint_inscriptions mi
        JOIN collections c ON mi.collection_id = c.id
        LEFT JOIN generated_ordinals go ON mi.ordinal_id = go.id
        WHERE mi.commit_tx_id IS NOT NULL
          AND mi.reveal_tx_id IS NULL
          AND mi.is_test_mint = false
        ORDER BY mi.commit_broadcast_at DESC NULLS LAST, mi.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `
    }

    const inscriptions = await query as any[]

    // Get total count
    let countQuery
    if (collectionId) {
      countQuery = sql`
        SELECT COUNT(*) as count
        FROM mint_inscriptions mi
        WHERE mi.commit_tx_id IS NOT NULL
          AND mi.reveal_tx_id IS NULL
          AND mi.is_test_mint = false
          AND mi.collection_id = ${collectionId}
      `
    } else {
      countQuery = sql`
        SELECT COUNT(*) as count
        FROM mint_inscriptions mi
        WHERE mi.commit_tx_id IS NOT NULL
          AND mi.reveal_tx_id IS NULL
          AND mi.is_test_mint = false
      `
    }

    const countResult = await countQuery as any[]
    const totalCount = countResult?.[0]?.count || 0

    return NextResponse.json({
      success: true,
      inscriptions: Array.isArray(inscriptions) ? inscriptions : [],
      total: totalCount,
      limit,
      offset,
    })
  } catch (error: any) {
    console.error('Error fetching pending reveals:', error)
    return NextResponse.json({ 
      error: 'Failed to fetch pending reveals',
      details: error.message 
    }, { status: 500 })
  }
}

