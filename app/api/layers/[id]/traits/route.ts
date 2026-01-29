import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/database';

// GET /api/layers/[id]/traits - Get all traits for a layer
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 });
  }

  try {
    const { id } = await params;
    const traits = await sql`
      SELECT 
        id,
        name,
        description,
        trait_prompt,
        rarity_weight,
        is_ignored,
        created_at,
        updated_at
      FROM traits 
      WHERE layer_id = ${id}
      ORDER BY name ASC
    `;

    return NextResponse.json({ traits });
  } catch (error) {
    console.error('Error fetching traits:', error);
    return NextResponse.json({ error: 'Failed to fetch traits' }, { status: 500 });
  }
}

// POST /api/layers/[id]/traits - Create new trait
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
    const { name, description, trait_prompt, rarity_weight } = body;

    if (!name || name.trim() === '') {
      return NextResponse.json({ error: 'Trait name is required' }, { status: 400 });
    }

    // Create the trait
    const result = await sql`
      INSERT INTO traits (layer_id, name, description, trait_prompt, rarity_weight)
      VALUES (${id}, ${name.trim()}, ${description || null}, ${trait_prompt || null}, ${rarity_weight || 1})
      RETURNING id, name, description, trait_prompt, rarity_weight, created_at, updated_at
    ` as any[];
    
    const trait = result && result.length > 0 ? result[0] : null;

    return NextResponse.json({ trait }, { status: 201 });
  } catch (error) {
    console.error('Error creating trait:', error);
    return NextResponse.json({ error: 'Failed to create trait' }, { status: 500 });
  }
}
