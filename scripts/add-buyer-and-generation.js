#!/usr/bin/env node

const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

async function addColumns() {
  const client = new Client({
    connectionString: process.env.NEON_DATABASE,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('🔌 Connecting to database...');
    await client.connect();
    console.log('✅ Connected\n');

    // Add all missing columns to marketplace_reviews
    console.log('1️⃣ Adding columns to marketplace_reviews...');
    try {
      await client.query(`
        ALTER TABLE marketplace_reviews 
        ADD COLUMN IF NOT EXISTS buyer_wallet TEXT,
        ADD COLUMN IF NOT EXISTS buyer_username TEXT,
        ADD COLUMN IF NOT EXISTS is_visible BOOLEAN DEFAULT true,
        ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
      `);
      console.log('   ✅ buyer_wallet added');
      console.log('   ✅ buyer_username added');
      console.log('   ✅ is_visible added');
      console.log('   ✅ is_edited added');
      console.log('   ✅ updated_at added');
      
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_marketplace_reviews_buyer 
        ON marketplace_reviews(buyer_wallet);
        
        CREATE INDEX IF NOT EXISTS idx_marketplace_reviews_visible 
        ON marketplace_reviews(is_visible) WHERE is_visible = true;
      `);
      console.log('   ✅ Indexes created\n');
    } catch (e) {
      console.log('   ⚠️  Error:', e.message, '\n');
    }

    // Add all missing columns to collections
    console.log('2️⃣ Adding columns to collections...');
    try {
      await client.query(`
        ALTER TABLE collections 
        ADD COLUMN IF NOT EXISTS generation_mode TEXT DEFAULT 'standard',
        ADD COLUMN IF NOT EXISTS border_requirements TEXT,
        ADD COLUMN IF NOT EXISTS video_url TEXT,
        ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS launched_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS mint_ended_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS trait_selections JSONB,
        ADD COLUMN IF NOT EXISTS compression_dimensions TEXT,
        ADD COLUMN IF NOT EXISTS is_pfp_collection BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS facing_direction TEXT,
        ADD COLUMN IF NOT EXISTS custom_rules TEXT,
        ADD COLUMN IF NOT EXISTS pixel_perfect BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS use_hyper_detailed BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS metadata_url TEXT;
      `);
      console.log('   ✅ generation_mode added');
      console.log('   ✅ border_requirements added');
      console.log('   ✅ video_url added');
      console.log('   ✅ is_locked added');
      console.log('   ✅ launched_at added');
      console.log('   ✅ mint_ended_at added');
      console.log('   ✅ trait_selections added');
      console.log('   ✅ compression_dimensions added');
      console.log('   ✅ is_pfp_collection added');
      console.log('   ✅ facing_direction added');
      console.log('   ✅ custom_rules added');
      console.log('   ✅ pixel_perfect added');
      console.log('   ✅ use_hyper_detailed added');
      console.log('   ✅ metadata_url added\n');
    } catch (e) {
      console.log('   ⚠️  Error:', e.message, '\n');
    }

    // Verify marketplace_reviews structure
    console.log('📊 marketplace_reviews columns:');
    const reviewCols = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'marketplace_reviews'
      ORDER BY ordinal_position
    `);
    reviewCols.rows.forEach(r => console.log(`  - ${r.column_name}`));

    // Add phase_name and mint_price_sats to mint_phases
    console.log('3️⃣ Adding columns to mint_phases...');
    try {
      await client.query(`
        ALTER TABLE mint_phases 
        ADD COLUMN IF NOT EXISTS phase_name TEXT,
        ADD COLUMN IF NOT EXISTS mint_price_sats BIGINT;
      `);
      console.log('   ✅ phase_name added to mint_phases');
      console.log('   ✅ mint_price_sats added to mint_phases\n');
    } catch (e) {
      console.log('   ⚠️  Error:', e.message, '\n');
    }

    // Add display_order to layers
    console.log('5️⃣ Adding display_order to layers...');
    try {
      await client.query(`
        ALTER TABLE layers 
        ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0;
      `);
      console.log('   ✅ display_order added to layers\n');
    } catch (e) {
      console.log('   ⚠️  Error:', e.message, '\n');
    }

    // Add metadata_url and compressed_size_kb to generated_ordinals
    console.log('6️⃣ Adding columns to generated_ordinals...');
    try {
      await client.query(`
        ALTER TABLE generated_ordinals 
        ADD COLUMN IF NOT EXISTS metadata_url TEXT,
        ADD COLUMN IF NOT EXISTS compressed_size_kb DECIMAL(10,2);
      `);
      console.log('   ✅ metadata_url added to generated_ordinals');
      console.log('   ✅ compressed_size_kb added to generated_ordinals\n');
    } catch (e) {
      console.log('   ⚠️  Error:', e.message, '\n');
    }

    // Add minted_count and allocation to whitelist_entries
    console.log('7️⃣ Adding columns to whitelist_entries...');
    try {
      await client.query(`
        ALTER TABLE whitelist_entries 
        ADD COLUMN IF NOT EXISTS minted_count INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS allocation INTEGER DEFAULT 1;
      `);
      console.log('   ✅ minted_count added to whitelist_entries');
      console.log('   ✅ allocation added to whitelist_entries\n');
    } catch (e) {
      console.log('   ⚠️  Error:', e.message, '\n');
    }

    // Verify collections has generation_mode
    console.log('📊 Checking collections for generation_mode...');
    const collCols = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'collections' 
      AND column_name = 'generation_mode'
    `);
    
    if (collCols.rows.length > 0) {
      console.log('  ✅ generation_mode exists in collections');
    } else {
      console.log('  ❌ generation_mode NOT found in collections');
    }

    // Create mint_inscriptions table if missing
    console.log('4️⃣ Creating mint_inscriptions table...');
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS mint_inscriptions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          collection_id UUID NOT NULL,
          session_id UUID,
          phase_id UUID,
          mint_number INTEGER,
          wallet_address TEXT NOT NULL,
          payment_address TEXT,
          payment_txid TEXT,
          inscription_id TEXT,
          inscription_number BIGINT,
          ordinal_number BIGINT,
          status TEXT DEFAULT 'pending',
          image_url TEXT,
          metadata JSONB,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_mint_inscriptions_collection 
        ON mint_inscriptions(collection_id);
        
        CREATE INDEX IF NOT EXISTS idx_mint_inscriptions_session 
        ON mint_inscriptions(session_id);
        
        CREATE INDEX IF NOT EXISTS idx_mint_inscriptions_phase 
        ON mint_inscriptions(phase_id);
        
        CREATE INDEX IF NOT EXISTS idx_mint_inscriptions_wallet 
        ON mint_inscriptions(wallet_address);
        
        CREATE INDEX IF NOT EXISTS idx_mint_inscriptions_status 
        ON mint_inscriptions(status);
      `);
      console.log('   ✅ mint_inscriptions table created\n');
    } catch (e) {
      console.log('   ⚠️  Error:', e.message, '\n');
    }

    console.log('🎉 All tables and columns added successfully!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await client.end();
    console.log('🔌 Connection closed');
  }
}

addColumns().catch(console.error);
