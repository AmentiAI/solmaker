import { NextResponse } from 'next/server'
import { sql } from '@/lib/database'

/**
 * GET /api/admin/solana/collections
 * Get all collections with Solana deployment info
 */
export async function GET() {
  if (!sql) {
    return NextResponse.json({ error: 'Database not available' }, { status: 500 })
  }

  try {
    const collections = await sql`
      SELECT 
        c.id,
        c.name,
        c.description,
        c.wallet_address,
        c.image_url,
        c.banner_image_url,
        c.candy_machine_address,
        c.collection_mint_address,
        c.collection_authority,
        c.metadata_uploaded,
        c.deployment_status,
        c.deployed_at,
        c.deployed_by,
        c.collection_status,
        c.launched_at,
        c.total_supply,
        c.created_at,
        (SELECT COUNT(*)::int FROM generated_ordinals WHERE collection_id = c.id) as ordinals_count,
        (SELECT COUNT(*)::int FROM solana_nft_mints WHERE collection_id = c.id AND mint_status = 'confirmed') as minted_count,
        (SELECT COUNT(*)::int FROM nft_metadata_uris WHERE collection_id = c.id) as metadata_count
      FROM collections c
      ORDER BY c.created_at DESC
      LIMIT 100
    ` as any[]

    return NextResponse.json(collections)
  } catch (error: any) {
    console.error('[Admin Collections] Error:', error)
    return NextResponse.json({ 
      error: 'Failed to fetch collections',
      details: error.message 
    }, { status: 500 })
  }
}
