import { NextRequest, NextResponse } from 'next/server'
import { getAvailableNfts } from '@/lib/solana/nft-fetcher'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const wallet = searchParams.get('wallet')
    const offsetParam = searchParams.get('offset')
    const limitParam = searchParams.get('limit')

    if (!wallet) {
      return NextResponse.json(
        { error: 'Missing required parameter: wallet' },
        { status: 400 }
      )
    }

    // Fetch available NFTs (excludes already listed)
    const allNfts = await getAvailableNfts(wallet)

    // Pagination
    const offset = parseInt(offsetParam || '0')
    const limit = parseInt(limitParam || '50')
    const paginatedNfts = allNfts.slice(offset, offset + limit)

    return NextResponse.json({
      success: true,
      nfts: paginatedNfts,
      total: allNfts.length,
      offset,
      limit,
    })
  } catch (error: any) {
    console.error('Error in GET /api/marketplace/solana/my-nfts:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
