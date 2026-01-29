/**
 * Add platform fee columns to ordinal_listings table
 * Stores fee amount and wallet address at listing time so buyer doesn't recalculate
 */

require('dotenv').config({ path: '.env.local' })
const { neon } = require('@neondatabase/serverless')

async function runMigration() {
  const databaseUrl = process.env.NEON_DATABASE || process.env.DATABASE_URL

  if (!databaseUrl) {
    console.error('❌ No database URL found. Please set NEON_DATABASE or DATABASE_URL')
    process.exit(1)
  }

  console.log('🚀 Adding platform fee columns to ordinal_listings...')
  console.log('📡 Connecting to database...')

  const sql = neon(databaseUrl)

  try {
    // Add platform_fee_sats column
    console.log('  Adding platform_fee_sats column...')
    try {
      await sql`ALTER TABLE ordinal_listings ADD COLUMN IF NOT EXISTS platform_fee_sats BIGINT`
      console.log('  ✅ Added platform_fee_sats column')
    } catch (e) {
      if (!e.message.includes('already exists')) {
        console.error('  ⚠️ Error:', e.message)
      } else {
        console.log('  ✅ platform_fee_sats column already exists')
      }
    }

    // Add platform_fee_wallet column
    console.log('  Adding platform_fee_wallet column...')
    try {
      await sql`ALTER TABLE ordinal_listings ADD COLUMN IF NOT EXISTS platform_fee_wallet VARCHAR(255)`
      console.log('  ✅ Added platform_fee_wallet column')
    } catch (e) {
      if (!e.message.includes('already exists')) {
        console.error('  ⚠️ Error:', e.message)
      } else {
        console.log('  ✅ platform_fee_wallet column already exists')
      }
    }

    // Update existing listings to have platform fee (2% or 330 min)
    console.log('  Updating existing listings with platform fee...')
    const updated = await sql`
      UPDATE ordinal_listings
      SET 
        platform_fee_sats = GREATEST(330, FLOOR(price_sats * 0.02)),
        platform_fee_wallet = 'bc1p693zz6n9cvmsewemg4j0pmvfvs4th3ft9c74afrc90l6sah300uqt99vee'
      WHERE platform_fee_sats IS NULL
    `
    console.log('  ✅ Updated existing listings')

    console.log('')
    console.log('='.repeat(60))
    console.log('✅ Migration completed successfully!')
    console.log('='.repeat(60))
    console.log('')
    console.log('📊 New columns added to ordinal_listings:')
    console.log('   • platform_fee_sats   - Fee amount in satoshis')
    console.log('   • platform_fee_wallet - Fee destination address')

  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  }
}

runMigration()
