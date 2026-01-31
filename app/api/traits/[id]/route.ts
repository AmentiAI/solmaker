import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/database';




// GET /api/traits/[id] - Get specific trait
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 });
  }

  try {
    const { id } = await params;
    const [trait] = await sql`
      SELECT 
        t.id,
        t.name,
        t.description,
        t.rarity_weight,
        t.created_at,
        t.updated_at,
        l.id as layer_id,
        l.name as layer_name,
        c.id as collection_id,
        c.name as collection_name
      FROM traits t
      JOIN layers l ON t.layer_id = l.id
      JOIN collections c ON l.collection_id = c.id
      WHERE t.id = ${id}
    `;

    if (!trait) {
      return NextResponse.json({ error: 'Trait not found' }, { status: 404 });
    }

    return NextResponse.json({ trait });
  } catch (error) {
    console.error('Error fetching trait:', error);
    return NextResponse.json({ error: 'Failed to fetch trait' }, { status: 500 });
  }
}

// PUT /api/traits/[id] - Update trait
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
    const { name, description, rarity_weight } = body;

    if (!name || name.trim() === '') {
      return NextResponse.json({ error: 'Trait name is required' }, { status: 400 });
    }

    const [trait] = await sql`
      UPDATE traits 
      SET name = ${name.trim()}, 
          description = ${description || null},
          rarity_weight = ${rarity_weight || 1},
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING id, name, description, rarity_weight, created_at, updated_at
    `;

    if (!trait) {
      return NextResponse.json({ error: 'Trait not found' }, { status: 404 });
    }

    return NextResponse.json({ trait });
  } catch (error) {
    console.error('Error updating trait:', error);
    return NextResponse.json({ error: 'Failed to update trait' }, { status: 500 });
  }
}

// DELETE /api/traits/[id] - Delete trait
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 });
  }

  try {
    const { id } = await params;
    let delete_ordinals = false;
    try {
      const body = await request.json();
      delete_ordinals = body.delete_ordinals === true;
    } catch {
      // No body provided, default to false
      delete_ordinals = false;
    }

    // Get trait info before deleting
    const traitInfo = await sql`
      SELECT t.name, t.layer_id, l.name as layer_name, l.collection_id
      FROM traits t
      JOIN layers l ON t.layer_id = l.id
      WHERE t.id = ${id}
      LIMIT 1
    ` as any[];

    if (!traitInfo || traitInfo.length === 0) {
      return NextResponse.json({ error: 'Trait not found' }, { status: 404 });
    }

    const trait = traitInfo[0];
    const traitName = trait.name;
    const layerName = trait.layer_name;
    const collectionId = trait.collection_id;

    // Delete ordinals if requested
    if (delete_ordinals === true) {
      // Find ordinals with this trait
      const ordinalsResult = await sql`
        SELECT id, image_url, compressed_image_url, thumbnail_url, metadata_url
        FROM generated_ordinals
        WHERE collection_id = ${collectionId}
          AND traits::jsonb ? ${layerName}
          AND (traits::jsonb->>${layerName})::jsonb->>'name' = ${traitName}
      ` as any[];

      const ordinals = Array.isArray(ordinalsResult) ? ordinalsResult : [];
      
      if (ordinals.length > 0) {
        // Delete blob storage images
        const { del } = await import('@vercel/blob');
        const deletePromises = ordinals.flatMap((ordinal: any) => {
          const urlsToDelete = [
            ordinal.image_url,
            ordinal.compressed_image_url,
            ordinal.thumbnail_url,
            ordinal.metadata_url
          ].filter((url): url is string => Boolean(url));

          return urlsToDelete.map((url) =>
            del(url).catch((error) => {
              console.error(`[Delete Trait] Failed to delete blob ${url}:`, error);
            })
          );
        });

        await Promise.allSettled(deletePromises);

        // Delete ordinals from database
        const ordinalIds = ordinals.map((o: any) => o.id);
        await sql`
          DELETE FROM generated_ordinals
          WHERE id = ANY(${ordinalIds})
        `;

        console.log(`[Delete Trait] Deleted ${ordinals.length} ordinal(s) with trait "${traitName}"`);
      }
    }

    // Delete the trait
    const [deletedTrait] = await sql`
      DELETE FROM traits 
      WHERE id = ${id}
      RETURNING id, name
    `;

    if (!deletedTrait) {
      return NextResponse.json({ error: 'Trait not found' }, { status: 404 });
    }

    return NextResponse.json({ 
      message: 'Trait deleted successfully',
      deleted_ordinals: delete_ordinals === true
    });
  } catch (error) {
    console.error('Error deleting trait:', error);
    return NextResponse.json({ error: 'Failed to delete trait' }, { status: 500 });
  }
}
