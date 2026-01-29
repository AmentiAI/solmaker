import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

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

async function makeCollectionIdNullable() {
  try {
    console.log('📊 Making collection_id nullable in promotion_jobs table...\n');
    console.log('This allows videos to be generated from uploaded images without a collection.\n');
    
    await sql`ALTER TABLE promotion_jobs ALTER COLUMN collection_id DROP NOT NULL`;
    console.log('✅ collection_id is now nullable in promotion_jobs');
    
    console.log('\n✅ Migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

makeCollectionIdNullable();
