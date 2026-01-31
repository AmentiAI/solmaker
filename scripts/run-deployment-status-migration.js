#!/usr/bin/env node

const { neon } = require('@neondatabase/serverless')

async function runMigration() {
  console.log('🚀 Running Migration 106: Add deployment_status...\n')

  const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL required')
    process.exit(1)
  }

  const sql = neon(databaseUrl)

  try {
    console.log('  Adding deployment_status column to collections table...')
    await sql`
      ALTER TABLE collections 
      ADD COLUMN IF NOT EXISTS deployment_status TEXT DEFAULT 'not_deployed'
    `
    
    console.log('  Creating index...')
    await sql`
      CREATE INDEX IF NOT EXISTS idx_collections_deployment_status 
      ON collections(deployment_status)
    `
    
    console.log('✅ Migration 106 completed!\n')

    const columns = await sql`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'collections' 
      AND column_name = 'deployment_status'
    `

    if (columns.length > 0) {
      const col = columns[0]
      console.log(`✅ Verified: deployment_status (${col.data_type}, default: ${col.column_default})`)
    }

  } catch (error) {
    console.error('❌ Migration failed:', error.message)
    process.exit(1)
  }
}

runMigration()
