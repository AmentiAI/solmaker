/**
 * Check the 2 ordinals we fixed earlier
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

const FIXED_ORDINALS = [
  'eac6856f-3776-4757-9c29-9947d146b841',
  '9270b6f3-ae3e-45ef-b232-35e0606b4103'
];

async function main() {
  const connectionString = process.env.NEON_DATABASE;
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

  try {
    await client.connect();
    console.log('✅ Connected\n');

    for (const ordinalId of FIXED_ORDINALS) {
      console.log('─'.repeat(70));
      console.log(`Ordinal: ${ordinalId}`);
      
      const ordinal = await client.query(`
        SELECT id, is_minted, ordinal_number
        FROM generated_ordinals
        WHERE id = $1
      `, [ordinalId]);

      if (ordinal.rows.length > 0) {
        const o = ordinal.rows[0];
        console.log(`   is_minted: ${o.is_minted}`);
        console.log(`   ordinal_number: ${o.ordinal_number}`);
      } else {
        console.log('   NOT FOUND');
      }

      // Check mint_inscriptions for this ordinal
      const mints = await client.query(`
        SELECT id, mint_status, minter_wallet, commit_tx_id, reveal_tx_id
        FROM mint_inscriptions
        WHERE ordinal_id = $1 AND is_test_mint = false
        ORDER BY created_at
      `, [ordinalId]);

      console.log(`   Mint records: ${mints.rows.length}`);
      mints.rows.forEach((m, i) => {
        console.log(`     ${i+1}. ${m.mint_status} - has commit: ${!!m.commit_tx_id}, has reveal: ${!!m.reveal_tx_id}`);
      });
    }

    // Also check: which 8 ordinals have is_minted = false?
    console.log('\n' + '═'.repeat(70));
    console.log('ALL ORDINALS WITH is_minted = FALSE:');
    console.log('═'.repeat(70));
    
    const falseMinted = await client.query(`
      SELECT go.id, go.ordinal_number, go.is_minted,
        (SELECT COUNT(*) FROM mint_inscriptions mi WHERE mi.ordinal_id = go.id AND mi.is_test_mint = false) as mint_count,
        (SELECT string_agg(mi.mint_status, ', ') FROM mint_inscriptions mi WHERE mi.ordinal_id = go.id AND mi.is_test_mint = false) as mint_statuses
      FROM generated_ordinals go
      WHERE go.collection_id = '61ce3cba-a8dc-490b-b2ae-1a480c284b2b'
        AND go.is_minted = false
      ORDER BY go.ordinal_number
    `, []);

    console.log(`\nFound ${falseMinted.rows.length} ordinals with is_minted = false:\n`);
    falseMinted.rows.forEach(o => {
      console.log(`  - ${o.id.substring(0,8)}... (#${o.ordinal_number || 'null'}) - mint records: ${o.mint_count}, statuses: ${o.mint_statuses || 'none'}`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
    console.log('\n🔌 Done');
  }
}

main();
