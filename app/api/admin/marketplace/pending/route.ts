import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { checkAuthorizationServer } from '@/lib/auth/access-control'

export async function GET(req: NextRequest) {
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
    const payments = await sql`
      SELECT 
        mpp.id,
        mpp.listing_id,
        mpp.buyer_wallet,
        mpp.seller_wallet,
        mpp.btc_amount,
        mpp.btc_amount_sats,
        mpp.payment_address,
        mpp.payment_txid,
        mpp.confirmations,
        mpp.status,
        mpp.created_at,
        mpp.expires_at,
        ml.title as listing_title,
        c.name as collection_name
      FROM marketplace_pending_payments mpp
      JOIN collection_marketplace_listings ml ON mpp.listing_id = ml.id
      JOIN collections c ON ml.collection_id = c.id
      WHERE mpp.status = 'pending'
      ORDER BY mpp.created_at DESC
      LIMIT 100
    ` as any[]

    return NextResponse.json({ payments })
  } catch (error: any) {
    console.error('Error fetching pending payments:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

