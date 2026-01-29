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

async function find() {
  await client.connect();
  console.log('Connected to database\n');

  // Find completed mints where ordinal's is_minted = false
  console.log('=== Completed mints where ordinal is_minted = FALSE ===\n');
  
  const result = await client.query(`
    SELECT 
      mi.id as mint_id,
      mi.ordinal_id,
      mi.inscription_id as mint_inscription_id,
      mi.mint_status,
      mi.minter_wallet,
      mi.commit_tx_id,
      mi.reveal_tx_id,
      mi.completed_at,
      go.is_minted,
      go.inscription_id as ordinal_inscription_id,
      go.ordinal_number
    FROM mint_inscriptions mi
    JOIN generated_ordinals go ON mi.ordinal_id = go.id
    WHERE go.collection_id = $1
      AND mi.mint_status = 'completed'
      AND mi.is_test_mint = false
      AND go.is_minted = false
    ORDER BY mi.completed_at
  `, [COLLECTION_ID]);

  console.log(`Found ${result.rows.length} completed mints with is_minted = false:\n`);
  
  for (const row of result.rows) {
    console.log(`Ordinal ${row.ordinal_id} (#${row.ordinal_number})`);
    console.log(`  ordinal is_minted: ${row.is_minted}`);
    console.log(`  ordinal inscription_id: ${row.ordinal_inscription_id || 'NULL'}`);
    console.log(`  mint inscription_id: ${row.mint_inscription_id}`);
    console.log(`  mint_status: ${row.mint_status}`);
    console.log(`  commit_tx: ${row.commit_tx_id}`);
    console.log(`  reveal_tx: ${row.reveal_tx_id}`);
    console.log(`  completed_at: ${row.completed_at}`);
    console.log('');
  }

  if (result.rows.length > 0) {
    // Generate fix SQL
    const ordinalIds = result.rows.map(r => r.ordinal_id);
    console.log('\n--- SQL to fix these ordinals ---');
    console.log(`UPDATE generated_ordinals`);
    console.log(`SET is_minted = true,`);
    console.log(`    inscription_id = mi.inscription_id,`);
    console.log(`    minter_address = mi.minter_wallet,`);
    console.log(`    mint_tx_id = mi.reveal_tx_id,`);
    console.log(`    minted_at = mi.completed_at`);
    console.log(`FROM (`);
    console.log(`  SELECT DISTINCT ON (ordinal_id) ordinal_id, inscription_id, minter_wallet, reveal_tx_id, completed_at`);
    console.log(`  FROM mint_inscriptions`);
    console.log(`  WHERE ordinal_id = ANY($1)`);
    console.log(`    AND mint_status = 'completed'`);
    console.log(`    AND is_test_mint = false`);
    console.log(`  ORDER BY ordinal_id, completed_at DESC`);
    console.log(`) mi`);
    console.log(`WHERE generated_ordinals.id = mi.ordinal_id;`);
    console.log(`\nOrdinal IDs: ['${ordinalIds.join("','")}']`);
  }

  // Also check: ordinals with inscription_id but is_minted = false
  console.log('\n\n=== Ordinals with inscription_id set but is_minted = FALSE ===\n');
  
  const result2 = await client.query(`
    SELECT id, ordinal_number, inscription_id, is_minted
    FROM generated_ordinals
    WHERE collection_id = $1
      AND inscription_id IS NOT NULL
      AND is_minted = false
    ORDER BY ordinal_number
  `, [COLLECTION_ID]);

  console.log(`Found ${result2.rows.length}:\n`);
  for (const row of result2.rows) {
    console.log(`  #${row.ordinal_number} (${row.id}): ${row.inscription_id}`);
  }

  await client.end();
}

find().catch(console.error);
