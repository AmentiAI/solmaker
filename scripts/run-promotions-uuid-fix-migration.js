/**
 * Run Promotions UUID Fix Migration
 * Fixes promotions.collection_id from INTEGER to UUID to match collections.id
 */

require('dotenv').config({ path: '.env.local' })
const { neon } = require('@neondatabase/serverless')

async function runMigration() {
  const databaseUrl = process.env.NEON_DATABASE || process.env.DATABASE_URL

  if (!databaseUrl) {
    console.error('❌ No database URL found. Please set NEON_DATABASE or DATABASE_URL')
    process.exit(1)
  }

  console.log('🚀 Running Promotions UUID Fix Migration...')
  console.log('📡 Connecting to database...')

  const sql = neon(databaseUrl)

  try {
    // Check current column type
    console.log('  Checking current promotions.collection_id type...')
    const currentType = await sql`
      SELECT data_type 
      FROM information_schema.columns 
      WHERE table_name = 'promotions' AND column_name = 'collection_id'
    `
    
    if (currentType.length === 0) {
      console.log('  ⚠️ promotions table or collection_id column not found')
      process.exit(0)
    }
    
    console.log(`  Current type: ${currentType[0].data_type}`)
    
    if (currentType[0].data_type === 'uuid') {
      console.log('  ✅ collection_id is already UUID - nothing to do!')
      process.exit(0)
    }

    // Step 1: Drop existing foreign key constraint if exists
    console.log('  Dropping existing FK constraint if exists...')
    await sql`
      ALTER TABLE promotions
      DROP CONSTRAINT IF EXISTS promotions_collection_id_fkey
    `
    console.log('  ✅ Dropped FK constraint')

    // Step 2: Convert collection_id to UUID safely
    console.log('  Converting collection_id to UUID type...')
    await sql`
      ALTER TABLE promotions
      ALTER COLUMN collection_id TYPE UUID
      USING (
        CASE
          WHEN collection_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            THEN collection_id::text::uuid
          ELSE NULL
        END
      )
    `
    console.log('  ✅ Converted collection_id to UUID')

    // Step 3: Re-add FK constraint
    console.log('  Re-adding FK constraint...')
    await sql`
      ALTER TABLE promotions
      ADD CONSTRAINT promotions_collection_id_fkey
      FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
    `
    console.log('  ✅ Added FK constraint')

    // Step 4: Add subject_type column if not exists
    console.log('  Adding subject_type column if not exists...')
    await sql`
      ALTER TABLE promotions
      ADD COLUMN IF NOT EXISTS subject_type TEXT
    `
    console.log('  ✅ Added subject_type column')

    console.log('')
    console.log('='.repeat(50))
    console.log('✅ Promotions UUID Fix Migration completed successfully!')
    console.log('='.repeat(50))

    // Verify the fix
    console.log('')
    console.log('🔍 Verifying fix...')
    const newType = await sql`
      SELECT data_type 
      FROM information_schema.columns 
      WHERE table_name = 'promotions' AND column_name = 'collection_id'
    `
    
    if (newType.length > 0 && newType[0].data_type === 'uuid') {
      console.log('   ✅ collection_id is now UUID')
    } else {
      console.log('   ❌ Fix verification failed')
    }

  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  }
}

runMigration()

