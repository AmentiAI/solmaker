// Exchange rate service for converting USD to SOL
// Uses CoinGecko API with caching

interface ExchangeRates {
  sol: number
  lastUpdated: number
}

const CACHE_TTL = 5 * 60 * 1000 // 5 minutes
let cachedRates: ExchangeRates | null = null

/**
 * Fetch exchange rates from CoinGecko API
 */
async function fetchExchangeRates(): Promise<ExchangeRates> {
  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
      {
        signal: AbortSignal.timeout(10000),
      }
    )

    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status}`)
    }

    const data = await response.json()

    const rates: ExchangeRates = {
      sol: data.solana?.usd || 100,
      lastUpdated: Date.now(),
    }

    if (rates.sol <= 0) {
      throw new Error('Invalid exchange rates received')
    }

    return rates
  } catch (error: any) {
    console.error('Error fetching exchange rates:', error)

    if (cachedRates && Date.now() - cachedRates.lastUpdated < CACHE_TTL * 2) {
      console.warn('Using cached rates due to fetch error')
      return cachedRates
    }

    return {
      sol: 100,
      lastUpdated: Date.now(),
    }
  }
}

/**
 * Get current exchange rates (cached)
 */
export async function getExchangeRates(): Promise<ExchangeRates> {
  const now = Date.now()

  if (cachedRates && now - cachedRates.lastUpdated < CACHE_TTL) {
    return cachedRates
  }

  cachedRates = await fetchExchangeRates()
  return cachedRates
}

/**
 * Convert USD to SOL
 */
export async function usdToSol(usdAmount: number): Promise<number> {
  const rates = await getExchangeRates()
  return usdAmount / rates.sol
}

/**
 * Get SOL price in USD
 */
export async function getSolPrice(): Promise<number> {
  const rates = await getExchangeRates()
  return rates.sol
}

/**
 * Get formatted SOL amount
 */
export function formatSolAmount(amount: number): string {
  return amount.toFixed(4)
}

/**
 * Format crypto amount (kept for backwards compatibility)
 */
export function formatCryptoAmount(amount: number, currency: 'sol' = 'sol'): string {
  return amount.toFixed(4)
}
