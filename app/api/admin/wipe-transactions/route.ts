import { NextRequest, NextResponse } from 'next/server'

import { checkAuthorizationServer } from '@/lib/auth/access-control'
import { sql } from '@/lib/database';

// POST /api/admin/wipe-transactions - Wipe all transactions
export async function POST(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const body = await request.json()
    const { wallet_address } = body

    if (!wallet_address) {
      return NextResponse.json({ error: 'Wallet address required' }, { status: 401 })
    }

    // Check admin authorization
    const authResult = await checkAuthorizationServer(request, sql)
    if (!authResult.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized. Admin access only.' }, { status: 403 })
    }

    // Get counts before deletion
    const pendingCount = await sql`
      SELECT COUNT(*) as count FROM pending_payments
    ` as any[]
    const creditTxCount = await sql`
      SELECT COUNT(*) as count FROM credit_transactions
    ` as any[]

    const pendingCountNum = (Array.isArray(pendingCount) && pendingCount[0]?.count) || 0
    const creditTxCountNum = (Array.isArray(creditTxCount) && creditTxCount[0]?.count) || 0

    // Delete all transactions
    await sql`DELETE FROM pending_payments`
    await sql`DELETE FROM credit_transactions`

    return NextResponse.json({
      success: true,
      message: `Wiped all transactions successfully`,
      deleted: {
        pending_payments: pendingCountNum,
        credit_transactions: creditTxCountNum
      }
    })
  } catch (error: any) {
    console.error('Error wiping transactions:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to wipe transactions' },
      { status: 500 }
    )
  }
}

