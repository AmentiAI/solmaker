import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/database';




// POST /api/collections/[id]/activate - Set collection as active
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 });
  }

  try {
    const { id } = await params;
    // First, deactivate all collections
    await sql`UPDATE collections SET is_active = FALSE`;

    // Then activate the specified collection
    const [collection] = await sql`
      UPDATE collections 
      SET is_active = TRUE, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING id, name, description, is_active, created_at, updated_at
    `;

    if (!collection) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
    }

    return NextResponse.json({ collection });
  } catch (error) {
    console.error('Error activating collection:', error);
    return NextResponse.json({ error: 'Failed to activate collection' }, { status: 500 });
  }
}