import { NextRequest, NextResponse } from 'next/server'
import { checkAuthorizationServer } from '@/lib/auth/access-control'
import { sql } from '@/lib/database'

const ORDMAKER_COLLECTION = 'ordmaker' // Collection symbol on Magic Eden

/**
 * POST /api/admin/community-payouts/holders
 * Automatically fetch all holders from the ordmaker collection via Magic Eden API
 * Paginates through all pieces (100 at a time) and builds a unique wallet list
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { wallet_address } = body

    if (!wallet_address) {
      return NextResponse.json({ error: 'Wallet address required' }, { status: 401 })
    }
    const authResult = await checkAuthorizationServer(wallet_address, sql)
    if (!authResult.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized. Admin access only.' }, { status: 403 })
    }

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

    console.log(`🔍 Fetching all holders from ordmaker collection...`)

    // Paginate through all pieces in the collection
    while (hasMore) {
      try {
        // Fetch collection pieces with pagination
        // Try different API endpoints - Magic Eden might use offset or cursor-based pagination
        const params = new URLSearchParams({
          collectionSymbol: ORDMAKER_COLLECTION,
          limit: limit.toString(),
          offset: offset.toString(),
        })

        // Try the collection tokens endpoint
        let url = `https://api-mainnet.magiceden.dev/v2/ord/btc/collections/${ORDMAKER_COLLECTION}/tokens?${params.toString()}`
        let response = await fetch(url, { headers })

        // If that doesn't work, try alternative endpoint
        if (!response.ok) {
          // Alternative: fetch by listing all tokens and filtering
          url = `https://api-mainnet.magiceden.dev/v2/ord/btc/tokens?collectionSymbol=${ORDMAKER_COLLECTION}&limit=${limit}&offset=${offset}`
          response = await fetch(url, { headers })
        }

        if (!response.ok) {
          const errorText = await response.text()
          console.error(`Magic Eden API error (offset ${offset}):`, response.status, errorText)
          
          // If we get 404 or similar, try one more endpoint format
          if (response.status === 404) {
            url = `https://api-mainnet.magiceden.dev/v2/ord/btc/collections/${ORDMAKER_COLLECTION}?limit=${limit}&offset=${offset}`
            response = await fetch(url, { headers })
          }

          if (!response.ok) {
            throw new Error(`Magic Eden API error: ${response.status} - ${errorText}`)
          }
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

        console.log(`   Fetched ${tokens.length} pieces (offset: ${offset}, page: ${Math.floor(offset / limit) + 1})`)

        // Process each token to extract wallet address
        for (const token of tokens) {
          // Extract owner address from token data
          // Magic Eden API might return it as 'owner', 'ownerAddress', 'currentOwner', etc.
          const ownerAddress = token.owner || token.ownerAddress || token.currentOwner || token.owner_address
          
          if (ownerAddress && typeof ownerAddress === 'string') {
            const currentCount = holderMap.get(ownerAddress) || 0
            holderMap.set(ownerAddress, currentCount + 1)
          }
        }

        totalFetched += tokens.length

        // Check if there are more results
        // If we got exactly 'limit' tokens, there might be more
        // If we got fewer than 'limit', we've reached the end
        hasMore = tokens.length === limit

        // Safety limit: don't fetch more than 10,000 pieces (should be enough for 200 supply)
        if (totalFetched >= 10000) {
          console.log(`   ⚠️ Reached safety limit of 10,000 pieces`)
          hasMore = false
        }

        if (hasMore) {
          // Move to next page: offset 0 -> 100 -> 200 -> 300, etc.
          offset += limit
          console.log(`   → Moving to next page (offset: ${offset})...`)
          // Rate limiting: wait a bit between requests
          await new Promise(resolve => setTimeout(resolve, 200))
        } else {
          console.log(`   ✅ Finished fetching. Total pieces processed: ${totalFetched}`)
        }
      } catch (error: any) {
        console.error(`Error fetching batch at offset ${offset}:`, error)
        // If we've fetched some data, continue with what we have
        if (holderMap.size > 0) {
          console.warn('Continuing with partial data...')
          break
        }
        throw error
      }
    }

    // Convert map to array format
    const holders = Array.from(holderMap.entries()).map(([wallet_address, count]) => ({
      wallet_address,
      count,
    }))

    // Sort by count descending
    holders.sort((a, b) => b.count - a.count)

    const totalOrdmakers = holders.reduce((sum, h) => sum + h.count, 0)

    console.log(`✅ Snapshot complete: ${holders.length} unique holders, ${totalOrdmakers} total ordmakers`)

    return NextResponse.json({
      success: true,
      holders,
      total_holders: holders.length,
      total_ordmakers: totalOrdmakers,
      pieces_fetched: totalFetched,
    })
  } catch (error: any) {
    console.error('Error fetching holders:', error)
    return NextResponse.json({ 
      error: 'Failed to fetch holders',
      details: error.message 
    }, { status: 500 })
  }
}

/**
 * Alternative: Accept a list of holders from the frontend
 * POST /api/admin/community-payouts/holders/from-list
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { wallet_address, holders } = body

    if (!wallet_address) {
      return NextResponse.json({ error: 'Wallet address required' }, { status: 401 })
    }
    const putAuthResult = await checkAuthorizationServer(wallet_address, sql)
    if (!putAuthResult.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized. Admin access only.' }, { status: 403 })
    }

    if (!Array.isArray(holders) || holders.length === 0) {
      return NextResponse.json({ error: 'Holders array is required' }, { status: 400 })
    }

    // Validate holders structure
    const validatedHolders = holders.map((holder: any) => {
      if (!holder.wallet_address || typeof holder.wallet_address !== 'string') {
        throw new Error('Each holder must have a wallet_address')
      }
      if (typeof holder.count !== 'number' || holder.count < 1) {
        throw new Error('Each holder must have a count >= 1')
      }
      return {
        wallet_address: holder.wallet_address.trim(),
        count: Math.floor(holder.count),
      }
    })

    // Aggregate by wallet (in case of duplicates)
    const holderMap = new Map<string, number>()
    for (const holder of validatedHolders) {
      const current = holderMap.get(holder.wallet_address) || 0
      holderMap.set(holder.wallet_address, current + holder.count)
    }

    const aggregatedHolders = Array.from(holderMap.entries()).map(([wallet_address, count]) => ({
      wallet_address,
      count,
    }))

    return NextResponse.json({
      success: true,
      holders: aggregatedHolders,
      total_holders: aggregatedHolders.length,
      total_ordmakers: aggregatedHolders.reduce((sum, h) => sum + h.count, 0),
    })
  } catch (error: any) {
    console.error('Error processing holders:', error)
    return NextResponse.json({ 
      error: 'Failed to process holders',
      details: error.message 
    }, { status: 500 })
  }
}

