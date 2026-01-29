import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'

/**
 * GET /api/mint/my-transactions - Get mint transaction history for a wallet
 * Returns all mint NFTs for the connected wallet
 */
export async function GET(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const wallet_address = searchParams.get('wallet_address')
    const collectionId = searchParams.get('collection_id')
    const limit = parseInt(searchParams.get('limit') || '100')
    const offset = parseInt(searchParams.get('offset') || '0')

    if (!wallet_address) {
      return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 })
    }

    let query
    if (collectionId) {
      query = sql`
        SELECT
          mn.id,
          mn.ordinal_id,
          mn.session_id,
          mn.collection_id,
          mn.mint_address,
          mn.tx_signature,
          mn.metadata_uri,
          mn.mint_status,
          mn.error_message,
          mn.created_at,
          mn.confirmed_at,
          c.name as collection_name,
          go.ordinal_number
        FROM mint_nfts mn
        JOIN collections c ON mn.collection_id = c.id
        LEFT JOIN generated_ordinals go ON mn.ordinal_id = go.id
        WHERE mn.wallet_address = ${wallet_address}
          AND mn.collection_id = ${collectionId}::uuid
          AND mn.tx_signature IS NOT NULL
        ORDER BY mn.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `
    } else {
      query = sql`
        SELECT
          mn.id,
          mn.ordinal_id,
          mn.session_id,
          mn.collection_id,
          mn.mint_address,
          mn.tx_signature,
          mn.metadata_uri,
          mn.mint_status,
          mn.error_message,
          mn.created_at,
          mn.confirmed_at,
          c.name as collection_name,
          go.ordinal_number
        FROM mint_nfts mn
        JOIN collections c ON mn.collection_id = c.id
        LEFT JOIN generated_ordinals go ON mn.ordinal_id = go.id
        WHERE mn.wallet_address = ${wallet_address}
          AND mn.tx_signature IS NOT NULL
        ORDER BY mn.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `
    }

    const mints = await query as any[]

    let countQuery
    if (collectionId) {
      countQuery = sql`
        SELECT COUNT(*) as count FROM mint_nfts
        WHERE wallet_address = ${wallet_address}
          AND collection_id = ${collectionId}::uuid
          AND tx_signature IS NOT NULL
      `
    } else {
      countQuery = sql`
        SELECT COUNT(*) as count FROM mint_nfts
        WHERE wallet_address = ${wallet_address}
          AND tx_signature IS NOT NULL
      `
    }

    const countResult = await countQuery as any[]
    const totalCount = countResult?.[0]?.count || 0

    return NextResponse.json({
      success: true,
      mints: Array.isArray(mints) ? mints : [],
      total: totalCount,
      limit,
      offset,
    })
  } catch (error: any) {
    console.error('Error fetching mint transactions:', error)
    return NextResponse.json({
      error: 'Failed to fetch mint transactions',
      details: error.message
    }, { status: 500 })
  }
}
