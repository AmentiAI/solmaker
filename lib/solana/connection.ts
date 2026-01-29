import { Connection, clusterApiUrl } from '@solana/web3.js'

let connectionInstance: Connection | null = null

export function getConnection(): Connection {
  if (!connectionInstance) {
    const rpcUrl = process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || clusterApiUrl('mainnet-beta')
    connectionInstance = new Connection(rpcUrl, 'confirmed')
  }
  return connectionInstance
}

export function getCluster(): string {
  return process.env.SOLANA_CLUSTER || process.env.NEXT_PUBLIC_SOLANA_CLUSTER || 'mainnet-beta'
}

export function getExplorerUrl(signature: string, type: 'tx' | 'account' = 'tx'): string {
  const cluster = getCluster()
  const base = 'https://solscan.io'
  const path = type === 'tx' ? 'tx' : 'account'
  const clusterParam = cluster === 'mainnet-beta' ? '' : `?cluster=${cluster}`
  return `${base}/${path}/${signature}${clusterParam}`
}
