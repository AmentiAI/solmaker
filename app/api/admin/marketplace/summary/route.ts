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
    // Get summary statistics
    const [salesStats, listingStats, pendingStats, sellerStats, buyerStats] = await Promise.all([
      // Total completed sales and volume
      sql`
        SELECT 
          COUNT(*) as total_sales,
          COALESCE(SUM(price_credits), 0) as total_credits_volume,
          COALESCE(SUM(CAST(btc_amount AS DECIMAL)), 0) as total_btc_volume
        FROM marketplace_transactions
        WHERE status = 'completed'
      `,
      // Active listings count
      sql`
        SELECT COUNT(*) as active_listings
        FROM collection_marketplace_listings
        WHERE status = 'active'
      `,
      // Pending payments count
      sql`
        SELECT COUNT(*) as pending_payments
        FROM marketplace_pending_payments
        WHERE status = 'pending'
      `,
      // Unique sellers
      sql`
        SELECT COUNT(DISTINCT seller_wallet) as unique_sellers
        FROM marketplace_transactions
        WHERE status = 'completed'
      `,
      // Unique buyers
      sql`
        SELECT COUNT(DISTINCT buyer_wallet) as unique_buyers
        FROM marketplace_transactions
        WHERE status = 'completed'
      `,
    ])

    const summary = {
      total_sales: parseInt((salesStats as any[])[0]?.total_sales || '0'),
      total_credits_volume: parseFloat((salesStats as any[])[0]?.total_credits_volume || '0'),
      total_btc_volume: parseFloat((salesStats as any[])[0]?.total_btc_volume || '0'),
      active_listings: parseInt((listingStats as any[])[0]?.active_listings || '0'),
      pending_payments: parseInt((pendingStats as any[])[0]?.pending_payments || '0'),
      unique_sellers: parseInt((sellerStats as any[])[0]?.unique_sellers || '0'),
      unique_buyers: parseInt((buyerStats as any[])[0]?.unique_buyers || '0'),
    }

    return NextResponse.json(summary)
  } catch (error: any) {
    console.error('Error fetching marketplace summary:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

