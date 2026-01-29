import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { isAdmin } from '@/lib/auth/access-control'

/**
 * GET /api/admin/launchpad/transactions - Get all launchpad mint transactions with filters
 * Supports filtering by collection, status, wallet, and date range
 */
export async function GET(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const adminWallet = searchParams.get('wallet_address')
    const collectionId = searchParams.get('collection_id')
    const status = searchParams.get('status')
    const minterWallet = searchParams.get('minter_wallet')
    const limit = parseInt(searchParams.get('limit') || '100')
    const offset = parseInt(searchParams.get('offset') || '0')
    const sortBy = searchParams.get('sort_by') || 'created_at'
    const sortOrder = searchParams.get('sort_order') || 'desc'

    if (!adminWallet || !isAdmin(adminWallet)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Build WHERE clause conditions
    const whereConditions: any[] = [sql`mi.is_test_mint = false`]
    
    if (collectionId) {
      whereConditions.push(sql`mi.collection_id = ${collectionId}`)
    }
    
    if (status) {
      whereConditions.push(sql`mi.mint_status = ${status}`)
    }
    
    if (minterWallet) {
      whereConditions.push(sql`mi.minter_wallet = ${minterWallet}`)
    }

    // Validate sort - use created_at as default
    const validSortColumns = [
      'created_at', 'commit_broadcast_at', 'reveal_broadcast_at', 
      'completed_at', 'commit_last_checked_at', 'reveal_last_checked_at',
      'commit_confirmations', 'reveal_confirmations'
    ]
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'created_at'
    const sortDir = sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC'
    const sortDirStr = sortDir === 'ASC' ? 'ASC' : 'DESC'

    // Build ORDER BY clause
    let orderByClause
    if (sortColumn === 'created_at') {
      orderByClause = sortDirStr === 'ASC' 
        ? sql`ORDER BY mi.created_at ASC`
        : sql`ORDER BY mi.created_at DESC`
    } else if (sortColumn === 'commit_broadcast_at') {
      orderByClause = sortDirStr === 'ASC'
        ? sql`ORDER BY mi.commit_broadcast_at ASC NULLS LAST`
        : sql`ORDER BY mi.commit_broadcast_at DESC NULLS LAST`
    } else if (sortColumn === 'reveal_broadcast_at') {
      orderByClause = sortDirStr === 'ASC'
        ? sql`ORDER BY mi.reveal_broadcast_at ASC NULLS LAST`
        : sql`ORDER BY mi.reveal_broadcast_at DESC NULLS LAST`
    } else if (sortColumn === 'completed_at') {
      orderByClause = sortDirStr === 'ASC'
        ? sql`ORDER BY mi.completed_at ASC NULLS LAST`
        : sql`ORDER BY mi.completed_at DESC NULLS LAST`
    } else if (sortColumn === 'commit_last_checked_at') {
      orderByClause = sortDirStr === 'ASC'
        ? sql`ORDER BY mi.commit_last_checked_at ASC NULLS LAST`
        : sql`ORDER BY mi.commit_last_checked_at DESC NULLS LAST`
    } else if (sortColumn === 'reveal_last_checked_at') {
      orderByClause = sortDirStr === 'ASC'
        ? sql`ORDER BY mi.reveal_last_checked_at ASC NULLS LAST`
        : sql`ORDER BY mi.reveal_last_checked_at DESC NULLS LAST`
    } else if (sortColumn === 'commit_confirmations') {
      orderByClause = sortDirStr === 'ASC'
        ? sql`ORDER BY mi.commit_confirmations ASC NULLS LAST`
        : sql`ORDER BY mi.commit_confirmations DESC NULLS LAST`
    } else if (sortColumn === 'reveal_confirmations') {
      orderByClause = sortDirStr === 'ASC'
        ? sql`ORDER BY mi.reveal_confirmations ASC NULLS LAST`
        : sql`ORDER BY mi.reveal_confirmations DESC NULLS LAST`
    } else {
      orderByClause = sql`ORDER BY mi.created_at DESC`
    }

    // Build WHERE clause by combining conditions
    let whereClause
    if (whereConditions.length === 1) {
      whereClause = sql`WHERE ${whereConditions[0]}`
    } else {
      // Combine multiple conditions
      whereClause = sql`WHERE ${whereConditions[0]}`
      for (let i = 1; i < whereConditions.length; i++) {
        whereClause = sql`${whereClause} AND ${whereConditions[i]}`
      }
    }

    // Check if payment verification columns exist
    let hasPaymentColumns = false
    try {
      const columnCheck = await sql`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'mint_inscriptions' 
          AND column_name = 'creator_payment_verified'
        LIMIT 1
      ` as any[]
      hasPaymentColumns = Array.isArray(columnCheck) && columnCheck.length > 0
    } catch (e) {
      // If we can't check, assume columns don't exist
      hasPaymentColumns = false
    }

    // Get transactions - conditionally include payment columns
    let transactions
    if (hasPaymentColumns) {
      transactions = await sql`
        SELECT 
          mi.id,
          mi.ordinal_id,
          mi.session_id,
          mi.collection_id,
          mi.commit_tx_id,
          mi.commit_output_index,
          mi.commit_output_value,
          mi.commit_confirmations,
          mi.commit_confirmed_at,
          mi.commit_last_checked_at,
          mi.reveal_tx_id,
          mi.reveal_confirmations,
          mi.reveal_confirmed_at,
          mi.reveal_last_checked_at,
          mi.inscription_id,
          mi.mint_status,
          mi.error_message,
          mi.error_code,
          mi.commit_broadcast_at,
          mi.reveal_broadcast_at,
          mi.completed_at,
          mi.created_at,
          mi.minter_wallet,
          mi.receiving_wallet,
          mi.fee_rate,
          mi.mint_price_paid,
          c.name as collection_name,
          go.ordinal_number,
          mp.phase_name,
          ms.quantity as mint_quantity,
          mi.creator_payment_verified,
          mi.creator_payment_amount,
          mi.creator_payment_wallet
        FROM mint_inscriptions mi
        JOIN collections c ON mi.collection_id = c.id
        LEFT JOIN generated_ordinals go ON mi.ordinal_id = go.id
        LEFT JOIN mint_phases mp ON mi.phase_id = mp.id
        LEFT JOIN mint_sessions ms ON mi.session_id = ms.id
        ${whereClause}
        ${orderByClause}
        LIMIT ${limit} OFFSET ${offset}
      ` as any[]
    } else {
      transactions = await sql`
        SELECT 
          mi.id,
          mi.ordinal_id,
          mi.session_id,
          mi.collection_id,
          mi.commit_tx_id,
          mi.commit_output_index,
          mi.commit_output_value,
          mi.commit_confirmations,
          mi.commit_confirmed_at,
          mi.commit_last_checked_at,
          mi.reveal_tx_id,
          mi.reveal_confirmations,
          mi.reveal_confirmed_at,
          mi.reveal_last_checked_at,
          mi.inscription_id,
          mi.mint_status,
          mi.error_message,
          mi.error_code,
          mi.commit_broadcast_at,
          mi.reveal_broadcast_at,
          mi.completed_at,
          mi.created_at,
          mi.minter_wallet,
          mi.receiving_wallet,
          mi.fee_rate,
          mi.mint_price_paid,
          c.name as collection_name,
          go.ordinal_number,
          mp.phase_name,
          ms.quantity as mint_quantity,
          NULL::boolean as creator_payment_verified,
          NULL::bigint as creator_payment_amount,
          NULL::varchar as creator_payment_wallet
        FROM mint_inscriptions mi
        JOIN collections c ON mi.collection_id = c.id
        LEFT JOIN generated_ordinals go ON mi.ordinal_id = go.id
        LEFT JOIN mint_phases mp ON mi.phase_id = mp.id
        LEFT JOIN mint_sessions ms ON mi.session_id = ms.id
        ${whereClause}
        ${orderByClause}
        LIMIT ${limit} OFFSET ${offset}
      ` as any[]
    }

    // Get total count
    let countWhereClause
    if (whereConditions.length === 1) {
      countWhereClause = sql`WHERE ${whereConditions[0]}`
    } else {
      countWhereClause = sql`WHERE ${whereConditions[0]}`
      for (let i = 1; i < whereConditions.length; i++) {
        countWhereClause = sql`${countWhereClause} AND ${whereConditions[i]}`
      }
    }
    
    const countResult = await sql`
      SELECT COUNT(*) as count
      FROM mint_inscriptions mi
      ${countWhereClause}
    ` as any[]
    const totalCount = countResult?.[0]?.count || 0

    return NextResponse.json({
      success: true,
      transactions: Array.isArray(transactions) ? transactions : [],
      total: totalCount,
      limit,
      offset,
    })
  } catch (error: any) {
    console.error('Error fetching admin transactions:', error)
    return NextResponse.json({ 
      error: 'Failed to fetch transactions',
      details: error.message 
    }, { status: 500 })
  }
}

/**
 * PATCH /api/admin/launchpad/transactions - Update transaction fields
 * Allows admin to manually update transaction status, timestamps, etc.
 */
export async function PATCH(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const body = await request.json()
    const { wallet_address, transaction_id, updates } = body

    if (!wallet_address || !isAdmin(wallet_address)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    if (!transaction_id) {
      return NextResponse.json({ error: 'transaction_id is required' }, { status: 400 })
    }

    // Build update object - only allow specific fields
    const allowedFields = [
      'mint_status',
      'commit_confirmations',
      'commit_confirmed_at',
      'commit_last_checked_at',
      'reveal_confirmations',
      'reveal_confirmed_at',
      'reveal_last_checked_at',
      'error_message',
      'error_code',
      'inscription_id',
      'completed_at',
    ]

    const updateFields: any = {}
    for (const [key, value] of Object.entries(updates || {})) {
      if (allowedFields.includes(key)) {
        updateFields[key] = value
      }
    }

    if (Object.keys(updateFields).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    // Build SQL update - use template literals for each field
    const setClauses: any[] = []
    
    for (const [key, value] of Object.entries(updateFields)) {
      if (value === null) {
        // Handle NULL values
        if (key === 'commit_confirmed_at') {
          setClauses.push(sql`commit_confirmed_at = NULL`)
        } else if (key === 'reveal_confirmed_at') {
          setClauses.push(sql`reveal_confirmed_at = NULL`)
        } else if (key === 'commit_last_checked_at') {
          setClauses.push(sql`commit_last_checked_at = NULL`)
        } else if (key === 'reveal_last_checked_at') {
          setClauses.push(sql`reveal_last_checked_at = NULL`)
        } else if (key === 'completed_at') {
          setClauses.push(sql`completed_at = NULL`)
        } else if (key === 'error_message') {
          setClauses.push(sql`error_message = NULL`)
        } else if (key === 'error_code') {
          setClauses.push(sql`error_code = NULL`)
        } else if (key === 'inscription_id') {
          setClauses.push(sql`inscription_id = NULL`)
        }
      } else {
        // Handle non-null values
        if (key === 'mint_status') {
          setClauses.push(sql`mint_status = ${value}`)
        } else if (key === 'commit_confirmations') {
          setClauses.push(sql`commit_confirmations = ${value}`)
        } else if (key === 'reveal_confirmations') {
          setClauses.push(sql`reveal_confirmations = ${value}`)
        } else if (key === 'error_message') {
          setClauses.push(sql`error_message = ${value}`)
        } else if (key === 'error_code') {
          setClauses.push(sql`error_code = ${value}`)
        } else if (key === 'inscription_id') {
          setClauses.push(sql`inscription_id = ${value}`)
        } else if (key === 'commit_confirmed_at') {
          setClauses.push(sql`commit_confirmed_at = ${value}`)
        } else if (key === 'reveal_confirmed_at') {
          setClauses.push(sql`reveal_confirmed_at = ${value}`)
        } else if (key === 'commit_last_checked_at') {
          setClauses.push(sql`commit_last_checked_at = ${value}`)
        } else if (key === 'reveal_last_checked_at') {
          setClauses.push(sql`reveal_last_checked_at = ${value}`)
        } else if (key === 'completed_at') {
          setClauses.push(sql`completed_at = ${value}`)
        }
      }
    }

    if (setClauses.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    // Build SET clause by combining all set clauses
    let setClause = setClauses[0]
    for (let i = 1; i < setClauses.length; i++) {
      setClause = sql`${setClause}, ${setClauses[i]}`
    }

    await sql`
      UPDATE mint_inscriptions
      SET ${setClause}
      WHERE id = ${transaction_id}
    `

    return NextResponse.json({ success: true, message: 'Transaction updated' })
  } catch (error: any) {
    console.error('Error updating transaction:', error)
    return NextResponse.json({ 
      error: 'Failed to update transaction',
      details: error.message 
    }, { status: 500 })
  }
}

/**
 * DELETE /api/admin/launchpad/transactions - Delete a mint transaction (admin only)
 */
export async function DELETE(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const adminWallet = searchParams.get('wallet_address')
    const transactionId = searchParams.get('transaction_id')

    if (!adminWallet || !isAdmin(adminWallet)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    if (!transactionId) {
      return NextResponse.json({ error: 'Transaction ID required' }, { status: 400 })
    }

    // Get transaction details before deletion
    const transactionResult = await sql`
      SELECT id, collection_id, ordinal_id, minter_wallet, mint_status, is_test_mint
      FROM mint_inscriptions
      WHERE id = ${transactionId}
    `
    const transaction = Array.isArray(transactionResult) ? transactionResult[0] : null

    if (!transaction) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    }

    // Only allow deleting transactions that haven't been completed or are test mints
    // For safety, we'll allow deletion of any transaction but log it
    const tAny = transaction as any
    if (tAny.mint_status === 'completed' && !tAny.is_test_mint) {
      // Warn but allow deletion
      console.warn(`[Admin Delete] Deleting completed transaction ${transactionId}`)
    }

    // Delete the transaction
    await sql`
      DELETE FROM mint_inscriptions
      WHERE id = ${transactionId}
    `

    // If there's an ordinal_id, mark it as not minted (make it available again)
    if (tAny.ordinal_id) {
      await sql`
        UPDATE generated_ordinals
        SET is_minted = false
        WHERE id = ${tAny.ordinal_id}
      `
    }

    return NextResponse.json({
      success: true,
      message: 'Transaction deleted successfully',
    })
  } catch (error: any) {
    console.error('Error deleting transaction:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete transaction' },
      { status: 500 }
    )
  }
}

