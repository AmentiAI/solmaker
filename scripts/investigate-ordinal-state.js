/**
 * Investigate why an ordinal has is_minted=false but has inscription data
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

// The inscription_id from your API response
const INSCRIPTION_ID = '4aa8ab73fafccffb9c64899dc306558d5c6062d4fee9a2bb26389fc4e1b0d583i0';
const COLLECTION_ID = '61ce3cba-a8dc-490b-b2ae-1a480c284b2b';

async function main() {
  const connectionString = process.env.NEON_DATABASE;
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

  try {
    await client.connect();
    console.log('✅ Connected\n');

    // Find the ordinal by inscription_id
    console.log('═'.repeat(70));
    console.log('FINDING ORDINAL BY INSCRIPTION_ID:', INSCRIPTION_ID);
    console.log('═'.repeat(70));

    const ordinal = await client.query(`
      SELECT id, ordinal_number, is_minted, inscription_id, minter_address, mint_tx_id, minted_at
      FROM generated_ordinals
      WHERE inscription_id = $1
    `, [INSCRIPTION_ID]);

    if (ordinal.rows.length === 0) {
      console.log('❌ No ordinal found with this inscription_id');
      return;
    }

    const o = ordinal.rows[0];
    console.log('\n📋 ORDINAL STATE (from generated_ordinals):');
    console.log(`   ID: ${o.id}`);
    console.log(`   ordinal_number: ${o.ordinal_number}`);
    console.log(`   is_minted: ${o.is_minted}`);
    console.log(`   inscription_id: ${o.inscription_id}`);
    console.log(`   minter_address: ${o.minter_address}`);
    console.log(`   mint_tx_id: ${o.mint_tx_id}`);
    console.log(`   minted_at: ${o.minted_at}`);

    // Now find ALL mint_inscriptions for this ordinal
    console.log('\n' + '─'.repeat(70));
    console.log('ALL MINT RECORDS FOR THIS ORDINAL (from mint_inscriptions):');
    console.log('─'.repeat(70));

    const mints = await client.query(`
      SELECT 
        id, mint_status, minter_wallet, 
        commit_tx_id, reveal_tx_id, inscription_id,
        created_at, completed_at
      FROM mint_inscriptions
      WHERE ordinal_id = $1
      ORDER BY created_at ASC
    `, [o.id]);

    console.log(`\nFound ${mints.rows.length} mint record(s):\n`);
    
    mints.rows.forEach((m, i) => {
      console.log(`  MINT #${i+1}: ${m.mint_status.toUpperCase()}`);
      console.log(`    ID: ${m.id}`);
      console.log(`    Wallet: ${m.minter_wallet}`);
      console.log(`    Commit TX: ${m.commit_tx_id ? m.commit_tx_id.substring(0, 20) + '...' : 'NONE'}`);
      console.log(`    Reveal TX: ${m.reveal_tx_id ? m.reveal_tx_id.substring(0, 20) + '...' : 'NONE'}`);
      console.log(`    Inscription: ${m.inscription_id || 'NONE'}`);
      console.log(`    Created: ${m.created_at}`);
      console.log(`    Completed: ${m.completed_at || 'N/A'}`);
      console.log('');
    });

    // Analysis
    console.log('═'.repeat(70));
    console.log('ANALYSIS');
    console.log('═'.repeat(70));
    
    const completedMints = mints.rows.filter(m => m.mint_status === 'completed');
    const failedMints = mints.rows.filter(m => m.mint_status === 'failed');
    
    console.log(`\n✅ Completed mints: ${completedMints.length}`);
    console.log(`❌ Failed mints: ${failedMints.length}`);
    
    if (completedMints.length > 0 && o.is_minted === false) {
      console.log('\n🐛 BUG DETECTED!');
      console.log('   The ordinal has is_minted=FALSE but has completed mint(s)!');
      console.log('   The cron job is resetting is_minted based on the FAILED mint,');
      console.log('   without checking that another user already COMPLETED a mint.');
    }

    if (failedMints.length > 0) {
      console.log('\n⚠️  The cron job sees the FAILED mint record and blindly resets');
      console.log('   is_minted=false on the ordinal, even though the COMPLETED');
      console.log('   mint already set inscription_id and minted_at on it.');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
    console.log('\n🔌 Done');
  }
}

main();
