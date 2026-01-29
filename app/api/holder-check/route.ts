import { NextRequest, NextResponse } from 'next/server'
import { checkHolderStatus } from '@/lib/holder-check'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const walletAddress = searchParams.get('wallet_address')

  if (!walletAddress) {
    return NextResponse.json({ error: 'wallet_address is required' }, { status: 400 })
  }

  const result = await checkHolderStatus(walletAddress)
  return NextResponse.json(result)
}

