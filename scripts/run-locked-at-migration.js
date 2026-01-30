#!/usr/bin/env node

const { neon } = require('@neondatabase/serverless')

async function runMigration() {
  console.log('🚀 Running Migration 088: Add locked_at and locked_by...\n')

  const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL required')
    process.exit(1)
  }

  const sql = neon(databaseUrl)

  try {
    console.log('  Adding locked_at column...')
    await sql`
      ALTER TABLE collections 
      ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ
    `
    
    console.log('  Adding locked_by column...')
    await sql`
      ALTER TABLE collections 
      ADD COLUMN IF NOT EXISTS locked_by TEXT
    `
    
    console.log('  Creating locked_at index...')
    await sql`
      CREATE INDEX IF NOT EXISTS idx_collections_locked_at 
      ON collections(locked_at) 
      WHERE locked_at IS NOT NULL
    `
    
    console.log('  Creating locked_by index...')
    await sql`
      CREATE INDEX IF NOT EXISTS idx_collections_locked_by 
      ON collections(locked_by) 
      WHERE locked_by IS NOT NULL
    `
    
    console.log('✅ Migration 088 completed!\n')

    const columns = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'collections' 
      AND column_name IN ('locked_at', 'locked_by')
      ORDER BY column_name
    `

    if (columns.length > 0) {
      console.log('✅ Verified columns:')
      columns.forEach(col => {
        console.log(`  - ${col.column_name} (${col.data_type}, nullable: ${col.is_nullable})`)
      })
    }

  } catch (error) {
    console.error('❌ Migration failed:', error.message)
    process.exit(1)
  }
}

runMigration()
