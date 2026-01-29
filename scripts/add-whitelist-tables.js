#!/usr/bin/env node

const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

async function addWhitelistTables() {
  const client = new Client({
    connectionString: process.env.NEON_DATABASE,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('🔌 Connecting to database...');
    await client.connect();
    console.log('✅ Connected\n');

    // Create mint_phase_whitelists table
    console.log('1️⃣ Creating mint_phase_whitelists table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS mint_phase_whitelists (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        collection_id UUID NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        max_entries INTEGER DEFAULT NULL,
        entries_count INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        created_by VARCHAR(255)
      );

      CREATE INDEX IF NOT EXISTS idx_mint_phase_whitelists_collection 
      ON mint_phase_whitelists(collection_id);
    `);
    console.log('   ✅ mint_phase_whitelists created\n');

    // Create whitelists table (if different from mint_phase_whitelists)
    console.log('2️⃣ Creating whitelists table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS whitelists (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        collection_id UUID NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        max_entries INTEGER DEFAULT NULL,
        entries_count INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        created_by VARCHAR(255)
      );

      CREATE INDEX IF NOT EXISTS idx_whitelists_collection 
      ON whitelists(collection_id);
    `);
    console.log('   ✅ whitelists created\n');

    console.log('🎉 Whitelist tables created successfully!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
    console.log('🔌 Connection closed');
  }
}

addWhitelistTables().catch(console.error);
