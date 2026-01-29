/**
 * Investigate the "failed" mints that have inscription_ids
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

const FAILED_MINT_IDS = [
  '2f62ed08-2842-4ee9-8489-7223adb1320a', // Ordinal eac6856f - failed with inscription
  'f8077ecc-5667-4bc1-a848-02c118ec96c2'  // Ordinal 9270b6f3 - failed with inscription
];

async function main() {
  const connectionString = process.env.NEON_DATABASE;
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

  try {
    await client.connect();
    console.log('✅ Connected\n');

    for (const mintId of FAILED_MINT_IDS) {
      console.log('═'.repeat(80));
      console.log(`MINT: ${mintId}`);
      console.log('═'.repeat(80));

      const mint = await client.query(`
        SELECT *
        FROM mint_inscriptions
        WHERE id = $1
      `, [mintId]);

      if (mint.rows.length > 0) {
        const m = mint.rows[0];
        console.log('\n📋 Full mint record:');
        console.log(`   Status: ${m.mint_status}`);
        console.log(`   Ordinal ID: ${m.ordinal_id}`);
        console.log(`   Minter: ${m.minter_wallet}`);
        console.log(`   Commit TX: ${m.commit_tx_id}`);
        console.log(`   Reveal TX: ${m.reveal_tx_id}`);
        console.log(`   Inscription ID: ${m.inscription_id}`);
        console.log(`   Error Message: ${m.error_message}`);
        console.log(`   Error Code: ${m.error_code}`);
        console.log(`   Created: ${m.created_at}`);
        console.log(`   Commit Broadcast: ${m.commit_broadcast_at}`);
        console.log(`   Reveal Broadcast: ${m.reveal_broadcast_at}`);
        console.log(`   Completed: ${m.completed_at}`);

        // Check if these transactions exist on mempool
        console.log('\n🔍 Checking transactions on mempool.space...');
        
        if (m.commit_tx_id) {
          try {
            const commitResp = await fetch(`https://mempool.space/api/tx/${m.commit_tx_id}`);
            console.log(`   Commit TX (${m.commit_tx_id.substring(0, 12)}...): ${commitResp.ok ? '✅ EXISTS' : '❌ NOT FOUND'} (${commitResp.status})`);
            if (commitResp.ok) {
              const commitData = await commitResp.json();
              console.log(`   - Confirmed: ${commitData.status?.confirmed ? 'YES at block ' + commitData.status.block_height : 'NO'}`);
            }
          } catch (e) {
            console.log(`   Commit TX check error: ${e.message}`);
          }
        }

        if (m.reveal_tx_id) {
          try {
            const revealResp = await fetch(`https://mempool.space/api/tx/${m.reveal_tx_id}`);
            console.log(`   Reveal TX (${m.reveal_tx_id.substring(0, 12)}...): ${revealResp.ok ? '✅ EXISTS' : '❌ NOT FOUND'} (${revealResp.status})`);
            if (revealResp.ok) {
              const revealData = await revealResp.json();
              console.log(`   - Confirmed: ${revealData.status?.confirmed ? 'YES at block ' + revealData.status.block_height : 'NO'}`);
            }
          } catch (e) {
            console.log(`   Reveal TX check error: ${e.message}`);
          }
        }
      }
    }

    // Also check: when did these mints get marked as failed?
    console.log('\n\n' + '═'.repeat(80));
    console.log('QUESTION: HOW DID MINTS GET MARKED AS FAILED IF THEY HAVE INSCRIPTIONS?');
    console.log('═'.repeat(80));
    console.log(`
Possible scenarios:
1. Manual admin update?
2. Cron job incorrectly marked them?
3. Race condition during processing?

The inscription_id is typically only set when mint completes successfully...
So either the inscription was set before failure, or it was a manual change.
`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
  }
}

main();
