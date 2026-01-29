/**
 * Run Mint Launch System Migration
 * Creates tables for collection mint launches and inscription tracking
 */

require('dotenv').config({ path: '.env.local' })
const { neon } = require('@neondatabase/serverless')

async function runMigration() {
  const databaseUrl = process.env.NEON_DATABASE || process.env.DATABASE_URL
  
  if (!databaseUrl) {
    console.error('❌ No database URL found. Please set NEON_DATABASE or DATABASE_URL')
    process.exit(1)
  }

  console.log('🔧 Running Mint Launch System Migration...')
  console.log('📡 Connecting to database...')

  const sql = neon(databaseUrl)

  try {
    // Execute each statement separately using tagged template literals
    
    // 1. Collection Mint Launches Table
    console.log('  Creating collection_mint_launches table...')
    await sql`
      CREATE TABLE IF NOT EXISTS collection_mint_launches (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        collection_id UUID NOT NULL,
        launch_name VARCHAR(255),
        mint_price_sats BIGINT NOT NULL DEFAULT 0,
        max_per_wallet INTEGER DEFAULT NULL,
        total_supply INTEGER NOT NULL,
        minted_count INTEGER DEFAULT 0,
        reserved_count INTEGER DEFAULT 0,
        creator_wallet VARCHAR(255) NOT NULL,
        platform_fee_wallet VARCHAR(255),
        platform_fee_percent DECIMAL(5,2) DEFAULT 0,
        launch_status VARCHAR(50) DEFAULT 'draft',
        scheduled_start TIMESTAMPTZ,
        scheduled_end TIMESTAMPTZ,
        actual_start TIMESTAMPTZ,
        actual_end TIMESTAMPTZ,
        allow_public_mint BOOLEAN DEFAULT TRUE,
        whitelist_only BOOLEAN DEFAULT FALSE,
        reveal_on_mint BOOLEAN DEFAULT TRUE,
        shuffle_on_mint BOOLEAN DEFAULT TRUE,
        default_fee_rate DECIMAL(10,2) DEFAULT 1.0,
        min_fee_rate DECIMAL(10,2) DEFAULT 0.5,
        max_fee_rate DECIMAL(10,2) DEFAULT 500,
        total_revenue_sats BIGINT DEFAULT 0,
        total_fees_collected BIGINT DEFAULT 0,
        unique_minters INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT valid_launch_status CHECK (launch_status IN ('draft', 'scheduled', 'active', 'paused', 'completed', 'cancelled'))
      )
    `
    console.log('  ✅ Created collection_mint_launches')

    // 2. Mint Inscriptions Table
    console.log('  Creating mint_inscriptions table...')
    await sql`
      CREATE TABLE IF NOT EXISTS mint_inscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        launch_id UUID,
        collection_id UUID NOT NULL,
        ordinal_id UUID,
        minter_wallet VARCHAR(255) NOT NULL,
        payment_wallet VARCHAR(255),
        receiving_wallet VARCHAR(255) NOT NULL,
        commit_tx_id VARCHAR(255),
        commit_psbt TEXT,
        commit_output_index INTEGER DEFAULT 0,
        commit_output_value BIGINT,
        commit_fee_sats BIGINT,
        commit_broadcast_at TIMESTAMPTZ,
        commit_confirmed_at TIMESTAMPTZ,
        commit_confirmations INTEGER DEFAULT 0,
        reveal_tx_id VARCHAR(255),
        reveal_hex TEXT,
        reveal_fee_sats BIGINT,
        reveal_broadcast_at TIMESTAMPTZ,
        reveal_confirmed_at TIMESTAMPTZ,
        reveal_confirmations INTEGER DEFAULT 0,
        inscription_id VARCHAR(255),
        inscription_number BIGINT,
        original_image_url TEXT,
        compressed_image_url TEXT,
        compressed_base64 TEXT,
        content_size_bytes INTEGER,
        content_type VARCHAR(100) DEFAULT 'image/webp',
        reveal_data JSONB,
        inscription_priv_key TEXT,
        taproot_address VARCHAR(255),
        fee_rate DECIMAL(10,4),
        total_cost_sats BIGINT,
        mint_price_paid BIGINT DEFAULT 0,
        mint_status VARCHAR(50) DEFAULT 'pending',
        error_message TEXT,
        error_code VARCHAR(50),
        retry_count INTEGER DEFAULT 0,
        last_retry_at TIMESTAMPTZ,
        is_test_mint BOOLEAN DEFAULT FALSE,
        is_admin_mint BOOLEAN DEFAULT FALSE,
        flagged_for_review BOOLEAN DEFAULT FALSE,
        admin_notes TEXT,
        stuck_since TIMESTAMPTZ,
        recovery_attempted BOOLEAN DEFAULT FALSE,
        recovery_tx_id VARCHAR(255),
        refund_status VARCHAR(50),
        refund_tx_id VARCHAR(255),
        refund_amount_sats BIGINT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMPTZ,
        CONSTRAINT valid_mint_status CHECK (mint_status IN (
          'pending', 'compressing', 'compressed',
          'commit_created', 'commit_signed', 'commit_broadcast', 'commit_confirming', 'commit_confirmed',
          'reveal_created', 'reveal_broadcast', 'reveal_confirming', 'reveal_confirmed',
          'completed', 'failed', 'stuck', 'refunded', 'cancelled'
        ))
      )
    `
    console.log('  ✅ Created mint_inscriptions')

    // 3. Mint Whitelist Table
    console.log('  Creating mint_whitelist table...')
    await sql`
      CREATE TABLE IF NOT EXISTS mint_whitelist (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        launch_id UUID NOT NULL,
        wallet_address VARCHAR(255) NOT NULL,
        max_mints INTEGER DEFAULT 1,
        mints_used INTEGER DEFAULT 0,
        added_by VARCHAR(255),
        added_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(launch_id, wallet_address)
      )
    `
    console.log('  ✅ Created mint_whitelist')

    // 4. Mint Activity Log Table
    console.log('  Creating mint_activity_log table...')
    await sql`
      CREATE TABLE IF NOT EXISTS mint_activity_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        launch_id UUID,
        mint_inscription_id UUID,
        collection_id UUID,
        actor_wallet VARCHAR(255),
        actor_type VARCHAR(50) DEFAULT 'user',
        action_type VARCHAR(100) NOT NULL,
        action_data JSONB,
        ip_address VARCHAR(45),
        user_agent TEXT,
        success BOOLEAN DEFAULT TRUE,
        error_message TEXT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `
    // Add collection_id column if table already exists without it
    try {
      await sql`ALTER TABLE mint_activity_log ADD COLUMN IF NOT EXISTS collection_id UUID`
    } catch (e) {
      // Column may already exist
    }
    console.log('  ✅ Created mint_activity_log')

    // 5. Stuck Transactions Table
    console.log('  Creating stuck_transactions table...')
    await sql`
      CREATE TABLE IF NOT EXISTS stuck_transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        mint_inscription_id UUID NOT NULL,
        tx_type VARCHAR(20) NOT NULL,
        tx_id VARCHAR(255) NOT NULL,
        tx_hex TEXT,
        detected_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        stuck_duration_minutes INTEGER,
        mempool_position INTEGER,
        current_fee_rate DECIMAL(10,4),
        recommended_fee_rate DECIMAL(10,4),
        resolution_status VARCHAR(50) DEFAULT 'detected',
        resolution_tx_id VARCHAR(255),
        resolution_fee_sats BIGINT,
        resolved_at TIMESTAMPTZ,
        resolved_by VARCHAR(255),
        admin_notes TEXT,
        CONSTRAINT valid_tx_type CHECK (tx_type IN ('commit', 'reveal')),
        CONSTRAINT valid_resolution_status CHECK (resolution_status IN ('detected', 'rbf_sent', 'cpfp_sent', 'resolved', 'abandoned'))
      )
    `
    console.log('  ✅ Created stuck_transactions')

    // 6. Add columns to collections table
    console.log('  Adding columns to collections table...')
    try {
      await sql`ALTER TABLE collections ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT FALSE`
      await sql`ALTER TABLE collections ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ`
      await sql`ALTER TABLE collections ADD COLUMN IF NOT EXISTS locked_by VARCHAR(255)`
      await sql`ALTER TABLE collections ADD COLUMN IF NOT EXISTS active_launch_id UUID`
      console.log('  ✅ Added columns to collections')
    } catch (e) {
      console.log('  ⚠️ Some columns may already exist')
    }

    // 6b. Add inscription_address column to mint_inscriptions
    console.log('  Adding inscription_address column to mint_inscriptions...')
    try {
      await sql`ALTER TABLE mint_inscriptions ADD COLUMN IF NOT EXISTS inscription_address VARCHAR(255)`
      console.log('  ✅ Added inscription_address column')
    } catch (e) {
      console.log('  ⚠️ inscription_address column may already exist')
    }

    // 7. Create admin_visits table (if not exists)
    console.log('  Creating admin_visits table...')
    await sql`
      CREATE TABLE IF NOT EXISTS admin_visits (
        id SERIAL PRIMARY KEY,
        wallet_address TEXT,
        user_agent TEXT,
        ip_address TEXT,
        visited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `
    console.log('  ✅ Created admin_visits')

    // 8. Add foreign key references
    console.log('  Adding foreign key references...')
    try {
      await sql`
        ALTER TABLE collection_mint_launches 
        ADD CONSTRAINT IF NOT EXISTS fk_launches_collection 
        FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
      `
    } catch (e) {
      // May already exist or constraint name conflict
    }
    try {
      await sql`
        ALTER TABLE mint_inscriptions 
        ADD CONSTRAINT IF NOT EXISTS fk_inscriptions_launch 
        FOREIGN KEY (launch_id) REFERENCES collection_mint_launches(id) ON DELETE SET NULL
      `
    } catch (e) {}
    try {
      await sql`
        ALTER TABLE mint_inscriptions 
        ADD CONSTRAINT IF NOT EXISTS fk_inscriptions_collection 
        FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
      `
    } catch (e) {}
    try {
      await sql`
        ALTER TABLE mint_whitelist 
        ADD CONSTRAINT IF NOT EXISTS fk_whitelist_launch 
        FOREIGN KEY (launch_id) REFERENCES collection_mint_launches(id) ON DELETE CASCADE
      `
    } catch (e) {}
    try {
      await sql`
        ALTER TABLE stuck_transactions 
        ADD CONSTRAINT IF NOT EXISTS fk_stuck_inscription 
        FOREIGN KEY (mint_inscription_id) REFERENCES mint_inscriptions(id) ON DELETE CASCADE
      `
    } catch (e) {}
    try {
      await sql`
        ALTER TABLE collections 
        ADD CONSTRAINT IF NOT EXISTS fk_collections_launch 
        FOREIGN KEY (active_launch_id) REFERENCES collection_mint_launches(id) ON DELETE SET NULL
      `
    } catch (e) {}
    console.log('  ✅ Added foreign key references')

    // 9. Create indexes
    console.log('  Creating indexes...')
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_mint_launches_collection ON collection_mint_launches(collection_id)',
      'CREATE INDEX IF NOT EXISTS idx_mint_launches_status ON collection_mint_launches(launch_status)',
      'CREATE INDEX IF NOT EXISTS idx_mint_inscriptions_launch ON mint_inscriptions(launch_id)',
      'CREATE INDEX IF NOT EXISTS idx_mint_inscriptions_collection ON mint_inscriptions(collection_id)',
      'CREATE INDEX IF NOT EXISTS idx_mint_inscriptions_status ON mint_inscriptions(mint_status)',
      'CREATE INDEX IF NOT EXISTS idx_mint_inscriptions_minter ON mint_inscriptions(minter_wallet)',
      'CREATE INDEX IF NOT EXISTS idx_mint_inscriptions_created ON mint_inscriptions(created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_mint_activity_launch ON mint_activity_log(launch_id)',
      'CREATE INDEX IF NOT EXISTS idx_mint_activity_created ON mint_activity_log(created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_stuck_tx_mint ON stuck_transactions(mint_inscription_id)',
      'CREATE INDEX IF NOT EXISTS idx_stuck_tx_status ON stuck_transactions(resolution_status)',
      'CREATE INDEX IF NOT EXISTS idx_admin_visits_wallet_address ON admin_visits(wallet_address)',
      'CREATE INDEX IF NOT EXISTS idx_admin_visits_visited_at ON admin_visits(visited_at)',
    ]
    
    for (const idx of indexes) {
      try {
        await sql.query(idx)
      } catch (e) {
        // Ignore if already exists
      }
    }
    console.log('  ✅ Created indexes')

    console.log('')
    console.log('=' .repeat(50))
    console.log('✅ Migration completed successfully!')
    console.log('=' .repeat(50))

    // Verify tables were created
    console.log('')
    console.log('🔍 Verifying tables...')
    
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN (
        'collection_mint_launches',
        'mint_inscriptions', 
        'mint_whitelist',
        'mint_activity_log',
        'stuck_transactions',
        'admin_visits'
      )
      ORDER BY table_name
    `

    console.log(`   Found ${tables.length}/6 mint tables:`)
    tables.forEach(t => console.log(`   - ${t.table_name}`))

  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  }
}

runMigration()

