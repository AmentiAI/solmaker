import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: '.env.local' });

const getDatabaseUrl = () => {
  return process.env.NEON_DATABASE || 
         process.env.DATABASE_URL || 
         process.env.NEXT_PUBLIC_NEON_DATABASE ||
         ''
}

const databaseUrl = getDatabaseUrl();

if (!databaseUrl) {
  console.error('No database URL found in environment variables');
  console.error('Please set NEON_DATABASE, DATABASE_URL, or NEXT_PUBLIC_NEON_DATABASE');
  process.exit(1);
}

async function runMigration() {
  const sql = neon(databaseUrl);
  
  try {
    console.log('Creating front_page_thumbnails table...');
    
    // Create table
    await sql`
      CREATE TABLE IF NOT EXISTS front_page_thumbnails (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        ordinal_id UUID NOT NULL REFERENCES generated_ordinals(id) ON DELETE CASCADE,
        thumbnail_url TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(ordinal_id)
      )
    `;
    
    // Create index
    await sql`
      CREATE INDEX IF NOT EXISTS idx_front_page_thumbnails_ordinal_id ON front_page_thumbnails(ordinal_id)
    `;
    
    console.log('✅ Front page thumbnails table created successfully!');
  } catch (error) {
    console.error('❌ Error running migration:', error);
    process.exit(1);
  }
}

runMigration();

