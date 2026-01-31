import { Connection, clusterApiUrl } from '@solana/web3.js'
import { sql } from '@/lib/database'

let connectionInstance: Connection | null = null
let cachedNetwork: string | null = null
let cachedRpcUrl: string | null = null
let lastFetch: number = 0
const CACHE_TTL = 60000 // 1 minute cache

/**
 * Get network and RPC settings from database
 * Falls back to env vars if database not available
 */
async function getNetworkSettings(): Promise<{ network: string; rpcUrl: string }> {
  const now = Date.now()
  
  // Return cached if still valid
  if (cachedNetwork && cachedRpcUrl && now - lastFetch < CACHE_TTL) {
    return { network: cachedNetwork, rpcUrl: cachedRpcUrl }
  }
  
  // Try database first
  if (sql) {
    try {
      const [networkResult, mainnetRpcResult, devnetRpcResult] = await Promise.all([
        sql`SELECT setting_value FROM site_settings WHERE setting_key = 'solana_network'` as Promise<any[]>,
        sql`SELECT setting_value FROM site_settings WHERE setting_key = 'solana_rpc_mainnet'` as Promise<any[]>,
        sql`SELECT setting_value FROM site_settings WHERE setting_key = 'solana_rpc_devnet'` as Promise<any[]>,
      ])
      
      const network = networkResult[0]?.setting_value || 'devnet'
      const mainnetRpc = mainnetRpcResult[0]?.setting_value || 'https://api.mainnet-beta.solana.com'
      const devnetRpc = devnetRpcResult[0]?.setting_value || 'https://api.devnet.solana.com'
      
      const rpcUrl = network === 'mainnet-beta' ? mainnetRpc : devnetRpc
      
      // Cache results
      cachedNetwork = network
      cachedRpcUrl = rpcUrl
      lastFetch = now
      
      return { network, rpcUrl }
    } catch (error) {
      console.warn('[Solana Connection] Failed to fetch from database, using env vars:', error)
    }
  }
  
  // Fallback to env vars
  const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK || process.env.SOLANA_CLUSTER || 'devnet'
  const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || process.env.SOLANA_RPC_URL || clusterApiUrl(network as any)
  
  return { network, rpcUrl }
}

export async function getConnectionAsync(): Promise<Connection> {
  const { rpcUrl } = await getNetworkSettings()
  connectionInstance = new Connection(rpcUrl, 'confirmed')
  return connectionInstance
}

export function getConnection(): Connection {
  if (!connectionInstance) {
    const rpcUrl = process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || clusterApiUrl('devnet')
    connectionInstance = new Connection(rpcUrl, 'confirmed')
  }
  return connectionInstance
}

export async function getClusterAsync(): Promise<string> {
  const { network } = await getNetworkSettings()
  return network
}

export function getCluster(): string {
  return cachedNetwork || process.env.SOLANA_CLUSTER || process.env.NEXT_PUBLIC_SOLANA_CLUSTER || 'devnet'
}

export async function getExplorerUrlAsync(signature: string, type: 'tx' | 'account' = 'tx'): Promise<string> {
  const cluster = await getClusterAsync()
  const base = 'https://solscan.io'
  const path = type === 'tx' ? 'tx' : 'account'
  const clusterParam = cluster === 'mainnet-beta' ? '' : `?cluster=${cluster}`
  return `${base}/${path}/${signature}${clusterParam}`
}

export function getExplorerUrl(signature: string, type: 'tx' | 'account' = 'tx'): string {
  const cluster = getCluster()
  const base = 'https://solscan.io'
  const path = type === 'tx' ? 'tx' : 'account'
  const clusterParam = cluster === 'mainnet-beta' ? '' : `?cluster=${cluster}`
  return `${base}/${path}/${signature}${clusterParam}`
}

/**
 * Clear connection cache (call this when network settings change)
 */
export function clearConnectionCache() {
  connectionInstance = null
  cachedNetwork = null
  cachedRpcUrl = null
  lastFetch = 0
}
