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
    console.log('🚀 Starting Collection Status Migration (053)...\n')

    // Execute ALTER TABLE with tagged template
    console.log('[1/5] Adding collection_status column...')
    await sql`ALTER TABLE collections ADD COLUMN IF NOT EXISTS collection_status VARCHAR(50) DEFAULT 'draft'`
    console.log('✅ Column added\n')

    // Execute CREATE INDEX with tagged template
    console.log('[2/5] Creating index...')
    await sql`CREATE INDEX IF NOT EXISTS idx_collections_status ON collections(collection_status) WHERE collection_status IS NOT NULL`
    console.log('✅ Index created\n')

    // Execute UPDATE with tagged template - Marketplace first
    console.log('[3/5] Backfilling marketplace collections...')
    const marketplaceResult = await sql`
      UPDATE collections c
      SET collection_status = 'marketplace'
      WHERE EXISTS (
        SELECT 1 FROM collection_marketplace_listings ml 
        WHERE ml.collection_id = c.id AND ml.status = 'active'
      )
      AND (collection_status IS NULL OR collection_status = 'draft')
    `
    console.log('✅ Marketplace backfill completed\n')

    // Execute UPDATE - Launchpad collections
    console.log('[4/5] Backfilling launchpad collections...')
    const launchpadResult = await sql`
      UPDATE collections c
      SET collection_status = 'launchpad'
      WHERE c.is_launchpad_collection = TRUE
        AND (collection_status IS NULL OR collection_status = 'draft')
    `
    console.log('✅ Launchpad backfill completed\n')

    // Execute UPDATE - Self-inscribe collections
    console.log('[5/5] Backfilling self-inscribe collections...')
    const selfInscribeResult = await sql`
      UPDATE collections c
      SET collection_status = 'self_inscribe'
      WHERE c.launch_status IS NOT NULL 
        AND c.launch_status != 'draft' 
        AND c.is_launchpad_collection = FALSE
        AND (collection_status IS NULL OR collection_status = 'draft')
    `
    console.log('✅ Self-inscribe backfill completed\n')

    // Execute COMMENT with tagged template
    console.log('Adding column comment...')
    await sql`COMMENT ON COLUMN collections.collection_status IS 'Collection status: draft, launchpad, self_inscribe, or marketplace'`
    console.log('✅ Comment added\n')

    // Verification
    console.log('🔍 Verifying migration results...')
    const columnCheckResult = await sql`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'collections' AND column_name = 'collection_status'
    `
    const columnCheck = Array.isArray(columnCheckResult) ? columnCheckResult : []
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
      try {
        const directCheck = await sql`SELECT collection_status FROM collections LIMIT 1`
        if (directCheck) {
          console.log('✅ Column exists (verified via direct query)')
        } else {
          throw new Error('Column not found - migration may have failed')
        }
      } catch (err) {
        throw new Error('Column not found - migration may have failed')
      }
    }

    const indexCheckResult = await sql`
      SELECT indexname FROM pg_indexes 
      WHERE tablename = 'collections' AND indexname = 'idx_collections_status'
    `
    const indexCheck = Array.isArray(indexCheckResult) ? indexCheckResult : []
    if (indexCheck.length > 0) {
      console.log(`✅ Index exists: ${indexCheck[0].indexname}`)
    } else {
      throw new Error('Index not found')
    }

    // Status distribution check
    const statusCheckResult = await sql`
      SELECT collection_status, COUNT(*)::int as count
      FROM collections
      GROUP BY collection_status
      ORDER BY collection_status
    `
    const statusCheck = Array.isArray(statusCheckResult) ? statusCheckResult : []
    console.log('\n📊 Status distribution:')
    statusCheck.forEach(row => {
      console.log(`   - ${row.collection_status || 'NULL'}: ${row.count}`)
    })

    console.log('\n' + '='.repeat(50))
    console.log('✅ Collection Status Migration (053) completed successfully!')
    console.log('='.repeat(50))
    console.log('\n💡 Collections now have explicit status: draft, launchpad, self_inscribe, or marketplace')
    console.log('💡 The collection_status field replaces the need for is_launchpad_collection\n')

    process.exit(0)
  } catch (error) {
    console.error('❌ Migration failed:', error.message)
    console.error(error)
    process.exit(1)
  }
}

runMigration()

