import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: '.env.local' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

async function addColumns() {
  try {
    console.log('📊 Adding collection mode columns...\n');
    
    // Add generation_mode column
    try {
      await sql`ALTER TABLE collections ADD COLUMN IF NOT EXISTS generation_mode TEXT DEFAULT 'trait' CHECK (generation_mode IN ('trait', 'prompt'))`;
      console.log('✅ Added generation_mode column');
    } catch (error) {
      console.log('⚠️  generation_mode column may already exist:', error.message);
    }

    // Add prompt_description to generation_jobs
    try {
      await sql`ALTER TABLE generation_jobs ADD COLUMN IF NOT EXISTS prompt_description TEXT`;
      console.log('✅ Added prompt_description column to generation_jobs');
    } catch (error) {
      console.log('⚠️  prompt_description column may already exist:', error.message);
    }

    // Create index
    try {
      await sql`CREATE INDEX IF NOT EXISTS idx_collections_generation_mode ON collections (generation_mode)`;
      console.log('✅ Created index on generation_mode');
    } catch (error) {
      console.log('⚠️  Index may already exist:', error.message);
    }

    // Update existing collections
    try {
      await sql`UPDATE collections SET generation_mode = 'trait' WHERE generation_mode IS NULL`;
      console.log('✅ Updated existing collections');
    } catch (error) {
      console.log('⚠️  Could not update existing collections:', error.message);
    }

    console.log('\n✅ Migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

addColumns();

