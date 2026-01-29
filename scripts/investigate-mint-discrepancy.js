/**
 * Script to investigate mint count discrepancy
 * Collection: 61ce3cba-a8dc-490b-b2ae-1a480c284b2b
 * Expected: 95 mints = 94 minted ordinals + 1 duplicate?
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local
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
  const connectionString = process.env.NEON_DATABASE || process.env.POSTGRES_URL || process.env.DATABASE_URL;
  
  if (!connectionString) {
    console.error('❌ No database connection string found');
    process.exit(1);
  }

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Connected to database\n');
    console.log('=' .repeat(70));
    console.log('INVESTIGATING MINT DISCREPANCY');
    console.log('=' .repeat(70));
    console.log(`Collection: ${COLLECTION_ID}\n`);

    // 1. Total ordinals in collection
    const totalOrdinals = await client.query(`
      SELECT COUNT(*) as count 
      FROM generated_ordinals 
      WHERE collection_id = $1
    `, [COLLECTION_ID]);
    console.log(`📊 Total ordinals in collection: ${totalOrdinals.rows[0].count}`);

    // 2. Ordinals marked as minted (is_minted = true)
    const mintedOrdinals = await client.query(`
      SELECT COUNT(*) as count 
      FROM generated_ordinals 
      WHERE collection_id = $1 AND is_minted = true
    `, [COLLECTION_ID]);
    console.log(`📊 Ordinals marked as minted (is_minted=true): ${mintedOrdinals.rows[0].count}`);

    // 3. Ordinals marked as available (is_minted = false)
    const availableOrdinals = await client.query(`
      SELECT COUNT(*) as count 
      FROM generated_ordinals 
      WHERE collection_id = $1 AND is_minted = false
    `, [COLLECTION_ID]);
    console.log(`📊 Ordinals available (is_minted=false): ${availableOrdinals.rows[0].count}`);

    // 4. Total mint_inscriptions
    const totalMints = await client.query(`
      SELECT COUNT(*) as count 
      FROM mint_inscriptions 
      WHERE collection_id = $1 AND is_test_mint = false
    `, [COLLECTION_ID]);
    console.log(`\n📊 Total mint_inscriptions (non-test): ${totalMints.rows[0].count}`);

    // 5. Breakdown by status
    const statusBreakdown = await client.query(`
      SELECT mint_status, COUNT(*) as count
      FROM mint_inscriptions 
      WHERE collection_id = $1 AND is_test_mint = false
      GROUP BY mint_status
      ORDER BY count DESC
    `, [COLLECTION_ID]);
    console.log('\n📊 Mint inscriptions by status:');
    statusBreakdown.rows.forEach(row => {
      console.log(`   ${(row.mint_status || 'NULL').padEnd(20)}: ${row.count}`);
    });

    // 6. CHECK FOR DUPLICATES - Same ordinal_id used in multiple mints
    const duplicateOrdinals = await client.query(`
      SELECT ordinal_id, COUNT(*) as mint_count
      FROM mint_inscriptions 
      WHERE collection_id = $1 
        AND is_test_mint = false
        AND ordinal_id IS NOT NULL
      GROUP BY ordinal_id
      HAVING COUNT(*) > 1
      ORDER BY mint_count DESC
    `, [COLLECTION_ID]);
    
    console.log('\n' + '─'.repeat(70));
    console.log('🔍 DUPLICATE CHECK - Ordinals minted more than once:');
    console.log('─'.repeat(70));
    
    if (duplicateOrdinals.rows.length > 0) {
      console.log(`⚠️  FOUND ${duplicateOrdinals.rows.length} ORDINALS WITH MULTIPLE MINTS!`);
      for (const dup of duplicateOrdinals.rows) {
        console.log(`\n   Ordinal ID: ${dup.ordinal_id}`);
        console.log(`   Minted ${dup.mint_count} times`);
        
        // Get details of each mint for this ordinal
        const mintDetails = await client.query(`
          SELECT id, mint_status, minter_wallet, commit_tx_id, reveal_tx_id, inscription_id, created_at
          FROM mint_inscriptions 
          WHERE ordinal_id = $1 AND collection_id = $2 AND is_test_mint = false
          ORDER BY created_at
        `, [dup.ordinal_id, COLLECTION_ID]);
        
        console.log('   Mint records:');
        mintDetails.rows.forEach((mint, i) => {
          console.log(`     ${i+1}. Status: ${mint.mint_status}`);
          console.log(`        Wallet: ${mint.minter_wallet?.substring(0, 12)}...`);
          console.log(`        Has Commit: ${mint.commit_tx_id ? 'YES' : 'NO'}`);
          console.log(`        Has Reveal: ${mint.reveal_tx_id ? 'YES' : 'NO'}`);
          console.log(`        Inscription: ${mint.inscription_id || 'none'}`);
          console.log(`        Created: ${mint.created_at}`);
        });
      }
    } else {
      console.log('✅ No duplicate ordinals found - each ordinal_id appears only once');
    }

    // 7. Check for mints WITHOUT ordinal_id (orphaned mints)
    const orphanedMints = await client.query(`
      SELECT COUNT(*) as count
      FROM mint_inscriptions 
      WHERE collection_id = $1 
        AND is_test_mint = false
        AND ordinal_id IS NULL
    `, [COLLECTION_ID]);
    console.log(`\n📊 Mints without ordinal_id (orphaned): ${orphanedMints.rows[0].count}`);

    // 8. Count unique ordinal_ids in mint_inscriptions
    const uniqueOrdinalsMinted = await client.query(`
      SELECT COUNT(DISTINCT ordinal_id) as count
      FROM mint_inscriptions 
      WHERE collection_id = $1 
        AND is_test_mint = false
        AND ordinal_id IS NOT NULL
    `, [COLLECTION_ID]);
    console.log(`📊 Unique ordinals in mint_inscriptions: ${uniqueOrdinalsMinted.rows[0].count}`);

    // 9. Compare generated_ordinals.is_minted with actual mint_inscriptions
    const markedMintedButNoMintRecord = await client.query(`
      SELECT go.id, go.ordinal_number, go.is_minted
      FROM generated_ordinals go
      LEFT JOIN mint_inscriptions mi ON mi.ordinal_id = go.id 
        AND mi.collection_id = go.collection_id 
        AND mi.is_test_mint = false
      WHERE go.collection_id = $1 
        AND go.is_minted = true
        AND mi.id IS NULL
    `, [COLLECTION_ID]);
    
    console.log(`\n📊 Ordinals marked minted but NO mint record: ${markedMintedButNoMintRecord.rows.length}`);
    if (markedMintedButNoMintRecord.rows.length > 0) {
      console.log('   These ordinals have is_minted=true but no matching mint_inscription:');
      markedMintedButNoMintRecord.rows.slice(0, 10).forEach(row => {
        console.log(`   - Ordinal #${row.ordinal_number} (${row.id})`);
      });
    }

    // 10. Ordinals with mint record but is_minted = false
    const hasMintRecordButNotMarked = await client.query(`
      SELECT go.id, go.ordinal_number, go.is_minted, mi.mint_status
      FROM generated_ordinals go
      INNER JOIN mint_inscriptions mi ON mi.ordinal_id = go.id 
        AND mi.collection_id = go.collection_id 
        AND mi.is_test_mint = false
      WHERE go.collection_id = $1 
        AND go.is_minted = false
    `, [COLLECTION_ID]);
    
    console.log(`\n📊 Ordinals with mint record but is_minted=false: ${hasMintRecordButNotMarked.rows.length}`);
    if (hasMintRecordButNotMarked.rows.length > 0) {
      console.log('   These ordinals have mint records but is_minted is still false:');
      hasMintRecordButNotMarked.rows.slice(0, 10).forEach(row => {
        console.log(`   - Ordinal #${row.ordinal_number} (${row.id}) - mint status: ${row.mint_status}`);
      });
    }

    // 11. Summary
    console.log('\n' + '═'.repeat(70));
    console.log('SUMMARY');
    console.log('═'.repeat(70));
    console.log(`Total ordinals in collection:      ${totalOrdinals.rows[0].count}`);
    console.log(`Ordinals marked is_minted=true:    ${mintedOrdinals.rows[0].count}`);
    console.log(`Ordinals marked is_minted=false:   ${availableOrdinals.rows[0].count}`);
    console.log(`Total mint_inscriptions:           ${totalMints.rows[0].count}`);
    console.log(`Unique ordinals with mint records: ${uniqueOrdinalsMinted.rows[0].count}`);
    console.log(`Duplicate ordinals found:          ${duplicateOrdinals.rows.length}`);
    
    const expectedMinted = parseInt(totalOrdinals.rows[0].count) - parseInt(availableOrdinals.rows[0].count);
    const actualMints = parseInt(totalMints.rows[0].count);
    const discrepancy = actualMints - expectedMinted;
    
    console.log(`\n📊 Expected minted (total - available): ${expectedMinted}`);
    console.log(`📊 Actual mint records: ${actualMints}`);
    console.log(`📊 Discrepancy: ${discrepancy > 0 ? '+' : ''}${discrepancy}`);
    
    if (discrepancy > 0) {
      console.log(`\n⚠️  There are ${discrepancy} more mint records than expected.`);
      console.log('   This could mean duplicate mints for the same ordinal.');
    } else if (discrepancy < 0) {
      console.log(`\n⚠️  There are ${Math.abs(discrepancy)} fewer mint records than expected.`);
      console.log('   Some ordinals may be marked minted without a mint record.');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
    console.log('\n🔌 Database connection closed');
  }
}

main();
