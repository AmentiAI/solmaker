#!/usr/bin/env node

const { neon } = require('@neondatabase/serverless')

async function runMigration() {
  console.log('🚀 Running Migration 093: Add trait_prompt...\n')

  const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL required')
    process.exit(1)
  }

  const sql = neon(databaseUrl)

  try {
    console.log('  Adding trait_prompt column to traits table...')
    await sql`
      ALTER TABLE traits 
      ADD COLUMN IF NOT EXISTS trait_prompt TEXT
    `
    
    console.log('  Creating index...')
    await sql`
      CREATE INDEX IF NOT EXISTS idx_traits_trait_prompt 
      ON traits(trait_prompt) 
      WHERE trait_prompt IS NOT NULL
    `
    
    console.log('✅ Migration 093 completed!\n')

    const columns = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'traits' 
      AND column_name = 'trait_prompt'
    `

    if (columns.length > 0) {
      const col = columns[0]
      console.log(`✅ Verified: trait_prompt (${col.data_type}, nullable: ${col.is_nullable})`)
    }

  } catch (error) {
    console.error('❌ Migration failed:', error.message)
    process.exit(1)
  }
}

runMigration()
