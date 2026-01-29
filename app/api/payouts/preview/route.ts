import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'

const TOTAL_SUPPLY = 168

// Get platform fee from environment variable (in BTC) and convert to satoshis
function getPlatformFeeSats(): number {
  const mintFeeBtc = parseFloat(process.env.MINT_FEE || '0.00002500')
  return Math.round(mintFeeBtc * 100000000) // Convert BTC to satoshis
}

/**
 * GET /api/payouts/preview
 * Get a LIVE preview of what the user would receive in the NEXT payout
 * This uses the same logic as the admin community payouts page
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

    // Get user's profile to find their payment address (watching wallet)
    const profile = await sql`
      SELECT wallet_address, payment_address, opt_in
      FROM profiles
      WHERE wallet_address = ${walletAddress}
      LIMIT 1
    ` as any[]

    if (!profile || profile.length === 0) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    const userProfile = profile[0]
    const watchingWallet = userProfile.payment_address || userProfile.wallet_address

    // Check if user is opted in
    if (!userProfile.opt_in) {
      return NextResponse.json({
        success: true,
        opted_in: false,
        wallet_address: walletAddress,
        watching_wallet: watchingWallet,
        message: 'You must opt-in to receive payouts'
      })
    }

    // Step 1: Get current revenue data (SAME LOGIC AS ADMIN)
    // Get the last payout timestamp
    const lastPayoutResult = await sql`
      SELECT snapshot_taken_at as last_payout_at
      FROM community_payouts
      ORDER BY snapshot_taken_at DESC, created_at DESC
      LIMIT 1
    ` as any[]
    
    const lastPayoutAt = lastPayoutResult[0]?.last_payout_at || null
    const platformFeeSats = getPlatformFeeSats()

    // Get completed mints since last payout (SAME QUERY AS ADMIN)
    let completedMints = 0
    if (lastPayoutAt) {
      const mintRevenueResult = await sql`
        SELECT 
          COUNT(DISTINCT CASE WHEN mi.mint_status = 'completed' AND mi.completed_at > ${lastPayoutAt} THEN mi.id END) as completed_mints
        FROM mint_inscriptions mi
        INNER JOIN collections c ON mi.collection_id = c.id
        WHERE mi.is_test_mint = false
          AND COALESCE(c.collection_status, 'draft') IN ('launchpad', 'launchpad_live')
      ` as any[]
      completedMints = Number(mintRevenueResult?.[0]?.completed_mints || 0)
    } else {
      const mintRevenueResult = await sql`
        SELECT 
          COUNT(DISTINCT CASE WHEN mi.mint_status = 'completed' THEN mi.id END) as completed_mints
        FROM mint_inscriptions mi
        INNER JOIN collections c ON mi.collection_id = c.id
        WHERE mi.is_test_mint = false
          AND COALESCE(c.collection_status, 'draft') IN ('launchpad', 'launchpad_live')
      ` as any[]
      completedMints = Number(mintRevenueResult?.[0]?.completed_mints || 0)
    }

    const mintRevenueSats = completedMints * platformFeeSats
    const mintPayoutSats = Math.floor(mintRevenueSats * 0.30) // 30% of mint revenue

    // Get credit purchases since last payout (SAME QUERY AS ADMIN)
    let creditPurchaseRevenueSats = 0
    if (lastPayoutAt) {
      const creditRevenueResult = await sql`
        SELECT 
          COALESCE(SUM(bitcoin_amount), 0) as total_btc
        FROM pending_payments
        WHERE status = 'completed'
          AND payment_txid IS NOT NULL
          AND created_at > ${lastPayoutAt}
      ` as any[]
      const totalBtc = parseFloat(creditRevenueResult?.[0]?.total_btc || '0')
      creditPurchaseRevenueSats = Math.round(totalBtc * 100000000)
    } else {
      const creditRevenueResult = await sql`
        SELECT 
          COALESCE(SUM(bitcoin_amount), 0) as total_btc
        FROM pending_payments
        WHERE status = 'completed'
          AND payment_txid IS NOT NULL
      ` as any[]
      const totalBtc = parseFloat(creditRevenueResult?.[0]?.total_btc || '0')
      creditPurchaseRevenueSats = Math.round(totalBtc * 100000000)
    }

    // Calculate revenue from credit purchases (SAME AS ADMIN):
    // 50% of credit purchases = revenue share
    // 30% of that 50% = payout amount (15% of total credit purchases)
    const creditRevenueShare = Math.floor(creditPurchaseRevenueSats * 0.50)
    const creditPayoutSats = Math.floor(creditRevenueShare * 0.30)

    const totalRevenueSats = mintRevenueSats + creditRevenueShare
    const totalPayoutSats = mintPayoutSats + creditPayoutSats

    // Step 2: Fetch current holders from Magic Eden
    // Use same pagination logic as admin
    const ORDMAKER_COLLECTION = 'ordmaker'
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

    // Map to track wallet addresses and their ordmaker counts
    const holderMap = new Map<string, number>()
    let offset = 0
    const limit = 100
    let hasMore = true
    let totalFetched = 0

    console.log(`[Payout Preview] Fetching all holders from ordmaker collection...`)

    // Paginate through all pieces in the collection
    while (hasMore) {
      try {
        // Try the collection tokens endpoint first
        let url = `https://api-mainnet.magiceden.dev/v2/ord/btc/collections/${ORDMAKER_COLLECTION}/tokens?collectionSymbol=${ORDMAKER_COLLECTION}&limit=${limit}&offset=${offset}`
        let response = await fetch(url, { headers })

        // If that doesn't work, try alternative endpoint
        if (!response.ok) {
          url = `https://api-mainnet.magiceden.dev/v2/ord/btc/tokens?collectionSymbol=${ORDMAKER_COLLECTION}&limit=${limit}&offset=${offset}`
          response = await fetch(url, { headers })
        }

        if (!response.ok) {
          const errorText = await response.text()
          console.error(`[Payout Preview] Magic Eden API error (offset ${offset}):`, response.status)
          
          // If we've fetched some data, continue with what we have
          if (holderMap.size > 0) {
            console.warn('[Payout Preview] Continuing with partial data...')
            break
          }
          
          return NextResponse.json({
            error: 'Failed to fetch current holders from Magic Eden',
            details: `Status: ${response.status} - ${errorText.substring(0, 200)}`
          }, { status: 500 })
        }

        const data = await response.json()
        
        // Handle different response formats
        let tokens: any[] = []
        if (Array.isArray(data)) {
          tokens = data
        } else if (data.tokens && Array.isArray(data.tokens)) {
          tokens = data.tokens
        } else if (data.items && Array.isArray(data.items)) {
          tokens = data.items
        }

        console.log(`[Payout Preview] Fetched ${tokens.length} pieces (offset: ${offset})`)

        // Process each token to extract wallet address
        for (const token of tokens) {
          const ownerAddress = token.owner || token.ownerAddress || token.currentOwner || token.owner_address
          
          if (ownerAddress && typeof ownerAddress === 'string') {
            const currentCount = holderMap.get(ownerAddress) || 0
            holderMap.set(ownerAddress, currentCount + 1)
          }
        }

        totalFetched += tokens.length

        // Check if there are more results
        hasMore = tokens.length === limit

        // Safety limit
        if (totalFetched >= 10000) {
          console.log(`[Payout Preview] Reached safety limit of 10,000 pieces`)
          hasMore = false
        }

        if (hasMore) {
          offset += limit
          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 100))
        }
      } catch (fetchError: any) {
        console.error(`[Payout Preview] Error fetching batch at offset ${offset}:`, fetchError)
        if (holderMap.size > 0) {
          console.warn('[Payout Preview] Continuing with partial data...')
          break
        }
        return NextResponse.json({
          error: 'Failed to fetch current holders',
          details: fetchError.message
        }, { status: 500 })
      }
    }

    // Convert map to array
    const holders = Array.from(holderMap.entries()).map(([wallet_address, count]) => ({
      wallet_address,
      count,
    }))
    
    const totalOrdmakers = holders.reduce((sum, h) => sum + h.count, 0)
    console.log(`[Payout Preview] Fetched ${holders.length} unique holders, ${totalOrdmakers} total ordmakers`)

    // Step 3: Get opted-in profiles for all holders
    const holderAddresses = holders.map(h => h.wallet_address)
    
    const profilesResult = await sql`
      SELECT wallet_address, payment_address, opt_in
      FROM profiles
      WHERE payment_address = ANY(${holderAddresses})
         OR wallet_address = ANY(${holderAddresses})
    ` as any[]

    // Create maps for lookup
    const optInByWallet = new Map<string, boolean>()
    const paymentToProfile = new Map<string, { wallet_address: string; opt_in: boolean }>()
    
    for (const p of profilesResult) {
      optInByWallet.set(p.wallet_address.toLowerCase(), p.opt_in === true)
      if (p.payment_address) {
        paymentToProfile.set(p.payment_address.toLowerCase(), {
          wallet_address: p.wallet_address,
          opt_in: p.opt_in === true
        })
      }
    }

    // Step 4: Filter to opted-in holders and calculate payouts
    const optedInHolders: { wallet_address: string; count: number; amount_sats: number; share: number }[] = []
    let totalOptedInOrdmakers = 0
    
    for (const holder of holders) {
      // Check if this holder is opted in (either by payment_address or wallet_address)
      const holderLower = holder.wallet_address.toLowerCase()
      const profileByPayment = paymentToProfile.get(holderLower)
      const isOptedIn = profileByPayment?.opt_in || optInByWallet.get(holderLower) || false
      
      if (isOptedIn) {
        const share = holder.count / TOTAL_SUPPLY
        const amountSats = Math.floor(totalPayoutSats * share)
        optedInHolders.push({
          wallet_address: holder.wallet_address,
          count: holder.count,
          amount_sats: amountSats,
          share,
        })
        totalOptedInOrdmakers += holder.count
      }
    }

    // Step 5: Find the current user in the opted-in holders
    const watchingWalletLower = watchingWallet.toLowerCase()
    const walletAddressLower = walletAddress.toLowerCase()
    
    let userHolder = optedInHolders.find(h => h.wallet_address.toLowerCase() === watchingWalletLower)
    if (!userHolder) {
      userHolder = optedInHolders.find(h => h.wallet_address.toLowerCase() === walletAddressLower)
    }

    if (!userHolder) {
      // User is opted in but doesn't hold any ordmakers at the watched address
      return NextResponse.json({
        success: true,
        opted_in: true,
        in_preview: false,
        wallet_address: walletAddress,
        watching_wallet: watchingWallet,
        preview_data: {
          total_revenue_sats: totalRevenueSats,
          payout_amount_sats: totalPayoutSats,
          total_holders: optedInHolders.length,
          total_ordmakers: totalOptedInOrdmakers,
          last_payout_at: lastPayoutAt,
        },
        user_data: {
          ordmaker_count: 0,
          amount_sats: 0,
          share_percentage: 0,
        },
        message: `Your watching wallet (${watchingWallet.substring(0, 10)}...) does not currently hold any ordmakers. Make sure your payment address matches the wallet that holds your ordmakers.`
      })
    }

    // User found in preview
    const sharePercentage = (userHolder.count / totalOptedInOrdmakers) * 100

    return NextResponse.json({
      success: true,
      opted_in: true,
      in_preview: true,
      wallet_address: walletAddress,
      watching_wallet: watchingWallet,
      preview_data: {
        total_revenue_sats: totalRevenueSats,
        payout_amount_sats: totalPayoutSats,
        total_holders: optedInHolders.length,
        total_ordmakers: totalOptedInOrdmakers,
        last_payout_at: lastPayoutAt,
      },
      user_data: {
        ordmaker_count: userHolder.count,
        amount_sats: userHolder.amount_sats,
        share_percentage: sharePercentage,
      }
    })
  } catch (error: any) {
    console.error('Error generating payout preview:', error)
    return NextResponse.json({ 
      error: 'Failed to generate payout preview',
      details: error.message 
    }, { status: 500 })
  }
}
