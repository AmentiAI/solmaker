/**
 * Script to add collection_collaborators table
 */

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

async function createTable() {
  try {
    console.log('📊 Creating collection_collaborators table...\n');
    
    // Create table without foreign key first (to avoid type mismatch issues)
    await sql`
      CREATE TABLE IF NOT EXISTS collection_collaborators (
        id TEXT PRIMARY KEY,
        collection_id TEXT NOT NULL,
        wallet_address TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'editor',
        invited_by TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(collection_id, wallet_address)
      )
    `;
    console.log('✅ Created collection_collaborators table');
    
    // Create indexes
    try {
      await sql`
        CREATE INDEX IF NOT EXISTS idx_collaborators_collection_id 
        ON collection_collaborators(collection_id)
      `;
      console.log('✅ Created index on collection_id');
    } catch (error) {
      if (!error?.message?.includes('already exists')) {
        throw error;
      }
      console.log('⏭️  Index on collection_id already exists');
    }
    
    try {
      await sql`
        CREATE INDEX IF NOT EXISTS idx_collaborators_wallet_address 
        ON collection_collaborators(wallet_address)
      `;
      console.log('✅ Created index on wallet_address');
    } catch (error) {
      if (!error?.message?.includes('already exists')) {
        throw error;
      }
      console.log('⏭️  Index on wallet_address already exists');
    }
    
    console.log('\n✅ Table and indexes created successfully!');
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

createTable();

