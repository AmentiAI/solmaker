#!/usr/bin/env node

const { neon } = require('@neondatabase/serverless')

async function runMigration() {
  console.log('🚀 Running Migration 101: Add max_per_transaction...\n')

  const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL required')
    process.exit(1)
  }

  const sql = neon(databaseUrl)

  try {
    console.log('  Adding max_per_transaction column to mint_phases table...')
    await sql`
      ALTER TABLE mint_phases 
      ADD COLUMN IF NOT EXISTS max_per_transaction INTEGER DEFAULT 1
    `
    
    console.log('  Creating index...')
    await sql`
      CREATE INDEX IF NOT EXISTS idx_mint_phases_max_per_transaction 
      ON mint_phases(max_per_transaction)
    `
    
    console.log('✅ Migration 101 completed!\n')

    const columns = await sql`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'mint_phases' 
      AND column_name = 'max_per_transaction'
    `

    if (columns.length > 0) {
      const col = columns[0]
      console.log(`✅ Verified: max_per_transaction (${col.data_type}, default: ${col.column_default})`)
    }

  } catch (error) {
    console.error('❌ Migration failed:', error.message)
    process.exit(1)
  }
}

runMigration()
