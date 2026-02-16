import { NextRequest, NextResponse } from 'next/server'
import { checkAuthorizationServer } from '@/lib/auth/access-control'
import { sql } from '@/lib/database'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const walletAddress = searchParams.get('wallet_address')
  const ownerAddress = searchParams.get('ownerAddress')
  const collectionSymbol = searchParams.get('collectionSymbol')
  const showAll = searchParams.get('showAll') || 'true'
  const limit = searchParams.get('limit') || '100' // Max allowed is 100

  // Admin check
  if (!walletAddress) {
    return NextResponse.json({ error: 'Wallet address required' }, { status: 401 })
  }
  const authResult = await checkAuthorizationServer(walletAddress, sql)
  if (!authResult.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized. Admin access only.' }, { status: 403 })
  }

  if (!ownerAddress) {
    return NextResponse.json({ error: 'ownerAddress is required' }, { status: 400 })
  }

  try {
    // Build Magic Eden API URL
    const params = new URLSearchParams({
      ownerAddress,
      showAll,
      limit,
    })
    
    if (collectionSymbol) {
      params.set('collectionSymbol', collectionSymbol)
    }

    const url = `https://api-mainnet.magiceden.dev/v2/ord/btc/tokens?${params.toString()}`
    
    // Build headers with API key
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'OrdMaker/1.0',
    }

    const apiKey = process.env.MAGIC_EDEN_API_KEY
    if (apiKey) {
      headers['X-API-Key'] = apiKey
      headers['Authorization'] = `Bearer ${apiKey}`
    }

    console.log('[Magic Eden Proxy] Fetching:', url)
    
    const response = await fetch(url, { 
      headers,
      next: { revalidate: 30 }, // Cache for 30 seconds
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Magic Eden Proxy] API Error:', response.status, errorText)
      return NextResponse.json(
        { error: `Magic Eden API Error: ${response.status}`, details: errorText },
        { status: response.status }
      )
    }

    const data = await response.json()
    
    // Extract tokens and total
    const tokens = data.tokens || (Array.isArray(data) ? data : [])
    const total = data.total ?? tokens.length

    return NextResponse.json({
      success: true,
      tokens,
      total,
      ownerAddress,
      collectionSymbol: collectionSymbol || null,
      limit: parseInt(limit),
    })
  } catch (error: any) {
    console.error('[Magic Eden Proxy] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch from Magic Eden' },
      { status: 500 }
    )
  }
}

