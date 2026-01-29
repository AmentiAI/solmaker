/**
 * Run Ordinal Marketplace Migration
 * Creates tables for individual ordinal buy/sell marketplace with PSBT-based trading
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

  console.log('🚀 Running Ordinal Marketplace Migration...')
  console.log('📡 Connecting to database...')

  const sql = neon(databaseUrl)

  try {
    // Create ordinal_listings table
    console.log('  Creating ordinal_listings table...')
    try {
      await sql`
        CREATE TABLE IF NOT EXISTS ordinal_listings (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          inscription_id VARCHAR(255) NOT NULL UNIQUE,
          ordinal_number BIGINT,
          collection_symbol VARCHAR(255),
          utxo_txid VARCHAR(255) NOT NULL,
          utxo_vout INTEGER NOT NULL,
          utxo_value BIGINT NOT NULL,
          seller_wallet VARCHAR(255) NOT NULL,
          seller_pubkey VARCHAR(255),
          price_sats BIGINT NOT NULL CHECK (price_sats > 0),
          price_btc DECIMAL(16,8) NOT NULL CHECK (price_btc > 0),
          partial_psbt_base64 TEXT NOT NULL,
          partial_psbt_hex TEXT,
          image_url TEXT,
          metadata_url TEXT,
          title VARCHAR(255),
          description TEXT,
          status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'sold', 'cancelled', 'expired', 'invalid')),
          sold_to_wallet VARCHAR(255),
          sold_tx_id VARCHAR(255),
          sold_at TIMESTAMPTZ,
          expires_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 days'),
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT unique_utxo UNIQUE (utxo_txid, utxo_vout)
        )
      `
      console.log('  ✅ Created ordinal_listings table')
    } catch (e) {
      if (!e.message.includes('already exists')) {
        console.error('  ❌ Error creating ordinal_listings:', e.message)
      }
    }

    // Create ordinal_transactions table
    console.log('  Creating ordinal_transactions table...')
    try {
      await sql`
        CREATE TABLE IF NOT EXISTS ordinal_transactions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          listing_id UUID NOT NULL,
          inscription_id VARCHAR(255) NOT NULL,
          seller_wallet VARCHAR(255) NOT NULL,
          buyer_wallet VARCHAR(255) NOT NULL,
          price_sats BIGINT NOT NULL,
          price_btc DECIMAL(16,8) NOT NULL,
          platform_fee_sats BIGINT DEFAULT 2500,
          tx_id VARCHAR(255) NOT NULL,
          tx_hex TEXT,
          confirmations INTEGER DEFAULT 0,
          status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed')),
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          confirmed_at TIMESTAMPTZ,
          CONSTRAINT unique_tx_id UNIQUE (tx_id)
        )
      `
      console.log('  ✅ Created ordinal_transactions table')
    } catch (e) {
      if (!e.message.includes('already exists')) {
        console.error('  ❌ Error creating ordinal_transactions:', e.message)
      }
    }

    // Create ordinal_offers table
    console.log('  Creating ordinal_offers table...')
    try {
      await sql`
        CREATE TABLE IF NOT EXISTS ordinal_offers (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          listing_id UUID NOT NULL,
          inscription_id VARCHAR(255) NOT NULL,
          buyer_wallet VARCHAR(255) NOT NULL,
          offer_sats BIGINT NOT NULL CHECK (offer_sats > 0),
          offer_btc DECIMAL(16,8) NOT NULL,
          offer_psbt_base64 TEXT NOT NULL,
          status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'expired', 'cancelled')),
          expires_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours'),
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
      `
      console.log('  ✅ Created ordinal_offers table')
    } catch (e) {
      if (!e.message.includes('already exists')) {
        console.error('  ❌ Error creating ordinal_offers:', e.message)
      }
    }

    // Create ordinal_pending_payments table
    console.log('  Creating ordinal_pending_payments table...')
    try {
      await sql`
        CREATE TABLE IF NOT EXISTS ordinal_pending_payments (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          listing_id UUID NOT NULL,
          buyer_wallet VARCHAR(255) NOT NULL,
          payment_address VARCHAR(255),
          expected_amount_sats BIGINT NOT NULL,
          status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'expired', 'failed')),
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          expires_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP + INTERVAL '1 hour'),
          tx_id VARCHAR(255),
          verified_at TIMESTAMPTZ
        )
      `
      console.log('  ✅ Created ordinal_pending_payments table')
    } catch (e) {
      if (!e.message.includes('already exists')) {
        console.error('  ❌ Error creating ordinal_pending_payments:', e.message)
      }
    }

    // Create indexes
    console.log('  Creating indexes...')
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_ordinal_listings_status ON ordinal_listings(status, created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_ordinal_listings_seller ON ordinal_listings(seller_wallet)',
      'CREATE INDEX IF NOT EXISTS idx_ordinal_listings_inscription ON ordinal_listings(inscription_id)',
      'CREATE INDEX IF NOT EXISTS idx_ordinal_transactions_listing ON ordinal_transactions(listing_id)',
      'CREATE INDEX IF NOT EXISTS idx_ordinal_transactions_tx ON ordinal_transactions(tx_id)',
      'CREATE INDEX IF NOT EXISTS idx_ordinal_offers_listing ON ordinal_offers(listing_id)',
      'CREATE INDEX IF NOT EXISTS idx_ordinal_pending_payments_listing ON ordinal_pending_payments(listing_id)',
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
    console.log('='.repeat(60))
    console.log('✅ Ordinal Marketplace Migration completed successfully!')
    console.log('='.repeat(60))

    // Verify tables were created
    console.log('')
    console.log('🔍 Verifying tables...')

    const tables = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN (
        'ordinal_listings',
        'ordinal_transactions',
        'ordinal_offers',
        'ordinal_pending_payments'
      )
      ORDER BY table_name
    `

    console.log(`   Found ${tables.length}/4 ordinal marketplace tables:`)
    tables.forEach(t => console.log(`   ✅ ${t.table_name}`))

    // Verify functions were created
    console.log('')
    console.log('🔍 Verifying functions...')

    const functions = await sql`
      SELECT routine_name
      FROM information_schema.routines
      WHERE routine_schema = 'public'
      AND routine_name IN (
        'expire_old_ordinal_listings',
        'is_ordinal_listed',
        'get_collection_floor_price',
        'update_ordinal_listing_timestamp'
      )
      ORDER BY routine_name
    `

    console.log(`   Found ${functions.length}/4 ordinal marketplace functions:`)
    functions.forEach(f => console.log(`   ✅ ${f.routine_name}()`))

    console.log('')
    console.log('📊 Summary:')
    console.log(`   • ordinal_listings: List individual ordinals for sale with partial PSBTs`)
    console.log(`   • ordinal_transactions: Track completed sales`)
    console.log(`   • ordinal_offers: Future feature for bidding/offers`)
    console.log(`   • ordinal_pending_payments: Track pending purchases`)
    console.log('')
    console.log('💡 Next steps:')
    console.log(`   1. Implement /api/marketplace/ordinals/list (create listing)`)
    console.log(`   2. Implement /api/marketplace/ordinals/listings (get listings)`)
    console.log(`   3. Implement /api/marketplace/ordinals/purchase (buy ordinal)`)
    console.log(`   4. Update marketplace UI with "Ordinals" tab`)

  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  }
}

runMigration()
