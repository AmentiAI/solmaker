import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { checkAuthorizationServer } from '@/lib/auth/access-control'

/**
 * GET /api/admin/launchpad/transactions - Get all Solana launchpad mint transactions
 * Queries solana_nft_mints table with filters
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

    if (!adminWallet) {
      return NextResponse.json({ error: 'Wallet address required' }, { status: 401 })
    }
    const authResult = await checkAuthorizationServer(adminWallet, sql)
    if (!authResult.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized. Admin access only.' }, { status: 403 })
    }

    // Build dynamic WHERE conditions
    let transactions
    let countResult

    if (collectionId && status && minterWallet) {
      transactions = await sql`
        SELECT
          sm.id, sm.collection_id, sm.candy_machine_address, sm.session_id, sm.phase_id,
          sm.ordinal_id, sm.nft_mint_address, sm.metadata_uri, sm.token_account,
          sm.minter_wallet, sm.mint_tx_signature,
          sm.mint_price_lamports, sm.platform_fee_lamports, sm.total_paid_lamports,
          sm.mint_status, sm.error_message, sm.retry_count,
          sm.created_at, sm.confirmed_at, sm.updated_at,
          c.name as collection_name,
          mp.phase_name
        FROM solana_nft_mints sm
        JOIN collections c ON sm.collection_id = c.id
        LEFT JOIN mint_phases mp ON sm.phase_id = mp.id
        WHERE sm.collection_id = ${collectionId}::uuid
          AND sm.mint_status = ${status}
          AND sm.minter_wallet = ${minterWallet}
        ORDER BY sm.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      ` as any[]
      countResult = await sql`
        SELECT COUNT(*) as count FROM solana_nft_mints sm
        WHERE sm.collection_id = ${collectionId}::uuid
          AND sm.mint_status = ${status}
          AND sm.minter_wallet = ${minterWallet}
      ` as any[]
    } else if (collectionId && status) {
      transactions = await sql`
        SELECT
          sm.id, sm.collection_id, sm.candy_machine_address, sm.session_id, sm.phase_id,
          sm.ordinal_id, sm.nft_mint_address, sm.metadata_uri, sm.token_account,
          sm.minter_wallet, sm.mint_tx_signature,
          sm.mint_price_lamports, sm.platform_fee_lamports, sm.total_paid_lamports,
          sm.mint_status, sm.error_message, sm.retry_count,
          sm.created_at, sm.confirmed_at, sm.updated_at,
          c.name as collection_name,
          mp.phase_name
        FROM solana_nft_mints sm
        JOIN collections c ON sm.collection_id = c.id
        LEFT JOIN mint_phases mp ON sm.phase_id = mp.id
        WHERE sm.collection_id = ${collectionId}::uuid
          AND sm.mint_status = ${status}
        ORDER BY sm.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      ` as any[]
      countResult = await sql`
        SELECT COUNT(*) as count FROM solana_nft_mints sm
        WHERE sm.collection_id = ${collectionId}::uuid AND sm.mint_status = ${status}
      ` as any[]
    } else if (collectionId && minterWallet) {
      transactions = await sql`
        SELECT
          sm.id, sm.collection_id, sm.candy_machine_address, sm.session_id, sm.phase_id,
          sm.ordinal_id, sm.nft_mint_address, sm.metadata_uri, sm.token_account,
          sm.minter_wallet, sm.mint_tx_signature,
          sm.mint_price_lamports, sm.platform_fee_lamports, sm.total_paid_lamports,
          sm.mint_status, sm.error_message, sm.retry_count,
          sm.created_at, sm.confirmed_at, sm.updated_at,
          c.name as collection_name,
          mp.phase_name
        FROM solana_nft_mints sm
        JOIN collections c ON sm.collection_id = c.id
        LEFT JOIN mint_phases mp ON sm.phase_id = mp.id
        WHERE sm.collection_id = ${collectionId}::uuid
          AND sm.minter_wallet = ${minterWallet}
        ORDER BY sm.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      ` as any[]
      countResult = await sql`
        SELECT COUNT(*) as count FROM solana_nft_mints sm
        WHERE sm.collection_id = ${collectionId}::uuid AND sm.minter_wallet = ${minterWallet}
      ` as any[]
    } else if (status && minterWallet) {
      transactions = await sql`
        SELECT
          sm.id, sm.collection_id, sm.candy_machine_address, sm.session_id, sm.phase_id,
          sm.ordinal_id, sm.nft_mint_address, sm.metadata_uri, sm.token_account,
          sm.minter_wallet, sm.mint_tx_signature,
          sm.mint_price_lamports, sm.platform_fee_lamports, sm.total_paid_lamports,
          sm.mint_status, sm.error_message, sm.retry_count,
          sm.created_at, sm.confirmed_at, sm.updated_at,
          c.name as collection_name,
          mp.phase_name
        FROM solana_nft_mints sm
        JOIN collections c ON sm.collection_id = c.id
        LEFT JOIN mint_phases mp ON sm.phase_id = mp.id
        WHERE sm.mint_status = ${status}
          AND sm.minter_wallet = ${minterWallet}
        ORDER BY sm.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      ` as any[]
      countResult = await sql`
        SELECT COUNT(*) as count FROM solana_nft_mints sm
        WHERE sm.mint_status = ${status} AND sm.minter_wallet = ${minterWallet}
      ` as any[]
    } else if (collectionId) {
      transactions = await sql`
        SELECT
          sm.id, sm.collection_id, sm.candy_machine_address, sm.session_id, sm.phase_id,
          sm.ordinal_id, sm.nft_mint_address, sm.metadata_uri, sm.token_account,
          sm.minter_wallet, sm.mint_tx_signature,
          sm.mint_price_lamports, sm.platform_fee_lamports, sm.total_paid_lamports,
          sm.mint_status, sm.error_message, sm.retry_count,
          sm.created_at, sm.confirmed_at, sm.updated_at,
          c.name as collection_name,
          mp.phase_name
        FROM solana_nft_mints sm
        JOIN collections c ON sm.collection_id = c.id
        LEFT JOIN mint_phases mp ON sm.phase_id = mp.id
        WHERE sm.collection_id = ${collectionId}::uuid
        ORDER BY sm.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      ` as any[]
      countResult = await sql`
        SELECT COUNT(*) as count FROM solana_nft_mints sm
        WHERE sm.collection_id = ${collectionId}::uuid
      ` as any[]
    } else if (status) {
      transactions = await sql`
        SELECT
          sm.id, sm.collection_id, sm.candy_machine_address, sm.session_id, sm.phase_id,
          sm.ordinal_id, sm.nft_mint_address, sm.metadata_uri, sm.token_account,
          sm.minter_wallet, sm.mint_tx_signature,
          sm.mint_price_lamports, sm.platform_fee_lamports, sm.total_paid_lamports,
          sm.mint_status, sm.error_message, sm.retry_count,
          sm.created_at, sm.confirmed_at, sm.updated_at,
          c.name as collection_name,
          mp.phase_name
        FROM solana_nft_mints sm
        JOIN collections c ON sm.collection_id = c.id
        LEFT JOIN mint_phases mp ON sm.phase_id = mp.id
        WHERE sm.mint_status = ${status}
        ORDER BY sm.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      ` as any[]
      countResult = await sql`
        SELECT COUNT(*) as count FROM solana_nft_mints sm WHERE sm.mint_status = ${status}
      ` as any[]
    } else if (minterWallet) {
      transactions = await sql`
        SELECT
          sm.id, sm.collection_id, sm.candy_machine_address, sm.session_id, sm.phase_id,
          sm.ordinal_id, sm.nft_mint_address, sm.metadata_uri, sm.token_account,
          sm.minter_wallet, sm.mint_tx_signature,
          sm.mint_price_lamports, sm.platform_fee_lamports, sm.total_paid_lamports,
          sm.mint_status, sm.error_message, sm.retry_count,
          sm.created_at, sm.confirmed_at, sm.updated_at,
          c.name as collection_name,
          mp.phase_name
        FROM solana_nft_mints sm
        JOIN collections c ON sm.collection_id = c.id
        LEFT JOIN mint_phases mp ON sm.phase_id = mp.id
        WHERE sm.minter_wallet = ${minterWallet}
        ORDER BY sm.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      ` as any[]
      countResult = await sql`
        SELECT COUNT(*) as count FROM solana_nft_mints sm WHERE sm.minter_wallet = ${minterWallet}
      ` as any[]
    } else {
      transactions = await sql`
        SELECT
          sm.id, sm.collection_id, sm.candy_machine_address, sm.session_id, sm.phase_id,
          sm.ordinal_id, sm.nft_mint_address, sm.metadata_uri, sm.token_account,
          sm.minter_wallet, sm.mint_tx_signature,
          sm.mint_price_lamports, sm.platform_fee_lamports, sm.total_paid_lamports,
          sm.mint_status, sm.error_message, sm.retry_count,
          sm.created_at, sm.confirmed_at, sm.updated_at,
          c.name as collection_name,
          mp.phase_name
        FROM solana_nft_mints sm
        JOIN collections c ON sm.collection_id = c.id
        LEFT JOIN mint_phases mp ON sm.phase_id = mp.id
        ORDER BY sm.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      ` as any[]
      countResult = await sql`
        SELECT COUNT(*) as count FROM solana_nft_mints
      ` as any[]
    }

    const totalCount = parseInt(countResult?.[0]?.count || '0', 10)

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
      details: error.message,
    }, { status: 500 })
  }
}

/**
 * PATCH /api/admin/launchpad/transactions - Update a Solana mint transaction
 */
export async function PATCH(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const body = await request.json()
    const { wallet_address, transaction_id, updates } = body

    if (!wallet_address) {
      return NextResponse.json({ error: 'Wallet address required' }, { status: 401 })
    }
    const authResult = await checkAuthorizationServer(wallet_address, sql)
    if (!authResult.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized. Admin access only.' }, { status: 403 })
    }

    if (!transaction_id) {
      return NextResponse.json({ error: 'transaction_id is required' }, { status: 400 })
    }

    const allowedFields = [
      'mint_status', 'error_message', 'confirmed_at', 'mint_tx_signature',
      'nft_mint_address',
    ]

    const updateFields: Record<string, any> = {}
    for (const [key, value] of Object.entries(updates || {})) {
      if (allowedFields.includes(key)) {
        updateFields[key] = value
      }
    }

    if (Object.keys(updateFields).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    // Build SET clause
    const setClauses: any[] = []
    for (const [key, value] of Object.entries(updateFields)) {
      if (value === null) {
        if (key === 'mint_status') setClauses.push(sql`mint_status = NULL`)
        else if (key === 'error_message') setClauses.push(sql`error_message = NULL`)
        else if (key === 'confirmed_at') setClauses.push(sql`confirmed_at = NULL`)
        else if (key === 'mint_tx_signature') setClauses.push(sql`mint_tx_signature = NULL`)
        else if (key === 'nft_mint_address') setClauses.push(sql`nft_mint_address = NULL`)
      } else {
        if (key === 'mint_status') setClauses.push(sql`mint_status = ${value}`)
        else if (key === 'error_message') setClauses.push(sql`error_message = ${value}`)
        else if (key === 'confirmed_at') setClauses.push(sql`confirmed_at = ${value}`)
        else if (key === 'mint_tx_signature') setClauses.push(sql`mint_tx_signature = ${value}`)
        else if (key === 'nft_mint_address') setClauses.push(sql`nft_mint_address = ${value}`)
      }
    }

    if (setClauses.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    let setClause = setClauses[0]
    for (let i = 1; i < setClauses.length; i++) {
      setClause = sql`${setClause}, ${setClauses[i]}`
    }

    await sql`
      UPDATE solana_nft_mints
      SET ${setClause}
      WHERE id = ${transaction_id}
    `

    return NextResponse.json({ success: true, message: 'Transaction updated' })
  } catch (error: any) {
    console.error('Error updating transaction:', error)
    return NextResponse.json({
      error: 'Failed to update transaction',
      details: error.message,
    }, { status: 500 })
  }
}

/**
 * DELETE /api/admin/launchpad/transactions - Delete a Solana mint transaction
 */
export async function DELETE(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const adminWallet = searchParams.get('wallet_address')
    const transactionId = searchParams.get('transaction_id')

    if (!adminWallet) {
      return NextResponse.json({ error: 'Wallet address required' }, { status: 401 })
    }
    const authResult = await checkAuthorizationServer(adminWallet, sql)
    if (!authResult.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized. Admin access only.' }, { status: 403 })
    }

    if (!transactionId) {
      return NextResponse.json({ error: 'Transaction ID required' }, { status: 400 })
    }

    const txResult = await sql`
      SELECT id, collection_id, ordinal_id, minter_wallet, mint_status, phase_id
      FROM solana_nft_mints
      WHERE id = ${transactionId}
    ` as any[]
    const transaction = txResult?.[0]

    if (!transaction) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    }

    // If confirmed, warn but allow
    if (transaction.mint_status === 'confirmed') {
      console.warn(`[Admin Delete] Deleting confirmed Solana mint ${transactionId}`)
    }

    // Decrement phase_minted if applicable
    if (transaction.phase_id && transaction.mint_status !== 'failed' && transaction.mint_status !== 'cancelled') {
      await sql`
        UPDATE mint_phases SET phase_minted = GREATEST(0, COALESCE(phase_minted, 0) - 1)
        WHERE id = ${transaction.phase_id}
      `
    }

    await sql`DELETE FROM solana_nft_mints WHERE id = ${transactionId}`

    // Mark ordinal as not minted if applicable
    if (transaction.ordinal_id) {
      await sql`
        UPDATE generated_ordinals SET is_minted = false WHERE id = ${transaction.ordinal_id}
      `
    }

    return NextResponse.json({ success: true, message: 'Transaction deleted successfully' })
  } catch (error: any) {
    console.error('Error deleting transaction:', error)
    return NextResponse.json({ error: error.message || 'Failed to delete transaction' }, { status: 500 })
  }
}
