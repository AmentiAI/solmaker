#!/usr/bin/env node

const { neon } = require('@neondatabase/serverless')

async function runMigration() {
  console.log('🚀 Running Migration 102: Add end_on_allocation...\n')

  const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL required')
    process.exit(1)
  }

  const sql = neon(databaseUrl)

  try {
    console.log('  Adding end_on_allocation column to mint_phases table...')
    await sql`
      ALTER TABLE mint_phases 
      ADD COLUMN IF NOT EXISTS end_on_allocation BOOLEAN DEFAULT false
    `
    
    console.log('  Creating index...')
    await sql`
      CREATE INDEX IF NOT EXISTS idx_mint_phases_end_on_allocation 
      ON mint_phases(end_on_allocation)
    `
    
    console.log('✅ Migration 102 completed!\n')

    const columns = await sql`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'mint_phases' 
      AND column_name = 'end_on_allocation'
    `

    if (columns.length > 0) {
      const col = columns[0]
      console.log(`✅ Verified: end_on_allocation (${col.data_type}, default: ${col.column_default})`)
    }

  } catch (error) {
    console.error('❌ Migration failed:', error.message)
    process.exit(1)
  }
}

runMigration()
