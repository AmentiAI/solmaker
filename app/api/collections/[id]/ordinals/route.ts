import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { del } from '@vercel/blob'

// GET /api/collections/[id]/ordinals - Get ordinals for a collection with pagination
// This endpoint matches the behavior of /full for ordinals to ensure consistency
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const { id: collectionId } = await params
    const { searchParams } = new URL(request.url)
    
    // Support both offset-based (for promotion) and page-based (for collection page) pagination
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')))
    const offset = searchParams.has('offset') 
      ? Math.max(0, parseInt(searchParams.get('offset') || '0'))
      : (page - 1) * limit

    // Get trait filters
    const traitFilters: Record<string, string> = {}
    for (const [key, value] of searchParams.entries()) {
      if (key.startsWith('trait_') && value) {
        const layerName = key.replace('trait_', '')
        traitFilters[layerName] = value
      }
    }

    // Check if we should show ordinals with orphaned traits (traits that no longer exist)
    const showOrphaned = searchParams.get('show_orphaned') === 'true'

    // Fetch ordinals with pagination (same query style as /full endpoint)
    const ordinalsResult = await sql`
      SELECT 
        id, collection_id, ordinal_number, image_url, compressed_image_url,
        thumbnail_url, metadata_url, prompt, traits, created_at,
        compressed_size_kb::numeric, original_size_kb::numeric, art_style,
        is_minted, inscription_id, minter_address, mint_tx_id, minted_at
      FROM generated_ordinals
      WHERE collection_id = ${collectionId}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `

    // Get total count
    const totalCountResult = await sql`
      SELECT COUNT(*)::int as total
      FROM generated_ordinals
      WHERE collection_id = ${collectionId}
    `

    let ordinals = Array.isArray(ordinalsResult) ? ordinalsResult : []
    let total = Array.isArray(totalCountResult) && totalCountResult.length > 0 
      ? (totalCountResult[0] as any).total 
      : 0

    // Get all existing traits for this collection to detect orphaned traits
    let existingTraitsMap: Record<string, Set<string>> = {}
    if (showOrphaned || Object.keys(traitFilters).length > 0) {
      const layersResult = await sql`
        SELECT id, name
        FROM layers
        WHERE collection_id = ${collectionId}
      ` as any[]
      
      const layerIds = Array.isArray(layersResult) ? layersResult.map(l => l.id) : []
      
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
    }

    // Apply trait filters in memory if needed (same as /full endpoint)
    if (Object.keys(traitFilters).length > 0 || showOrphaned) {
      const allOrdinalsResult = await sql`
        SELECT 
          id, collection_id, ordinal_number, image_url, compressed_image_url,
          thumbnail_url, metadata_url, prompt, traits, created_at,
          compressed_size_kb::numeric, original_size_kb::numeric, art_style,
          is_minted, inscription_id, minter_address, mint_tx_id, minted_at
        FROM generated_ordinals
        WHERE collection_id = ${collectionId}
        ORDER BY created_at DESC
      `
      
      let filteredOrdinals = Array.isArray(allOrdinalsResult) ? allOrdinalsResult : []
      
      if (showOrphaned) {
        // Filter to only show ordinals with orphaned traits
        filteredOrdinals = filteredOrdinals.filter(ordinal => {
          const traits = (ordinal.traits as any) || {}
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
      } else if (Object.keys(traitFilters).length > 0) {
        // Normal trait filtering
        filteredOrdinals = filteredOrdinals.filter(ordinal => {
          for (const [layerName, traitName] of Object.entries(traitFilters)) {
            if (traitName) {
              const ordinalTrait = (ordinal.traits as any)?.[layerName]
              if (!ordinalTrait || ordinalTrait.name !== traitName) {
                return false
              }
            }
          }
          return true
        })
      }
      
      total = filteredOrdinals.length
      ordinals = filteredOrdinals.slice(offset, offset + limit)
    }

    const totalPages = Math.ceil(total / limit)

    return NextResponse.json({
      ordinals,
      // Both formats for compatibility
      pagination: {
        total,
        totalPages,
        currentPage: page,
        limit
      },
      // Also include flat format for promotion page
      total,
      limit,
      offset,
      hasMore: offset + ordinals.length < total
    })
  } catch (error) {
    console.error('[Collections Ordinals API] Error:', error)
    return NextResponse.json({ error: 'Failed to fetch ordinals' }, { status: 500 })
  }
}

// DELETE /api/collections/[id]/ordinals?ordinal_id=xxx - Delete an ordinal
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const { id: collectionId } = await params
    const { searchParams } = new URL(request.url)
    const ordinalId = searchParams.get('ordinal_id')
    const walletAddress = searchParams.get('wallet_address')

    if (!ordinalId) {
      return NextResponse.json({ error: 'ordinal_id is required' }, { status: 400 })
    }

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

    // Get the ordinal to delete
    const ordinalResult = await sql`
      SELECT 
        id,
        image_url,
        compressed_image_url,
        thumbnail_url,
        metadata_url
      FROM generated_ordinals
      WHERE id = ${ordinalId}
        AND collection_id = ${collectionId}
    ` as any[]

    if (!ordinalResult || ordinalResult.length === 0) {
      return NextResponse.json({ error: 'Ordinal not found' }, { status: 404 })
    }

    const ordinal = ordinalResult[0]

    // Delete images from blob storage
    const urlsToDelete = [
      ordinal.image_url,
      ordinal.compressed_image_url,
      ordinal.thumbnail_url,
      ordinal.metadata_url
    ].filter((url): url is string => Boolean(url))

    const deletePromises = urlsToDelete.map(async (url) => {
      try {
        await del(url)
        console.log(`[Delete Ordinal] Deleted blob: ${url}`)
      } catch (error) {
        console.error(`[Delete Ordinal] Failed to delete blob ${url}:`, error)
        // Continue even if blob deletion fails
      }
    })

    await Promise.allSettled(deletePromises)

    // Delete the ordinal from database
    const deleteResult = await sql`
      DELETE FROM generated_ordinals
      WHERE id = ${ordinalId}
        AND collection_id = ${collectionId}
      RETURNING id
    ` as any[]

    if (!deleteResult || deleteResult.length === 0) {
      return NextResponse.json({ error: 'Failed to delete ordinal from database' }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true,
      message: 'Ordinal deleted successfully'
    })
  } catch (error) {
    console.error('[Collections Ordinals API] Delete error:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Failed to delete ordinal' 
    }, { status: 500 })
  }
}
