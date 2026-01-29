/**
 * Run Launchpad System Migration
 * Creates tables for mint phases, whitelists, reservations, and collection launch settings
 */

require('dotenv').config({ path: '.env.local' })
const { neon } = require('@neondatabase/serverless')
const fs = require('fs')
const path = require('path')

async function runMigration() {
  const databaseUrl = process.env.NEON_DATABASE || process.env.DATABASE_URL
  
  if (!databaseUrl) {
    console.error('❌ No database URL found. Please set NEON_DATABASE or DATABASE_URL')
    process.exit(1)
  }

  console.log('🚀 Running Launchpad System Migration...')
  console.log('📡 Connecting to database...')

  const sql = neon(databaseUrl)

  try {
    // Add columns to collections table
    console.log('  Adding launch settings to collections table...')
    
    const alterStatements = [
      'ALTER TABLE collections ADD COLUMN IF NOT EXISTS banner_image_url TEXT',
      'ALTER TABLE collections ADD COLUMN IF NOT EXISTS mobile_image_url TEXT',
      'ALTER TABLE collections ADD COLUMN IF NOT EXISTS audio_url TEXT',
      'ALTER TABLE collections ADD COLUMN IF NOT EXISTS video_url TEXT',
      'ALTER TABLE collections ADD COLUMN IF NOT EXISTS extend_last_phase BOOLEAN DEFAULT FALSE',
      'ALTER TABLE collections ADD COLUMN IF NOT EXISTS launch_status VARCHAR(50) DEFAULT \'draft\'',
      'ALTER TABLE collections ADD COLUMN IF NOT EXISTS launched_at TIMESTAMPTZ',
      'ALTER TABLE collections ADD COLUMN IF NOT EXISTS mint_ended_at TIMESTAMPTZ',
      'ALTER TABLE collections ADD COLUMN IF NOT EXISTS total_minted INTEGER DEFAULT 0',
    ]
    
    for (const stmt of alterStatements) {
      try {
        await sql.query(stmt)
      } catch (e) {
        // Ignore if already exists
      }
    }
    console.log('  ✅ Added collection launch settings')

    // Create mint_phases table
    console.log('  Creating mint_phases table...')
    await sql`
      CREATE TABLE IF NOT EXISTS mint_phases (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        collection_id UUID NOT NULL,
        phase_name VARCHAR(255) NOT NULL,
        phase_order INTEGER NOT NULL DEFAULT 0,
        start_time TIMESTAMPTZ NOT NULL,
        end_time TIMESTAMPTZ,
        mint_price_sats BIGINT NOT NULL DEFAULT 0,
        min_fee_rate DECIMAL(10,2) DEFAULT 1,
        max_fee_rate DECIMAL(10,2) DEFAULT 500,
        suggested_fee_rate DECIMAL(10,2) DEFAULT 10,
        max_per_wallet INTEGER DEFAULT NULL,
        max_per_transaction INTEGER DEFAULT 1,
        phase_allocation INTEGER DEFAULT NULL,
        phase_minted INTEGER DEFAULT 0,
        whitelist_only BOOLEAN DEFAULT FALSE,
        whitelist_id UUID,
        end_on_allocation BOOLEAN DEFAULT TRUE,
        is_active BOOLEAN DEFAULT FALSE,
        is_completed BOOLEAN DEFAULT FALSE,
        description TEXT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `
    console.log('  ✅ Created mint_phases')

    // Create mint_phase_whitelists table
    console.log('  Creating mint_phase_whitelists table...')
    await sql`
      CREATE TABLE IF NOT EXISTS mint_phase_whitelists (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        collection_id UUID NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        max_entries INTEGER DEFAULT NULL,
        entries_count INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        created_by VARCHAR(255)
      )
    `
    console.log('  ✅ Created mint_phase_whitelists')

    // Create whitelist_entries table
    console.log('  Creating whitelist_entries table...')
    await sql`
      CREATE TABLE IF NOT EXISTS whitelist_entries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        whitelist_id UUID NOT NULL,
        wallet_address VARCHAR(255) NOT NULL,
        allocation INTEGER DEFAULT 1,
        minted_count INTEGER DEFAULT 0,
        added_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        added_by VARCHAR(255),
        notes TEXT,
        UNIQUE(whitelist_id, wallet_address)
      )
    `
    console.log('  ✅ Created whitelist_entries')

    // Create ordinal_reservations table
    console.log('  Creating ordinal_reservations table...')
    await sql`
      CREATE TABLE IF NOT EXISTS ordinal_reservations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        collection_id UUID NOT NULL,
        ordinal_id UUID NOT NULL,
        phase_id UUID,
        reserved_by VARCHAR(255) NOT NULL,
        reserved_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMPTZ NOT NULL,
        status VARCHAR(50) DEFAULT 'reserved',
        inscription_id UUID,
        completed_at TIMESTAMPTZ
      )
    `
    console.log('  ✅ Created ordinal_reservations')

    // Create mint_queue table
    console.log('  Creating mint_queue table...')
    await sql`
      CREATE TABLE IF NOT EXISTS mint_queue (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        collection_id UUID NOT NULL,
        phase_id UUID,
        ordinal_id UUID NOT NULL,
        reservation_id UUID,
        minter_wallet VARCHAR(255) NOT NULL,
        receiving_wallet VARCHAR(255) NOT NULL,
        mint_price_sats BIGINT NOT NULL DEFAULT 0,
        fee_rate DECIMAL(10,4) NOT NULL DEFAULT 1,
        queue_position INTEGER,
        queued_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(50) DEFAULT 'queued',
        processing_started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        error_message TEXT,
        inscription_id UUID
      )
    `
    console.log('  ✅ Created mint_queue')

    // Create phase_wallet_mints table
    console.log('  Creating phase_wallet_mints table...')
    await sql`
      CREATE TABLE IF NOT EXISTS phase_wallet_mints (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        phase_id UUID NOT NULL,
        wallet_address VARCHAR(255) NOT NULL,
        mint_count INTEGER DEFAULT 0,
        last_mint_at TIMESTAMPTZ,
        UNIQUE(phase_id, wallet_address)
      )
    `
    console.log('  ✅ Created phase_wallet_mints')

    // Create indexes
    console.log('  Creating indexes...')
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_mint_phases_collection ON mint_phases(collection_id)',
      'CREATE INDEX IF NOT EXISTS idx_mint_phases_active ON mint_phases(is_active, start_time)',
      'CREATE INDEX IF NOT EXISTS idx_mint_phases_order ON mint_phases(collection_id, phase_order)',
      'CREATE INDEX IF NOT EXISTS idx_whitelist_entries_whitelist ON whitelist_entries(whitelist_id)',
      'CREATE INDEX IF NOT EXISTS idx_whitelist_entries_wallet ON whitelist_entries(wallet_address)',
      'CREATE INDEX IF NOT EXISTS idx_reservations_collection ON ordinal_reservations(collection_id)',
      'CREATE INDEX IF NOT EXISTS idx_reservations_ordinal ON ordinal_reservations(ordinal_id)',
      'CREATE INDEX IF NOT EXISTS idx_reservations_status ON ordinal_reservations(status, expires_at)',
      'CREATE INDEX IF NOT EXISTS idx_reservations_wallet ON ordinal_reservations(reserved_by)',
      'CREATE INDEX IF NOT EXISTS idx_mint_queue_collection ON mint_queue(collection_id)',
      'CREATE INDEX IF NOT EXISTS idx_mint_queue_status ON mint_queue(status, queue_position)',
      'CREATE INDEX IF NOT EXISTS idx_mint_queue_minter ON mint_queue(minter_wallet)',
      'CREATE INDEX IF NOT EXISTS idx_phase_wallet_mints ON phase_wallet_mints(phase_id, wallet_address)',
      'CREATE INDEX IF NOT EXISTS idx_collections_launch_status ON collections(launch_status)',
      'CREATE INDEX IF NOT EXISTS idx_collections_launched ON collections(launched_at DESC)',
    ]
    
    for (const idx of indexes) {
      try {
        await sql.query(idx)
      } catch (e) {
        // Ignore if already exists
      }
    }
    console.log('  ✅ Created indexes')

    // Add foreign keys
    console.log('  Adding foreign key constraints...')
    const fks = [
      'ALTER TABLE mint_phases ADD CONSTRAINT IF NOT EXISTS fk_phases_collection FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE',
      'ALTER TABLE mint_phase_whitelists ADD CONSTRAINT IF NOT EXISTS fk_whitelists_collection FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE',
      'ALTER TABLE whitelist_entries ADD CONSTRAINT IF NOT EXISTS fk_entries_whitelist FOREIGN KEY (whitelist_id) REFERENCES mint_phase_whitelists(id) ON DELETE CASCADE',
      'ALTER TABLE ordinal_reservations ADD CONSTRAINT IF NOT EXISTS fk_reservations_collection FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE',
      'ALTER TABLE mint_queue ADD CONSTRAINT IF NOT EXISTS fk_queue_collection FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE',
      'ALTER TABLE phase_wallet_mints ADD CONSTRAINT IF NOT EXISTS fk_wallet_mints_phase FOREIGN KEY (phase_id) REFERENCES mint_phases(id) ON DELETE CASCADE',
    ]
    
    for (const fk of fks) {
      try {
        await sql.query(fk)
      } catch (e) {
        // Ignore if already exists or reference issues
      }
    }
    console.log('  ✅ Added foreign key constraints')

    console.log('')
    console.log('=' .repeat(50))
    console.log('✅ Launchpad Migration completed successfully!')
    console.log('=' .repeat(50))

    // Verify tables were created
    console.log('')
    console.log('🔍 Verifying tables...')
    
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN (
        'mint_phases',
        'mint_phase_whitelists', 
        'whitelist_entries',
        'ordinal_reservations',
        'mint_queue',
        'phase_wallet_mints'
      )
      ORDER BY table_name
    `

    console.log(`   Found ${tables.length}/6 launchpad tables:`)
    tables.forEach(t => console.log(`   - ${t.table_name}`))

  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  }
}

runMigration()

