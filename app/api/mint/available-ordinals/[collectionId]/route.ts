import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database';


// GET /api/mint/available-ordinals/[collectionId] - Get unminted ordinals
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ collectionId: string }> }
) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const { collectionId } = await params
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = (page - 1) * limit

    // Try to fetch ordinals with is_minted filter first
    // If that fails (column doesn't exist), fall back to fetching all
    let ordinals
    let totalCount
    try {
      // Get total count
      const countResult = await sql`
        SELECT COUNT(*)::int as total
        FROM generated_ordinals
        WHERE collection_id = ${collectionId}
          AND (is_minted IS NULL OR is_minted = FALSE)
      `
      totalCount = countResult[0]?.total || 0

      // Get paginated ordinals
      ordinals = await sql`
        SELECT 
          id,
          ordinal_number,
          image_url,
          thumbnail_url,
          metadata_url,
          traits,
          file_size_bytes,
          created_at
        FROM generated_ordinals
        WHERE collection_id = ${collectionId}
          AND (is_minted IS NULL OR is_minted = FALSE)
        ORDER BY ordinal_number ASC
        LIMIT ${limit}
        OFFSET ${offset}
      `
    } catch (columnError) {
      // If is_minted column doesn't exist, just fetch all ordinals
      console.log('is_minted column not found, fetching all ordinals')
      
      const countResult = await sql`
        SELECT COUNT(*)::int as total
        FROM generated_ordinals
        WHERE collection_id = ${collectionId}
      `
      totalCount = countResult[0]?.total || 0

      ordinals = await sql`
        SELECT 
          id,
          ordinal_number,
          image_url,
          thumbnail_url,
          metadata_url,
          traits,
          file_size_bytes,
          created_at
        FROM generated_ordinals
        WHERE collection_id = ${collectionId}
        ORDER BY ordinal_number ASC
        LIMIT ${limit}
        OFFSET ${offset}
      `
    }

    const ordinalsArray = Array.isArray(ordinals) ? ordinals : []
    const totalPages = Math.ceil(totalCount / limit)

    return NextResponse.json({
      ordinals: ordinalsArray,
      count: ordinalsArray.length,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages,
      },
    })
  } catch (error) {
    console.error('Error fetching available ordinals:', error)
    return NextResponse.json({ 
      error: 'Failed to fetch ordinals',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

