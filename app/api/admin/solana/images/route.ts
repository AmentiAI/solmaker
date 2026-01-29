import { NextResponse } from 'next/server'
import { sql } from '@/lib/database'

/**
 * GET /api/admin/solana/images
 * Get generated images/ordinals
 */
export async function GET(request: Request) {
  if (!sql) {
    return NextResponse.json({ error: 'Database not available' }, { status: 500 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const collectionId = searchParams.get('collection_id')
    const limit = parseInt(searchParams.get('limit') || '100')
    const minted = searchParams.get('minted') // 'true', 'false', or null for all

    let query

    if (collectionId) {
      if (minted === 'true') {
        query = sql`
          SELECT 
            go.id,
            go.collection_id,
            go.image_url,
            go.compressed_image_url,
            go.attributes,
            go.is_minted,
            go.metadata_uploaded,
            go.created_at,
            c.name as collection_name,
            nmu.metadata_uri,
            snm.nft_mint_address,
            snm.mint_tx_signature
          FROM generated_ordinals go
          JOIN collections c ON go.collection_id = c.id
          LEFT JOIN nft_metadata_uris nmu ON go.id = nmu.ordinal_id
          LEFT JOIN solana_nft_mints snm ON go.id = snm.ordinal_id AND snm.mint_status = 'confirmed'
          WHERE go.collection_id = ${collectionId}::uuid
          AND go.is_minted = true
          ORDER BY go.created_at DESC
          LIMIT ${limit}
        `
      } else if (minted === 'false') {
        query = sql`
          SELECT 
            go.id,
            go.collection_id,
            go.image_url,
            go.compressed_image_url,
            go.attributes,
            go.is_minted,
            go.metadata_uploaded,
            go.created_at,
            c.name as collection_name,
            nmu.metadata_uri
          FROM generated_ordinals go
          JOIN collections c ON go.collection_id = c.id
          LEFT JOIN nft_metadata_uris nmu ON go.id = nmu.ordinal_id
          WHERE go.collection_id = ${collectionId}::uuid
          AND go.is_minted = false
          ORDER BY go.created_at DESC
          LIMIT ${limit}
        `
      } else {
        query = sql`
          SELECT 
            go.id,
            go.collection_id,
            go.image_url,
            go.compressed_image_url,
            go.attributes,
            go.is_minted,
            go.metadata_uploaded,
            go.created_at,
            c.name as collection_name,
            nmu.metadata_uri,
            snm.nft_mint_address
          FROM generated_ordinals go
          JOIN collections c ON go.collection_id = c.id
          LEFT JOIN nft_metadata_uris nmu ON go.id = nmu.ordinal_id
          LEFT JOIN solana_nft_mints snm ON go.id = snm.ordinal_id AND snm.mint_status = 'confirmed'
          WHERE go.collection_id = ${collectionId}::uuid
          ORDER BY go.created_at DESC
          LIMIT ${limit}
        `
      }
    } else {
      query = sql`
        SELECT 
          go.id,
          go.collection_id,
          go.image_url,
          go.compressed_image_url,
          go.attributes,
          go.is_minted,
          go.metadata_uploaded,
          go.created_at,
          c.name as collection_name,
          nmu.metadata_uri,
          snm.nft_mint_address
        FROM generated_ordinals go
        JOIN collections c ON go.collection_id = c.id
        LEFT JOIN nft_metadata_uris nmu ON go.id = nmu.ordinal_id
        LEFT JOIN solana_nft_mints snm ON go.id = snm.ordinal_id AND snm.mint_status = 'confirmed'
        ORDER BY go.created_at DESC
        LIMIT ${limit}
      `
    }

    const images = await query as any[]

    return NextResponse.json(images)
  } catch (error: any) {
    console.error('[Admin Images] Error:', error)
    return NextResponse.json({ 
      error: 'Failed to fetch images',
      details: error.message 
    }, { status: 500 })
  }
}
