/**
 * Check minted count directly from database
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

function loadEnv() {
  const envPath = path.resolve(__dirname, '..', '.env.local');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
        if (!process.env[key.trim()]) {
          process.env[key.trim()] = value;
        }
      }
    });
  }
}

loadEnv();

const COLLECTION_ID = '61ce3cba-a8dc-490b-b2ae-1a480c284b2b';

async function main() {
  const connectionString = process.env.NEON_DATABASE;
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

  try {
    await client.connect();
    console.log('✅ Connected\n');
    console.log('=' .repeat(70));
    console.log('CHECKING MINTED COUNT FOR:', COLLECTION_ID);
    console.log('=' .repeat(70));

    // Query 1: Total ordinals
    const total = await client.query(`
      SELECT COUNT(*) as count FROM generated_ordinals WHERE collection_id = $1
    `, [COLLECTION_ID]);
    console.log(`\n📊 Total ordinals: ${total.rows[0].count}`);

    // Query 2: is_minted = true
    const mintedTrue = await client.query(`
      SELECT COUNT(*) as count FROM generated_ordinals WHERE collection_id = $1 AND is_minted = true
    `, [COLLECTION_ID]);
    console.log(`📊 is_minted = TRUE: ${mintedTrue.rows[0].count}`);

    // Query 3: is_minted = false
    const mintedFalse = await client.query(`
      SELECT COUNT(*) as count FROM generated_ordinals WHERE collection_id = $1 AND is_minted = false
    `, [COLLECTION_ID]);
    console.log(`📊 is_minted = FALSE: ${mintedFalse.rows[0].count}`);

    // Query 4: is_minted IS NULL
    const mintedNull = await client.query(`
      SELECT COUNT(*) as count FROM generated_ordinals WHERE collection_id = $1 AND is_minted IS NULL
    `, [COLLECTION_ID]);
    console.log(`📊 is_minted = NULL: ${mintedNull.rows[0].count}`);

    // Query 5: Breakdown of all is_minted values
    const breakdown = await client.query(`
      SELECT is_minted, COUNT(*) as count 
      FROM generated_ordinals 
      WHERE collection_id = $1 
      GROUP BY is_minted
    `, [COLLECTION_ID]);
    console.log('\n📊 Breakdown by is_minted value:');
    breakdown.rows.forEach(row => {
      console.log(`   ${row.is_minted === null ? 'NULL' : row.is_minted}: ${row.count}`);
    });

    // Query 6: Check the exact query the API uses
    console.log('\n' + '─'.repeat(70));
    console.log('🔍 EXACT API QUERY RESULTS:');
    console.log('─'.repeat(70));
    
    const apiQuery = await client.query(`
      SELECT 
        (SELECT COUNT(*) FROM generated_ordinals WHERE collection_id = $1) as total_supply,
        (SELECT COUNT(*) FROM generated_ordinals WHERE collection_id = $1 AND is_minted = true) as minted_count,
        (SELECT COUNT(*) FROM generated_ordinals WHERE collection_id = $1 AND is_minted = false) as available_count
    `, [COLLECTION_ID]);
    
    console.log(`   total_supply: ${apiQuery.rows[0].total_supply}`);
    console.log(`   minted_count (is_minted=true): ${apiQuery.rows[0].minted_count}`);
    console.log(`   available_count (is_minted=false): ${apiQuery.rows[0].available_count}`);

    // Query 7: Check what the OLD query would return (from mint_inscriptions)
    console.log('\n' + '─'.repeat(70));
    console.log('🔍 OLD QUERY (mint_inscriptions) WOULD RETURN:');
    console.log('─'.repeat(70));
    
    const oldQuery = await client.query(`
      SELECT COUNT(*) as count
      FROM mint_inscriptions 
      WHERE collection_id = $1 
        AND is_test_mint = false
        AND commit_tx_id IS NOT NULL
        AND LENGTH(TRIM(commit_tx_id)) > 0
        AND mint_status NOT IN ('failed', 'expired')
    `, [COLLECTION_ID]);
    console.log(`   minted_count (from mint_inscriptions): ${oldQuery.rows[0].count}`);

    // Summary
    console.log('\n' + '═'.repeat(70));
    console.log('SUMMARY');
    console.log('═'.repeat(70));
    console.log(`Total ordinals: ${total.rows[0].count}`);
    console.log(`is_minted = TRUE: ${mintedTrue.rows[0].count}`);
    console.log(`is_minted = FALSE: ${mintedFalse.rows[0].count}`);
    console.log(`is_minted = NULL: ${mintedNull.rows[0].count}`);
    console.log(`\nAPI should show: ${mintedTrue.rows[0].count} minted, ${parseInt(mintedFalse.rows[0].count) + parseInt(mintedNull.rows[0].count)} available`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
    console.log('\n🔌 Done');
  }
}

main();
