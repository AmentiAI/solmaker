#!/usr/bin/env node

const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

async function fixMintInscriptions() {
  const client = new Client({
    connectionString: process.env.NEON_DATABASE,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('🔌 Connecting to database...');
    await client.connect();
    console.log('✅ Connected\n');

    // Drop the incomplete table and recreate with full schema
    console.log('🗑️  Dropping incomplete mint_inscriptions table...');
    await client.query(`DROP TABLE IF EXISTS mint_inscriptions CASCADE;`);
    console.log('   ✅ Dropped\n');

    console.log('📋 Creating complete mint_inscriptions table...');
    await client.query(`
      CREATE TABLE mint_inscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        
        -- References
        launch_id UUID,
        collection_id UUID NOT NULL,
        ordinal_id UUID,
        phase_id UUID,
        session_id TEXT,
        
        -- User info
        minter_wallet VARCHAR(255) NOT NULL,
        payment_wallet VARCHAR(255),
        receiving_wallet VARCHAR(255) NOT NULL,
        
        -- Transaction details (Commit)
        commit_tx_id VARCHAR(255),
        commit_psbt TEXT,
        commit_output_index INTEGER DEFAULT 0,
        commit_output_value BIGINT,
        commit_fee_sats BIGINT,
        commit_broadcast_at TIMESTAMPTZ,
        commit_confirmed_at TIMESTAMPTZ,
        commit_confirmations INTEGER DEFAULT 0,
        
        -- Transaction details (Reveal)
        reveal_tx_id VARCHAR(255),
        reveal_hex TEXT,
        reveal_fee_sats BIGINT,
        reveal_broadcast_at TIMESTAMPTZ,
        reveal_confirmed_at TIMESTAMPTZ,
        reveal_confirmations INTEGER DEFAULT 0,
        
        -- Inscription details
        inscription_id VARCHAR(255),
        inscription_number BIGINT,
        inscription_address VARCHAR(255),
        
        -- Content info
        original_image_url TEXT,
        compressed_image_url TEXT,
        compressed_base64 TEXT,
        content_size_bytes INTEGER,
        content_type VARCHAR(100) DEFAULT 'image/webp',
        
        -- Tapscript data
        reveal_data JSONB,
        inscription_priv_key TEXT,
        taproot_address VARCHAR(255),
        
        -- Fee information
        fee_rate DECIMAL(10,4),
        total_cost_sats BIGINT,
        mint_price_paid BIGINT DEFAULT 0,
        
        -- Status tracking
        mint_status VARCHAR(50) DEFAULT 'pending',
        error_message TEXT,
        error_code VARCHAR(50),
        retry_count INTEGER DEFAULT 0,
        last_retry_at TIMESTAMPTZ,
        
        -- Admin flags
        is_test_mint BOOLEAN DEFAULT FALSE,
        is_admin_mint BOOLEAN DEFAULT FALSE,
        flagged_for_review BOOLEAN DEFAULT FALSE,
        admin_notes TEXT,
        
        -- Loss prevention
        stuck_since TIMESTAMPTZ,
        recovery_attempted BOOLEAN DEFAULT FALSE,
        recovery_tx_id VARCHAR(255),
        refund_status VARCHAR(50),
        refund_tx_id VARCHAR(255),
        refund_amount_sats BIGINT,
        
        -- Timestamps
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMPTZ,
        
        CONSTRAINT valid_mint_status CHECK (mint_status IN (
          'pending', 'compressing', 'compressed',
          'commit_created', 'commit_signed', 'commit_broadcast', 'commit_confirming', 'commit_confirmed',
          'reveal_created', 'reveal_broadcast', 'reveal_confirming', 'reveal_confirmed',
          'completed', 'failed', 'stuck', 'refunded', 'cancelled', 'expired'
        ))
      );
    `);
    console.log('   ✅ mint_inscriptions table created\n');

    console.log('📊 Creating indexes...');
    await client.query(`
      CREATE INDEX idx_mint_inscriptions_launch ON mint_inscriptions(launch_id);
      CREATE INDEX idx_mint_inscriptions_collection ON mint_inscriptions(collection_id);
      CREATE INDEX idx_mint_inscriptions_ordinal ON mint_inscriptions(ordinal_id);
      CREATE INDEX idx_mint_inscriptions_phase ON mint_inscriptions(phase_id);
      CREATE INDEX idx_mint_inscriptions_minter ON mint_inscriptions(minter_wallet);
      CREATE INDEX idx_mint_inscriptions_status ON mint_inscriptions(mint_status);
      CREATE INDEX idx_mint_inscriptions_commit_tx ON mint_inscriptions(commit_tx_id);
      CREATE INDEX idx_mint_inscriptions_reveal_tx ON mint_inscriptions(reveal_tx_id);
      CREATE INDEX idx_mint_inscriptions_inscription ON mint_inscriptions(inscription_id);
      CREATE INDEX idx_mint_inscriptions_created ON mint_inscriptions(created_at DESC);
      CREATE INDEX idx_mint_inscriptions_stuck ON mint_inscriptions(mint_status, stuck_since) WHERE stuck_since IS NOT NULL;
      CREATE INDEX idx_mint_inscriptions_test ON mint_inscriptions(is_test_mint) WHERE is_test_mint = TRUE;
      CREATE INDEX idx_mint_inscriptions_flagged ON mint_inscriptions(flagged_for_review) WHERE flagged_for_review = TRUE;
    `);
    console.log('   ✅ All indexes created\n');

    // Show final structure
    console.log('📊 mint_inscriptions columns:');
    const columns = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns 
      WHERE table_name = 'mint_inscriptions'
      ORDER BY ordinal_position
    `);
    
    columns.rows.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type}`);
    });

    console.log(`\n✨ Total: ${columns.rows.length} columns`);
    console.log('\n🎉 mint_inscriptions table is now complete!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await client.end();
    console.log('🔌 Connection closed');
  }
}

fixMintInscriptions().catch(console.error);
