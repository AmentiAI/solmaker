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

async function checkTransaction(txid) {
  try {
    const response = await fetch(`https://mempool.space/api/tx/${txid}`);
    if (response.status === 404) {
      return { exists: false, confirmed: false };
    }
    if (!response.ok) {
      return { error: `HTTP ${response.status}` };
    }
    const data = await response.json();
    return {
      exists: true,
      confirmed: data.status?.confirmed || false,
      block_height: data.status?.block_height || null,
      block_time: data.status?.block_time ? new Date(data.status.block_time * 1000).toISOString() : null
    };
  } catch (err) {
    return { error: err.message };
  }
}

async function verify() {
  await client.connect();
  console.log('Connected to database\n');

  // Get the 5 ordinals with is_minted=true but only failed mints
  const result = await client.query(`
    SELECT 
      go.id as ordinal_id,
      go.ordinal_number,
      go.is_minted,
      go.inscription_id as ordinal_inscription_id,
      go.mint_tx_id as ordinal_mint_tx,
      mi.id as mint_id,
      mi.mint_status,
      mi.commit_tx_id,
      mi.reveal_tx_id,
      mi.inscription_id as mint_inscription_id,
      mi.error_message,
      mi.created_at
    FROM generated_ordinals go
    LEFT JOIN mint_inscriptions mi ON mi.ordinal_id = go.id AND mi.is_test_mint = false
    WHERE go.collection_id = $1
      AND go.is_minted = true
      AND NOT EXISTS (
        SELECT 1 FROM mint_inscriptions mi2
        WHERE mi2.ordinal_id = go.id
          AND mi2.mint_status IN ('completed', 'commit_confirmed', 'reveal_broadcast', 'commit_broadcast')
          AND mi2.is_test_mint = false
      )
    ORDER BY go.id, mi.created_at DESC
  `, [COLLECTION_ID]);

  console.log(`Found ${result.rows.length} mint records to verify\n`);
  console.log('='.repeat(80));

  // Group by ordinal
  const ordinals = {};
  for (const row of result.rows) {
    if (!ordinals[row.ordinal_id]) {
      ordinals[row.ordinal_id] = {
        ordinal_id: row.ordinal_id,
        ordinal_number: row.ordinal_number,
        is_minted: row.is_minted,
        ordinal_inscription_id: row.ordinal_inscription_id,
        ordinal_mint_tx: row.ordinal_mint_tx,
        mints: []
      };
    }
    if (row.mint_id) {
      ordinals[row.ordinal_id].mints.push({
        mint_id: row.mint_id,
        mint_status: row.mint_status,
        commit_tx_id: row.commit_tx_id,
        reveal_tx_id: row.reveal_tx_id,
        inscription_id: row.mint_inscription_id,
        error_message: row.error_message,
        created_at: row.created_at
      });
    }
  }

  for (const [ordinalId, data] of Object.entries(ordinals)) {
    console.log(`\nOrdinal: ${ordinalId}`);
    console.log(`  is_minted: ${data.is_minted}`);
    console.log(`  ordinal inscription_id: ${data.ordinal_inscription_id || 'null'}`);
    console.log(`  ordinal mint_tx_id: ${data.ordinal_mint_tx || 'null'}`);
    
    // Check ordinal's mint_tx on chain if it exists
    if (data.ordinal_mint_tx) {
      console.log(`\n  Checking ordinal's mint_tx on mempool.space...`);
      const txStatus = await checkTransaction(data.ordinal_mint_tx);
      if (txStatus.error) {
        console.log(`    ❌ Error: ${txStatus.error}`);
      } else if (!txStatus.exists) {
        console.log(`    ❌ TX NOT FOUND (404) - was RBF'd or never broadcast`);
      } else if (txStatus.confirmed) {
        console.log(`    ✅ CONFIRMED in block ${txStatus.block_height} at ${txStatus.block_time}`);
      } else {
        console.log(`    ⏳ EXISTS but unconfirmed (in mempool)`);
      }
    }

    console.log(`\n  Mint records (${data.mints.length}):`);
    
    for (const mint of data.mints) {
      console.log(`\n    Mint ${mint.mint_id}:`);
      console.log(`      DB status: ${mint.mint_status}`);
      console.log(`      DB error: ${mint.error_message || 'none'}`);
      console.log(`      commit_tx: ${mint.commit_tx_id || 'null'}`);
      console.log(`      reveal_tx: ${mint.reveal_tx_id || 'null'}`);
      console.log(`      inscription_id: ${mint.inscription_id || 'null'}`);
      
      // Check commit TX
      if (mint.commit_tx_id) {
        console.log(`\n      Checking COMMIT TX on mempool.space...`);
        const commitStatus = await checkTransaction(mint.commit_tx_id);
        if (commitStatus.error) {
          console.log(`        ❌ Error: ${commitStatus.error}`);
        } else if (!commitStatus.exists) {
          console.log(`        ❌ COMMIT NOT FOUND (404) - was RBF'd or never broadcast`);
        } else if (commitStatus.confirmed) {
          console.log(`        ✅ COMMIT CONFIRMED in block ${commitStatus.block_height}`);
        } else {
          console.log(`        ⏳ COMMIT exists but unconfirmed`);
        }
      }
      
      // Check reveal TX
      if (mint.reveal_tx_id) {
        console.log(`      Checking REVEAL TX on mempool.space...`);
        const revealStatus = await checkTransaction(mint.reveal_tx_id);
        if (revealStatus.error) {
          console.log(`        ❌ Error: ${revealStatus.error}`);
        } else if (!revealStatus.exists) {
          console.log(`        ❌ REVEAL NOT FOUND (404) - was RBF'd or never broadcast`);
        } else if (revealStatus.confirmed) {
          console.log(`        ✅ REVEAL CONFIRMED in block ${revealStatus.block_height}`);
        } else {
          console.log(`        ⏳ REVEAL exists but unconfirmed`);
        }
      }
      
      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 200));
    }
    
    console.log('\n' + '-'.repeat(80));
  }

  await client.end();
  console.log('\nDone!');
}

verify().catch(console.error);
