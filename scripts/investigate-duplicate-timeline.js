/**
 * Deep investigation of duplicate mint timeline
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
const DUPLICATE_ORDINALS = [
  'eac6856f-3776-4757-9c29-9947d146b841',
  '9270b6f3-ae3e-45ef-b232-35e0606b4103'
];

async function main() {
  const connectionString = process.env.NEON_DATABASE;
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

  try {
    await client.connect();
    console.log('✅ Connected\n');

    for (const ordinalId of DUPLICATE_ORDINALS) {
      console.log('═'.repeat(80));
      console.log(`ORDINAL: ${ordinalId}`);
      console.log('═'.repeat(80));

      // Get ordinal details
      const ordinal = await client.query(`
        SELECT id, ordinal_number, is_minted, created_at
        FROM generated_ordinals
        WHERE id = $1
      `, [ordinalId]);
      
      if (ordinal.rows.length > 0) {
        const o = ordinal.rows[0];
        console.log(`\n📋 Ordinal Status:`);
        console.log(`   Number: #${o.ordinal_number}`);
        console.log(`   is_minted: ${o.is_minted}`);
        console.log(`   Created: ${o.created_at}`);
      }

      // Get ALL mint_inscriptions for this ordinal with full timeline
      const mints = await client.query(`
        SELECT 
          id,
          mint_status,
          minter_wallet,
          receiving_wallet,
          commit_tx_id,
          reveal_tx_id,
          inscription_id,
          created_at,
          commit_broadcast_at,
          reveal_broadcast_at,
          completed_at,
          updated_at
        FROM mint_inscriptions
        WHERE ordinal_id = $1 AND collection_id = $2 AND is_test_mint = false
        ORDER BY created_at ASC
      `, [ordinalId, COLLECTION_ID]);

      console.log(`\n📋 Mint Timeline (${mints.rows.length} records):`);
      console.log('─'.repeat(80));
      
      mints.rows.forEach((m, i) => {
        console.log(`\n🔹 MINT #${i+1}: ${m.mint_status?.toUpperCase()}`);
        console.log(`   ID: ${m.id}`);
        console.log(`   Minter: ${m.minter_wallet?.substring(0, 20)}...`);
        console.log(`   Created:    ${m.created_at}`);
        console.log(`   Commit TX:  ${m.commit_tx_id ? m.commit_tx_id.substring(0, 20) + '...' : 'NONE'}`);
        console.log(`   Commit At:  ${m.commit_broadcast_at || 'N/A'}`);
        console.log(`   Reveal TX:  ${m.reveal_tx_id ? m.reveal_tx_id.substring(0, 20) + '...' : 'NONE'}`);
        console.log(`   Reveal At:  ${m.reveal_broadcast_at || 'N/A'}`);
        console.log(`   Completed:  ${m.completed_at || 'N/A'}`);
        console.log(`   Updated:    ${m.updated_at}`);
        console.log(`   Inscription: ${m.inscription_id || 'NONE'}`);
      });

      // Check reservation history if table exists
      try {
        const reservations = await client.query(`
          SELECT 
            id, wallet_address, status, created_at, expires_at, released_at
          FROM ordinal_reservations
          WHERE ordinal_id = $1
          ORDER BY created_at ASC
        `, [ordinalId]);

        if (reservations.rows.length > 0) {
          console.log(`\n📋 Reservation History (${reservations.rows.length} records):`);
          console.log('─'.repeat(80));
          reservations.rows.forEach((r, i) => {
            console.log(`\n🔸 Reservation #${i+1}: ${r.status}`);
            console.log(`   Wallet: ${r.wallet_address?.substring(0, 20)}...`);
            console.log(`   Created: ${r.created_at}`);
            console.log(`   Expires: ${r.expires_at}`);
            console.log(`   Released: ${r.released_at || 'N/A'}`);
          });
        }
      } catch (e) {
        console.log('\n(No reservation table or data)');
      }

      // Key question: When did each mint's commit get broadcast relative to each other?
      console.log('\n' + '─'.repeat(80));
      console.log('⏱️  KEY TIMELINE ANALYSIS:');
      console.log('─'.repeat(80));
      
      const sortedByCommit = [...mints.rows]
        .filter(m => m.commit_broadcast_at)
        .sort((a, b) => new Date(a.commit_broadcast_at) - new Date(b.commit_broadcast_at));
      
      if (sortedByCommit.length > 1) {
        const first = sortedByCommit[0];
        const second = sortedByCommit[1];
        const gap = new Date(second.commit_broadcast_at) - new Date(first.commit_broadcast_at);
        const gapSeconds = gap / 1000;
        const gapMinutes = gapSeconds / 60;
        
        console.log(`First commit:  ${first.commit_broadcast_at} (${first.mint_status})`);
        console.log(`Second commit: ${second.commit_broadcast_at} (${second.mint_status})`);
        console.log(`Time between:  ${gapMinutes.toFixed(1)} minutes (${gapSeconds.toFixed(0)} seconds)`);
        
        if (sortedByCommit.length > 2) {
          const third = sortedByCommit[2];
          const gap2 = new Date(third.commit_broadcast_at) - new Date(second.commit_broadcast_at);
          console.log(`Third commit:  ${third.commit_broadcast_at} (${third.mint_status})`);
          console.log(`Time between 2nd-3rd: ${(gap2/1000/60).toFixed(1)} minutes`);
        }
      }

      console.log('\n');
    }

    // Also check: what status should prevent re-minting?
    console.log('═'.repeat(80));
    console.log('CHECKING WHAT SHOULD BLOCK MINTING:');
    console.log('═'.repeat(80));
    
    // Check if there's any logic that checks mint_inscriptions before allowing new mint
    // The key question: does reserve API check if ordinal already has a non-failed mint?
    
    console.log(`
The bug is likely in one of these places:
1. /api/launchpad/[id]/reserve - Should check if ordinal already has active mint
2. The "available ordinals" query - Should exclude ordinals with pending/completed mints
3. is_minted flag not being set when mint completes
`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
  }
}

main();
