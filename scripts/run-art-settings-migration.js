#!/usr/bin/env node

const { neon } = require('@neondatabase/serverless')

async function runMigration() {
  console.log('🚀 Running Migration 107: Add art_settings...\n')

  const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL required')
    process.exit(1)
  }

  const sql = neon(databaseUrl)

  try {
    console.log('  Adding art_settings column to collections table...')
    await sql`
      ALTER TABLE collections 
      ADD COLUMN IF NOT EXISTS art_settings JSONB
    `
    
    console.log('  Creating GIN index...')
    await sql`
      CREATE INDEX IF NOT EXISTS idx_collections_art_settings 
      ON collections USING GIN (art_settings)
      WHERE art_settings IS NOT NULL
    `
    
    console.log('✅ Migration 107 completed!\n')

    const columns = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'collections' 
      AND column_name = 'art_settings'
    `

    if (columns.length > 0) {
      const col = columns[0]
      console.log(`✅ Verified: art_settings (${col.data_type}, nullable: ${col.is_nullable})`)
    }

  } catch (error) {
    console.error('❌ Migration failed:', error.message)
    process.exit(1)
  }
}

runMigration()
