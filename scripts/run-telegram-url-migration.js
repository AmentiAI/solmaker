#!/usr/bin/env node

const { neon } = require('@neondatabase/serverless')

async function runMigration() {
  console.log('🚀 Running Migration 092: Add telegram_url...\n')

  const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL required')
    process.exit(1)
  }

  const sql = neon(databaseUrl)

  try {
    console.log('  Adding telegram_url column...')
    await sql`
      ALTER TABLE collections 
      ADD COLUMN IF NOT EXISTS telegram_url TEXT
    `
    
    console.log('  Creating index...')
    await sql`
      CREATE INDEX IF NOT EXISTS idx_collections_telegram_url 
      ON collections(telegram_url) 
      WHERE telegram_url IS NOT NULL
    `
    
    console.log('✅ Migration 092 completed!\n')

    const columns = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'collections' 
      AND column_name = 'telegram_url'
    `

    if (columns.length > 0) {
      const col = columns[0]
      console.log(`✅ Verified: telegram_url (${col.data_type}, nullable: ${col.is_nullable})`)
    }

  } catch (error) {
    console.error('❌ Migration failed:', error.message)
    process.exit(1)
  }
}

runMigration()
