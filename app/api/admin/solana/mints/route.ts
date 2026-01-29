import { NextResponse } from 'next/server'
import { sql } from '@/lib/database'

/**
 * GET /api/admin/solana/mints
 * Get all Solana NFT mints
 */
export async function GET(request: Request) {
  if (!sql) {
    return NextResponse.json({ error: 'Database not available' }, { status: 500 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') // pending, confirmed, failed
    const limit = parseInt(searchParams.get('limit') || '100')

    let query = sql`
      SELECT 
        snm.id,
        snm.collection_id,
        snm.candy_machine_address,
        snm.nft_mint_address,
        snm.minter_wallet,
        snm.mint_tx_signature,
        snm.mint_price_lamports,
        snm.platform_fee_lamports,
        snm.mint_status,
        snm.error_message,
        snm.created_at,
        snm.confirmed_at,
        c.name as collection_name,
        c.image_url as collection_image
      FROM solana_nft_mints snm
      JOIN collections c ON snm.collection_id = c.id
    `

    if (status) {
      query = sql`
        SELECT 
          snm.id,
          snm.collection_id,
          snm.candy_machine_address,
          snm.nft_mint_address,
          snm.minter_wallet,
          snm.mint_tx_signature,
          snm.mint_price_lamports,
          snm.platform_fee_lamports,
          snm.mint_status,
          snm.error_message,
          snm.created_at,
          snm.confirmed_at,
          c.name as collection_name,
          c.image_url as collection_image
        FROM solana_nft_mints snm
        JOIN collections c ON snm.collection_id = c.id
        WHERE snm.mint_status = ${status}
      `
    }

    const mints = await sql`
      ${query}
      ORDER BY snm.created_at DESC
      LIMIT ${limit}
    ` as any[]

    return NextResponse.json(mints)
  } catch (error: any) {
    console.error('[Admin Mints] Error:', error)
    return NextResponse.json({ 
      error: 'Failed to fetch mints',
      details: error.message 
    }, { status: 500 })
  }
}
