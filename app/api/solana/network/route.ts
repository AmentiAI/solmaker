import { NextResponse } from 'next/server'
import { sql } from '@/lib/database'

/**
 * GET /api/solana/network
 * Public endpoint to get current Solana network configuration
 */
export async function GET() {
  if (!sql) {
    return NextResponse.json({ error: 'Database not available' }, { status: 500 })
  }

  try {
    const [networkResult, mainnetRpcResult, devnetRpcResult] = await Promise.all([
      sql`SELECT setting_value FROM site_settings WHERE setting_key = 'solana_network'` as Promise<any[]>,
      sql`SELECT setting_value FROM site_settings WHERE setting_key = 'solana_rpc_mainnet'` as Promise<any[]>,
      sql`SELECT setting_value FROM site_settings WHERE setting_key = 'solana_rpc_devnet'` as Promise<any[]>,
    ])
    
    const network = networkResult[0]?.setting_value || 'devnet'
    const mainnetRpc = mainnetRpcResult[0]?.setting_value || 'https://api.mainnet-beta.solana.com'
    const devnetRpc = devnetRpcResult[0]?.setting_value || 'https://api.devnet.solana.com'
    
    const activeRpc = network === 'mainnet-beta' ? mainnetRpc : devnetRpc
    
    return NextResponse.json({
      network,
      rpcUrl: activeRpc,
      isMainnet: network === 'mainnet-beta',
      isDevnet: network === 'devnet',
      endpoints: {
        mainnet: mainnetRpc,
        devnet: devnetRpc,
      },
    })
  } catch (error: any) {
    console.error('[Solana Network API] Error:', error)
    
    // Fallback to env vars
    const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet'
    const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com'
    
    return NextResponse.json({
      network,
      rpcUrl,
      isMainnet: network === 'mainnet-beta',
      isDevnet: network === 'devnet',
      fallback: true,
    })
  }
}
