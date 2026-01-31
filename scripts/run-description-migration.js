#!/usr/bin/env node

const { neon } = require('@neondatabase/serverless')

async function runMigration() {
  console.log('🚀 Running Migration 103: Add description...\n')

  const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL required')
    process.exit(1)
  }

  const sql = neon(databaseUrl)

  try {
    console.log('  Adding description column to mint_phases table...')
    await sql`
      ALTER TABLE mint_phases 
      ADD COLUMN IF NOT EXISTS description TEXT
    `
    
    console.log('  Creating index...')
    await sql`
      CREATE INDEX IF NOT EXISTS idx_mint_phases_description 
      ON mint_phases(description) 
      WHERE description IS NOT NULL
    `
    
    console.log('✅ Migration 103 completed!\n')

    const columns = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'mint_phases' 
      AND column_name = 'description'
    `

    if (columns.length > 0) {
      const col = columns[0]
      console.log(`✅ Verified: description (${col.data_type}, nullable: ${col.is_nullable})`)
    }

  } catch (error) {
    console.error('❌ Migration failed:', error.message)
    process.exit(1)
  }
}

runMigration()
