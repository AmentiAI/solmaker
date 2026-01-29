import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/database';
import { isAuthorized } from '@/lib/auth/access-control';

// GET /api/collections/[id]/full - Get collection with all related data in one request
// OPTIMIZED: Combines 4 separate API calls into 1 with parallel queries
// SECURED: Requires wallet_address and verifies ownership/collaborator access
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 });
  }

  try {
    const { id: collectionId } = await params;
    const { searchParams } = new URL(request.url);
    
    // Authorization check
    const walletAddress = searchParams.get('wallet_address');
    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet address required' }, { status: 401 });
    }
    
    // Pagination params
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '15');
    const offset = (page - 1) * limit;

    // Get trait filters
    const traitFilters: Record<string, string> = {};
    for (const [key, value] of searchParams.entries()) {
      if (key.startsWith('trait_') && value) {
        const layerName = key.replace('trait_', '');
        traitFilters[layerName] = value;
      }
    }

    // Check if we should show ordinals with orphaned traits
    const showOrphaned = searchParams.get('show_orphaned') === 'true'

    // Execute all queries in parallel for maximum speed
    const [
      collectionResult,
      layersResult,
      ordinalsResult,
      totalCountResult,
      jobStatusResult
    ] = await Promise.all([
      // 1. Get collection data (single query with all fields)
      sql`
        SELECT 
          id, name, description, is_active, created_at, updated_at, wallet_address,
          art_style, border_requirements, custom_rules, colors_description,
          lighting_description, generation_mode, compression_quality,
          compression_dimensions, compression_format, compression_target_kb,
          is_pfp_collection, facing_direction, body_style, use_hyper_detailed,
          COALESCE(collection_status, 'draft') as collection_status
        FROM collections 
        WHERE id::text = ${collectionId}
      `,
      
      // 2. Get layers with trait counts
      sql`
        SELECT 
          l.id, l.name, l.display_order, l.created_at, l.updated_at,
          COUNT(t.id)::int as trait_count
        FROM layers l
        LEFT JOIN traits t ON l.id = t.layer_id
        WHERE l.collection_id = ${collectionId}
        GROUP BY l.id, l.name, l.display_order, l.created_at, l.updated_at
        ORDER BY l.display_order ASC
      `,
      
      // 3. Get ordinals (paginated)
      sql`
        SELECT 
          id, collection_id, ordinal_number, image_url, compressed_image_url,
          thumbnail_url, metadata_url, prompt, traits, created_at,
          compressed_size_kb::numeric, original_size_kb::numeric, art_style
        FROM generated_ordinals
        WHERE collection_id = ${collectionId}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
      
      // 4. Get total ordinals count
      sql`
        SELECT COUNT(*)::int as total
        FROM generated_ordinals
        WHERE collection_id = ${collectionId}
      `,
      
      // 5. Get job status counts
      sql`
        SELECT status, COUNT(*)::int as count
        FROM generation_jobs
        WHERE collection_id = ${collectionId}
        AND status IN ('pending', 'processing')
        GROUP BY status
      `
    ]);

    // Process collection
    const collection = Array.isArray(collectionResult) && collectionResult.length > 0 
      ? {
          ...collectionResult[0],
          compression_quality: collectionResult[0].compression_quality ?? 100,
          compression_dimensions: collectionResult[0].compression_dimensions ?? 1024,
          compression_format: collectionResult[0].compression_format ?? 'webp',
          generation_mode: collectionResult[0].generation_mode ?? 'trait',
          is_pfp_collection: collectionResult[0].is_pfp_collection ?? false,
          body_style: collectionResult[0].body_style ?? 'full',
          use_hyper_detailed: collectionResult[0].use_hyper_detailed ?? true
        }
      : null;

    if (!collection) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
    }

    // Authorization check - must be owner, collaborator, or admin
    const isAdmin = isAuthorized(walletAddress);
    const isOwner = walletAddress.trim() === collection.wallet_address;
    let hasAccess = isOwner || isAdmin;

    if (!hasAccess) {
      // Check if user is a collaborator
      const collaboratorResult = await sql`
        SELECT role FROM collection_collaborators
        WHERE collection_id = ${collectionId}
          AND wallet_address = ${walletAddress.trim()}
          AND status = 'accepted'
      ` as any[];
      hasAccess = Array.isArray(collaboratorResult) && collaboratorResult.length > 0;
    }

    if (!hasAccess) {
      return NextResponse.json({ error: 'Not authorized to access this collection' }, { status: 403 });
    }

    // Process layers
    const layers = Array.isArray(layersResult) ? layersResult : [];

    // Process ordinals with optional trait filtering
    let ordinals = Array.isArray(ordinalsResult) ? ordinalsResult : [];
    let total = Array.isArray(totalCountResult) && totalCountResult[0] 
      ? totalCountResult[0].total 
      : 0;

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

    // Apply trait filters in memory if needed
    if (Object.keys(traitFilters).length > 0 || showOrphaned) {
      // For trait filtering, we need to fetch all and filter
      // This is a trade-off for flexibility vs performance
      const allOrdinalsResult = await sql`
        SELECT 
          id, collection_id, ordinal_number, image_url, compressed_image_url,
          thumbnail_url, metadata_url, prompt, traits, created_at,
          compressed_size_kb::numeric, original_size_kb::numeric
        FROM generated_ordinals
        WHERE collection_id = ${collectionId}
        ORDER BY created_at DESC
      `;
      
      let filteredOrdinals = Array.isArray(allOrdinalsResult) ? allOrdinalsResult : [];
      
      if (showOrphaned) {
        // Filter to only show ordinals with orphaned traits
        filteredOrdinals = filteredOrdinals.filter(ordinal => {
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
      } else if (Object.keys(traitFilters).length > 0) {
        // Normal trait filtering
        filteredOrdinals = filteredOrdinals.filter(ordinal => {
          for (const [layerName, traitName] of Object.entries(traitFilters)) {
            if (traitName) {
              const ordinalTrait = ordinal.traits?.[layerName];
              if (!ordinalTrait || ordinalTrait.name !== traitName) {
                return false;
              }
            }
          }
          return true;
        });
      }
      
      total = filteredOrdinals.length;
      ordinals = filteredOrdinals.slice(offset, offset + limit);
    }

    // Process job status
    const jobCounts: Record<string, number> = {};
    if (Array.isArray(jobStatusResult)) {
      jobStatusResult.forEach(row => {
        jobCounts[row.status] = row.count;
      });
    }

    return NextResponse.json({
      collection,
      layers,
      ordinals,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      },
      jobStatus: {
        pending: jobCounts.pending || 0,
        processing: jobCounts.processing || 0,
        total: (jobCounts.pending || 0) + (jobCounts.processing || 0)
      }
    }, {
      headers: {
        'Cache-Control': 'private, max-age=5' // Short cache for dynamic data
      }
    });

  } catch (error: any) {
    console.error('[Collections Full API] Error:', error?.message);
    return NextResponse.json({ 
      error: 'Failed to fetch collection data',
      details: error?.message 
    }, { status: 500 });
  }
}

