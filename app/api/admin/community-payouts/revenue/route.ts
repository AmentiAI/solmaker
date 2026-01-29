import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { isAdmin } from '@/lib/auth/access-control'

const TOTAL_SUPPLY = 168 // Total supply of ordmaker collection

// Get platform fee from environment variable (in BTC) and convert to satoshis
function getPlatformFeeSats(): number {
  const mintFeeBtc = parseFloat(process.env.MINT_FEE || '0.00002500')
  return Math.round(mintFeeBtc * 100000000) // Convert BTC to satoshis
}

/**
 * GET /api/admin/community-payouts/revenue
 * Get total revenue since last payout (or all revenue if no payouts exist)
 */
export async function GET(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const adminWallet = searchParams.get('wallet_address')

    if (!adminWallet || !isAdmin(adminWallet)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Get the last payout timestamp
    // Priority: 1. Database record (source of truth), 2. Manual LAST_PAYOUT_DATE env var (fallback), 3. null (all revenue)
    let lastPayoutTime = null
    
    // First, check database (this is the source of truth that can be updated)
    try {
      const lastPayout = await sql`
        SELECT id, snapshot_taken_at, total_revenue_sats, payout_amount_sats, created_at
        FROM community_payouts
        ORDER BY snapshot_taken_at DESC, created_at DESC
        LIMIT 1
      ` as any[]
      const timestamp = lastPayout?.[0]?.snapshot_taken_at
      if (timestamp) {
        // Ensure timestamp is converted to ISO string format
        lastPayoutTime = timestamp instanceof Date ? timestamp.toISOString() : new Date(timestamp).toISOString()
        console.log(`[Revenue API] Using last payout date from database: ${lastPayoutTime}`)
        console.log(`[Revenue API] Payout ID: ${lastPayout[0].id}, Created: ${lastPayout[0].created_at}`)
      } else {
        console.log(`[Revenue API] No payout records found in database`)
      }
    } catch (tableError: any) {
      // Table might not exist yet - that's okay, we'll just get all revenue
      console.warn('community_payouts table might not exist yet:', tableError.message)
    }
    
    // If no database record found, check for manual override from environment variable (fallback only)
    if (!lastPayoutTime) {
      const manualLastPayoutDate = process.env.LAST_PAYOUT_DATE
      if (manualLastPayoutDate) {
        try {
          const manualDate = new Date(manualLastPayoutDate)
          if (!isNaN(manualDate.getTime())) {
            lastPayoutTime = manualDate.toISOString()
            console.log(`[Revenue API] Using manual last payout date from env (fallback): ${lastPayoutTime}`)
          } else {
            console.warn(`Invalid LAST_PAYOUT_DATE format: ${manualLastPayoutDate}`)
          }
        } catch (e) {
          console.warn(`Error parsing LAST_PAYOUT_DATE: ${e}`)
        }
      }
    } else {
      // Database value found - log if env var exists but is being ignored
      if (process.env.LAST_PAYOUT_DATE) {
        console.log(`[Revenue API] LAST_PAYOUT_DATE env var exists but is being ignored (database takes priority)`)
      }
    }

    // Get platform fee in satoshis from environment variable
    const platformFeeSats = getPlatformFeeSats()
    
    // Calculate revenue from completed mints since last payout
    // Revenue = platform fees collected per mint, NOT total mint prices paid
    // The platform earns the MINT_FEE amount per completed mint as a fee
    let revenueQuery
    if (lastPayoutTime) {
      revenueQuery = sql`
        SELECT 
          COUNT(DISTINCT CASE WHEN mi.mint_status = 'completed' AND mi.completed_at > ${lastPayoutTime} THEN mi.id END) as completed_mints
        FROM mint_inscriptions mi
        INNER JOIN collections c ON mi.collection_id = c.id
        WHERE mi.is_test_mint = false
          AND COALESCE(c.collection_status, 'draft') IN ('launchpad', 'launchpad_live')
      `
    } else {
      // No previous payout - get all revenue
      revenueQuery = sql`
        SELECT 
          COUNT(DISTINCT CASE WHEN mi.mint_status = 'completed' THEN mi.id END) as completed_mints
        FROM mint_inscriptions mi
        INNER JOIN collections c ON mi.collection_id = c.id
        WHERE mi.is_test_mint = false
          AND COALESCE(c.collection_status, 'draft') IN ('launchpad', 'launchpad_live')
      `
    }

    const revenueResult = await revenueQuery as any[]
    const revenueData = revenueResult?.[0] || {}

    // Handle BigInt values from PostgreSQL and calculate revenue
    // Revenue = number of completed mints × platform fee per mint
    const completedMints = Number(revenueData.completed_mints || 0)
    const mintRevenueSats = completedMints * platformFeeSats
    
    // Get credit purchase revenue since last payout
    let creditPurchaseRevenueSats = 0
    if (lastPayoutTime) {
      const creditPurchasesQuery = sql`
        SELECT 
          COALESCE(SUM(bitcoin_amount), 0) as total_btc
        FROM pending_payments
        WHERE status = 'completed'
          AND payment_txid IS NOT NULL
          AND created_at > ${lastPayoutTime}
      `
      const creditPurchasesResult = await creditPurchasesQuery as any[]
      const totalBtc = parseFloat(creditPurchasesResult?.[0]?.total_btc || '0')
      creditPurchaseRevenueSats = Math.round(totalBtc * 100000000) // Convert BTC to sats
    } else {
      // No previous payout - get all credit purchases
      const creditPurchasesQuery = sql`
        SELECT 
          COALESCE(SUM(bitcoin_amount), 0) as total_btc
        FROM pending_payments
        WHERE status = 'completed'
          AND payment_txid IS NOT NULL
      `
      const creditPurchasesResult = await creditPurchasesQuery as any[]
      const totalBtc = parseFloat(creditPurchasesResult?.[0]?.total_btc || '0')
      creditPurchaseRevenueSats = Math.round(totalBtc * 100000000) // Convert BTC to sats
    }
    
    // Calculate revenue from credit purchases:
    // 50% of credit purchases = revenue share
    // 30% of that 50% = payout amount (15% of total credit purchases)
    const creditPurchaseRevenueShare = Math.floor(creditPurchaseRevenueSats * 0.50) // 50% of credit purchases
    const creditPurchasePayoutSats = Math.floor(creditPurchaseRevenueShare * 0.30) // 30% of the 50% (15% total)
    
    // Total revenue = mint revenue + credit purchase revenue share
    const totalRevenueSats = mintRevenueSats + creditPurchaseRevenueShare
    
    // Total payout = 30% of mint revenue + 30% of 50% of credit purchases
    const mintPayoutSats = Math.floor(mintRevenueSats * 0.30)
    const payoutAmountSats = mintPayoutSats + creditPurchasePayoutSats

    return NextResponse.json({
      success: true,
      last_payout_at: lastPayoutTime,
      completed_mints: completedMints,
      mint_revenue_sats: mintRevenueSats,
      credit_purchase_revenue_sats: creditPurchaseRevenueSats,
      credit_purchase_revenue_share_sats: creditPurchaseRevenueShare, // 50% of credit purchases
      total_revenue_sats: totalRevenueSats, // mint revenue + 50% of credit purchases
      mint_payout_sats: mintPayoutSats, // 30% of mint revenue
      credit_purchase_payout_sats: creditPurchasePayoutSats, // 30% of 50% of credit purchases (15% total)
      payout_amount_sats: payoutAmountSats, // Total payout: 30% of mint revenue + 15% of credit purchases
      total_supply: TOTAL_SUPPLY,
    })
  } catch (error: any) {
    console.error('Error fetching revenue:', error)
    console.error('Error stack:', error.stack)
    return NextResponse.json({ 
      error: 'Failed to fetch revenue',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 })
  }
}

