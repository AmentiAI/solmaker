/**
 * Client-side Solscan URL utility.
 * Fetches the network from site settings API and caches it.
 */

let cachedNetwork: string | null = null
let fetchPromise: Promise<string> | null = null

/**
 * Get the current Solana network from site settings (cached).
 */
async function getNetwork(): Promise<string> {
  if (cachedNetwork) return cachedNetwork

  if (!fetchPromise) {
    fetchPromise = fetch('/api/solana/network')
      .then(res => res.json())
      .then(data => {
        cachedNetwork = data.network || 'devnet'
        return cachedNetwork!
      })
      .catch(() => {
        cachedNetwork = 'devnet'
        return 'devnet'
      })
  }

  return fetchPromise
}

/**
 * Get a Solscan URL for a transaction or account.
 * Uses cached network from site settings.
 *
 * For synchronous use (before network is fetched), pass `network` param.
 */
export function getSolscanUrl(
  value: string,
  type: 'tx' | 'account' | 'token' = 'tx',
  network?: string
): string {
  const cluster = network || cachedNetwork || 'devnet'
  const clusterParam = cluster === 'mainnet-beta' ? '' : `?cluster=${cluster}`
  return `https://solscan.io/${type}/${value}${clusterParam}`
}

/**
 * Get a Solscan URL (async - fetches network from API if not cached).
 */
export async function getSolscanUrlAsync(
  value: string,
  type: 'tx' | 'account' | 'token' = 'tx'
): Promise<string> {
  const network = await getNetwork()
  return getSolscanUrl(value, type, network)
}

/**
 * React hook-friendly: preload network so getSolscanUrl works synchronously.
 * Call this in a useEffect at app load.
 */
export function preloadSolscanNetwork(): void {
  getNetwork()
}

/**
 * Clear cached network (call when admin changes network settings).
 */
export function clearSolscanNetworkCache(): void {
  cachedNetwork = null
  fetchPromise = null
}
