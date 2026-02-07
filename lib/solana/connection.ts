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
      const mainnetRpc = mainnetRpcResult[0]?.setting_value || process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'
      const devnetRpc = devnetRpcResult[0]?.setting_value || process.env.SOLANA_DEVNET_RPC_URL || 'https://api.devnet.solana.com'
      
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
  
  // Fallback to env vars - pick the right RPC based on network
  const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK || process.env.SOLANA_CLUSTER || 'devnet'
  
  const mainnetRpc = process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'
  const devnetRpc = process.env.SOLANA_DEVNET_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_DEVNET_RPC_URL || 'https://api.devnet.solana.com'
  
  const rpcUrl = network === 'mainnet-beta' ? mainnetRpc : devnetRpc
  
  console.log(`[Solana Connection] Using env var fallback: network=${network}, rpc=${rpcUrl.substring(0, 40)}...`)
  
  return { network, rpcUrl }
}

export async function getConnectionAsync(): Promise<Connection> {
  const { network, rpcUrl } = await getNetworkSettings()
  // Always create fresh connection to respect network switches
  connectionInstance = new Connection(rpcUrl, 'confirmed')
  cachedNetwork = network
  return connectionInstance
}

export function getConnection(): Connection {
  if (!connectionInstance) {
    // Pick the right RPC based on network setting
    const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK || process.env.SOLANA_CLUSTER || 'devnet'
    const mainnetRpc = process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'
    const devnetRpc = process.env.SOLANA_DEVNET_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_DEVNET_RPC_URL || 'https://api.devnet.solana.com'
    const rpcUrl = network === 'mainnet-beta' ? mainnetRpc : devnetRpc
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
