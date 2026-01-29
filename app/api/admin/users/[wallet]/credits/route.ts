import { NextRequest, NextResponse } from 'next/server'

import { checkAuthorizationServer } from '@/lib/auth/access-control'
import { sql } from '@/lib/database';

// POST /api/admin/users/[wallet]/credits - Update user credit balance
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ wallet: string }> }
) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const { wallet } = await params
    const walletAddress = decodeURIComponent(wallet)
    const body = await request.json()
    const { admin_wallet_address, new_balance, reason } = body

    if (!admin_wallet_address) {
      return NextResponse.json({ error: 'Admin wallet address required' }, { status: 401 })
    }

    // Check admin authorization - pass wallet address directly since body is already read
    const authResult = await checkAuthorizationServer(admin_wallet_address, sql)
    if (!authResult.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized. Admin access only.' }, { status: 403 })
    }

    if (typeof new_balance !== 'number' || new_balance < 0) {
      return NextResponse.json({ error: 'Invalid balance. Must be a non-negative number.' }, { status: 400 })
    }

    // Get current balance
    const currentResult = await sql`
      SELECT credits FROM credits WHERE wallet_address = ${walletAddress} LIMIT 1
    ` as any[]
    
    const currentBalance = (Array.isArray(currentResult) && currentResult[0]?.credits) || 0
    
    // Ensure credits record exists
    await sql`
      INSERT INTO credits (wallet_address, credits, created_at, updated_at)
      VALUES (${walletAddress}, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (wallet_address) DO NOTHING
    `

    // Calculate difference
    const difference = parseFloat(String(new_balance)) - parseFloat(String(currentBalance))

    // Update balance
    await sql`
      UPDATE credits
      SET credits = ${new_balance}, updated_at = CURRENT_TIMESTAMP
      WHERE wallet_address = ${walletAddress}
    `

    // Record transaction for audit trail
    if (Math.abs(difference) > 0.0001) { // Only record if there's a meaningful change
      const transactionType = difference > 0 ? 'purchase' : 'usage'
      const description = reason || `Admin adjustment: ${difference > 0 ? '+' : ''}${difference.toFixed(2)} credits (Admin: ${admin_wallet_address.substring(0, 8)}...)`
      
      await sql`
        INSERT INTO credit_transactions (
          wallet_address,
          amount,
          transaction_type,
          description,
          payment_txid
        )
        VALUES (
          ${walletAddress},
          ${difference},
          ${transactionType},
          ${description},
          NULL
        )
      `
    }

    return NextResponse.json({
      success: true,
      message: `Credit balance updated successfully`,
      previous_balance: parseFloat(String(currentBalance)),
      new_balance: new_balance,
      difference: difference
    })
  } catch (error: any) {
    console.error('Error updating user credits:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to update credit balance' },
      { status: 500 }
    )
  }
}

