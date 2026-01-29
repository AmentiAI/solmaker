/**
 * Shared utility for checking if a wallet holds ordinals from a specific collection
 * Used for discount validation
 */

const DISCOUNT_COLLECTION = 'ordmaker' // Collection that gives 50% discount

export interface HolderCheckResult {
  isHolder: boolean
  holdingCount: number
  collection: string
  discountPercent: number
}

/**
 * Check if a wallet holds ordinals from the discount collection via Magic Eden API
 */
export async function checkHolderStatus(walletAddress: string): Promise<HolderCheckResult> {
  try {
    // Build Magic Eden API URL to check for discount collection
    const params = new URLSearchParams({
      ownerAddress: walletAddress,
      collectionSymbol: DISCOUNT_COLLECTION,
      showAll: 'true',
      limit: '20', // We only need to know if they have > 0
    })

    const url = `https://api-mainnet.magiceden.dev/v2/ord/btc/tokens?${params.toString()}`
    
    // Build headers with API key
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'OrdMaker/1.0',
    }

    const apiKey = process.env.MAGIC_EDEN_API_KEY
    if (apiKey) {
      headers['X-API-Key'] = apiKey
      headers['Authorization'] = `Bearer ${apiKey}`
    }

    const response = await fetch(url, { 
      headers,
      next: { revalidate: 60 }, // Cache for 60 seconds
    })

    if (!response.ok) {
      // If API fails, default to no discount (don't block purchases)
      console.error('[Holder Check] Magic Eden API error:', response.status)
      return {
        isHolder: false,
        holdingCount: 0,
        collection: DISCOUNT_COLLECTION,
        discountPercent: 0,
      }
    }

    const data = await response.json()
    const tokens = data.tokens || []
    const total = data.total ?? tokens.length

    const isHolder = total > 0
    const discountPercent = isHolder ? 50 : 0

    return {
      isHolder,
      holdingCount: total,
      collection: DISCOUNT_COLLECTION,
      discountPercent,
    }
  } catch (error: any) {
    console.error('[Holder Check] Error:', error)
    // Default to no discount on error
    return {
      isHolder: false,
      holdingCount: 0,
      collection: DISCOUNT_COLLECTION,
      discountPercent: 0,
    }
  }
}

