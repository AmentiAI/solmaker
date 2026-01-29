import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { isAdmin } from '@/lib/auth/access-control'

/**
 * POST /api/admin/launchpad/transactions/fix-commit-value - Fix missing commit_output_value
 * Recovers commit_output_value from reveal_data if it's NULL
 */
export async function POST(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const body = await request.json()
    const { wallet_address, transaction_id } = body

    if (!wallet_address || !isAdmin(wallet_address)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    if (!transaction_id) {
      return NextResponse.json({ error: 'transaction_id is required' }, { status: 400 })
    }

    // Get the transaction with reveal_data
    const transactionResult = await sql`
      SELECT id, commit_output_value, reveal_data
      FROM mint_inscriptions
      WHERE id = ${transaction_id}
    ` as any[]
    const transaction = transactionResult?.[0]

    if (!transaction) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    }

    // If commit_output_value already exists, no need to fix
    if (transaction.commit_output_value != null && transaction.commit_output_value > 0) {
      return NextResponse.json({ 
        success: true, 
        commit_output_value: transaction.commit_output_value,
        message: 'Commit output value already exists'
      })
    }

    // Try to recover from reveal_data
    const revealData = transaction.reveal_data
    let recoveredValue: number | null = null

    if (revealData?.commitOutputValue != null) {
      recoveredValue = typeof revealData.commitOutputValue === 'string' 
        ? parseInt(revealData.commitOutputValue, 10) 
        : Number(revealData.commitOutputValue)
    }

    if (recoveredValue == null || isNaN(recoveredValue) || recoveredValue <= 0) {
      return NextResponse.json({ 
        error: 'Cannot recover commit output value',
        details: 'commitOutputValue not found in reveal_data or is invalid'
      }, { status: 400 })
    }

    // Update the database
    await sql`
      UPDATE mint_inscriptions
      SET commit_output_value = ${recoveredValue}
      WHERE id = ${transaction_id}
    `

    return NextResponse.json({ 
      success: true, 
      commit_output_value: recoveredValue,
      message: 'Commit output value recovered from reveal_data'
    })
  } catch (error: any) {
    console.error('Error fixing commit output value:', error)
    return NextResponse.json({ 
      error: 'Failed to fix commit output value',
      details: error.message 
    }, { status: 500 })
  }
}

