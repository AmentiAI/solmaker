#!/usr/bin/env node

const { neon } = require('@neondatabase/serverless')

async function runMigration() {
  console.log('🚀 Running Migration 105: Fix name column to be nullable...\n')

  const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL required')
    process.exit(1)
  }

  const sql = neon(databaseUrl)

  try {
    console.log('  Removing NOT NULL constraint from name column...')
    await sql`
      ALTER TABLE mint_phases 
      ALTER COLUMN name DROP NOT NULL
    `
    
    console.log('✅ Migration 105 completed!\n')

    const columns = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'mint_phases' 
      AND column_name = 'name'
    `

    if (columns.length > 0) {
      const col = columns[0]
      console.log(`✅ Verified: name (${col.data_type}, nullable: ${col.is_nullable})`)
    }

  } catch (error) {
    console.error('❌ Migration failed:', error.message)
    process.exit(1)
  }
}

runMigration()
