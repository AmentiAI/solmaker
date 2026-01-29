import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/database';

// GET /api/profile/[username]/collections - Get collections for a user by username
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 });
  }

  try {
    const { username } = await params;

    if (!username || username.trim() === '') {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    }

    // Get profile by username to get wallet_address
    const profileResult = await sql`
      SELECT wallet_address FROM profiles WHERE username = ${username.trim()} LIMIT 1
    ` as any[];

    if (profileResult.length === 0) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const walletAddress = profileResult[0].wallet_address;

    // Get collections owned by this wallet address (case-insensitive)
    const ownedCollections = await sql`
      SELECT 
        id,
        name,
        description,
        is_active,
        created_at,
        updated_at,
        generation_mode,
        art_style,
        border_requirements,
        wallet_address
      FROM collections 
      WHERE wallet_address IS NOT NULL 
        AND LOWER(TRIM(wallet_address)) = LOWER(${walletAddress.trim()})
      ORDER BY created_at DESC
    ` as any[];

    // Get collections where user is a collaborator (case-insensitive)
    // Wrap in try-catch in case the collection_collaborators table doesn't exist yet
    let collaboratorCollections: any[] = [];
    try {
      // Check if collection_collaborators table exists
      const tableCheck = await sql`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'collection_collaborators'
        ) as table_exists
      ` as any[];
      
      if (tableCheck && tableCheck[0]?.table_exists) {
        collaboratorCollections = await sql`
          SELECT 
            c.id,
            c.name,
            c.description,
            c.is_active,
            c.created_at,
            c.updated_at,
            c.generation_mode,
            c.art_style,
            c.border_requirements,
            c.wallet_address,
            cc.role as collaborator_role
          FROM collections c
          INNER JOIN collection_collaborators cc ON c.id::text = cc.collection_id::text
          WHERE LOWER(TRIM(cc.wallet_address)) = LOWER(${walletAddress.trim()})
            AND cc.status = 'accepted'
          ORDER BY cc.created_at DESC
        ` as any[];
      }
    } catch (collabError: any) {
      console.error('[Profile Collections API] Error fetching collaborator collections:', collabError?.message || collabError);
      collaboratorCollections = [];
    }

    // Combine and deduplicate (in case user is both owner and collaborator)
    const collectionsMap = new Map();
    (Array.isArray(ownedCollections) ? ownedCollections : []).forEach((col: any) => {
      collectionsMap.set(col.id, {
        ...col,
        is_owner: true
      });
    });

    (Array.isArray(collaboratorCollections) ? collaboratorCollections : []).forEach((col: any) => {
      if (!collectionsMap.has(col.id)) {
        collectionsMap.set(col.id, {
          id: col.id,
          name: col.name,
          description: col.description,
          is_active: col.is_active,
          created_at: col.created_at,
          updated_at: col.updated_at,
          generation_mode: col.generation_mode,
          art_style: col.art_style,
          border_requirements: col.border_requirements,
          wallet_address: col.wallet_address,
          is_owner: false,
          collaborator_role: col.collaborator_role
        });
      }
    });

    const collections = Array.from(collectionsMap.values());

    // Separate owned and collaborator collections
    const owned = collections.filter((col: any) => col.is_owner === true);
    const collabs = collections.filter((col: any) => col.is_owner === false);

    return NextResponse.json({ 
      collections,
      owned_collections: owned,
      collaborator_collections: collabs,
      username,
      wallet_address: walletAddress
    });
  } catch (error: any) {
    console.error('Error fetching collections by username:', error);
    return NextResponse.json({ 
      error: error?.message || 'Failed to fetch collections' 
    }, { status: 500 });
  }
}

