import { NextRequest, NextResponse } from 'next/server'

// Solana connection would be initialized here in production
// For now, return mock data
const LAMPORTS_PER_SOL = 1000000000

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const address = searchParams.get('address')

    if (!address) {
      return NextResponse.json(
        { error: 'Wallet address is required' },
        { status: 400 }
      )
    }

    // In production, this would connect to Solana RPC
    // For now, return mock balance
    try {
      // Mock balance for development
      const mockBalance = 1.5 // SOL
      
      return NextResponse.json({
        address,
        balance: mockBalance,
        lamports: mockBalance * LAMPORTS_PER_SOL
      })
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid wallet address' },
        { status: 400 }
      )
    }
  } catch (error) {
    console.error('Error fetching balance:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
