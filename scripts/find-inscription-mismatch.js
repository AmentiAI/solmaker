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

  // Get all completed mints and their ordinal's inscription_id
  console.log('=== All completed mints vs ordinal inscription_id ===\n');
  
  const result = await client.query(`
    SELECT 
      mi.id as mint_id,
      mi.ordinal_id,
      mi.inscription_id as mint_inscription_id,
      mi.completed_at,
      go.inscription_id as ordinal_inscription_id,
      go.is_minted,
      go.ordinal_number
    FROM mint_inscriptions mi
    JOIN generated_ordinals go ON mi.ordinal_id = go.id
    WHERE go.collection_id = $1
      AND mi.mint_status = 'completed'
      AND mi.is_test_mint = false
    ORDER BY mi.completed_at
  `, [COLLECTION_ID]);

  console.log(`Total completed mints: ${result.rows.length}\n`);

  // Find mismatches
  const mismatches = result.rows.filter(r => r.mint_inscription_id !== r.ordinal_inscription_id);
  
  console.log(`Mismatches (mint inscription != ordinal inscription): ${mismatches.length}\n`);
  
  for (const row of mismatches) {
    console.log(`Ordinal ${row.ordinal_id} (#${row.ordinal_number})`);
    console.log(`  is_minted: ${row.is_minted}`);
    console.log(`  MINT inscription_id:    ${row.mint_inscription_id}`);
    console.log(`  ORDINAL inscription_id: ${row.ordinal_inscription_id || 'NULL'}`);
    console.log(`  completed_at: ${row.completed_at}`);
    console.log('');
  }

  // Get all unique inscription IDs from both places
  const mintInscriptionIds = new Set(result.rows.map(r => r.mint_inscription_id).filter(Boolean));
  const ordinalInscriptionIds = new Set(result.rows.map(r => r.ordinal_inscription_id).filter(Boolean));
  
  console.log(`\nUnique mint inscription IDs: ${mintInscriptionIds.size}`);
  console.log(`Unique ordinal inscription IDs: ${ordinalInscriptionIds.size}`);
  
  // Find inscription IDs in mints but not on ordinals
  const inMintsNotOrdinals = [...mintInscriptionIds].filter(id => !ordinalInscriptionIds.has(id));
  console.log(`\nIn mint_inscriptions but not on ordinals: ${inMintsNotOrdinals.length}`);
  for (const id of inMintsNotOrdinals) {
    console.log(`  - ${id}`);
  }

  // Check if same ordinal has multiple completed mints
  console.log('\n\n=== Ordinals with MULTIPLE completed mints ===\n');
  
  const result2 = await client.query(`
    SELECT 
      go.id as ordinal_id,
      go.ordinal_number,
      go.inscription_id as ordinal_inscription_id,
      go.is_minted,
      COUNT(*) as mint_count,
      json_agg(json_build_object(
        'mint_id', mi.id,
        'inscription_id', mi.inscription_id,
        'completed_at', mi.completed_at
      ) ORDER BY mi.completed_at) as mints
    FROM generated_ordinals go
    JOIN mint_inscriptions mi ON mi.ordinal_id = go.id
    WHERE go.collection_id = $1
      AND mi.mint_status = 'completed'
      AND mi.is_test_mint = false
    GROUP BY go.id, go.ordinal_number, go.inscription_id, go.is_minted
    HAVING COUNT(*) > 1
    ORDER BY go.ordinal_number
  `, [COLLECTION_ID]);

  console.log(`Ordinals with multiple completed mints: ${result2.rows.length}\n`);
  
  for (const row of result2.rows) {
    console.log(`Ordinal ${row.ordinal_id} (#${row.ordinal_number}) - ${row.mint_count} mints`);
    console.log(`  is_minted: ${row.is_minted}`);
    console.log(`  ordinal inscription_id: ${row.ordinal_inscription_id}`);
    console.log(`  Mints:`);
    for (const m of row.mints) {
      console.log(`    - ${m.inscription_id} (${m.completed_at})`);
    }
    console.log('');
  }

  await client.end();
}

find().catch(console.error);
