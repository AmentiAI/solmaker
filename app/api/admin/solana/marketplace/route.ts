import { NextResponse } from 'next/server'
import { sql } from '@/lib/database'

/**
 * GET /api/admin/solana/marketplace
 * Get marketplace listings
 */
export async function GET() {
  if (!sql) {
    return NextResponse.json({ error: 'Database not available' }, { status: 500 })
  }

  try {
    // Check if marketplace_listings table exists
    const tableCheck = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'marketplace_listings'
      )
    ` as any[]

    if (!tableCheck[0]?.exists) {
      // Table doesn't exist yet, return empty array
      return NextResponse.json([])
    }

    const listings = await sql`
      SELECT 
        ml.*,
        c.name as collection_name,
        c.image_url as collection_image
      FROM marketplace_listings ml
      LEFT JOIN collections c ON ml.collection_id = c.id
      ORDER BY ml.created_at DESC
      LIMIT 100
    ` as any[]

    return NextResponse.json(listings)
  } catch (error: any) {
    console.error('[Admin Marketplace] Error:', error)
    // Return empty array if there's an error (likely table doesn't exist)
    return NextResponse.json([])
  }
}
