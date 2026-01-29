import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/database';
import { isAuthorized } from '@/lib/auth/access-control';

// Helper function to check collection access
async function checkCollectionAccess(collectionId: string, walletAddress: string): Promise<boolean> {
  // Get collection owner
  const collectionResult = await sql`
    SELECT wallet_address FROM collections WHERE id::text = ${collectionId}
  ` as any[];
  const collection = collectionResult?.[0] || null;
  
  if (!collection) return false;
  
  // Check if user is owner, admin, or collaborator
  const isAdmin = isAuthorized(walletAddress);
  const isOwner = walletAddress.trim() === collection.wallet_address;
  if (isOwner || isAdmin) return true;
  
  // Check collaborator
  const collaboratorResult = await sql`
    SELECT role FROM collection_collaborators
    WHERE collection_id = ${collectionId}
      AND wallet_address = ${walletAddress.trim()}
      AND status = 'accepted'
  ` as any[];
  return Array.isArray(collaboratorResult) && collaboratorResult.length > 0;
}

// GET /api/collections/[id]/layers - Get all layers for a collection (requires auth)
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
    
    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet address required' }, { status: 401 });
    }
    
    const hasAccess = await checkCollectionAccess(id, walletAddress);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }
    
    const result = await sql`
      SELECT 
        l.id,
        l.name,
        l.display_order,
        l.created_at,
        l.updated_at,
        COUNT(t.id) as trait_count
      FROM layers l
      LEFT JOIN traits t ON l.id = t.layer_id
      WHERE l.collection_id = ${id}
      GROUP BY l.id, l.name, l.display_order, l.created_at, l.updated_at
      ORDER BY l.display_order ASC
    `;

    // Convert trait_count to number
    const layers = Array.isArray(result) ? result.map(layer => ({
      ...layer,
      trait_count: parseInt(layer.trait_count) || 0
    })) : [];

    return NextResponse.json({ layers });
  } catch (error) {
    console.error('Error fetching layers:', error);
    return NextResponse.json({ error: 'Failed to fetch layers' }, { status: 500 });
  }
}

// POST /api/collections/[id]/layers - Create new layer (requires auth)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const { wallet_address, name } = body;

    if (!wallet_address) {
      return NextResponse.json({ error: 'Wallet address required' }, { status: 401 });
    }
    
    const hasAccess = await checkCollectionAccess(id, wallet_address);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    if (!name || name.trim() === '') {
      return NextResponse.json({ error: 'Layer name is required' }, { status: 400 });
    }

    // Get the next display order
    const [maxOrder] = await sql`
      SELECT COALESCE(MAX(display_order), 0) as max_order
      FROM layers 
      WHERE collection_id = ${id}
    `;

    const nextOrder = (maxOrder?.max_order || 0) + 1;

    // Create the layer
    const [layer] = await sql`
      INSERT INTO layers (collection_id, name, display_order)
      VALUES (${id}, ${name.trim()}, ${nextOrder})
      RETURNING id, name, display_order, created_at, updated_at
    `;

    return NextResponse.json({ layer }, { status: 201 });
  } catch (error) {
    console.error('Error creating layer:', error);
    return NextResponse.json({ error: 'Failed to create layer' }, { status: 500 });
  }
}
