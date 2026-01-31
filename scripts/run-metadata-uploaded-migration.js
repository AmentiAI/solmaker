#!/usr/bin/env node

const { neon } = require('@neondatabase/serverless')

async function runMigration() {
  console.log('🚀 Running Migration 112: Add metadata_uploaded...\n')

  const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL required')
    process.exit(1)
  }

  const sql = neon(databaseUrl)

  try {
    console.log('  Adding metadata_uploaded column to generated_ordinals table...')
    await sql`
      ALTER TABLE generated_ordinals 
      ADD COLUMN IF NOT EXISTS metadata_uploaded BOOLEAN DEFAULT false
    `
    
    console.log('  Creating index...')
    await sql`
      CREATE INDEX IF NOT EXISTS idx_generated_ordinals_metadata_uploaded 
      ON generated_ordinals(collection_id, metadata_uploaded)
    `
    
    console.log('✅ Migration 112 completed!\n')

    const columns = await sql`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'generated_ordinals' 
      AND column_name = 'metadata_uploaded'
    `

    if (columns.length > 0) {
      const col = columns[0]
      console.log(`✅ Verified: metadata_uploaded (${col.data_type}, default: ${col.column_default})`)
    }

  } catch (error) {
    console.error('❌ Migration failed:', error.message)
    process.exit(1)
  }
}

runMigration()
