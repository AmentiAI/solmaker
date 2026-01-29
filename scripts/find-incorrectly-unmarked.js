const { Client } = require('pg');
const dotenv = require('dotenv');
const fs = require('fs');

// Load environment variables from .env.local
const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
for (const k in envConfig) {
  process.env[k] = envConfig[k];
}

const COLLECTION_ID = '57362d80-6be7-4a60-be7f-048277034ed2';

const client = new Client({
  connectionString: process.env.NEON_DATABASE,
  ssl: { rejectUnauthorized: false },
});

async function findIncorrectlyUnmarked() {
  await client.connect();
  console.log('Connected to database\n');

  // Find ordinals that have is_minted = false BUT have successful mint records
  const result = await client.query(`
    SELECT 
      go.id as ordinal_id,
      go.ordinal_number,
      go.is_minted,
      go.inscription_id as ordinal_inscription_id,
      go.minted_at as ordinal_minted_at,
      mi.id as mint_id,
      mi.mint_status,
      mi.commit_tx_id,
      mi.reveal_tx_id,
      mi.inscription_id as mint_inscription_id,
      mi.commit_confirmed_at,
      mi.reveal_confirmed_at,
      mi.created_at as mint_created_at
    FROM generated_ordinals go
    JOIN mint_inscriptions mi ON mi.ordinal_id = go.id
    WHERE go.collection_id = $1
      AND go.is_minted = false
      AND mi.mint_status IN ('completed', 'commit_confirmed', 'reveal_broadcast')
      AND mi.is_test_mint = false
    ORDER BY go.ordinal_number
  `, [COLLECTION_ID]);

  console.log(`Found ${result.rows.length} ordinals with is_minted=false but successful mints:\n`);

  if (result.rows.length === 0) {
    console.log('✅ No incorrectly unmarked ordinals found!');
  } else {
    for (const row of result.rows) {
      console.log(`Ordinal #${row.ordinal_number} (${row.ordinal_id})`);
      console.log(`  is_minted: ${row.is_minted}`);
      console.log(`  ordinal inscription_id: ${row.ordinal_inscription_id || 'null'}`);
      console.log(`  Mint record ${row.mint_id}:`);
      console.log(`    mint_status: ${row.mint_status}`);
      console.log(`    commit_tx: ${row.commit_tx_id}`);
      console.log(`    reveal_tx: ${row.reveal_tx_id || 'null'}`);
      console.log(`    inscription_id: ${row.mint_inscription_id || 'null'}`);
      console.log(`    commit_confirmed_at: ${row.commit_confirmed_at || 'null'}`);
      console.log(`    reveal_confirmed_at: ${row.reveal_confirmed_at || 'null'}`);
      console.log('');
    }

    // Get unique ordinal IDs to fix
    const uniqueOrdinalIds = [...new Set(result.rows.map(r => r.ordinal_id))];
    console.log(`\n=== ${uniqueOrdinalIds.length} unique ordinals need fixing ===`);
    console.log('IDs to fix:', uniqueOrdinalIds);
    
    console.log('\n--- SQL to fix these ordinals ---');
    console.log(`UPDATE generated_ordinals SET is_minted = true WHERE id IN ('${uniqueOrdinalIds.join("','")}');`);
  }

  // Also check for ordinals that have inscription_id set but is_minted = false
  console.log('\n\n=== Checking ordinals with inscription_id but is_minted=false ===');
  const result2 = await client.query(`
    SELECT id, ordinal_number, is_minted, inscription_id, minted_at
    FROM generated_ordinals
    WHERE collection_id = $1
      AND is_minted = false
      AND inscription_id IS NOT NULL
    ORDER BY ordinal_number
  `, [COLLECTION_ID]);

  console.log(`Found ${result2.rows.length} ordinals with inscription_id but is_minted=false:\n`);
  for (const row of result2.rows) {
    console.log(`  #${row.ordinal_number}: ${row.id} - inscription: ${row.inscription_id}`);
  }

  if (result2.rows.length > 0) {
    const ids = result2.rows.map(r => r.id);
    console.log('\n--- SQL to fix these ---');
    console.log(`UPDATE generated_ordinals SET is_minted = true WHERE id IN ('${ids.join("','")}');`);
  }

  await client.end();
}

findIncorrectlyUnmarked().catch(console.error);
