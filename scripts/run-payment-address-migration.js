/**
 * Run Payment Address Migration
 * Adds payment_address column to mint_sessions table
 */

require('dotenv').config({ path: '.env.local' })
const { neon } = require('@neondatabase/serverless')

async function runMigration() {
  const databaseUrl = process.env.NEON_DATABASE || process.env.DATABASE_URL

  if (!databaseUrl) {
    console.error('❌ No database URL found. Please set NEON_DATABASE or DATABASE_URL')
    process.exit(1)
  }

  console.log('🚀 Running Payment Address Migration...')
  console.log('📡 Connecting to database...')

  const sql = neon(databaseUrl)

  try {
    // Add payment_address column
    console.log('  Adding payment_address column to mint_sessions...')
    await sql`
      ALTER TABLE mint_sessions
      ADD COLUMN IF NOT EXISTS payment_address VARCHAR(255)
    `
    console.log('  ✅ Added payment_address column')

    // Add reveal_data column if it doesn't exist
    console.log('  Adding reveal_data column to mint_sessions...')
    await sql`
      ALTER TABLE mint_sessions
      ADD COLUMN IF NOT EXISTS reveal_data JSONB
    `
    console.log('  ✅ Added reveal_data column')

    // Create index
    console.log('  Creating index...')
    await sql.query('CREATE INDEX IF NOT EXISTS idx_mint_sessions_payment_address ON mint_sessions(payment_address)')
    console.log('  ✅ Created index')

    console.log('')
    console.log('=' .repeat(50))
    console.log('✅ Payment Address Migration completed successfully!')
    console.log('=' .repeat(50))

  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  }
}

runMigration()
