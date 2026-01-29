/**
 * Run Promotions Migration
 * Creates table to track promotional flyer generation history
 */

require('dotenv').config({ path: '.env.local' })
const { neon } = require('@neondatabase/serverless')

async function runMigration() {
  const databaseUrl = process.env.NEON_DATABASE || process.env.DATABASE_URL

  if (!databaseUrl) {
    console.error('❌ No database URL found. Please set NEON_DATABASE or DATABASE_URL')
    process.exit(1)
  }

  console.log('🚀 Running Promotions Migration...')
  console.log('📡 Connecting to database...')

  const sql = neon(databaseUrl)

  try {
    // Create promotions table
    console.log('  Creating promotions table...')
    await sql`
      CREATE TABLE IF NOT EXISTS promotions (
        id SERIAL PRIMARY KEY,
        wallet_address TEXT NOT NULL,
        collection_id INTEGER NOT NULL,
        collection_name TEXT,
        image_url TEXT NOT NULL,
        flyer_text TEXT,
        character_count INTEGER NOT NULL,
        character_actions JSONB,
        no_text BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `
    console.log('  ✅ Created promotions table')

    // Create indexes
    console.log('  Creating indexes...')
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_promotions_wallet ON promotions(wallet_address)',
      'CREATE INDEX IF NOT EXISTS idx_promotions_collection ON promotions(collection_id)',
      'CREATE INDEX IF NOT EXISTS idx_promotions_created_at ON promotions(created_at DESC)',
    ]

    for (const idx of indexes) {
      try {
        await sql.query(idx)
      } catch (e) {
        // Ignore if already exists
      }
    }
    console.log('  ✅ Created indexes')

    console.log('')
    console.log('=' .repeat(50))
    console.log('✅ Promotions Migration completed successfully!')
    console.log('=' .repeat(50))

    // Verify table was created
    console.log('')
    console.log('🔍 Verifying table...')

    const tables = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = 'promotions'
    `

    if (tables.length > 0) {
      console.log('   ✅ Promotions table verified')
    } else {
      console.log('   ❌ Promotions table not found')
    }

  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  }
}

runMigration()
