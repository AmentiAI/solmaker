const { Client } = require('pg');
const dotenv = require('dotenv');
const fs = require('fs');

const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
for (const k in envConfig) process.env[k] = envConfig[k];

const COLLECTION_ID = '57362d80-6be7-4a60-be7f-048277034ed2';

const client = new Client({
  connectionString: process.env.NEON_DATABASE,
  ssl: { rejectUnauthorized: false },
});

async function check() {
  await client.connect();
  console.log('Connected to database\n');

  // Find ordinals where is_minted = true but ALL mint records are failed
  console.log('=== Ordinals with is_minted=true but ONLY failed mint records ===\n');
  
  const result = await client.query(`
    SELECT 
      go.id as ordinal_id,
      go.ordinal_number,
      go.is_minted,
      go.inscription_id as ordinal_inscription_id,
      (
        SELECT json_agg(json_build_object(
          'mint_id', mi.id,
          'mint_status', mi.mint_status,
          'commit_tx', mi.commit_tx_id,
          'reveal_tx', mi.reveal_tx_id,
          'inscription_id', mi.inscription_id,
          'commit_confirmed_at', mi.commit_confirmed_at,
          'reveal_confirmed_at', mi.reveal_confirmed_at,
          'error_message', mi.error_message,
          'created_at', mi.created_at
        ) ORDER BY mi.created_at DESC)
        FROM mint_inscriptions mi
        WHERE mi.ordinal_id = go.id AND mi.is_test_mint = false
      ) as mint_records
    FROM generated_ordinals go
    WHERE go.collection_id = $1
      AND go.is_minted = true
      AND NOT EXISTS (
        SELECT 1 FROM mint_inscriptions mi2
        WHERE mi2.ordinal_id = go.id
          AND mi2.mint_status IN ('completed', 'commit_confirmed', 'reveal_broadcast', 'commit_broadcast')
          AND mi2.is_test_mint = false
      )
    ORDER BY go.ordinal_number
  `, [COLLECTION_ID]);

  if (result.rows.length === 0) {
    console.log('✅ No ordinals found with is_minted=true but only failed mints!\n');
  } else {
    console.log(`Found ${result.rows.length} ordinals:\n`);
    for (const row of result.rows) {
      console.log(`Ordinal #${row.ordinal_number} (${row.ordinal_id})`);
      console.log(`  is_minted: ${row.is_minted}`);
      console.log(`  ordinal inscription_id: ${row.ordinal_inscription_id || 'null'}`);
      console.log(`  Mint records:`);
      if (row.mint_records) {
        for (const m of row.mint_records) {
          console.log(`    - ${m.mint_id}: status=${m.mint_status}, commit=${m.commit_tx?.slice(0,16) || 'null'}...`);
          if (m.error_message) console.log(`      error: ${m.error_message}`);
        }
      } else {
        console.log(`    (no mint records)`);
      }
      console.log('');
    }
    
    const ids = result.rows.map(r => r.ordinal_id);
    console.log('\n--- SQL to fix (set is_minted=false since no successful mints) ---');
    console.log(`UPDATE generated_ordinals SET is_minted = false, inscription_id = NULL, minter_address = NULL, mint_tx_id = NULL, minted_at = NULL WHERE id IN ('${ids.join("','")}');`);
  }

  // Also show ALL ordinals with multiple mint records
  console.log('\n\n=== All ordinals with MULTIPLE mint records (for reference) ===\n');
  
  const multiResult = await client.query(`
    SELECT 
      go.id as ordinal_id,
      go.ordinal_number,
      go.is_minted,
      go.inscription_id as ordinal_inscription_id,
      (
        SELECT json_agg(json_build_object(
          'mint_id', mi.id,
          'mint_status', mi.mint_status,
          'commit_tx', mi.commit_tx_id,
          'inscription_id', mi.inscription_id,
          'created_at', mi.created_at
        ) ORDER BY mi.created_at DESC)
        FROM mint_inscriptions mi
        WHERE mi.ordinal_id = go.id AND mi.is_test_mint = false
      ) as mint_records,
      (SELECT COUNT(*) FROM mint_inscriptions mi WHERE mi.ordinal_id = go.id AND mi.is_test_mint = false) as mint_count
    FROM generated_ordinals go
    WHERE go.collection_id = $1
    HAVING (SELECT COUNT(*) FROM mint_inscriptions mi WHERE mi.ordinal_id = go.id AND mi.is_test_mint = false) > 1
    ORDER BY go.ordinal_number
  `, [COLLECTION_ID]);

  if (multiResult.rows.length === 0) {
    console.log('No ordinals with multiple mint records.\n');
  } else {
    console.log(`Found ${multiResult.rows.length} ordinals with multiple mints:\n`);
    for (const row of multiResult.rows) {
      console.log(`Ordinal #${row.ordinal_number} (${row.ordinal_id}) - ${row.mint_count} mints`);
      console.log(`  is_minted: ${row.is_minted}`);
      console.log(`  ordinal inscription_id: ${row.ordinal_inscription_id || 'null'}`);
      if (row.mint_records) {
        for (const m of row.mint_records) {
          console.log(`    - ${m.mint_status}: commit=${m.commit_tx?.slice(0,16) || 'null'}... inscription=${m.inscription_id || 'null'}`);
        }
      }
      console.log('');
    }
  }

  await client.end();
}

check().catch(console.error);
