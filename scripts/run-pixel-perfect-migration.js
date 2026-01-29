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
         ''
}

const databaseUrl = getDatabaseUrl();

if (!databaseUrl) {
  console.error('❌ No database connection string found. Please set NEON_DATABASE in .env.local');
  process.exit(1);
}

const sql = neon(databaseUrl);

async function main() {
  try {
    console.log('🎯 Adding pixel_perfect column to collections...');

    // Add pixel_perfect column to collections table
    await sql`
      ALTER TABLE collections
      ADD COLUMN IF NOT EXISTS pixel_perfect BOOLEAN DEFAULT FALSE
    `;

    console.log('✅ Migration complete!');
    console.log('📝 Collections now support pixel-perfect character body positioning');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

main();
