import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'

const ORDMAKER_COLLECTION = 'ordmaker'
const TOTAL_SUPPLY = 168 // Current collection size

// Get platform fee from environment variable (in BTC) and convert to satoshis
function getPlatformFeeSats(): number {
  const mintFeeBtc = parseFloat(process.env.MINT_FEE || '0.00002500')
  return Math.round(mintFeeBtc * 100000000) // Convert BTC to satoshis
}

/**
 * GET /api/payouts/owed
 * Calculate what is currently owed to a wallet based on their ordmaker holdings
 */
export async function GET(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const walletAddress = searchParams.get('wallet_address')

    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 })
    }

    // Get the last payout timestamp
    // Priority: 1. Database record (source of truth), 2. Manual LAST_PAYOUT_DATE env var (fallback), 3. null (all revenue)
    let lastPayoutTime = null
    
    // First, check database (source of truth)
    try {
      const lastPayout = await sql`
        SELECT snapshot_taken_at
        FROM community_payouts
        ORDER BY snapshot_taken_at DESC
        LIMIT 1
      ` as any[]
      const timestamp = lastPayout?.[0]?.snapshot_taken_at
      if (timestamp) {
        // Ensure timestamp is converted to ISO string format
        lastPayoutTime = timestamp instanceof Date ? timestamp.toISOString() : new Date(timestamp).toISOString()
        console.log(`[Owed API] Using last payout date from database: ${lastPayoutTime}`)
      }
    } catch (tableError: any) {
      // Table might not exist yet - that's okay
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
            console.log(`[Owed API] Using manual last payout date from env (fallback): ${lastPayoutTime}`)
          } else {
            console.warn(`Invalid LAST_PAYOUT_DATE format: ${manualLastPayoutDate}`)
          }
        } catch (e) {
          console.warn(`Error parsing LAST_PAYOUT_DATE: ${e}`)
        }
      }
    }

    // Calculate unpaid revenue (revenue since last payout)
    const platformFeeSats = getPlatformFeeSats()
    
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
    const completedMints = Number(revenueData.completed_mints || 0)
    const totalRevenueSats = completedMints * platformFeeSats
    
    // Calculate 30% payout amount (what will be distributed)
    const unpaidPayoutAmountSats = Math.floor(totalRevenueSats * 0.30)

    // Fetch user's ordmaker count from Magic Eden API
    const apiKey = process.env.MAGIC_EDEN_API_KEY
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'OrdMaker/1.0',
    }

    if (apiKey) {
      headers['X-API-Key'] = apiKey
      headers['Authorization'] = `Bearer ${apiKey}`
    }

    let ordmakerCount = 0
    let offset = 0
    const limit = 100
    let hasMore = true

    console.log(`🔍 Fetching ordmaker count for wallet: ${walletAddress}`)

    // Paginate through all pieces to find user's holdings
    while (hasMore) {
      try {
        const params = new URLSearchParams({
          collectionSymbol: ORDMAKER_COLLECTION,
          limit: limit.toString(),
          offset: offset.toString(),
        })

        let url = `https://api-mainnet.magiceden.dev/v2/ord/btc/collections/${ORDMAKER_COLLECTION}/tokens?${params.toString()}`
        let response = await fetch(url, { headers })

        if (!response.ok) {
          url = `https://api-mainnet.magiceden.dev/v2/ord/btc/tokens?collectionSymbol=${ORDMAKER_COLLECTION}&limit=${limit}&offset=${offset}`
          response = await fetch(url, { headers })
        }

        if (!response.ok) {
          if (response.status === 404) {
            url = `https://api-mainnet.magiceden.dev/v2/ord/btc/collections/${ORDMAKER_COLLECTION}?limit=${limit}&offset=${offset}`
            response = await fetch(url, { headers })
          }

          if (!response.ok) {
            const errorText = await response.text()
            throw new Error(`Magic Eden API error: ${response.status} - ${errorText}`)
          }
        }

        const data = await response.json()
        
        let tokens: any[] = []
        if (Array.isArray(data)) {
          tokens = data
        } else if (data.tokens && Array.isArray(data.tokens)) {
          tokens = data.tokens
        } else if (data.items && Array.isArray(data.items)) {
          tokens = data.items
        }

        // Count tokens owned by this wallet
        for (const token of tokens) {
          const ownerAddress = token.owner || token.ownerAddress || token.currentOwner || token.owner_address
          
          if (ownerAddress && typeof ownerAddress === 'string' && ownerAddress.toLowerCase() === walletAddress.toLowerCase()) {
            ordmakerCount++
          }
        }

        // Check if there are more pages
        if (tokens.length < limit) {
          hasMore = false
        } else {
          offset += limit
          // Safety limit to prevent infinite loops
          if (offset >= 10000) {
            hasMore = false
          }
        }
      } catch (error: any) {
        console.error(`Error fetching ordmaker count (offset ${offset}):`, error)
        // Continue with what we have
        hasMore = false
      }
    }

    // Calculate what's owed: (unpaid_payout_amount / total_supply) * user_ordmaker_count
    const satsOwed = ordmakerCount > 0 
      ? Math.floor((unpaidPayoutAmountSats / TOTAL_SUPPLY) * ordmakerCount)
      : 0

    const sharePercentage = ordmakerCount > 0 
      ? (ordmakerCount / TOTAL_SUPPLY) * 100
      : 0

    return NextResponse.json({
      success: true,
      wallet_address: walletAddress,
      ordmaker_count: ordmakerCount,
      total_supply: TOTAL_SUPPLY,
      share_percentage: sharePercentage,
      unpaid_revenue_sats: totalRevenueSats,
      unpaid_payout_amount_sats: unpaidPayoutAmountSats, // 30% of unpaid revenue
      sats_owed: satsOwed,
      last_payout_at: lastPayoutTime,
    })
  } catch (error: any) {
    console.error('Error calculating owed amount:', error)
    return NextResponse.json({ 
      error: 'Failed to calculate owed amount',
      details: error.message 
    }, { status: 500 })
  }
}

