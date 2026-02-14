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
        deployment_status,
        wallet_address
      FROM collections
      WHERE id = ${collectionId}::uuid
    ` as any[]

    if (!collections.length) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 })
    }

    const collection = collections[0]

    // If wallet address is provided, verify user is owner or collaborator
    if (wallet_address) {
      const isOwner = collection.wallet_address === wallet_address

      let isCollaborator = false
      if (!isOwner) {
        const collaboratorResult = await sql`
          SELECT role FROM collection_collaborators
          WHERE collection_id = ${collectionId}::uuid
            AND wallet_address = ${wallet_address.trim()}
            AND status = 'accepted'
            AND role IN ('owner', 'editor')
        ` as any[]
        isCollaborator = Array.isArray(collaboratorResult) && collaboratorResult.length > 0
      }

      // User must be owner or collaborator
      if (!isOwner && !isCollaborator) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
      }
    }

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
