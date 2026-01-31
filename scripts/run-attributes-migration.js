#!/usr/bin/env node

const { neon } = require('@neondatabase/serverless')

async function runMigration() {
  console.log('🚀 Running Migration 110: Add attributes...\n')

  const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL required')
    process.exit(1)
  }

  const sql = neon(databaseUrl)

  try {
    console.log('  Adding attributes column to generated_ordinals table...')
    await sql`
      ALTER TABLE generated_ordinals 
      ADD COLUMN IF NOT EXISTS attributes JSONB
    `
    
    console.log('  Creating GIN index...')
    await sql`
      CREATE INDEX IF NOT EXISTS idx_generated_ordinals_attributes 
      ON generated_ordinals USING GIN (attributes)
      WHERE attributes IS NOT NULL
    `
    
    console.log('✅ Migration 110 completed!\n')

    const columns = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'generated_ordinals' 
      AND column_name = 'attributes'
    `

    if (columns.length > 0) {
      const col = columns[0]
      console.log(`✅ Verified: attributes (${col.data_type}, nullable: ${col.is_nullable})`)
    }

  } catch (error) {
    console.error('❌ Migration failed:', error.message)
    process.exit(1)
  }
}

runMigration()
