/**
 * Run Preset Preview Migration
 * Creates preset_previews table to store generated positioning preset preview images
 */

require('dotenv').config({ path: '.env.local' })
const { neon } = require('@neondatabase/serverless')

async function runMigration() {
  const databaseUrl = process.env.NEON_DATABASE || process.env.DATABASE_URL

  if (!databaseUrl) {
    console.error('❌ No database URL found. Please set NEON_DATABASE or DATABASE_URL')
    process.exit(1)
  }

  console.log('🚀 Running Preset Preview Migration...')
  console.log('📡 Connecting to database...')

  const sql = neon(databaseUrl)

  try {
    console.log('  Creating preset_previews table...')
    await sql`
      CREATE TABLE IF NOT EXISTS preset_previews (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        preset_id TEXT NOT NULL UNIQUE,
        image_url TEXT NOT NULL,
        prompt TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `
    console.log('  ✅ Created preset_previews table')

    console.log('  Creating index on preset_id...')
    await sql`
      CREATE INDEX IF NOT EXISTS idx_preset_previews_preset_id ON preset_previews(preset_id)
    `
    console.log('  ✅ Created index')

    console.log('  Adding table comment...')
    try {
      await sql`
        COMMENT ON TABLE preset_previews IS 'Stores generated preview images for character positioning presets to avoid regeneration'
      `
      console.log('  ✅ Added comment')
    } catch (error) {
      // Comment might fail if not supported, that's okay
      console.log('  ⏭️  Comment skipped (may not be supported)')
    }

    console.log('')
    console.log('='.repeat(50))
    console.log('✅ Preset Preview Migration completed successfully!')
    console.log('='.repeat(50))
    console.log('')
    console.log('The preset_previews table has been created.')
    console.log('Preview images will now be cached to avoid regeneration.')

  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  }
}

runMigration()

