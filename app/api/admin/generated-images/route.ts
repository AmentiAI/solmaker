import { NextRequest, NextResponse } from 'next/server';

import { checkAuthorizationServer } from '@/lib/auth/access-control';
import { sql } from '@/lib/database';



// GET /api/admin/generated-images - Get all generated ordinals with pagination
export async function GET(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 });
  }

  try {
    // Check authorization
    const url = new URL(request.url);
    const walletAddress = url.searchParams.get('wallet_address');

    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet address required' }, { status: 401 });
    }

    const authResult = await checkAuthorizationServer(request, sql);
    if (!authResult.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized. Admin access only.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = (page - 1) * limit;
    const collectionId = searchParams.get('collection_id');
    const search = searchParams.get('search')?.trim();

    // Build base query with conditions
    let countQuery;
    let dataQuery;

    if (collectionId && search) {
      const searchPattern = `%${search}%`;
      countQuery = sql`
        SELECT COUNT(*)::int as total
        FROM generated_ordinals go
        INNER JOIN collections c ON go.collection_id = c.id
        WHERE go.collection_id = ${collectionId}
          AND (c.name ILIKE ${searchPattern} OR go.id::text ILIKE ${searchPattern} OR go.ordinal_number::text ILIKE ${searchPattern})
      `;
      dataQuery = sql`
        SELECT 
          go.id,
          go.collection_id,
          go.ordinal_number,
          go.image_url,
          go.compressed_image_url,
          go.thumbnail_url,
          go.metadata_url,
          go.prompt,
          go.art_style as ordinal_art_style,
          go.original_size_kb,
          go.compressed_size_kb,
          go.thumbnail_size_kb,
          go.traits,
          go.created_at,
          c.name as collection_name,
          c.art_style as collection_art_style,
          c.border_requirements,
          c.custom_rules,
          c.colors_description,
          c.lighting_description,
          c.generation_mode,
          c.compression_quality,
          c.compression_dimensions,
          c.compression_format,
          c.compression_target_kb,
          c.is_pfp_collection,
          c.facing_direction,
          c.body_style,
          c.use_hyper_detailed,
          c.pixel_perfect,
          c.wireframe_config
        FROM generated_ordinals go
        INNER JOIN collections c ON go.collection_id = c.id
        WHERE go.collection_id = ${collectionId}
          AND (c.name ILIKE ${searchPattern} OR go.id::text ILIKE ${searchPattern} OR go.ordinal_number::text ILIKE ${searchPattern})
        ORDER BY go.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    } else if (collectionId) {
      countQuery = sql`
        SELECT COUNT(*)::int as total
        FROM generated_ordinals go
        INNER JOIN collections c ON go.collection_id = c.id
        WHERE go.collection_id = ${collectionId}
      `;
      dataQuery = sql`
        SELECT 
          go.id,
          go.collection_id,
          go.ordinal_number,
          go.image_url,
          go.compressed_image_url,
          go.thumbnail_url,
          go.metadata_url,
          go.prompt,
          go.art_style as ordinal_art_style,
          go.original_size_kb,
          go.compressed_size_kb,
          go.thumbnail_size_kb,
          go.traits,
          go.created_at,
          c.name as collection_name,
          c.art_style as collection_art_style,
          c.border_requirements,
          c.custom_rules,
          c.colors_description,
          c.lighting_description,
          c.generation_mode,
          c.compression_quality,
          c.compression_dimensions,
          c.compression_format,
          c.compression_target_kb,
          c.is_pfp_collection,
          c.facing_direction,
          c.body_style,
          c.use_hyper_detailed,
          c.pixel_perfect,
          c.wireframe_config
        FROM generated_ordinals go
        INNER JOIN collections c ON go.collection_id = c.id
        WHERE go.collection_id = ${collectionId}
        ORDER BY go.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    } else if (search) {
      const searchPattern = `%${search}%`;
      countQuery = sql`
        SELECT COUNT(*)::int as total
        FROM generated_ordinals go
        INNER JOIN collections c ON go.collection_id = c.id
        WHERE c.name ILIKE ${searchPattern} OR go.id::text ILIKE ${searchPattern} OR go.ordinal_number::text ILIKE ${searchPattern}
      `;
      dataQuery = sql`
        SELECT 
          go.id,
          go.collection_id,
          go.ordinal_number,
          go.image_url,
          go.compressed_image_url,
          go.thumbnail_url,
          go.metadata_url,
          go.prompt,
          go.art_style as ordinal_art_style,
          go.original_size_kb,
          go.compressed_size_kb,
          go.thumbnail_size_kb,
          go.traits,
          go.created_at,
          c.name as collection_name,
          c.art_style as collection_art_style,
          c.border_requirements,
          c.custom_rules,
          c.colors_description,
          c.lighting_description,
          c.generation_mode,
          c.compression_quality,
          c.compression_dimensions,
          c.compression_format,
          c.compression_target_kb,
          c.is_pfp_collection,
          c.facing_direction,
          c.body_style,
          c.use_hyper_detailed,
          c.pixel_perfect,
          c.wireframe_config
        FROM generated_ordinals go
        INNER JOIN collections c ON go.collection_id = c.id
        WHERE c.name ILIKE ${searchPattern} OR go.id::text ILIKE ${searchPattern} OR go.ordinal_number::text ILIKE ${searchPattern}
        ORDER BY go.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    } else {
      countQuery = sql`
        SELECT COUNT(*)::int as total
        FROM generated_ordinals go
        INNER JOIN collections c ON go.collection_id = c.id
      `;
      dataQuery = sql`
        SELECT 
          go.id,
          go.collection_id,
          go.ordinal_number,
          go.image_url,
          go.compressed_image_url,
          go.thumbnail_url,
          go.metadata_url,
          go.prompt,
          go.art_style as ordinal_art_style,
          go.original_size_kb,
          go.compressed_size_kb,
          go.thumbnail_size_kb,
          go.traits,
          go.created_at,
          c.name as collection_name,
          c.art_style as collection_art_style,
          c.border_requirements,
          c.custom_rules,
          c.colors_description,
          c.lighting_description,
          c.generation_mode,
          c.compression_quality,
          c.compression_dimensions,
          c.compression_format,
          c.compression_target_kb,
          c.is_pfp_collection,
          c.facing_direction,
          c.body_style,
          c.use_hyper_detailed,
          c.pixel_perfect,
          c.wireframe_config
        FROM generated_ordinals go
        INNER JOIN collections c ON go.collection_id = c.id
        ORDER BY go.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    }

    const countResult = await countQuery as any[];
    const total = countResult[0]?.total || 0;

    const result = await dataQuery as any[];
    const ordinals = Array.isArray(result) ? result : [];

    // Fetch any generation errors for these ordinals
    const ordinalIds = ordinals.map((o: any) => o.id);
    const ordinalNumbers = ordinals.map((o: any) => o.ordinal_number).filter((n: any) => n !== null);
    const collectionIds = [...new Set(ordinals.map((o: any) => o.collection_id))];
    
    // Get errors - match by collection_id + ordinal_number
    let errors: any[] = [];
    if (ordinalNumbers.length > 0 && collectionIds.length > 0) {
      try {
        const errorResult = await sql`
          SELECT 
            ge.collection_id,
            ge.ordinal_number,
            ge.error_type,
            ge.error_message,
            ge.error_details,
            ge.api_response,
            ge.prompt as error_prompt,
            ge.created_at as error_created_at
          FROM generation_errors ge
          WHERE ge.collection_id = ANY(${collectionIds})
            AND ge.ordinal_number = ANY(${ordinalNumbers})
          ORDER BY ge.created_at DESC
        ` as any[];
        errors = Array.isArray(errorResult) ? errorResult : [];
      } catch (errorFetchErr) {
        console.error('[Admin Generated Images API] Error fetching generation errors:', errorFetchErr);
      }
    }
    
    // Create a map for quick error lookup
    const errorMap = new Map<string, any>();
    for (const err of errors) {
      const key = `${err.collection_id}-${err.ordinal_number}`;
      // Only keep the most recent error per ordinal
      if (!errorMap.has(key)) {
        errorMap.set(key, err);
      }
    }

    return NextResponse.json({
      ordinals: ordinals.map(ordinal => {
        const errorKey = `${ordinal.collection_id}-${ordinal.ordinal_number}`;
        const error = errorMap.get(errorKey);
        
        return {
          id: ordinal.id,
          collection_id: ordinal.collection_id,
          collection_name: ordinal.collection_name,
          ordinal_number: ordinal.ordinal_number,
          image_url: ordinal.compressed_image_url || ordinal.image_url,
          compressed_image_url: ordinal.compressed_image_url,
          thumbnail_url: ordinal.thumbnail_url,
          metadata_url: ordinal.metadata_url,
          prompt: ordinal.prompt,
          ordinal_art_style: ordinal.ordinal_art_style,
          original_size_kb: ordinal.original_size_kb,
          compressed_size_kb: ordinal.compressed_size_kb,
          thumbnail_size_kb: ordinal.thumbnail_size_kb,
          traits: ordinal.traits,
          created_at: ordinal.created_at,
          // Generation error info (if any)
          generation_error: error ? {
            error_type: error.error_type,
            error_message: error.error_message,
            error_details: error.error_details,
            api_response: error.api_response,
            error_prompt: error.error_prompt,
            error_created_at: error.error_created_at,
          } : null,
          // Collection settings
          collection_settings: {
            art_style: ordinal.collection_art_style,
            border_requirements: ordinal.border_requirements,
            custom_rules: ordinal.custom_rules,
            colors_description: ordinal.colors_description,
            lighting_description: ordinal.lighting_description,
            generation_mode: ordinal.generation_mode,
            compression_quality: ordinal.compression_quality,
            compression_dimensions: ordinal.compression_dimensions,
            compression_format: ordinal.compression_format,
            compression_target_kb: ordinal.compression_target_kb,
            is_pfp_collection: ordinal.is_pfp_collection,
            facing_direction: ordinal.facing_direction,
            body_style: ordinal.body_style,
            use_hyper_detailed: ordinal.use_hyper_detailed,
            pixel_perfect: ordinal.pixel_perfect,
            wireframe_config: ordinal.wireframe_config,
          },
        };
      }),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error('[Admin Generated Images API] Error:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch generated images',
      details: error?.message 
    }, { status: 500 });
  }
}

// DELETE /api/admin/generated-images - Delete selected ordinals
export async function DELETE(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 });
  }

  try {
    // Check authorization
    const url = new URL(request.url);
    const walletAddress = url.searchParams.get('wallet_address');

    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet address required' }, { status: 401 });
    }

    const authResult = await checkAuthorizationServer(request, sql);
    if (!authResult.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized. Admin access only.' }, { status: 403 });
    }

    const body = await request.json();
    const { ordinal_ids } = body;

    if (!ordinal_ids || !Array.isArray(ordinal_ids) || ordinal_ids.length === 0) {
      return NextResponse.json({ error: 'No ordinal IDs provided' }, { status: 400 });
    }

    // Delete ordinals
    const result = await sql`
      DELETE FROM generated_ordinals
      WHERE id = ANY(${ordinal_ids})
      RETURNING id
    ` as any[];

    const deleted = Array.isArray(result) ? result : [];

    return NextResponse.json({
      message: `Successfully deleted ${deleted.length} ordinal(s)`,
      deleted_count: deleted.length,
    });
  } catch (error: any) {
    console.error('[Admin Generated Images API] Delete Error:', error);
    return NextResponse.json({ 
      error: 'Failed to delete ordinals',
      details: error?.message 
    }, { status: 500 });
  }
}

