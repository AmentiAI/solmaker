import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'

/**
 * GET /api/marketplace/ordinals/collections
 * Returns all ordinal collections from the database
 */
export async function GET(req: NextRequest) {
  try {
    const collections = await sql`
      SELECT 
        symbol,
        name,
        image_uri,
        description,
        website_link,
        twitter_link,
        discord_link,
        supply,
        min_inscription_number,
        max_inscription_number
      FROM ordinal_collections
      ORDER BY name ASC, symbol ASC
    ` as any[]

    return NextResponse.json({
      success: true,
      collections: collections.map(c => ({
        symbol: c.symbol,
        name: c.name || c.symbol,
        image: c.image_uri,
        description: c.description,
        website: c.website_link,
        twitter: c.twitter_link,
        discord: c.discord_link,
        supply: c.supply,
        min_inscription_number: c.min_inscription_number,
        max_inscription_number: c.max_inscription_number,
      }))
    })
  } catch (error: any) {
    console.error('Error fetching collections:', error)
    return NextResponse.json({
      error: 'Failed to fetch collections',
      details: error.message
    }, { status: 500 })
  }
}
