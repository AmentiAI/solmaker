import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/database';
import { isAuthorized } from '@/lib/auth/access-control';

// Helper function to check layer access
async function checkLayerAccess(layerId: string, walletAddress: string): Promise<boolean> {
  const layerResult = await sql`
    SELECT c.wallet_address, c.id as collection_id
    FROM layers l
    JOIN collections c ON l.collection_id = c.id
    WHERE l.id = ${layerId}
  ` as any[];
  const layer = layerResult?.[0] || null;
  
  if (!layer) return false;
  
  const isAdmin = isAuthorized(walletAddress);
  const isOwner = walletAddress.trim() === layer.wallet_address;
  if (isOwner || isAdmin) return true;
  
  const collaboratorResult = await sql`
    SELECT role FROM collection_collaborators
    WHERE collection_id = ${layer.collection_id}
      AND wallet_address = ${walletAddress.trim()}
      AND status = 'accepted'
      AND role IN ('owner', 'editor')
  ` as any[];
  return Array.isArray(collaboratorResult) && collaboratorResult.length > 0;
}




// GET /api/layers/[id] - Get specific layer
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 });
  }

  try {
    const { id } = await params;
    const [layer] = await sql`
      SELECT 
        l.id,
        l.name,
        l.display_order,
        l.created_at,
        l.updated_at,
        c.id as collection_id,
        c.name as collection_name
      FROM layers l
      JOIN collections c ON l.collection_id = c.id
      WHERE l.id = ${id}
    `;

    if (!layer) {
      return NextResponse.json({ error: 'Layer not found' }, { status: 404 });
    }

    return NextResponse.json({ layer });
  } catch (error) {
    console.error('Error fetching layer:', error);
    return NextResponse.json({ error: 'Failed to fetch layer' }, { status: 500 });
  }
}

// PUT /api/layers/[id] - Update layer
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
    const { name, display_order } = body;

    if (!name || name.trim() === '') {
      return NextResponse.json({ error: 'Layer name is required' }, { status: 400 });
    }

    const [layer] = await sql`
      UPDATE layers 
      SET name = ${name.trim()}, 
          display_order = ${display_order || 0}, 
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING id, name, display_order, created_at, updated_at
    `;

    if (!layer) {
      return NextResponse.json({ error: 'Layer not found' }, { status: 404 });
    }

    return NextResponse.json({ layer });
  } catch (error) {
    console.error('Error updating layer:', error);
    return NextResponse.json({ error: 'Failed to update layer' }, { status: 500 });
  }
}

// DELETE /api/layers/[id] - Delete layer
export async function DELETE(
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
    
    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet address required' }, { status: 401 });
    }
    
    const hasAccess = await checkLayerAccess(id, walletAddress);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    // Delete the layer (traits will be cascade deleted if foreign key is set up, or we can delete them explicitly)
    const [layer] = await sql`
      DELETE FROM layers 
      WHERE id = ${id}
      RETURNING id, name
    `;

    if (!layer) {
      return NextResponse.json({ error: 'Layer not found' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Layer deleted successfully' });
  } catch (error) {
    console.error('Error deleting layer:', error);
    return NextResponse.json({ error: 'Failed to delete layer' }, { status: 500 });
  }
}
