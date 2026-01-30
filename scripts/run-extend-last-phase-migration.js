#!/usr/bin/env node

const { neon } = require('@neondatabase/serverless')

async function runMigration() {
  console.log('🚀 Running Migration 089: Add extend_last_phase...\n')

  const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL required')
    process.exit(1)
  }

  const sql = neon(databaseUrl)

  try {
    console.log('  Adding extend_last_phase column...')
    await sql`
      ALTER TABLE collections 
      ADD COLUMN IF NOT EXISTS extend_last_phase BOOLEAN DEFAULT false
    `
    
    console.log('  Creating index...')
    await sql`
      CREATE INDEX IF NOT EXISTS idx_collections_extend_last_phase 
      ON collections(extend_last_phase)
    `
    
    console.log('✅ Migration 089 completed!\n')

    const columns = await sql`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'collections' 
      AND column_name = 'extend_last_phase'
    `

    if (columns.length > 0) {
      const col = columns[0]
      console.log(`✅ Verified: extend_last_phase (${col.data_type}, default: ${col.column_default})`)
    }

  } catch (error) {
    console.error('❌ Migration failed:', error.message)
    process.exit(1)
  }
}

runMigration()
