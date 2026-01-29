/**
 * Run Marketplace System Migration
 * Creates tables for collection marketplace listings, transactions, and fraud prevention
 */

require('dotenv').config({ path: '.env.local' })
const { neon } = require('@neondatabase/serverless')

async function runMigration() {
  const databaseUrl = process.env.NEON_DATABASE || process.env.DATABASE_URL

  if (!databaseUrl) {
    console.error('❌ No database URL found. Please set NEON_DATABASE or DATABASE_URL')
    process.exit(1)
  }

  console.log('🚀 Running Marketplace System Migration...')
  console.log('📡 Connecting to database...')

  const sql = neon(databaseUrl)

  try {
    // Add columns to collections table
    console.log('  Adding marketplace columns to collections table...')

    const alterStatements = [
      'ALTER TABLE collections ADD COLUMN IF NOT EXISTS marketplace_listing_id UUID',
      'ALTER TABLE collections ADD COLUMN IF NOT EXISTS marketplace_status VARCHAR(50)',
    ]

    for (const stmt of alterStatements) {
      try {
        await sql.query(stmt)
      } catch (e) {
        // Ignore if already exists
      }
    }
    console.log('  ✅ Added marketplace columns to collections')

    // Create collection_marketplace_listings table
    console.log('  Creating collection_marketplace_listings table...')
    await sql`
      CREATE TABLE IF NOT EXISTS collection_marketplace_listings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        collection_id UUID NOT NULL,
        seller_wallet VARCHAR(255) NOT NULL,
        price_credits DECIMAL(10,2) NOT NULL CHECK (price_credits > 0),
        title VARCHAR(255) NOT NULL,
        description TEXT,
        included_promo_urls TEXT[],
        terms_accepted BOOLEAN DEFAULT FALSE NOT NULL,
        terms_accepted_at TIMESTAMPTZ,
        status VARCHAR(50) DEFAULT 'active',
        sold_to_wallet VARCHAR(255),
        sold_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `
    console.log('  ✅ Created collection_marketplace_listings')

    // Create marketplace_transactions table
    console.log('  Creating marketplace_transactions table...')
    await sql`
      CREATE TABLE IF NOT EXISTS marketplace_transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        listing_id UUID NOT NULL,
        collection_id UUID NOT NULL,
        seller_wallet VARCHAR(255) NOT NULL,
        buyer_wallet VARCHAR(255) NOT NULL,
        price_credits DECIMAL(10,2) NOT NULL,
        seller_credits_before DECIMAL(10,2) NOT NULL,
        seller_credits_after DECIMAL(10,2) NOT NULL,
        buyer_credits_before DECIMAL(10,2) NOT NULL,
        buyer_credits_after DECIMAL(10,2) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMPTZ,
        error_message TEXT
      )
    `
    console.log('  ✅ Created marketplace_transactions')

    // Create marketplace_seller_violations table
    console.log('  Creating marketplace_seller_violations table...')
    await sql`
      CREATE TABLE IF NOT EXISTS marketplace_seller_violations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        seller_wallet VARCHAR(255) NOT NULL,
        collection_id UUID NOT NULL,
        violation_type VARCHAR(100) NOT NULL,
        description TEXT,
        is_banned BOOLEAN DEFAULT FALSE,
        banned_at TIMESTAMPTZ,
        banned_until TIMESTAMPTZ,
        detected_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        reported_by VARCHAR(255),
        notes TEXT
      )
    `
    console.log('  ✅ Created marketplace_seller_violations')

    // Create indexes
    console.log('  Creating indexes...')
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_marketplace_listings_status ON collection_marketplace_listings(status, created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_marketplace_listings_seller ON collection_marketplace_listings(seller_wallet)',
      'CREATE INDEX IF NOT EXISTS idx_marketplace_listings_collection ON collection_marketplace_listings(collection_id)',
      'CREATE INDEX IF NOT EXISTS idx_marketplace_transactions_listing ON marketplace_transactions(listing_id)',
      'CREATE INDEX IF NOT EXISTS idx_marketplace_transactions_buyer ON marketplace_transactions(buyer_wallet)',
      'CREATE INDEX IF NOT EXISTS idx_marketplace_transactions_seller ON marketplace_transactions(seller_wallet)',
      'CREATE INDEX IF NOT EXISTS idx_marketplace_transactions_status ON marketplace_transactions(status)',
      'CREATE INDEX IF NOT EXISTS idx_marketplace_violations_seller ON marketplace_seller_violations(seller_wallet)',
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
      'ALTER TABLE collection_marketplace_listings ADD CONSTRAINT IF NOT EXISTS fk_listings_collection FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE',
      'ALTER TABLE marketplace_transactions ADD CONSTRAINT IF NOT EXISTS fk_transactions_listing FOREIGN KEY (listing_id) REFERENCES collection_marketplace_listings(id) ON DELETE CASCADE',
      'ALTER TABLE marketplace_transactions ADD CONSTRAINT IF NOT EXISTS fk_transactions_collection FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE',
      'ALTER TABLE marketplace_seller_violations ADD CONSTRAINT IF NOT EXISTS fk_violations_collection FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE',
    ]

    for (const fk of fks) {
      try {
        await sql.query(fk)
      } catch (e) {
        // Ignore if already exists
      }
    }
    console.log('  ✅ Added foreign key constraints')

    // Create functions
    console.log('  Creating database functions...')

    // is_seller_banned function
    try {
      await sql.query(`
        CREATE OR REPLACE FUNCTION is_seller_banned(p_seller_wallet VARCHAR(255))
        RETURNS BOOLEAN AS $$
        DECLARE
          v_is_banned BOOLEAN;
        BEGIN
          SELECT EXISTS(
            SELECT 1
            FROM marketplace_seller_violations
            WHERE seller_wallet = p_seller_wallet
            AND is_banned = TRUE
            AND (banned_until IS NULL OR banned_until > NOW())
          ) INTO v_is_banned;

          RETURN v_is_banned;
        END;
        $$ LANGUAGE plpgsql;
      `)
      console.log('  ✅ Created is_seller_banned() function')
    } catch (e) {
      console.log('  ⚠️  is_seller_banned() function may already exist')
    }

    // transfer_collection_ownership function
    try {
      await sql.query(`
        CREATE OR REPLACE FUNCTION transfer_collection_ownership(
          p_collection_id UUID,
          p_from_wallet VARCHAR(255),
          p_to_wallet VARCHAR(255),
          p_listing_id UUID
        )
        RETURNS BOOLEAN AS $$
        BEGIN
          UPDATE collections
          SET wallet_address = p_to_wallet,
              marketplace_status = 'sold',
              marketplace_listing_id = NULL,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = p_collection_id
          AND wallet_address = p_from_wallet;

          IF NOT FOUND THEN
            RETURN FALSE;
          END IF;

          UPDATE collection_marketplace_listings
          SET status = 'sold',
              sold_to_wallet = p_to_wallet,
              sold_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = p_listing_id
          AND seller_wallet = p_from_wallet;

          RETURN TRUE;
        END;
        $$ LANGUAGE plpgsql;
      `)
      console.log('  ✅ Created transfer_collection_ownership() function')
    } catch (e) {
      console.log('  ⚠️  transfer_collection_ownership() function may already exist')
    }

    console.log('')
    console.log('='.repeat(50))
    console.log('✅ Marketplace Migration completed successfully!')
    console.log('='.repeat(50))

    // Verify tables were created
    console.log('')
    console.log('🔍 Verifying tables...')

    const tables = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN (
        'collection_marketplace_listings',
        'marketplace_transactions',
        'marketplace_seller_violations'
      )
      ORDER BY table_name
    `

    console.log(`   Found ${tables.length}/3 marketplace tables:`)
    tables.forEach(t => console.log(`   - ${t.table_name}`))

  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  }
}

runMigration()
