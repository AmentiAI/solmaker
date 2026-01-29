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
    console.log('🚀 Starting Launchpad Collection Flag Migration...\n')

    const migrationSQL = `
-- Add is_launchpad_collection flag to explicitly mark collections as launchpad collections
-- This replaces the vague "is_locked" check and provides clear launchpad tracking

ALTER TABLE collections 
ADD COLUMN IF NOT EXISTS is_launchpad_collection BOOLEAN DEFAULT FALSE;

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_collections_is_launchpad 
ON collections(is_launchpad_collection) 
WHERE is_launchpad_collection = TRUE;

-- Backfill: Mark existing collections as launchpad if they have mint phases and are locked
UPDATE collections c
SET is_launchpad_collection = TRUE
WHERE c.is_locked = TRUE
  AND EXISTS (
    SELECT 1 FROM mint_phases mp 
    WHERE mp.collection_id = c.id
  )
  AND c.is_launchpad_collection = FALSE;

-- Add comment for documentation
COMMENT ON COLUMN collections.is_launchpad_collection IS 'If true, this collection is officially marked as a launchpad collection and will appear on launchpad pages';
`

    // Split by semicolon and filter out empty statements
    // Remove comments first, then split
    const cleanedSQL = migrationSQL
      .split('\n')
      .map(line => {
        const commentIndex = line.indexOf('--')
        if (commentIndex >= 0) {
          return line.substring(0, commentIndex).trim()
        }
        return line.trim()
      })
      .filter(line => line.length > 0)
      .join('\n')
    
    const statements = cleanedSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0)

    console.log(`Found ${statements.length} SQL statements to execute\n`)

    // Execute ALTER TABLE with tagged template
    console.log('[1/4] Adding is_launchpad_collection column...')
    await sql`ALTER TABLE collections ADD COLUMN IF NOT EXISTS is_launchpad_collection BOOLEAN DEFAULT FALSE`
    console.log('✅ Column added\n')

    // Execute CREATE INDEX with tagged template
    console.log('[2/4] Creating index...')
    await sql`CREATE INDEX IF NOT EXISTS idx_collections_is_launchpad ON collections(is_launchpad_collection) WHERE is_launchpad_collection = TRUE`
    console.log('✅ Index created\n')

    // Execute UPDATE with tagged template
    console.log('[3/4] Backfilling existing launchpad collections...')
    await sql`
      UPDATE collections c
      SET is_launchpad_collection = TRUE
      WHERE c.is_locked = TRUE
        AND EXISTS (
          SELECT 1 FROM mint_phases mp 
          WHERE mp.collection_id = c.id
        )
        AND c.is_launchpad_collection = FALSE
    `
    console.log('✅ Backfill completed\n')

    // Execute COMMENT with tagged template
    console.log('[4/4] Adding comment...')
    await sql`COMMENT ON COLUMN collections.is_launchpad_collection IS 'If true, this collection is officially marked as a launchpad collection and will appear on launchpad pages'`
    console.log('✅ Comment added\n')

    // Verification
    console.log('🔍 Verifying migration results...')
    const columnCheckResult = await sql`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'collections' AND column_name = 'is_launchpad_collection'
    `
    const columnCheck = Array.isArray(columnCheckResult) ? columnCheckResult : []
    console.log(`   Debug: columnCheckResult type: ${typeof columnCheckResult}, isArray: ${Array.isArray(columnCheckResult)}, length: ${columnCheck.length}`)
    if (columnCheck.length > 0) {
      console.log('✅ Column exists:')
      columnCheck.forEach(col => {
        console.log(`   - Name: ${col.column_name}`)
        console.log(`   - Type: ${col.data_type}`)
        console.log(`   - Default: ${col.column_default}`)
        console.log(`   - Nullable: ${col.is_nullable === 'YES' ? 'YES' : 'NO'}`)
      })
    } else {
      // Try a direct query to see if column exists
      const directCheck = await sql`SELECT is_launchpad_collection FROM collections LIMIT 1`
      if (directCheck) {
        console.log('✅ Column exists (verified via direct query)')
      } else {
        throw new Error('Column not found - migration may have failed')
      }
    }

    const indexCheckResult = await sql`
      SELECT indexname FROM pg_indexes 
      WHERE tablename = 'collections' AND indexname = 'idx_collections_is_launchpad'
    `
    const indexCheck = Array.isArray(indexCheckResult) ? indexCheckResult : []
    if (indexCheck.length > 0) {
      console.log(`✅ Index exists: ${indexCheck[0].indexname}`)
    } else {
      throw new Error('Index not found')
    }

    const backfillCheckResult = await sql`
      SELECT COUNT(*)::int as count
      FROM collections
      WHERE is_launchpad_collection = TRUE
    `
    const backfillCheck = Array.isArray(backfillCheckResult) ? backfillCheckResult : []
    const backfilledCount = backfillCheck.length > 0 
      ? backfillCheck[0].count 
      : 0
    console.log(`✅ Backfilled ${backfilledCount} existing launchpad collections`)

    console.log('\n' + '='.repeat(50))
    console.log('✅ Launchpad Collection Flag Migration completed successfully!')
    console.log('='.repeat(50))
    console.log('\n💡 Collections can now be explicitly marked as launchpad collections')
    console.log('💡 Admin panel will show "Launchpad Collections" instead of "Collections with Mints"\n')

    process.exit(0)
  } catch (error) {
    console.error('❌ Migration failed:', error.message)
    console.error(error)
    process.exit(1)
  }
}

runMigration()

