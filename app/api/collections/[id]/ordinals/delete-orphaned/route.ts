import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { del } from '@vercel/blob'

// POST /api/collections/[id]/ordinals/delete-orphaned - Delete all ordinals with orphaned traits
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const { id: collectionId } = await params
    const { searchParams } = new URL(request.url)
    const walletAddress = searchParams.get('wallet_address')

    if (!walletAddress) {
      return NextResponse.json({ error: 'wallet_address is required' }, { status: 400 })
    }

    // Verify collection exists and get owner
    const collectionResult = await sql`
      SELECT wallet_address
      FROM collections
      WHERE id::text = ${collectionId}
    ` as any[]

    if (!collectionResult || collectionResult.length === 0) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 })
    }

    const collectionOwner = collectionResult[0].wallet_address

    // Check if user is owner or collaborator with editor role
    const isOwner = walletAddress.trim() === collectionOwner
    let isAuthorized = isOwner

    if (!isOwner) {
      const collaboratorResult = await sql`
        SELECT role
        FROM collection_collaborators
        WHERE collection_id = ${collectionId}
          AND wallet_address = ${walletAddress.trim()}
          AND status = 'accepted'
          AND role IN ('owner', 'editor')
      ` as any[]

      isAuthorized = Array.isArray(collaboratorResult) && collaboratorResult.length > 0
    }

    if (!isAuthorized) {
      return NextResponse.json({ 
        error: 'You do not have permission to delete ordinals from this collection' 
      }, { status: 403 })
    }

    // Get all existing traits for this collection
    const layersResult = await sql`
      SELECT id, name
      FROM layers
      WHERE collection_id = ${collectionId}
    ` as any[]
    
    const layerIds = Array.isArray(layersResult) ? layersResult.map(l => l.id) : []
    const existingTraitsMap: Record<string, Set<string>> = {}
    
    if (layerIds.length > 0) {
      const traitsResult = await sql`
        SELECT layer_id, name
        FROM traits
        WHERE layer_id = ANY(${layerIds})
      ` as any[]
      
      // Build map: layer_name -> Set of trait names
      layersResult.forEach((layer: any) => {
        existingTraitsMap[layer.name] = new Set()
      })
      
      if (Array.isArray(traitsResult)) {
        traitsResult.forEach((trait: any) => {
          const layer = layersResult.find((l: any) => l.id === trait.layer_id)
          if (layer && existingTraitsMap[layer.name]) {
            existingTraitsMap[layer.name].add(trait.name)
          }
        })
      }
    }

    // Get all ordinals for this collection
    const allOrdinalsResult = await sql`
      SELECT 
        id,
        image_url,
        compressed_image_url,
        thumbnail_url,
        metadata_url,
        traits
      FROM generated_ordinals
      WHERE collection_id = ${collectionId}
    ` as any[]

    const allOrdinals = Array.isArray(allOrdinalsResult) ? allOrdinalsResult : []
    
    // Find ordinals with orphaned traits
    const orphanedOrdinals = allOrdinals.filter((ordinal: any) => {
      const traits = ordinal.traits || {}
      // Check if any trait in the ordinal references a deleted trait
      for (const [layerName, traitData] of Object.entries(traits)) {
        const traitName = (traitData as any)?.name
        if (traitName) {
          const validTraits = existingTraitsMap[layerName]
          // If layer doesn't exist or trait doesn't exist in valid traits, it's orphaned
          if (!validTraits || !validTraits.has(traitName)) {
            return true // This ordinal has an orphaned trait
          }
        }
      }
      return false
    })

    if (orphanedOrdinals.length === 0) {
      return NextResponse.json({ 
        success: true,
        deleted: 0,
        message: 'No ordinals with orphaned traits found'
      })
    }

    // Delete images from blob storage for all orphaned ordinals
    const deletePromises: Promise<void>[] = []
    orphanedOrdinals.forEach((ordinal: any) => {
      const urlsToDelete = [
        ordinal.image_url,
        ordinal.compressed_image_url,
        ordinal.thumbnail_url,
        ordinal.metadata_url
      ].filter((url): url is string => Boolean(url))

      urlsToDelete.forEach((url) => {
        deletePromises.push(
          del(url).catch((error) => {
            console.error(`[Delete Orphaned] Failed to delete blob ${url}:`, error)
            // Continue even if blob deletion fails
          })
        )
      })
    })

    await Promise.allSettled(deletePromises)

    // Delete ordinals from database
    const ordinalIds = orphanedOrdinals.map((o: any) => o.id)
    const deleteResult = await sql`
      DELETE FROM generated_ordinals
      WHERE id = ANY(${ordinalIds})
        AND collection_id = ${collectionId}
      RETURNING id
    ` as any[]

    const deletedCount = Array.isArray(deleteResult) ? deleteResult.length : 0

    return NextResponse.json({ 
      success: true,
      deleted: deletedCount,
      message: `Successfully deleted ${deletedCount} ordinal(s) with orphaned traits`
    })
  } catch (error) {
    console.error('[Collections Ordinals API] Delete orphaned error:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Failed to delete orphaned ordinals' 
    }, { status: 500 })
  }
}



