import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/database';




// POST /api/migrations/add-collaborator-status - Run migration to add status field
export async function POST(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 });
  }

  try {
    console.log('🔄 Running migration: Add status field to collection_collaborators...');
    
    // Check if column already exists
    const columnCheck = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'collection_collaborators' 
      AND column_name = 'status'
    `;
    
    if (columnCheck && columnCheck.length > 0) {
      return NextResponse.json({ 
        message: 'Migration already completed. Status column already exists.',
        alreadyExists: true
      });
    }

    // Add status column
    await sql`
      ALTER TABLE collection_collaborators
      ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'accepted'
    `;

    // Update existing records to be 'accepted' (backward compatibility)
    await sql`
      UPDATE collection_collaborators
      SET status = 'accepted'
      WHERE status IS NULL OR status = ''
    `;

    // Add constraint to ensure status is one of the valid values
    try {
      await sql`
        ALTER TABLE collection_collaborators
        ADD CONSTRAINT check_status CHECK (status IN ('pending', 'accepted', 'declined'))
      `;
    } catch (constraintError: any) {
      // Constraint might already exist, that's okay
      console.log('Constraint check (may already exist):', constraintError?.message);
    }

    // Create index for faster lookups of pending invitations
    await sql`
      CREATE INDEX IF NOT EXISTS idx_collaborators_status ON collection_collaborators(status)
    `;

    console.log('✅ Migration completed successfully!');
    
    return NextResponse.json({ 
      message: 'Migration completed successfully!',
      changes: [
        'Added status column to collection_collaborators',
        'Set existing records to "accepted" status',
        'Created index on status field'
      ]
    });
  } catch (error: any) {
    console.error('❌ Migration failed:', error);
    return NextResponse.json(
      { error: error?.message || 'Migration failed', details: error },
      { status: 500 }
    );
  }
}

