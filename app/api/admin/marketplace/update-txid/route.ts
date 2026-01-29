import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { checkAuthorizationServer } from '@/lib/auth/access-control'

export async function POST(req: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database not available' }, { status: 500 })
  }

  const walletAddress = req.nextUrl.searchParams.get('wallet_address')
  
  if (!walletAddress) {
    return NextResponse.json({ error: 'Wallet address required' }, { status: 401 })
  }

  const authResult = await checkAuthorizationServer(req, sql)
  if (!authResult.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized. Admin access only.' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { payment_id, txid } = body

    if (!payment_id || !txid) {
      return NextResponse.json({ error: 'payment_id and txid are required' }, { status: 400 })
    }

    // Validate txid format (should be 64 hex characters)
    const txidClean = txid.trim().toLowerCase()
    if (!/^[a-f0-9]{64}$/.test(txidClean)) {
      return NextResponse.json({ error: 'Invalid txid format. Must be 64 hex characters.' }, { status: 400 })
    }

    // Update the pending payment with the txid
    const result = await sql`
      UPDATE marketplace_pending_payments
      SET payment_txid = ${txidClean}
      WHERE id = ${payment_id}
      RETURNING id, payment_txid
    ` as any[]

    if (result.length === 0) {
      return NextResponse.json({ error: 'Pending payment not found' }, { status: 404 })
    }

    console.log(`[Admin] Updated payment ${payment_id} with txid ${txidClean}`)

    return NextResponse.json({ 
      success: true, 
      message: 'Transaction ID updated successfully',
      payment_id: result[0].id,
      txid: result[0].payment_txid
    })
  } catch (error: any) {
    console.error('Error updating txid:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

