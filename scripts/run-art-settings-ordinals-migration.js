#!/usr/bin/env node

const { neon } = require('@neondatabase/serverless')

async function runMigration() {
  console.log('🚀 Running Migration 109: Add art_settings to generated_ordinals...\n')

  const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL required')
    process.exit(1)
  }

  const sql = neon(databaseUrl)

  try {
    console.log('  Adding art_settings column to generated_ordinals table...')
    await sql`
      ALTER TABLE generated_ordinals 
      ADD COLUMN IF NOT EXISTS art_settings JSONB
    `
    
    console.log('  Creating GIN index...')
    await sql`
      CREATE INDEX IF NOT EXISTS idx_generated_ordinals_art_settings 
      ON generated_ordinals USING GIN (art_settings)
      WHERE art_settings IS NOT NULL
    `
    
    console.log('✅ Migration 109 completed!\n')

    const columns = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'generated_ordinals' 
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
