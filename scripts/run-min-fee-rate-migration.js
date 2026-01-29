/**
 * Run Min Fee Rate Migration
 * Updates min_fee_rate default and existing values to 0.1 sat/vB
 */

require('dotenv').config({ path: '.env.local' })
const { neon } = require('@neondatabase/serverless')

async function runMigration() {
  const databaseUrl = process.env.NEON_DATABASE || process.env.DATABASE_URL

  if (!databaseUrl) {
    console.error('❌ No database URL found. Please set NEON_DATABASE or DATABASE_URL')
    process.exit(1)
  }

  console.log('🚀 Running Min Fee Rate Migration...')
  console.log('📡 Connecting to database...')

  const sql = neon(databaseUrl)

  try {
    // Update default value for new rows
    console.log('  Updating min_fee_rate default to 0.1...')
    await sql.query('ALTER TABLE mint_phases ALTER COLUMN min_fee_rate SET DEFAULT 0.1')
    console.log('  ✅ Updated default value')

    // Update existing rows
    console.log('  Updating existing rows with min_fee_rate = 1.0...')
    const result = await sql`
      UPDATE mint_phases
      SET min_fee_rate = 0.1
      WHERE min_fee_rate = 1.0
    `
    console.log(`  ✅ Updated ${result.length || 0} existing rows`)

    console.log('')
    console.log('=' .repeat(50))
    console.log('✅ Min Fee Rate Migration completed successfully!')
    console.log('=' .repeat(50))
    console.log('')
    console.log('You can now use fee rates as low as 0.1 sat/vB!')

  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  }
}

runMigration()
