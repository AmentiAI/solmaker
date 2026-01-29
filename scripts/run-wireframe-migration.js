/**
 * Run Wireframe Config Migration
 * Adds wireframe_config column to collections table
 */

require('dotenv').config({ path: '.env.local' })
const { neon } = require('@neondatabase/serverless')
const { readFileSync } = require('fs')
const { join } = require('path')

async function runMigration() {
  const databaseUrl = process.env.NEON_DATABASE || process.env.DATABASE_URL

  if (!databaseUrl) {
    console.error('❌ No database URL found. Please set NEON_DATABASE or DATABASE_URL')
    process.exit(1)
  }

  console.log('🚀 Running Wireframe Config Migration...')
  console.log('📡 Connecting to database...')

  const sql = neon(databaseUrl)

  try {
    console.log('  Adding wireframe_config column to collections...')
    await sql`
      ALTER TABLE collections
      ADD COLUMN IF NOT EXISTS wireframe_config JSONB
    `
    console.log('  ✅ Added wireframe_config column')

    console.log('  Adding comment to wireframe_config column...')
    try {
      await sql`
        COMMENT ON COLUMN collections.wireframe_config IS 'Custom wireframe positioning configuration for pixel-perfect PFP collections. Stores anchor points (head top, eye line, nose, mouth, shoulders, etc.) as percentages of canvas dimensions.'
      `
      console.log('  ✅ Added comment')
    } catch (error) {
      // Comment might fail if column doesn't support comments, that's okay
      console.log('  ⏭️  Comment skipped (may not be supported)')
    }

    console.log('')
    console.log('='.repeat(50))
    console.log('✅ Wireframe Config Migration completed successfully!')
    console.log('='.repeat(50))
    console.log('')
    console.log('Collections can now store custom wireframe positioning for pixel-perfect PFP collections.')

  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  }
}

runMigration()

