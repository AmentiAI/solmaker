import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/database';
import { isAuthorized } from '@/lib/auth/access-control';
import { requireWalletAuth } from '@/lib/auth/signature-verification';

// GET /api/collections/[id] - Get specific collection (requires authorization)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 });
  }

  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const walletAddress = searchParams.get('wallet_address');

    // Require wallet address for authorization
    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet address required' }, { status: 401 });
    }
    
    // Start with basic columns that definitely exist
    const result = await sql`
      SELECT 
        id,
        name,
        description,
        is_active,
        created_at,
        updated_at,
        wallet_address,
        collection_status
      FROM collections 
      WHERE id::text = ${id}
    ` as any[];

    const collection = Array.isArray(result) && result.length > 0 ? result[0] : null;

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
        WHERE collection_id = ${id}
          AND wallet_address = ${walletAddress.trim()}
          AND status = 'accepted'
      ` as any[];
      hasAccess = Array.isArray(collaboratorResult) && collaboratorResult.length > 0;
    }

    if (!hasAccess) {
      return NextResponse.json({ error: 'Not authorized to access this collection' }, { status: 403 });
    }

    // Try to get additional columns if they exist (optional, won't fail if they don't exist)
    try {
      const extendedResult = await sql`
        SELECT
          art_style,
          border_requirements,
          custom_rules,
          colors_description,
          lighting_description,
          generation_mode,
          compression_quality,
          compression_dimensions,
          compression_format,
          compression_target_kb,
          is_pfp_collection,
          facing_direction,
          body_style,
          use_hyper_detailed,
          pixel_perfect,
          wireframe_config
        FROM collections
        WHERE id::text = ${id}
      ` as any[];

      if (extendedResult.length > 0) {
        Object.assign(collection, {
          art_style: extendedResult[0].art_style || null,
          border_requirements: extendedResult[0].border_requirements || null,
          custom_rules: extendedResult[0].custom_rules || null,
          colors_description: extendedResult[0].colors_description || null,
          lighting_description: extendedResult[0].lighting_description || null,
          generation_mode: extendedResult[0].generation_mode || 'trait',
          compression_quality: extendedResult[0].compression_quality || 100,
          compression_dimensions: extendedResult[0].compression_dimensions || 1024,
          compression_format: extendedResult[0].compression_format || 'webp',
          compression_target_kb: extendedResult[0].compression_target_kb || null,
          is_pfp_collection: extendedResult[0].is_pfp_collection ?? false,
          facing_direction: extendedResult[0].facing_direction || null,
          body_style: extendedResult[0].body_style || 'full',
          use_hyper_detailed: extendedResult[0].use_hyper_detailed ?? true,
          pixel_perfect: extendedResult[0].pixel_perfect ?? false,
          wireframe_config: extendedResult[0].wireframe_config || null
        });
      }
    } catch (extendedError) {
      // If extended columns don't exist, use defaults
      console.log('[Collections API] Extended columns not available, using defaults');
      Object.assign(collection, {
        art_style: null,
        border_requirements: null,
        custom_rules: null,
        colors_description: null,
        lighting_description: null,
        generation_mode: 'trait',
        compression_quality: 100,
        compression_dimensions: 1024,
        compression_format: 'webp',
        is_pfp_collection: false,
        facing_direction: null,
        body_style: 'full',
        use_hyper_detailed: true,
        pixel_perfect: false
      });
    }

    console.log('[Collections API] Returning collection:', collection.id, collection.name);
    return NextResponse.json({ collection });
  } catch (error: any) {
    console.error('[Collections API] Error fetching collection:', error);
    console.error('[Collections API] Error details:', error?.message, error?.stack);
    return NextResponse.json({ 
      error: 'Failed to fetch collection',
      details: error?.message 
    }, { status: 500 });
  }
}

// PUT /api/collections/[id] - Update collection (requires authorization)
// PUT /api/collections/[id] - Update collection
// SECURITY: Requires wallet signature verification
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 });
  }

  try {
    const { id } = await params;
    
    // SECURITY: Require signature verification
    const auth = await requireWalletAuth(request, true);
    if (!auth.isValid || !auth.walletAddress) {
      return NextResponse.json({ 
        error: auth.error || 'Authentication required',
        details: 'Please sign the request with your wallet to verify ownership'
      }, { status: 401 });
    }
    
    const wallet_address = auth.walletAddress;
    const body = await request.clone().json();
    
    const { name, description, art_style, border_requirements, custom_rules, colors_description, lighting_description, compression_quality, compression_dimensions, compression_format, compression_target_kb, is_pfp_collection, facing_direction, body_style, pixel_perfect, wireframe_config } = body;

    // Get collection owner
    const collectionCheck = await sql`
      SELECT wallet_address FROM collections WHERE id::text = ${id}
    ` as any[];
    const existingCollection = collectionCheck?.[0] || null;

    if (!existingCollection) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
    }

    // Check authorization
    const isAdmin = isAuthorized(wallet_address);
    const isOwner = wallet_address.trim() === existingCollection.wallet_address;
    let hasAccess = isOwner || isAdmin;

    if (!hasAccess) {
      const collaboratorResult = await sql`
        SELECT role FROM collection_collaborators
        WHERE collection_id = ${id}
          AND wallet_address = ${wallet_address.trim()}
          AND status = 'accepted'
          AND role IN ('owner', 'editor')
      ` as any[];
      hasAccess = Array.isArray(collaboratorResult) && collaboratorResult.length > 0;
    }

    if (!hasAccess) {
      return NextResponse.json({ error: 'Not authorized to edit this collection' }, { status: 403 });
    }

    if (!name || name.trim() === '') {
      return NextResponse.json({ error: 'Collection name is required' }, { status: 400 });
    }

    // Validate compression settings
    const quality = compression_quality !== undefined ? Math.max(0, Math.min(100, parseInt(String(compression_quality)) || 100)) : 100;
    const dimensions = compression_dimensions !== undefined ? Math.max(1, Math.min(1024, parseInt(String(compression_dimensions)) || 1024)) : 1024;
    const format = compression_format && ['jpg', 'png', 'webp'].includes(compression_format) ? compression_format : 'webp';
    const targetKB = compression_target_kb !== undefined && compression_target_kb !== null 
      ? (() => {
          const parsed = parseInt(String(compression_target_kb));
          return isNaN(parsed) ? null : Math.max(1, Math.min(10000, parsed));
        })()
      : null;

    // Validate facing direction if PFP collection
    const validFacingDirections = ['left', 'left-front', 'front', 'right-front', 'right'];
    const facingDir = is_pfp_collection && facing_direction && validFacingDirections.includes(facing_direction) 
      ? facing_direction 
      : null;

    // Validate body style if PFP collection
    const validBodyStyles = ['full', 'half', 'headonly'];
    const bodyStyleValue = is_pfp_collection && body_style && validBodyStyles.includes(body_style)
      ? body_style
      : 'full';

    // Validate wireframe_config if provided
    const wireframeConfigValue = wireframe_config && typeof wireframe_config === 'object'
      ? wireframe_config
      : null;

    const result = await sql`
      UPDATE collections
      SET name = ${name.trim()},
          description = ${description || null},
          art_style = ${art_style || null},
          border_requirements = ${border_requirements || null},
          custom_rules = ${custom_rules || null},
          colors_description = ${colors_description || null},
          lighting_description = ${lighting_description || null},
          wireframe_config = ${wireframeConfigValue ? JSON.stringify(wireframeConfigValue) : null}::jsonb,
          generation_mode = ${body.generation_mode || null},
          compression_quality = ${quality},
          compression_dimensions = ${dimensions},
          compression_format = ${format},
          compression_target_kb = ${targetKB},
          is_pfp_collection = ${is_pfp_collection || false},
          facing_direction = ${facingDir},
          body_style = ${bodyStyleValue},
          pixel_perfect = ${pixel_perfect !== undefined ? pixel_perfect : false},
          updated_at = CURRENT_TIMESTAMP
      WHERE id::text = ${id}
      RETURNING id, name, description, art_style, border_requirements, custom_rules, generation_mode, compression_quality, compression_dimensions, compression_format, compression_target_kb, is_pfp_collection, facing_direction, body_style, use_hyper_detailed, pixel_perfect, wireframe_config, is_active, created_at, updated_at
    ` as any[];

    const collection = result[0] || null;

    if (!collection) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
    }

    return NextResponse.json({ collection });
  } catch (error) {
    console.error('Error updating collection:', error);
    return NextResponse.json({ error: 'Failed to update collection' }, { status: 500 });
  }
}

// DELETE /api/collections/[id] - Soft delete collection (requires authorization)
// DELETE /api/collections/[id] - Delete collection
// SECURITY: Requires wallet signature verification
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 });
  }

  try {
    const { id } = await params;
    
    // SECURITY: Require signature verification
    const auth = await requireWalletAuth(request, true);
    if (!auth.isValid || !auth.walletAddress) {
      return NextResponse.json({ 
        error: auth.error || 'Authentication required',
        details: 'Please sign the request with your wallet to verify ownership'
      }, { status: 401 });
    }
    
    const walletAddress = auth.walletAddress;

    // Get collection owner
    const collectionCheck = await sql`
      SELECT wallet_address FROM collections WHERE id::text = ${id}
    ` as any[];
    const existingCollection = collectionCheck?.[0] || null;

    if (!existingCollection) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
    }

    // Only owner or admin can delete
    const isAdmin = isAuthorized(walletAddress);
    const isOwner = walletAddress.trim() === existingCollection.wallet_address;

    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: 'Not authorized to delete this collection' }, { status: 403 });
    }

    const result = await sql`
      UPDATE collections 
      SET collection_status = 'deleted',
          updated_at = CURRENT_TIMESTAMP
      WHERE id::text = ${id}
      RETURNING id, name, collection_status
    ` as any[];

    const collection = result[0] || null;

    if (!collection) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Collection deleted successfully' });
  } catch (error) {
    console.error('Error deleting collection:', error);
    return NextResponse.json({ error: 'Failed to delete collection' }, { status: 500 });
  }
}