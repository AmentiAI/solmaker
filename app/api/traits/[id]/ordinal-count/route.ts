import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'

/**
 * GET /api/traits/[id]/ordinal-count - Get count of ordinals that have this trait
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const { id } = await params
    
    // Get trait name and layer info
    const traitResult = await sql`
      SELECT t.name, t.layer_id, l.name as layer_name, l.collection_id
      FROM traits t
      JOIN layers l ON t.layer_id = l.id
      WHERE t.id = ${id}
      LIMIT 1
    ` as any[]

    if (!traitResult || traitResult.length === 0) {
      return NextResponse.json({ error: 'Trait not found' }, { status: 404 })
    }

    const trait = traitResult[0]
    const traitName = trait.name
    const layerName = trait.layer_name
    const collectionId = trait.collection_id

    // Count ordinals that have this trait
    // We need to check the traits JSONB column for this trait
    const countResult = await sql`
      SELECT COUNT(*)::int as count
      FROM generated_ordinals
      WHERE collection_id = ${collectionId}
        AND traits::jsonb ? ${layerName}
        AND (traits::jsonb->>${layerName})::jsonb->>'name' = ${traitName}
    ` as any[]

    const count = countResult && countResult.length > 0 ? (countResult[0]?.count || 0) : 0

    return NextResponse.json({ count })
  } catch (error: any) {
    console.error('[Trait Ordinal Count API] Error:', error)
    return NextResponse.json(
      { error: 'Failed to count ordinals', details: error?.message },
      { status: 500 }
    )
  }
}

