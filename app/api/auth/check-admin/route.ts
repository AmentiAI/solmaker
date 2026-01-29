import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { checkAuthorizationServer } from '@/lib/auth/access-control'

export async function GET(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database not available' }, { status: 500 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const walletAddress = searchParams.get('wallet_address')

    if (!walletAddress) {
      return NextResponse.json({ 
        isAdmin: false, 
        error: 'Wallet address required' 
      }, { status: 400 })
    }

    // Check admin status using database
    const auth = await checkAuthorizationServer(walletAddress, sql)

    return NextResponse.json({
      isAdmin: auth.isAdmin,
      isAuthorized: auth.isAuthorized,
      walletAddress: auth.walletAddress,
    })
  } catch (error: any) {
    console.error('Error checking admin status:', error)
    return NextResponse.json({ 
      isAdmin: false, 
      error: error.message 
    }, { status: 500 })
  }
}
