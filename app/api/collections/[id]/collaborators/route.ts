import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/database';

// GET /api/collections/[id]/collaborators - Get all collaborators for a collection
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 });
  }

  try {
    const { id: collectionId } = await params;

    const collaborators = await sql`
      SELECT 
        id,
        collection_id,
        wallet_address,
        role,
        invited_by,
        status,
        created_at
      FROM collection_collaborators
      WHERE collection_id = ${collectionId}
      ORDER BY created_at ASC
    `;

    return NextResponse.json({ 
      collaborators: Array.isArray(collaborators) ? collaborators : [] 
    });
  } catch (error: any) {
    console.error('Error fetching collaborators:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch collaborators' },
      { status: 500 }
    );
  }
}

// POST /api/collections/[id]/collaborators - Invite a collaborator
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 });
  }

  try {
    const { id: collectionId } = await params;
    const body = await request.json();
    const { wallet_address, username, role = 'editor', invited_by } = body;

    // Determine wallet address - either provided directly or looked up from username
    let targetWalletAddress: string | null = null;

    if (wallet_address && wallet_address.trim() !== '') {
      targetWalletAddress = wallet_address.trim();
    } else if (username && username.trim() !== '') {
      // Look up wallet address from username
      try {
        const profileResult = await sql`
          SELECT wallet_address
          FROM profiles
          WHERE username = ${username.trim().toLowerCase()}
          LIMIT 1
        `;
        
        if (Array.isArray(profileResult) && profileResult.length > 0) {
          targetWalletAddress = (profileResult[0] as any).wallet_address;
        } else {
          return NextResponse.json({ 
            error: `Username "${username}" not found. Please make sure the user has created a profile.` 
          }, { status: 404 });
        }
      } catch (profileError) {
        console.error('Error looking up username:', profileError);
        return NextResponse.json({ 
          error: 'Failed to look up username. Please try using wallet address instead.' 
        }, { status: 500 });
      }
    } else {
      return NextResponse.json({ 
        error: 'Either wallet address or username is required' 
      }, { status: 400 });
    }

    if (!targetWalletAddress) {
      return NextResponse.json({ error: 'Could not determine wallet address' }, { status: 400 });
    }

    if (!invited_by || invited_by.trim() === '') {
      return NextResponse.json({ error: 'Inviter wallet address is required' }, { status: 400 });
    }

    // Verify the inviter is the collection owner or has permission
    const collectionResult = await sql`
      SELECT wallet_address
      FROM collections
      WHERE id::text = ${collectionId}
    `;

    const collection = Array.isArray(collectionResult) ? collectionResult[0] : null;
    if (!collection) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
    }

    const collectionOwner = (collection as any).wallet_address;
    
    // Check if inviter is owner or existing collaborator
    if (invited_by !== collectionOwner) {
      const existingCollaborator = await sql`
        SELECT role
        FROM collection_collaborators
        WHERE collection_id = ${collectionId}
          AND wallet_address = ${invited_by}
          AND role IN ('owner', 'editor')
      `;
      
      if (!Array.isArray(existingCollaborator) || existingCollaborator.length === 0) {
        return NextResponse.json({ 
          error: 'Only collection owners and editors can invite collaborators' 
        }, { status: 403 });
      }
    }

    // Check if user is already a collaborator
    const existing = await sql`
      SELECT id
      FROM collection_collaborators
      WHERE collection_id = ${collectionId}
        AND wallet_address = ${targetWalletAddress}
    `;

    if (Array.isArray(existing) && existing.length > 0) {
      return NextResponse.json({ 
        error: 'User is already a collaborator on this collection' 
      }, { status: 400 });
    }

    // Don't allow inviting the owner as a collaborator
    if (targetWalletAddress === collectionOwner) {
      return NextResponse.json({ 
        error: 'Collection owner is already a member' 
      }, { status: 400 });
    }

    // Validate role
    const validRoles = ['editor', 'viewer'];
    const collaboratorRole = validRoles.includes(role) ? role : 'editor';

    // Normalize wallet address (trim and ensure consistent format)
    const normalizedWalletAddress = targetWalletAddress.trim();

    // Create collaborator entry with pending status
    // Let database generate UUID automatically with DEFAULT gen_random_uuid()
    const result = await sql`
      INSERT INTO collection_collaborators (
        collection_id,
        wallet_address,
        role,
        invited_by,
        status
      )
      VALUES (
        ${collectionId},
        ${normalizedWalletAddress},
        ${collaboratorRole},
        ${invited_by.trim()},
        'pending'
      )
      RETURNING id, collection_id, wallet_address, role, invited_by, status, created_at
    `;

    const collaborator = Array.isArray(result) ? result[0] : result;

    console.log('[Collaborators API] Created collaborator:', {
      id: collaborator?.id,
      collection_id: collectionId,
      wallet_address: normalizedWalletAddress,
      role: collaboratorRole
    });

    return NextResponse.json({ collaborator }, { status: 201 });
  } catch (error: any) {
    console.error('Error inviting collaborator:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to invite collaborator' },
      { status: 500 }
    );
  }
}

// DELETE /api/collections/[id]/collaborators - Remove a collaborator
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 });
  }

  try {
    const { id: collectionId } = await params;
    const { searchParams } = new URL(request.url);
    const collaboratorId = searchParams.get('collaborator_id');
    const walletAddress = searchParams.get('wallet_address');
    const requesterWallet = searchParams.get('requester_wallet');

    if (!requesterWallet) {
      return NextResponse.json({ error: 'Requester wallet address is required' }, { status: 400 });
    }

    // Verify the requester is the collection owner or removing themselves
    const collectionResult = await sql`
      SELECT wallet_address
      FROM collections
      WHERE id::text = ${collectionId}
    `;

    const collection = Array.isArray(collectionResult) ? collectionResult[0] : null;
    if (!collection) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
    }

    const collectionOwner = (collection as any).wallet_address;

    // Get collaborator to remove
    let collaboratorToRemove;
    if (collaboratorId) {
      const result = await sql`
        SELECT wallet_address
        FROM collection_collaborators
        WHERE id = ${collaboratorId}
          AND collection_id = ${collectionId}
      `;
      collaboratorToRemove = Array.isArray(result) && result.length > 0 ? result[0] : null;
    } else if (walletAddress) {
      collaboratorToRemove = { wallet_address: walletAddress };
    } else {
      return NextResponse.json({ 
        error: 'Either collaborator_id or wallet_address is required' 
      }, { status: 400 });
    }

    if (!collaboratorToRemove) {
      return NextResponse.json({ error: 'Collaborator not found' }, { status: 404 });
    }

    const targetWallet = (collaboratorToRemove as any).wallet_address;

    // Check permissions: owner can remove anyone, users can only remove themselves
    if (requesterWallet !== collectionOwner && requesterWallet !== targetWallet) {
      return NextResponse.json({ 
        error: 'Only collection owners can remove other collaborators' 
      }, { status: 403 });
    }

    // Remove collaborator
    const deleteResult = await sql`
      DELETE FROM collection_collaborators
      WHERE collection_id = ${collectionId}
        AND wallet_address = ${targetWallet}
      RETURNING id
    `;

    if (!Array.isArray(deleteResult) || deleteResult.length === 0) {
      return NextResponse.json({ error: 'Collaborator not found' }, { status: 404 });
    }

    return NextResponse.json({ 
      message: 'Collaborator removed successfully' 
    });
  } catch (error: any) {
    console.error('Error removing collaborator:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to remove collaborator' },
      { status: 500 }
    );
  }
}

