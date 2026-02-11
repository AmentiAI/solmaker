import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';
import { existsSync } from 'fs';

// Load environment variables from .env.local or .env
if (existsSync('.env.local')) {
  dotenv.config({ path: '.env.local' });
} else {
  dotenv.config({ path: '.env' });
}

const getDatabaseUrl = () => {
  return process.env.NEON_DATABASE ||
         process.env.DATABASE_URL ||
         ''
}

const databaseUrl = getDatabaseUrl();

if (!databaseUrl) {
  console.error('❌ No database connection string found. Please set NEON_DATABASE in .env.local');
  process.exit(1);
}

const sql = neon(databaseUrl);

async function fixPromotionJobsWallet() {
  try {
    console.log('Checking promotion_jobs table...');

    // Get all existing columns
    const existingColumns = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'promotion_jobs'
    `;

    const columnNames = existingColumns.map(row => row.column_name);
    console.log('Existing columns:', columnNames.join(', '));

    // Check and add wallet_address
    if (!columnNames.includes('wallet_address')) {
      console.log('Adding wallet_address column...');
      await sql`
        ALTER TABLE promotion_jobs
        ADD COLUMN wallet_address TEXT NOT NULL DEFAULT ''
      `;
      console.log('✓ Added wallet_address column');
    } else {
      console.log('✓ wallet_address column already exists');
    }

    // Check and add collection_id
    if (!columnNames.includes('collection_id')) {
      console.log('Adding collection_id column...');
      await sql`
        ALTER TABLE promotion_jobs
        ADD COLUMN collection_id UUID REFERENCES collections(id) ON DELETE CASCADE
      `;
      console.log('✓ Added collection_id column');
    } else {
      console.log('✓ collection_id column already exists');
    }

    // Check and add flyer_text
    if (!columnNames.includes('flyer_text')) {
      console.log('Adding flyer_text column...');
      await sql`
        ALTER TABLE promotion_jobs
        ADD COLUMN flyer_text TEXT
      `;
      console.log('✓ Added flyer_text column');
    } else {
      console.log('✓ flyer_text column already exists');
    }

    // Check and add no_text
    if (!columnNames.includes('no_text')) {
      console.log('Adding no_text column...');
      await sql`
        ALTER TABLE promotion_jobs
        ADD COLUMN no_text BOOLEAN DEFAULT FALSE
      `;
      console.log('✓ Added no_text column');
    } else {
      console.log('✓ no_text column already exists');
    }

    // Check and add subject_type
    if (!columnNames.includes('subject_type')) {
      console.log('Adding subject_type column...');
      await sql`
        ALTER TABLE promotion_jobs
        ADD COLUMN subject_type TEXT DEFAULT 'character'
      `;
      console.log('✓ Added subject_type column');
    } else {
      console.log('✓ subject_type column already exists');
    }

    // Check and add subject_count
    if (!columnNames.includes('subject_count')) {
      console.log('Adding subject_count column...');
      await sql`
        ALTER TABLE promotion_jobs
        ADD COLUMN subject_count INTEGER NOT NULL DEFAULT 1
      `;
      console.log('✓ Added subject_count column');
    } else {
      console.log('✓ subject_count column already exists');
    }

    // Check and add subject_actions
    if (!columnNames.includes('subject_actions')) {
      console.log('Adding subject_actions column...');
      await sql`
        ALTER TABLE promotion_jobs
        ADD COLUMN subject_actions JSONB
      `;
      console.log('✓ Added subject_actions column');
    } else {
      console.log('✓ subject_actions column already exists');
    }

    // Check and add image_url
    if (!columnNames.includes('image_url')) {
      console.log('Adding image_url column...');
      await sql`
        ALTER TABLE promotion_jobs
        ADD COLUMN image_url TEXT
      `;
      console.log('✓ Added image_url column');
    } else {
      console.log('✓ image_url column already exists');
    }

    // Check and add started_at
    if (!columnNames.includes('started_at')) {
      console.log('Adding started_at column...');
      await sql`
        ALTER TABLE promotion_jobs
        ADD COLUMN started_at TIMESTAMP
      `;
      console.log('✓ Added started_at column');
    } else {
      console.log('✓ started_at column already exists');
    }

    // Check and add completed_at
    if (!columnNames.includes('completed_at')) {
      console.log('Adding completed_at column...');
      await sql`
        ALTER TABLE promotion_jobs
        ADD COLUMN completed_at TIMESTAMP
      `;
      console.log('✓ Added completed_at column');
    } else {
      console.log('✓ completed_at column already exists');
    }

    // Check and add aspect_ratio
    if (!columnNames.includes('aspect_ratio')) {
      console.log('Adding aspect_ratio column...');
      await sql`
        ALTER TABLE promotion_jobs
        ADD COLUMN aspect_ratio TEXT DEFAULT 'square'
      `;
      console.log('✓ Added aspect_ratio column');
    } else {
      console.log('✓ aspect_ratio column already exists');
    }

    // Update status column constraint if needed
    console.log('Updating status column constraint...');
    await sql`
      ALTER TABLE promotion_jobs
      DROP CONSTRAINT IF EXISTS promotion_jobs_status_check
    `;
    await sql`
      ALTER TABLE promotion_jobs
      ADD CONSTRAINT promotion_jobs_status_check
      CHECK (status IN ('pending', 'processing', 'completed', 'failed'))
    `;
    console.log('✓ Updated status column constraint');

    // Create indexes if they don't exist
    console.log('Creating indexes...');
    await sql`
      CREATE INDEX IF NOT EXISTS idx_promotion_jobs_status_created
      ON promotion_jobs(status, created_at ASC)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_promotion_jobs_wallet_created
      ON promotion_jobs(wallet_address, created_at DESC)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_promotion_jobs_collection_created
      ON promotion_jobs(collection_id, created_at DESC)
    `;
    console.log('✓ Created indexes');

    console.log('\nDone! All columns added successfully.');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

fixPromotionJobsWallet();
