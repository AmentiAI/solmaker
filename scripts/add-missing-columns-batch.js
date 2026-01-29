#!/usr/bin/env node

const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

async function addMissingColumns() {
  const client = new Client({
    connectionString: process.env.NEON_DATABASE,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('🔌 Connecting to database...');
    await client.connect();
    console.log('✅ Connected\n');

    // Add invited_by to collection_collaborators
    console.log('1️⃣ Adding invited_by to collection_collaborators...');
    await client.query(`
      ALTER TABLE collection_collaborators 
      ADD COLUMN IF NOT EXISTS invited_by TEXT;
    `);
    console.log('   ✅ invited_by added\n');

    // Add is_active to various tables that might need it
    console.log('2️⃣ Adding is_active columns...');
    
    const tablesToAddIsActive = [
      'collections',
      'collection_collaborators',
      'collection_marketplace_listings',
      'nft_listings',
      'profiles'
    ];

    for (const table of tablesToAddIsActive) {
      try {
        await client.query(`
          ALTER TABLE ${table} 
          ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
        `);
        console.log(`   ✅ is_active added to ${table}`);
      } catch (e) {
        console.log(`   ⚠️  ${table}: ${e.message}`);
      }
    }

    // Add status to collection_collaborators if missing
    console.log('\n3️⃣ Adding status to collection_collaborators...');
    await client.query(`
      ALTER TABLE collection_collaborators 
      ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
    `);
    console.log('   ✅ status added\n');

    // Create indexes
    console.log('4️⃣ Creating indexes...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_collection_collaborators_invited_by 
      ON collection_collaborators(invited_by);
      
      CREATE INDEX IF NOT EXISTS idx_collections_is_active 
      ON collections(is_active) WHERE is_active = true;
    `);
    console.log('   ✅ Indexes created\n');

    // Show collection_collaborators structure
    console.log('📊 collection_collaborators structure:');
    const columns = await client.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns 
      WHERE table_name = 'collection_collaborators'
      ORDER BY ordinal_position
    `);

    columns.rows.forEach(col => {
      const def = col.column_default ? ` (default: ${col.column_default})` : '';
      console.log(`  - ${col.column_name}: ${col.data_type}${def}`);
    });

    console.log('\n🎉 All missing columns added successfully!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await client.end();
    console.log('🔌 Connection closed');
  }
}

addMissingColumns().catch(console.error);
