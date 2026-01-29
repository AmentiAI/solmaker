import { NextResponse } from 'next/server'
import { verifyPlatformWallet, getPlatformWalletBalance } from '@/lib/solana/platform-wallet'

/**
 * GET /api/admin/platform-wallet
 * Check platform wallet status and balance
 */
export async function GET() {
  try {
    const verification = await verifyPlatformWallet()
    
    if (!verification.configured) {
      return NextResponse.json({
        error: 'Platform wallet not properly configured',
        details: verification.error,
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      wallet: {
        address: verification.address,
        balance: verification.balance,
        balanceFormatted: `${verification.balance?.toFixed(4)} SOL`,
      },
      message: 'Platform wallet configured and accessible',
    })

  } catch (error: any) {
    console.error('[Platform Wallet] Error:', error)
    return NextResponse.json({
      error: 'Failed to check platform wallet',
      details: error.message,
    }, { status: 500 })
  }
}
