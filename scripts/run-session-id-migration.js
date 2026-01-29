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
    console.log('🔗 Adding session_id to mint_inscriptions for batch support...\n');

    // Add session_id column to mint_inscriptions
    console.log('1️⃣ Adding session_id column to mint_inscriptions...');
    await sql`
      ALTER TABLE mint_inscriptions
      ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES mint_sessions(id) ON DELETE CASCADE
    `;
    console.log('✅ session_id column added');

    // Create index for fast lookups
    console.log('2️⃣ Creating index on session_id...');
    await sql`
      CREATE INDEX IF NOT EXISTS idx_mint_inscriptions_session ON mint_inscriptions(session_id)
    `;
    console.log('✅ Index created');

    // Add commit_tx_hex to mint_sessions
    console.log('3️⃣ Adding commit_tx_hex column to mint_sessions...');
    await sql`
      ALTER TABLE mint_sessions
      ADD COLUMN IF NOT EXISTS commit_tx_hex TEXT
    `;
    console.log('✅ commit_tx_hex column added');

    console.log('\n✅ Migration complete!');
    console.log('📝 mint_inscriptions now supports batch linking via session_id');
    console.log('📝 mint_sessions now stores commit_tx_hex for recovery');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

main();

