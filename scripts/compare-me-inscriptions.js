const { Client } = require('pg');
const dotenv = require('dotenv');
const fs = require('fs');

const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
for (const k in envConfig) process.env[k] = envConfig[k];

const COLLECTION_ID = '57362d80-6be7-4a60-be7f-048277034ed2';
const ME_SLUG = 'the_forgotten';

const client = new Client({
  connectionString: process.env.NEON_DATABASE,
  ssl: { rejectUnauthorized: false },
});

async function fetchMagicEdenInscriptions(slug) {
  console.log(`\nFetching inscriptions from Magic Eden for slug: ${slug}...`);
  
  const allInscriptions = [];
  let offset = 0;
  const limit = 100;
  
  while (true) {
    try {
      const url = `https://api-mainnet.magiceden.dev/v2/ord/btc/tokens?collectionSymbol=${slug}&offset=${offset}&limit=${limit}`;
      console.log(`  Fetching offset ${offset}...`);
      
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
        }
      });
      
      if (!response.ok) {
        console.log(`  Magic Eden API returned ${response.status}`);
        break;
      }
      
      const data = await response.json();
      
      if (!data.tokens || data.tokens.length === 0) {
        break;
      }
      
      for (const token of data.tokens) {
        allInscriptions.push({
          inscriptionId: token.id,
          contentType: token.contentType,
          owner: token.owner,
        });
      }
      
      if (data.tokens.length < limit) {
        break;
      }
      
      offset += limit;
      
      // Rate limit delay
      await new Promise(r => setTimeout(r, 300));
    } catch (err) {
      console.error(`  Error fetching from Magic Eden:`, err.message);
      break;
    }
  }
  
  console.log(`  Total inscriptions from Magic Eden: ${allInscriptions.length}`);
  return allInscriptions;
}

async function compare() {
  await client.connect();
  console.log('Connected to database\n');

  // Get all ordinals with is_minted = true and their inscription IDs
  console.log('=== DATABASE: Ordinals with is_minted = true ===');
  const dbMinted = await client.query(`
    SELECT id, ordinal_number, inscription_id, minter_address, minted_at
    FROM generated_ordinals
    WHERE collection_id = $1 AND is_minted = true
    ORDER BY ordinal_number
  `, [COLLECTION_ID]);
  
  console.log(`Total is_minted = true: ${dbMinted.rows.length}`);
  
  // Get all ordinals with inscription_id set (regardless of is_minted)
  console.log('\n=== DATABASE: Ordinals with inscription_id set ===');
  const dbWithInscription = await client.query(`
    SELECT id, ordinal_number, inscription_id, is_minted, minter_address
    FROM generated_ordinals
    WHERE collection_id = $1 AND inscription_id IS NOT NULL
    ORDER BY ordinal_number
  `, [COLLECTION_ID]);
  
  console.log(`Total with inscription_id: ${dbWithInscription.rows.length}`);
  
  // Get from mint_inscriptions table (completed only)
  console.log('\n=== DATABASE: Completed mint_inscriptions ===');
  const dbMints = await client.query(`
    SELECT mi.id, mi.ordinal_id, mi.inscription_id, mi.mint_status, mi.minter_wallet
    FROM mint_inscriptions mi
    JOIN generated_ordinals go ON mi.ordinal_id = go.id
    WHERE go.collection_id = $1
      AND mi.mint_status = 'completed'
      AND mi.is_test_mint = false
    ORDER BY mi.completed_at
  `, [COLLECTION_ID]);
  
  console.log(`Total completed mints: ${dbMints.rows.length}`);
  
  // Extract inscription IDs from database
  const dbInscriptionIds = new Set();
  for (const row of dbMinted.rows) {
    if (row.inscription_id) {
      dbInscriptionIds.add(row.inscription_id);
    }
  }
  // Also add from mint_inscriptions in case ordinal wasn't updated
  for (const row of dbMints.rows) {
    if (row.inscription_id) {
      dbInscriptionIds.add(row.inscription_id);
    }
  }
  
  console.log(`\nUnique inscription IDs in database: ${dbInscriptionIds.size}`);
  
  // Fetch from Magic Eden
  const meInscriptions = await fetchMagicEdenInscriptions(ME_SLUG);
  const meInscriptionIds = new Set(meInscriptions.map(i => i.inscriptionId));
  
  console.log(`\n${'='.repeat(60)}`);
  console.log('COMPARISON RESULTS');
  console.log('='.repeat(60));
  
  console.log(`\nDatabase inscription IDs: ${dbInscriptionIds.size}`);
  console.log(`Magic Eden inscription IDs: ${meInscriptionIds.size}`);
  
  // Find inscriptions in ME but not in DB
  const inMeNotDb = [];
  for (const id of meInscriptionIds) {
    if (!dbInscriptionIds.has(id)) {
      inMeNotDb.push(id);
    }
  }
  
  // Find inscriptions in DB but not in ME
  const inDbNotMe = [];
  for (const id of dbInscriptionIds) {
    if (!meInscriptionIds.has(id)) {
      inDbNotMe.push(id);
    }
  }
  
  console.log(`\n📍 In Magic Eden but NOT in Database: ${inMeNotDb.length}`);
  if (inMeNotDb.length > 0) {
    for (const id of inMeNotDb) {
      const meData = meInscriptions.find(i => i.inscriptionId === id);
      console.log(`  - ${id}`);
      if (meData) {
        console.log(`    Owner: ${meData.owner}`);
      }
    }
  }
  
  console.log(`\n📍 In Database but NOT in Magic Eden: ${inDbNotMe.length}`);
  if (inDbNotMe.length > 0) {
    for (const id of inDbNotMe) {
      console.log(`  - ${id}`);
    }
  }
  
  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Database is_minted count: ${dbMinted.rows.length}`);
  console.log(`Database unique inscription_ids: ${dbInscriptionIds.size}`);
  console.log(`Magic Eden count: ${meInscriptionIds.size}`);
  console.log(`Difference (ME - DB): ${meInscriptionIds.size - dbInscriptionIds.size}`);
  console.log(`Missing from DB: ${inMeNotDb.length}`);
  console.log(`Missing from ME: ${inDbNotMe.length}`);
  
  await client.end();
}

compare().catch(console.error);
