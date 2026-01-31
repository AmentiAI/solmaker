#!/usr/bin/env node

const { neon } = require('@neondatabase/serverless')

async function runMigration() {
  console.log('🚀 Running Migration 094: Add inscription_id...\n')

  const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL required')
    process.exit(1)
  }

  const sql = neon(databaseUrl)

  try {
    console.log('  Adding inscription_id column to generated_ordinals table...')
    await sql`
      ALTER TABLE generated_ordinals 
      ADD COLUMN IF NOT EXISTS inscription_id TEXT
    `
    
    console.log('  Creating index...')
    await sql`
      CREATE INDEX IF NOT EXISTS idx_generated_ordinals_inscription_id 
      ON generated_ordinals(inscription_id) 
      WHERE inscription_id IS NOT NULL
    `
    
    console.log('✅ Migration 094 completed!\n')

    const columns = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'generated_ordinals' 
      AND column_name = 'inscription_id'
    `

    if (columns.length > 0) {
      const col = columns[0]
      console.log(`✅ Verified: inscription_id (${col.data_type}, nullable: ${col.is_nullable})`)
    }

  } catch (error) {
    console.error('❌ Migration failed:', error.message)
    process.exit(1)
  }
}

runMigration()
