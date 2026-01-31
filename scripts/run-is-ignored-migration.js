#!/usr/bin/env node

const { neon } = require('@neondatabase/serverless')

async function runMigration() {
  console.log('🚀 Running Migration 095: Add is_ignored...\n')

  const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL required')
    process.exit(1)
  }

  const sql = neon(databaseUrl)

  try {
    console.log('  Adding is_ignored column to traits table...')
    await sql`
      ALTER TABLE traits 
      ADD COLUMN IF NOT EXISTS is_ignored BOOLEAN DEFAULT false
    `
    
    console.log('  Creating index...')
    await sql`
      CREATE INDEX IF NOT EXISTS idx_traits_is_ignored 
      ON traits(is_ignored)
    `
    
    console.log('✅ Migration 095 completed!\n')

    const columns = await sql`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'traits' 
      AND column_name = 'is_ignored'
    `

    if (columns.length > 0) {
      const col = columns[0]
      console.log(`✅ Verified: is_ignored (${col.data_type}, default: ${col.column_default})`)
    }

  } catch (error) {
    console.error('❌ Migration failed:', error.message)
    process.exit(1)
  }
}

runMigration()
