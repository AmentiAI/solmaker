/**
 * Script to run the user_payouts migration
 * Usage: node scripts/run-user-payouts-migration.js
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

  console.log('🚀 Running User Payouts Migration...')
  console.log('📡 Connecting to database...')

  const sql = neon(databaseUrl)

  try {
    // First ensure community_payouts table exists
    console.log('  Ensuring community_payouts table exists...')
    await sql`
      CREATE TABLE IF NOT EXISTS community_payouts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        snapshot_taken_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        payout_tx_id VARCHAR(255),
        total_revenue_sats BIGINT NOT NULL,
        payout_amount_sats BIGINT NOT NULL,
        total_holders INTEGER NOT NULL,
        total_supply INTEGER NOT NULL DEFAULT 200,
        holders_data JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `
    console.log('  ✅ community_payouts table ready')

    // Create user_payouts table
    console.log('  Creating user_payouts table...')
    await sql`
      CREATE TABLE IF NOT EXISTS user_payouts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        wallet_address VARCHAR(255) NOT NULL,
        payout_tx_id VARCHAR(255) NOT NULL,
        amount_sats BIGINT NOT NULL,
        ordmaker_count INTEGER NOT NULL,
        share_percentage DECIMAL(10, 4) NOT NULL,
        community_payout_id UUID REFERENCES community_payouts(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `
    console.log('  ✅ Created user_payouts table')

    // Create indexes
    console.log('  Creating indexes...')
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_user_payouts_wallet_address ON user_payouts(wallet_address)',
      'CREATE INDEX IF NOT EXISTS idx_user_payouts_payout_tx_id ON user_payouts(payout_tx_id)',
      'CREATE INDEX IF NOT EXISTS idx_user_payouts_created_at ON user_payouts(created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_user_payouts_community_payout_id ON user_payouts(community_payout_id)',
    ]

    for (const idx of indexes) {
      try {
        await sql.query(idx)
      } catch (e) {
        // Ignore if already exists
      }
    }
    console.log('  ✅ Created indexes')

    // Add comments
    console.log('  Adding table comments...')
    const comments = [
      "COMMENT ON TABLE user_payouts IS 'Tracks individual payouts to users from community revenue distributions'",
      "COMMENT ON COLUMN user_payouts.wallet_address IS 'Bitcoin wallet address that received the payout'",
      "COMMENT ON COLUMN user_payouts.payout_tx_id IS 'Bitcoin transaction ID for the payout'",
      "COMMENT ON COLUMN user_payouts.amount_sats IS 'Amount received in satoshis'",
      "COMMENT ON COLUMN user_payouts.ordmaker_count IS 'Number of ordmakers held at the time of payout snapshot'",
      "COMMENT ON COLUMN user_payouts.share_percentage IS 'Percentage share of total supply (e.g., 0.50 for 0.50%)'",
      "COMMENT ON COLUMN user_payouts.community_payout_id IS 'Reference to the community_payouts record this payout belongs to'",
    ]

    for (const comment of comments) {
      try {
        await sql.query(comment)
      } catch (e) {
        // Ignore errors
      }
    }
    console.log('  ✅ Added comments')

    console.log('')
    console.log('='.repeat(50))
    console.log('✅ User Payouts Migration completed successfully!')
    console.log('='.repeat(50))

    // Verify table was created
    console.log('')
    console.log('🔍 Verifying table...')
    const tables = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = 'user_payouts'
    `

    if (tables.length > 0) {
      console.log(`   ✅ Found user_payouts table`)
    } else {
      console.log(`   ⚠️  user_payouts table not found`)
    }

  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  }
}

runMigration()

