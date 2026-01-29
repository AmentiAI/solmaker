import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/database';
import { isAuthorized } from '@/lib/auth/access-control';

// PUT /api/collections/[id]/compression-settings - Update compression settings only
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const { wallet_address, compression_quality, compression_dimensions, compression_format, compression_target_kb } = body;

    // Authorization check
    if (!wallet_address) {
      return NextResponse.json({ error: 'Wallet address required' }, { status: 401 });
    }

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

    // Validate compression settings
    const quality = compression_quality !== undefined ? Math.max(0, Math.min(100, parseInt(String(compression_quality)) || 100)) : 100;
    const dimensions = compression_dimensions !== undefined && compression_dimensions !== null && compression_dimensions !== ''
      ? Math.max(1, Math.min(1024, parseInt(String(compression_dimensions)) || 1024))
      : null;
    const format = compression_format && ['jpg', 'png', 'webp'].includes(compression_format) ? compression_format : 'webp';
    const targetKB = compression_target_kb !== undefined && compression_target_kb !== null && compression_target_kb !== ''
      ? (() => {
          const parsed = parseInt(String(compression_target_kb));
          return isNaN(parsed) ? null : Math.max(1, Math.min(10000, parsed));
        })()
      : null;

    const result = await sql`
      UPDATE collections
      SET compression_quality = ${quality},
          compression_dimensions = ${dimensions},
          compression_format = ${format},
          compression_target_kb = ${targetKB},
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
    console.error('Error updating compression settings:', error);
    return NextResponse.json({ error: 'Failed to update compression settings' }, { status: 500 });
  }
}

