#!/usr/bin/env node

const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const COLLECTION_ID = '39896e32-86d3-4a1d-a083-be0a2c56c652';

async function checkCollection() {
  const client = new Client({
    connectionString: process.env.NEON_DATABASE,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('🔌 Connecting to database...');
    await client.connect();
    console.log('✅ Connected\n');

    // Check if collection exists
    console.log(`🔍 Checking for collection ${COLLECTION_ID}...`);
    const collectionCheck = await client.query(`
      SELECT id, name, wallet_address 
      FROM collections 
      WHERE id = $1
    `, [COLLECTION_ID]);

    if (collectionCheck.rows.length === 0) {
      console.log('❌ Collection does not exist!\n');
      
      // Show all collections for this wallet
      const wallet = 'D3SNZXJwsMVqJM7qBMUZ8w2rnDhNiLbSs2TT1Ez8GiLJ';
      const userCollections = await client.query(`
        SELECT id, name, created_at 
        FROM collections 
        WHERE wallet_address = $1
        ORDER BY created_at DESC
        LIMIT 5
      `, [wallet]);
      
      if (userCollections.rows.length > 0) {
        console.log('📋 Your collections:');
        userCollections.rows.forEach(c => {
          console.log(`   - ${c.name} (${c.id})`);
        });
      } else {
        console.log('📋 You have no collections yet.');
      }
    } else {
      const collection = collectionCheck.rows[0];
      console.log('✅ Collection found!');
      console.log(`   - Name: ${collection.name}`);
      console.log(`   - Owner: ${collection.wallet_address}\n`);
      
      // Check for phases
      console.log('📋 Checking phases...');
      const phases = await client.query(`
        SELECT id, phase_name, start_time 
        FROM mint_phases 
        WHERE collection_id = $1
      `, [COLLECTION_ID]);
      
      console.log(`   Found ${phases.rows.length} phase(s)`);
      
      // Check for whitelists
      console.log('📋 Checking whitelists...');
      const whitelists = await client.query(`
        SELECT id, name 
        FROM mint_phase_whitelists 
        WHERE collection_id = $1
      `, [COLLECTION_ID]);
      
      console.log(`   Found ${whitelists.rows.length} whitelist(s)`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await client.end();
    console.log('\n🔌 Connection closed');
  }
}

checkCollection().catch(console.error);
