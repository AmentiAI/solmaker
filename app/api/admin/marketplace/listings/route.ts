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
    const listings = await sql`
      SELECT 
        ml.id,
        ml.collection_id,
        ml.seller_wallet,
        ml.price_credits,
        ml.price_btc,
        ml.payment_type,
        ml.title,
        ml.description,
        ml.status,
        ml.created_at,
        c.name as collection_name,
        (SELECT COUNT(*) FROM generated_ordinals WHERE collection_id = ml.collection_id) as ordinal_count,
        (
          SELECT thumbnail_url 
          FROM generated_ordinals 
          WHERE collection_id = ml.collection_id 
            AND thumbnail_url IS NOT NULL
          ORDER BY created_at DESC
          LIMIT 1
        ) as sample_image
      FROM collection_marketplace_listings ml
      JOIN collections c ON ml.collection_id = c.id
      WHERE ml.status = 'active'
      ORDER BY ml.created_at DESC
      LIMIT 100
    ` as any[]

    return NextResponse.json({ listings })
  } catch (error: any) {
    console.error('Error fetching listings:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

