require('dotenv').config({ path: '.env.local' })
const { neon } = require('@neondatabase/serverless')

const databaseUrl = process.env.NEON_DATABASE || process.env.DATABASE_URL

if (!databaseUrl) {
  console.error('❌ No database URL found. Please set NEON_DATABASE or DATABASE_URL')
  process.exit(1)
}

const sql = neon(databaseUrl)

async function runMigration() {
  try {
    console.log('🚀 Starting Launchpad Live Status Migration (056)...\n')

    // Drop existing constraint
    console.log('[1/3] Dropping existing constraint...')
    await sql`ALTER TABLE collections DROP CONSTRAINT IF EXISTS chk_collection_status`
    console.log('✅ Constraint dropped\n')

    // Add new CHECK constraint with launchpad_live status
    console.log('[2/3] Adding CHECK constraint with launchpad_live status...')
    await sql`ALTER TABLE collections ADD CONSTRAINT chk_collection_status CHECK (collection_status IN ('draft', 'launchpad', 'launchpad_live', 'self_inscribe', 'marketplace', 'deleted'))`
    console.log('✅ Constraint added\n')

    // Update comment
    console.log('[3/3] Updating column comment...')
    await sql`COMMENT ON COLUMN collections.collection_status IS 'Collection status: draft, launchpad, launchpad_live, self_inscribe, marketplace, or deleted'`
    console.log('✅ Comment updated\n')

    // Verification
    console.log('🔍 Verifying migration results...')
    const constraintCheck = await sql`
      SELECT constraint_name, check_clause
      FROM information_schema.check_constraints
      WHERE constraint_name = 'chk_collection_status'
    `
    const constraint = Array.isArray(constraintCheck) ? constraintCheck : []
    if (constraint.length > 0) {
      console.log('✅ CHECK constraint exists:')
      console.log(`   ${constraint[0].check_clause}\n`)
    } else {
      console.log('⚠️  Warning: Could not verify constraint\n')
    }

    console.log('='.repeat(50))
    console.log('✅ Migration completed successfully!')
    console.log('='.repeat(50))
    console.log('')
    console.log('Collections can now use "launchpad_live" status to appear on /launchpad')
    console.log('Valid statuses: draft, launchpad, launchpad_live, self_inscribe, marketplace, deleted')

  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  }
}

runMigration()

