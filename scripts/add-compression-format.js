/**
 * Add compression_format column to collections table
 * Usage: node scripts/add-compression-format.js
 */

import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: '.env.local' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

async function runMigration() {
  try {
    console.log('📊 Adding compression_format column to collections table...\n');
    
    const migrationPath = join(__dirname, 'migrations', '029_add_compression_format.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf-8');
    
    // Execute the migration
    await sql.unsafe(migrationSQL);
    
    console.log('✅ Migration completed successfully!');
    console.log('📝 compression_format column added to collections table (default: webp)\n');
    
  } catch (error) {
    const errorMsg = error?.message || String(error);
    if (errorMsg.includes('already exists') || errorMsg.includes('duplicate')) {
      console.log('⏭️  Column already exists, skipping');
    } else {
      console.error('❌ Migration failed:', errorMsg);
      process.exit(1);
    }
  }
}

runMigration();

