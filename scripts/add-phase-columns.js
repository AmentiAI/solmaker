#!/usr/bin/env node

const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

async function addPhaseColumns() {
  const client = new Client({
    connectionString: process.env.NEON_DATABASE,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('🔌 Connecting to database...');
    await client.connect();
    console.log('✅ Connected\n');

    console.log('📋 Adding columns to mint_phases...');
    await client.query(`
      ALTER TABLE mint_phases 
      ADD COLUMN IF NOT EXISTS is_completed BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS suggested_fee_rate DECIMAL(10,2) DEFAULT 10;
    `);
    console.log('   ✅ is_completed added');
    console.log('   ✅ suggested_fee_rate added\n');

    // Show mint_phases structure
    console.log('📊 mint_phases columns:');
    const columns = await client.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns 
      WHERE table_name = 'mint_phases'
      ORDER BY ordinal_position
    `);
    
    columns.rows.forEach(col => {
      const def = col.column_default ? ` (default: ${col.column_default})` : '';
      console.log(`  - ${col.column_name}: ${col.data_type}${def}`);
    });

    console.log('\n🎉 mint_phases is now complete!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
    console.log('🔌 Connection closed');
  }
}

addPhaseColumns().catch(console.error);
