/**
 * Add 'pending' status to ordinal_listings constraint
 * Needed for the listing flow: pending -> active (after seller signs PSBT)
 */

require('dotenv').config({ path: '.env.local' })
const { neon } = require('@neondatabase/serverless')

async function runMigration() {
  const databaseUrl = process.env.NEON_DATABASE || process.env.DATABASE_URL

  if (!databaseUrl) {
    console.error('❌ No database URL found. Please set NEON_DATABASE or DATABASE_URL')
    process.exit(1)
  }

  console.log('🚀 Adding pending status to ordinal_listings...')
  console.log('📡 Connecting to database...')

  const sql = neon(databaseUrl)

  try {
    // Drop the existing constraint
    console.log('  Dropping existing status constraint...')
    try {
      await sql`ALTER TABLE ordinal_listings DROP CONSTRAINT IF EXISTS ordinal_listings_status_check`
      console.log('  ✅ Dropped existing constraint')
    } catch (e) {
      console.log('  ⚠️ Constraint may not exist:', e.message)
    }

    // Add the new constraint with 'pending' included
    console.log('  Adding new status constraint with pending...')
    await sql`
      ALTER TABLE ordinal_listings 
      ADD CONSTRAINT ordinal_listings_status_check 
      CHECK (status IN ('pending', 'active', 'sold', 'cancelled', 'expired', 'invalid'))
    `
    console.log('  ✅ Added new constraint')

    console.log('')
    console.log('='.repeat(60))
    console.log('✅ Migration completed successfully!')
    console.log('='.repeat(60))
    console.log('')
    console.log('📊 ordinal_listings status now allows:')
    console.log('   • pending   - Listing created, waiting for seller to sign PSBT')
    console.log('   • active    - Listing live and available for purchase')
    console.log('   • sold      - Ordinal has been purchased')
    console.log('   • cancelled - Seller cancelled the listing')
    console.log('   • expired   - Listing expired after 30 days')
    console.log('   • invalid   - UTXO spent or listing invalidated')

  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  }
}

runMigration()
