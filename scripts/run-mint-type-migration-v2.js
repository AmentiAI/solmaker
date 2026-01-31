#!/usr/bin/env node

const { neon } = require('@neondatabase/serverless')

async function runMigration() {
  console.log('🚀 Running Migration 064: Add mint_type...\n')

  const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL required')
    process.exit(1)
  }

  const sql = neon(databaseUrl)

  try {
    console.log('  Adding mint_type column to collections table...')
    await sql`
      ALTER TABLE collections 
      ADD COLUMN IF NOT EXISTS mint_type VARCHAR(20) DEFAULT 'hidden'
    `
    
    console.log('  Dropping old constraint if exists...')
    await sql`
      ALTER TABLE collections 
      DROP CONSTRAINT IF EXISTS check_mint_type
    `
    
    console.log('  Adding check constraint...')
    await sql`
      ALTER TABLE collections 
      ADD CONSTRAINT check_mint_type 
      CHECK (mint_type IN ('hidden', 'choices'))
    `
    
    console.log('  Creating index...')
    await sql`
      CREATE INDEX IF NOT EXISTS idx_collections_mint_type 
      ON collections(mint_type) 
      WHERE mint_type = 'choices'
    `
    
    console.log('✅ Migration 064 completed!\n')

    const columns = await sql`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'collections' 
      AND column_name = 'mint_type'
    `

    if (columns.length > 0) {
      const col = columns[0]
      console.log(`✅ Verified: mint_type (${col.data_type}, default: ${col.column_default})`)
    }

  } catch (error) {
    console.error('❌ Migration failed:', error.message)
    process.exit(1)
  }
}

runMigration()
