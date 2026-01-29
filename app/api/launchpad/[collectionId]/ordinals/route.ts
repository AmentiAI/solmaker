import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'

/**
 * GET /api/launchpad/[collectionId]/ordinals - Get paginated ordinals for choices mint
 * Query params: page (default 1), per_page (default 10)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ collectionId: string }> }
) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const { collectionId } = await params
    
    // Validate UUID format to prevent database errors from invalid IDs
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!collectionId || !uuidRegex.test(collectionId)) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 })
    }
    
    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const perPage = Math.min(50, Math.max(1, parseInt(searchParams.get('per_page') || '10', 10)))
    const offset = (page - 1) * perPage

    // Verify collection exists and is choices mint type
    const collectionResult = await sql`
      SELECT id, mint_type, collection_status
      FROM collections
      WHERE id = ${collectionId}
    ` as any[]
    const collection = collectionResult?.[0] || null

    if (!collection) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 })
    }

    if (collection.mint_type !== 'choices') {
      return NextResponse.json({ 
        error: 'Collection is not configured for choices mint',
        mint_type: collection.mint_type 
      }, { status: 400 })
    }

    // Get total count of available ordinals
    const totalCountResult = await sql`
      SELECT COUNT(*) as count
      FROM generated_ordinals
      WHERE collection_id = ${collectionId}
        AND is_minted = false
    ` as any[]
    const totalCount = parseInt(totalCountResult[0]?.count || '0', 10)
    const totalPages = Math.ceil(totalCount / perPage)

    // Get ordinals for this page with lock status
    const ordinalsResult = await sql`
      SELECT 
        go.id,
        go.ordinal_number,
        go.image_url,
        go.thumbnail_url,
        go.compressed_size_kb,
        go.is_minted,
        -- Check if ordinal is locked (has active reservation)
        CASE 
          WHEN EXISTS (
            SELECT 1 FROM ordinal_reservations r
            WHERE r.ordinal_id = go.id
              AND r.status = 'reserved'
              AND r.expires_at > NOW()
          ) THEN true
          ELSE false
        END as is_locked,
        -- Get lock expiry time if locked
        (
          SELECT r.expires_at
          FROM ordinal_reservations r
          WHERE r.ordinal_id = go.id
            AND r.status = 'reserved'
            AND r.expires_at > NOW()
          ORDER BY r.reserved_at DESC
          LIMIT 1
        ) as locked_until,
        -- Get who locked it (if locked)
        (
          SELECT r.reserved_by
          FROM ordinal_reservations r
          WHERE r.ordinal_id = go.id
            AND r.status = 'reserved'
            AND r.expires_at > NOW()
          ORDER BY r.reserved_at DESC
          LIMIT 1
        ) as locked_by
      FROM generated_ordinals go
      WHERE go.collection_id = ${collectionId}
        AND go.is_minted = false
      ORDER BY go.ordinal_number ASC NULLS LAST, go.id ASC
      LIMIT ${perPage}
      OFFSET ${offset}
    ` as any[]

    const ordinals = Array.isArray(ordinalsResult) ? ordinalsResult : []

    return NextResponse.json({
      ordinals,
      pagination: {
        page,
        per_page: perPage,
        total: totalCount,
        total_pages: totalPages,
        has_next: page < totalPages,
        has_prev: page > 1,
      },
    })
  } catch (error: any) {
    console.error('Error fetching paginated ordinals:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch ordinals' },
      { status: 500 }
    )
  }
}

