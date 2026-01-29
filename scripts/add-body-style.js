import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';

dotenv.config({ path: '.env.local' });

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

async function runMigration() {
  try {
    console.log('📊 Adding body_style column to collections table...\n');
    
    await sql`
      ALTER TABLE collections
      ADD COLUMN IF NOT EXISTS body_style TEXT DEFAULT 'full'
    `;
    
    console.log('✅ Migration completed successfully!');
    console.log('📝 body_style column added to collections table (default: full)\n');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();

