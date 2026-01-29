const { neon } = require('@neondatabase/serverless');
require('dotenv').config({ path: '.env.local' });

const getDatabaseUrl = () => {
  return process.env.NEON_DATABASE || 
         process.env.DATABASE_URL || 
         process.env.NEXT_PUBLIC_NEON_DATABASE ||
         ''
}

const databaseUrl = getDatabaseUrl();

if (!databaseUrl) {
  console.error('❌ No database connection string found. Please set NEON_DATABASE in .env.local');
  process.exit(1);
}

const sql = neon(databaseUrl);

async function addStatusColumn() {
  try {
    console.log('🔄 Adding status column to collection_collaborators...');
    
    // Check if column already exists
    const columnCheck = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'collection_collaborators' 
      AND column_name = 'status'
    `;
    
    if (Array.isArray(columnCheck) && columnCheck.length > 0) {
      console.log('✅ Status column already exists!');
      return;
    }

    // Add status column
    console.log('   - Adding status column...');
    await sql`
      ALTER TABLE collection_collaborators
      ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'accepted'
    `;

    // Update existing records to be 'accepted' (backward compatibility)
    console.log('   - Updating existing records...');
    await sql`
      UPDATE collection_collaborators
      SET status = 'accepted'
      WHERE status IS NULL OR status = ''
    `;

    // Add constraint to ensure status is one of the valid values
    try {
      console.log('   - Adding constraint...');
      await sql`
        ALTER TABLE collection_collaborators
        ADD CONSTRAINT check_status CHECK (status IN ('pending', 'accepted', 'declined'))
      `;
    } catch (constraintError) {
      // Constraint might already exist, that's okay
      console.log('   - Constraint may already exist (continuing...)');
    }

    // Create index for faster lookups
    console.log('   - Creating index...');
    await sql`
      CREATE INDEX IF NOT EXISTS idx_collaborators_status ON collection_collaborators(status)
    `;

    console.log('✅ Successfully added status column to collection_collaborators!');
    console.log('   - Column added with default value "accepted"');
    console.log('   - Existing records updated to "accepted"');
    console.log('   - Index created on status field');
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  }
}

addStatusColumn();

