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
    // Simple query - get completed marketplace transactions with basic joins
    const transactions = await sql`
      SELECT 
        mt.id,
        mt.listing_id,
        mt.collection_id,
        mt.seller_wallet,
        mt.buyer_wallet,
        mt.price_credits,
        mt.payment_type,
        mt.btc_amount,
        mt.btc_txid,
        mt.status,
        mt.created_at,
        mt.completed_at,
        c.name as collection_name,
        c.description as collection_description,
        c.art_style,
        ml.title as listing_title,
        ml.description as listing_description
      FROM marketplace_transactions mt
      JOIN collections c ON c.id = mt.collection_id
      LEFT JOIN collection_marketplace_listings ml ON ml.id = mt.listing_id
      WHERE mt.status = 'completed'
      ORDER BY mt.completed_at DESC NULLS LAST, mt.created_at DESC
      LIMIT 100
    ` as any[]

    // Now fetch additional data separately for each transaction
    const enrichedTransactions = await Promise.all(
      transactions.map(async (tx) => {
        let ordinalCount = 0
        let sampleImages: string[] = []
        let promoImages: string[] = []

        try {
          // Get ordinal count
          const countResult = await sql!`
            SELECT COUNT(*)::int as count 
            FROM generated_ordinals 
            WHERE collection_id = ${tx.collection_id}
          ` as any[]
          ordinalCount = countResult[0]?.count || 0
        } catch (e) {
          // Ignore errors
        }

        try {
          // Get sample images
          const imagesResult = await sql!`
            SELECT thumbnail_url 
            FROM generated_ordinals 
            WHERE collection_id = ${tx.collection_id}
              AND thumbnail_url IS NOT NULL
            ORDER BY created_at DESC
            LIMIT 6
          ` as any[]
          sampleImages = imagesResult.map((r: any) => r.thumbnail_url).filter(Boolean)
        } catch (e) {
          // Ignore errors
        }

        try {
          // Get promo images
          const promoResult = await sql!`
            SELECT image_url 
            FROM promotions 
            WHERE collection_id = ${tx.collection_id}
              AND image_url IS NOT NULL
          ` as any[]
          promoImages = promoResult.map((r: any) => r.image_url).filter(Boolean)
        } catch (e) {
          // Ignore errors
        }

        return {
          ...tx,
          ordinal_count: ordinalCount,
          sample_images: sampleImages,
          promo_images: promoImages,
        }
      })
    )

    return NextResponse.json({ transactions: enrichedTransactions })
  } catch (error: any) {
    console.error('Error fetching marketplace sales:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
