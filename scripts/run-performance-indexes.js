/**
 * Script to add performance indexes to the database
 * Usage: node scripts/run-performance-indexes.js
 */

const { neon } = require('@neondatabase/serverless');
require('dotenv').config({ path: '.env.local' });

const sql = neon(process.env.NEON_DATABASE || process.env.DATABASE_URL);

async function run() {
  try {
    console.log('📊 Adding performance indexes...\n');
    
    // Using tagged template literals as required by neon
    const indexQueries = [
      { name: 'idx_generated_ordinals_collection_id', fn: () => sql`CREATE INDEX IF NOT EXISTS idx_generated_ordinals_collection_id ON generated_ordinals(collection_id)` },
      { name: 'idx_collections_wallet_address', fn: () => sql`CREATE INDEX IF NOT EXISTS idx_collections_wallet_address ON collections(wallet_address)` },
      { name: 'idx_generation_jobs_status_collection', fn: () => sql`CREATE INDEX IF NOT EXISTS idx_generation_jobs_status_collection ON generation_jobs(collection_id, status)` },
      { name: 'idx_credit_transactions_wallet', fn: () => sql`CREATE INDEX IF NOT EXISTS idx_credit_transactions_wallet ON credit_transactions(wallet_address)` },
      { name: 'idx_traits_layer_id', fn: () => sql`CREATE INDEX IF NOT EXISTS idx_traits_layer_id ON traits(layer_id)` },
      { name: 'idx_layers_collection_id', fn: () => sql`CREATE INDEX IF NOT EXISTS idx_layers_collection_id ON layers(collection_id)` },
    ];
    
    for (const index of indexQueries) {
      try {
        await index.fn();
        console.log(`✅ ${index.name}`);
      } catch (e) {
        const msg = e?.message || String(e);
        if (msg.includes('already exists')) {
          console.log(`⏭️  ${index.name} (already exists)`);
        } else {
          console.error(`❌ ${index.name}: ${msg}`);
        }
      }
    }
    
    console.log('\n📈 Running ANALYZE on key tables...');
    try { await sql`ANALYZE generated_ordinals`; console.log('✅ ANALYZE generated_ordinals'); } catch (e) { console.log(`⚠️ generated_ordinals: ${e?.message}`); }
    try { await sql`ANALYZE collections`; console.log('✅ ANALYZE collections'); } catch (e) { console.log(`⚠️ collections: ${e?.message}`); }
    try { await sql`ANALYZE generation_jobs`; console.log('✅ ANALYZE generation_jobs'); } catch (e) { console.log(`⚠️ generation_jobs: ${e?.message}`); }
    try { await sql`ANALYZE credit_transactions`; console.log('✅ ANALYZE credit_transactions'); } catch (e) { console.log(`⚠️ credit_transactions: ${e?.message}`); }
    try { await sql`ANALYZE traits`; console.log('✅ ANALYZE traits'); } catch (e) { console.log(`⚠️ traits: ${e?.message}`); }
    try { await sql`ANALYZE layers`; console.log('✅ ANALYZE layers'); } catch (e) { console.log(`⚠️ layers: ${e?.message}`); }
    
    console.log('\n✅ Performance indexes added successfully!');
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

run();

