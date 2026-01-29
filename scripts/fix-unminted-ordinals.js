/**
 * Fix ordinals that have completed mints but is_minted = false
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

    // Find ordinals with completed mints but is_minted = false
    const brokenOrdinals = await client.query(`
      SELECT DISTINCT go.id, go.ordinal_number, go.is_minted
      FROM generated_ordinals go
      INNER JOIN mint_inscriptions mi ON mi.ordinal_id = go.id
      WHERE go.collection_id = $1
        AND go.is_minted = false
        AND mi.mint_status = 'completed'
        AND mi.is_test_mint = false
    `, [COLLECTION_ID]);

    console.log(`Found ${brokenOrdinals.rows.length} ordinals to fix:\n`);
    
    for (const ordinal of brokenOrdinals.rows) {
      console.log(`  - ${ordinal.id} (ordinal #${ordinal.ordinal_number})`);
    }

    if (brokenOrdinals.rows.length === 0) {
      console.log('Nothing to fix!');
      return;
    }

    // Fix them
    console.log('\nFixing...\n');
    
    const ordinalIds = brokenOrdinals.rows.map(o => o.id);
    
    const result = await client.query(`
      UPDATE generated_ordinals
      SET is_minted = true
      WHERE id = ANY($1)
      RETURNING id
    `, [ordinalIds]);

    console.log(`✅ Fixed ${result.rowCount} ordinals - set is_minted = true`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
    console.log('\n🔌 Done');
  }
}

main();
