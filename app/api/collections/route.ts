import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/database';
import { hasEnoughCredits } from '@/lib/credits/credits';
import { requireWalletAuth } from '@/lib/auth/signature-verification';

// GET /api/collections - List collections for a wallet (owned + collaborator only)
// Only returns: 1) collections where wallet_address = owner, 2) collections where wallet is an accepted collaborator.
// OPTIMIZED: Reduced from 6-8 queries to 2 queries
export async function GET(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const walletAddress = searchParams.get('wallet_address');
    const isLockedFilter = searchParams.get('is_locked'); // Optional filter for locked collections

    if (!walletAddress || typeof walletAddress !== 'string' || walletAddress.trim() === '') {
      return NextResponse.json({ 
        error: 'Wallet address is required',
        details: 'Please provide a valid wallet_address query parameter'
      }, { status: 400 });
    }

    const trimmedWalletAddress = walletAddress.trim();
    const filterLocked = isLockedFilter === 'true';

    // OPTIMIZED: Single query for owned collections using index
    // Include status fields: collection_status, marketplace_listing_id
    const ownedCollectionsQuery = filterLocked
      ? sql`
          SELECT 
            c.id,
            c.name,
            c.description,
            c.is_active,
            c.is_locked,
            c.created_at,
            c.updated_at,
            c.wallet_address,
            COALESCE(c.collection_status, 'draft') as collection_status,
            ml.id as marketplace_listing_id
          FROM collections c
          LEFT JOIN collection_marketplace_listings ml ON ml.collection_id = c.id AND ml.status = 'active'
          WHERE c.wallet_address = ${trimmedWalletAddress}
            AND c.is_locked = true
          ORDER BY c.created_at DESC
        `
      : sql`
          SELECT 
            c.id,
            c.name,
            c.description,
            c.is_active,
            c.is_locked,
            c.created_at,
            c.updated_at,
            c.wallet_address,
            COALESCE(c.collection_status, 'draft') as collection_status,
            ml.id as marketplace_listing_id
          FROM collections c
          LEFT JOIN collection_marketplace_listings ml ON ml.collection_id = c.id AND ml.status = 'active'
          WHERE c.wallet_address = ${trimmedWalletAddress}
          ORDER BY c.created_at DESC
        `;
    const ownedCollections = await ownedCollectionsQuery as any[];

    // OPTIMIZED: Single query for collaborator collections
    let collaboratorCollections: any[] = [];
    try {
      const collaboratorCollectionsQuery = filterLocked
        ? sql`
            SELECT 
              c.id,
              c.name,
              c.description,
              c.is_active,
              c.is_locked,
              c.created_at,
              c.updated_at,
              c.wallet_address,
              COALESCE(c.collection_status, 'draft') as collection_status,
              ml.id as marketplace_listing_id,
              cc.role as collaborator_role
            FROM collections c
            INNER JOIN collection_collaborators cc ON c.id::text = cc.collection_id::text
            LEFT JOIN collection_marketplace_listings ml ON ml.collection_id = c.id AND ml.status = 'active'
            WHERE cc.wallet_address = ${trimmedWalletAddress}
              AND cc.status = 'accepted'
              AND c.is_locked = true
            ORDER BY cc.created_at DESC
          `
        : sql`
            SELECT 
              c.id,
              c.name,
              c.description,
              c.is_active,
              c.is_locked,
              c.created_at,
              c.updated_at,
              c.wallet_address,
              COALESCE(c.collection_status, 'draft') as collection_status,
              ml.id as marketplace_listing_id,
              cc.role as collaborator_role
            FROM collections c
            INNER JOIN collection_collaborators cc ON c.id::text = cc.collection_id::text
            LEFT JOIN collection_marketplace_listings ml ON ml.collection_id = c.id AND ml.status = 'active'
            WHERE cc.wallet_address = ${trimmedWalletAddress}
              AND cc.status = 'accepted'
            ORDER BY cc.created_at DESC
          `;
      collaboratorCollections = await collaboratorCollectionsQuery as any[];
    } catch (collabError: any) {
      // Table might not exist yet - that's okay
      collaboratorCollections = [];
    }

    // Helper function to compute collection status from collection_status field
    // If marketplace_listing_id exists, override to marketplace
    const computeCollectionStatus = (col: any): 'draft' | 'launchpad' | 'launchpad_live' | 'self_inscribe' | 'marketplace' | 'deleted' => {
      // If has active marketplace listing, it's marketplace
      if (col.marketplace_listing_id) {
        return 'marketplace'
      }
      // Use collection_status field directly, default to draft
      // launchpad_live is recognized and passed through (will be displayed as launchpad on frontend)
      const status = col.collection_status || 'draft'
      if (['draft', 'launchpad', 'launchpad_live', 'self_inscribe', 'marketplace', 'deleted'].includes(status)) {
        return status as 'draft' | 'launchpad' | 'launchpad_live' | 'self_inscribe' | 'marketplace' | 'deleted'
      }
      return 'draft'
    }

    // Combine and deduplicate
    const ownedMap = new Map();
    ownedCollections.forEach((col: any) => {
      const status = computeCollectionStatus(col)
      ownedMap.set(col.id, { 
        id: col.id,
        name: col.name,
        description: col.description,
        is_active: col.is_active,
        created_at: col.created_at,
        updated_at: col.updated_at,
        wallet_address: col.wallet_address,
        is_owner: true,
        status: status,
        marketplace_listing_id: col.marketplace_listing_id
      });
    });

    collaboratorCollections.forEach((col: any) => {
      if (!ownedMap.has(col.id)) {
        const status = computeCollectionStatus(col)
        ownedMap.set(col.id, { 
          id: col.id,
          name: col.name,
          description: col.description,
          is_active: col.is_active,
          created_at: col.created_at,
          updated_at: col.updated_at,
          wallet_address: col.wallet_address,
          is_owner: false, 
          collaborator_role: col.collaborator_role,
          status: status,
          marketplace_listing_id: col.marketplace_listing_id
        });
      }
    });

    const allCollections = Array.from(ownedMap.values());
    const owned = allCollections.filter((col: any) => col.is_owner === true);
    const collabs = allCollections.filter((col: any) => col.is_owner === false);

    return NextResponse.json({ 
      collections: allCollections,
      owned_collections: owned,
      collaborator_collections: collabs
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, max-age=30' // Cache for 30 seconds
      }
    });
  } catch (error: any) {
    console.error('[Collections API] Error:', error?.message);
    return NextResponse.json({ 
      error: 'Failed to fetch collections',
      details: error?.message || 'Unknown error'
    }, { status: 500 });
  }
}

// POST /api/collections - Create new collection
// SECURITY: Requires wallet signature verification to prevent spoofing
export async function POST(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 });
  }

  try {
    // SECURITY: Require signature verification - prevents anyone from creating collections as another user
    const auth = await requireWalletAuth(request, true); // Require signature
    if (!auth.isValid || !auth.walletAddress) {
      return NextResponse.json({ 
        error: auth.error || 'Authentication required',
        details: 'Please sign the request with your wallet to verify ownership'
      }, { status: 401 });
    }
    
    const wallet_address = auth.walletAddress;
    const body = await request.clone().json();
    
    const {
      name,
      description,
      traitSelections,
      compression_quality,
      compression_dimensions,
      compression_format,
      is_pfp_collection,
      facing_direction,
      body_style,
      art_style,
      art_style_id,
      border_requirements,
      colors_description,
      lighting_description,
      custom_rules,
      pixel_perfect,
      wireframe_config,
    } = body;

    if (!name || name.trim() === '') {
      return NextResponse.json({ error: 'Collection name is required' }, { status: 400 });
    }

    // Check if user has credits (required to create collections)
    const hasCredits = await hasEnoughCredits(wallet_address, 1);
    if (!hasCredits) {
      return NextResponse.json(
        { error: 'Insufficient credits. You need at least 1 credit to create a collection. Please purchase credits first.' },
        { status: 402 }
      );
    }

    const defaultTraitSelections = {
      characterType: { enabled: false, selected: [] },
      background: { enabled: false, selected: [] },
      accessories: { enabled: false, selected: [] },
      eyes: { enabled: false, selected: [] },
      mouth: { enabled: false, selected: [] },
      headwear: { enabled: false, selected: [] },
      outfits: { enabled: false, selected: [] },
      props: { enabled: false, selected: [] },
    };

    const mergedTraitSelections = {
      ...defaultTraitSelections,
      ...(traitSelections || {}),
    };

    const traitSelectionsJson = JSON.stringify(mergedTraitSelections);

    // Validate compression settings
    const quality = compression_quality !== undefined && compression_quality !== null && compression_quality !== ''
      ? Math.max(0, Math.min(100, parseInt(String(compression_quality)) || 100))
      : null;
    const dimensions = compression_dimensions !== undefined && compression_dimensions !== null && compression_dimensions !== ''
      ? Math.max(1, Math.min(1024, parseInt(String(compression_dimensions)) || 1024))
      : null;
    const format = compression_format && ['jpg', 'png', 'webp'].includes(compression_format)
      ? compression_format
      : 'webp';
    
    // Validate PFP settings
    const isPfp = is_pfp_collection === true || is_pfp_collection === 'true'
    const validFacingDirections = ['left', 'left-front', 'front', 'right-front', 'right']
    const facingDir = isPfp && facing_direction && validFacingDirections.includes(facing_direction)
      ? facing_direction
      : null
    const validBodyStyles = ['full', 'half', 'headonly']
    const bodyStyleValue = isPfp && body_style && validBodyStyles.includes(body_style)
      ? body_style
      : 'full'

    // Validate art style and other prompt settings
    const artStyleValue = art_style?.trim() || null;
    const borderReqsValue = border_requirements?.trim() || null;
    const colorsValue = colors_description?.trim() || null;
    const lightingValue = lighting_description?.trim() || null;
    const customRulesValue = custom_rules?.trim() || null;
    const pixelPerfectValue = pixel_perfect === true || pixel_perfect === 'true';
    
    // Validate wireframe_config if provided
    const wireframeConfigValue = wireframe_config && typeof wireframe_config === 'object'
      ? wireframe_config
      : null;

    const result = await sql`
      INSERT INTO collections (
        name,
        description,
        generation_mode,
        trait_selections,
        wallet_address,
        compression_quality,
        compression_dimensions,
        compression_format,
        is_pfp_collection,
        facing_direction,
        body_style,
        art_style,
        border_requirements,
        colors_description,
        lighting_description,
        custom_rules,
        pixel_perfect,
        wireframe_config
      )
      VALUES (
        ${name.trim()},
        ${description || null},
        'trait',
        ${traitSelectionsJson}::jsonb,
        ${wallet_address.trim()},
        ${quality},
        ${dimensions},
        ${format},
        ${isPfp},
        ${facingDir},
        ${bodyStyleValue},
        ${artStyleValue},
        ${borderReqsValue},
        ${colorsValue},
        ${lightingValue},
        ${customRulesValue},
        ${pixelPerfectValue},
        ${wireframeConfigValue ? JSON.stringify(wireframeConfigValue) : null}::jsonb
      )
      RETURNING 
        id, 
        name, 
        description, 
        'trait' as generation_mode, 
        trait_selections,
        is_active, 
        created_at, 
        updated_at,
        wallet_address,
        art_style
    `;

    const collection = Array.isArray(result) ? result[0] : result;

    return NextResponse.json({ collection }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating collection:', error);
    return NextResponse.json({ error: error?.message || 'Failed to create collection' }, { status: 500 });
  }
}
