#!/usr/bin/env node

const { neon } = require('@neondatabase/serverless')

async function runMigration() {
  console.log('🚀 Running Migration 087: Add thumbnail_size_kb...\n')

  const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL required')
    process.exit(1)
  }

  const sql = neon(databaseUrl)

  try {
    console.log('  Adding thumbnail_size_kb column...')
    await sql`
      ALTER TABLE generated_ordinals 
      ADD COLUMN IF NOT EXISTS thumbnail_size_kb NUMERIC(10, 2)
    `
    
    console.log('  Creating index...')
    await sql`
      CREATE INDEX IF NOT EXISTS idx_generated_ordinals_thumbnail_size 
      ON generated_ordinals(thumbnail_size_kb) 
      WHERE thumbnail_size_kb IS NOT NULL
    `
    
    console.log('✅ Migration 087 completed!\n')

    const columns = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'generated_ordinals' 
      AND column_name = 'thumbnail_size_kb'
    `

    if (columns.length > 0) {
      const col = columns[0]
      console.log('✅ Verified: thumbnail_size_kb (${col.data_type}, nullable: ${col.is_nullable})')
    }

  } catch (error) {
    console.error('❌ Migration failed:', error.message)
    process.exit(1)
  }
}

runMigration()
