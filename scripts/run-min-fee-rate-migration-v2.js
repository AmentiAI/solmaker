#!/usr/bin/env node

const { neon } = require('@neondatabase/serverless')

async function runMigration() {
  console.log('🚀 Running Migration 099: Add min_fee_rate...\n')

  const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL required')
    process.exit(1)
  }

  const sql = neon(databaseUrl)

  try {
    console.log('  Adding min_fee_rate column to mint_phases table...')
    await sql`
      ALTER TABLE mint_phases 
      ADD COLUMN IF NOT EXISTS min_fee_rate DECIMAL(10,2) DEFAULT 0.1
    `
    
    console.log('  Creating index...')
    await sql`
      CREATE INDEX IF NOT EXISTS idx_mint_phases_min_fee_rate 
      ON mint_phases(min_fee_rate)
    `
    
    console.log('✅ Migration 099 completed!\n')

    const columns = await sql`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'mint_phases' 
      AND column_name = 'min_fee_rate'
    `

    if (columns.length > 0) {
      const col = columns[0]
      console.log(`✅ Verified: min_fee_rate (${col.data_type}, default: ${col.column_default})`)
    }

  } catch (error) {
    console.error('❌ Migration failed:', error.message)
    process.exit(1)
  }
}

runMigration()
