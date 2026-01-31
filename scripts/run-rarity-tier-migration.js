#!/usr/bin/env node

const { neon } = require('@neondatabase/serverless')

async function runMigration() {
  console.log('🚀 Running Migration 114: Add rarity_tier...\n')

  const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL required')
    process.exit(1)
  }

  const sql = neon(databaseUrl)

  try {
    console.log('  Adding rarity_tier column to generated_ordinals table...')
    await sql`
      ALTER TABLE generated_ordinals 
      ADD COLUMN IF NOT EXISTS rarity_tier TEXT
    `
    
    console.log('  Creating index...')
    await sql`
      CREATE INDEX IF NOT EXISTS idx_generated_ordinals_rarity_tier 
      ON generated_ordinals(collection_id, rarity_tier) 
      WHERE rarity_tier IS NOT NULL
    `
    
    console.log('✅ Migration 114 completed!\n')

    const columns = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'generated_ordinals' 
      AND column_name = 'rarity_tier'
    `

    if (columns.length > 0) {
      const col = columns[0]
      console.log(`✅ Verified: rarity_tier (${col.data_type}, nullable: ${col.is_nullable})`)
    }

  } catch (error) {
    console.error('❌ Migration failed:', error.message)
    process.exit(1)
  }
}

runMigration()
