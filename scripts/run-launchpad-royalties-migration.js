/**
 * Script to add launchpad royalty/payment fields
 * Usage: node scripts/run-launchpad-royalties-migration.js
 */

const { neon } = require('@neondatabase/serverless');
require('dotenv').config({ path: '.env.local' });

const sql = neon(process.env.NEON_DATABASE || process.env.DATABASE_URL);

async function run() {
  try {
    console.log('📊 Adding launchpad royalty/payment fields...\n');
    
    // Add columns to collections table
    try {
      await sql`ALTER TABLE collections ADD COLUMN IF NOT EXISTS creator_royalty_wallet VARCHAR(255)`;
      console.log('✅ collections.creator_royalty_wallet');
    } catch (e) { console.log(`⚠️ collections.creator_royalty_wallet: ${e?.message}`); }
    
    try {
      await sql`ALTER TABLE collections ADD COLUMN IF NOT EXISTS creator_royalty_percent DECIMAL(5,2) DEFAULT 0`;
      console.log('✅ collections.creator_royalty_percent');
    } catch (e) { console.log(`⚠️ collections.creator_royalty_percent: ${e?.message}`); }
    
    // Add columns to mint_phases table
    try {
      await sql`ALTER TABLE mint_phases ADD COLUMN IF NOT EXISTS creator_payment_wallet VARCHAR(255)`;
      console.log('✅ mint_phases.creator_payment_wallet');
    } catch (e) { console.log(`⚠️ mint_phases.creator_payment_wallet: ${e?.message}`); }
    
    try {
      await sql`ALTER TABLE mint_phases ADD COLUMN IF NOT EXISTS platform_fee_sats BIGINT DEFAULT 2500`;
      console.log('✅ mint_phases.platform_fee_sats');
    } catch (e) { console.log(`⚠️ mint_phases.platform_fee_sats: ${e?.message}`); }
    
    // Add columns to collection_mint_launches table
    try {
      await sql`ALTER TABLE collection_mint_launches ADD COLUMN IF NOT EXISTS creator_royalty_percent DECIMAL(5,2) DEFAULT 0`;
      console.log('✅ collection_mint_launches.creator_royalty_percent');
    } catch (e) { console.log(`⚠️ collection_mint_launches.creator_royalty_percent: ${e?.message}`); }
    
    console.log('\n✅ Launchpad royalty fields added successfully!');
    console.log('\nNew fields:');
    console.log('  - collections.creator_royalty_wallet: BTC address for mint payments');
    console.log('  - collections.creator_royalty_percent: % of mint price to creator');
    console.log('  - mint_phases.creator_payment_wallet: Override wallet per phase');
    console.log('  - mint_phases.platform_fee_sats: Platform fee (default 2500 sats)');
    
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

run();

