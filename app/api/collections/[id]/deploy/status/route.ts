import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'

/**
 * GET /api/collections/[id]/deploy/status
 * Get the current deployment state of a collection
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!sql) {
    return NextResponse.json({ error: 'Database not available' }, { status: 500 })
  }

  try {
    const { id: collectionId } = await params
    const { searchParams } = new URL(request.url)
    const wallet_address = searchParams.get('wallet_address')

    const collections = await sql`
      SELECT 
        metadata_uploaded,
        collection_mint_address,
        candy_machine_address,
        deployment_status
      FROM collections 
      WHERE id = ${collectionId}::uuid
      ${wallet_address ? sql`AND wallet_address = ${wallet_address}` : sql``}
    ` as any[]

    if (!collections.length) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 })
    }

    const collection = collections[0]

    return NextResponse.json({
      metadata_uploaded: !!collection.metadata_uploaded,
      collection_mint_address: collection.collection_mint_address || null,
      candy_machine_address: collection.candy_machine_address || null,
      deployment_status: collection.deployment_status || null,
    })
  } catch (error: any) {
    console.error('[Deploy Status] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
