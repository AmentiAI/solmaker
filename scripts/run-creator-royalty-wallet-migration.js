#!/usr/bin/env node

const { neon } = require('@neondatabase/serverless')

async function runMigration() {
  console.log('🚀 Running Migration 090: Add creator_royalty_wallet...\n')

  const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL required')
    process.exit(1)
  }

  const sql = neon(databaseUrl)

  try {
    console.log('  Adding creator_royalty_wallet column...')
    await sql`
      ALTER TABLE collections 
      ADD COLUMN IF NOT EXISTS creator_royalty_wallet TEXT
    `
    
    console.log('  Creating index...')
    await sql`
      CREATE INDEX IF NOT EXISTS idx_collections_creator_royalty_wallet 
      ON collections(creator_royalty_wallet) 
      WHERE creator_royalty_wallet IS NOT NULL
    `
    
    console.log('✅ Migration 090 completed!\n')

    const columns = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'collections' 
      AND column_name = 'creator_royalty_wallet'
    `

    if (columns.length > 0) {
      const col = columns[0]
      console.log(`✅ Verified: creator_royalty_wallet (${col.data_type}, nullable: ${col.is_nullable})`)
    }

  } catch (error) {
    console.error('❌ Migration failed:', error.message)
    process.exit(1)
  }
}

runMigration()
