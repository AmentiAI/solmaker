#!/usr/bin/env node

const { neon } = require('@neondatabase/serverless')

async function runMigration() {
  console.log('🚀 Running Migration 115: Create candy_machine_deployments table...\n')

  const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL required')
    process.exit(1)
  }

  const sql = neon(databaseUrl)

  try {
    console.log('  Creating candy_machine_deployments table...')
    await sql`
      CREATE TABLE IF NOT EXISTS candy_machine_deployments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
        
        step TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        
        tx_signature TEXT,
        error_message TEXT,
        step_data JSONB,
        
        started_at TIMESTAMPTZ DEFAULT NOW(),
        completed_at TIMESTAMPTZ,
        
        CONSTRAINT valid_step_status CHECK (status IN (
          'pending', 'in_progress', 'completed', 'failed'
        ))
      )
    `
    
    console.log('  Creating indexes...')
    await sql`
      CREATE INDEX IF NOT EXISTS idx_cm_deployments_collection 
      ON candy_machine_deployments(collection_id)
    `
    
    await sql`
      CREATE INDEX IF NOT EXISTS idx_cm_deployments_status 
      ON candy_machine_deployments(status)
    `
    
    await sql`
      CREATE INDEX IF NOT EXISTS idx_cm_deployments_started 
      ON candy_machine_deployments(started_at DESC)
    `
    
    console.log('✅ Migration 115 completed!\n')

    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'candy_machine_deployments'
    `

    if (tables.length > 0) {
      console.log('✅ Table candy_machine_deployments created')
      
      const columns = await sql`
        SELECT column_name, data_type
        FROM information_schema.columns 
        WHERE table_name = 'candy_machine_deployments'
        ORDER BY ordinal_position
      `
      
      console.log('\n📋 Columns:')
      columns.forEach(col => {
        console.log(`  - ${col.column_name} (${col.data_type})`)
      })
    }

  } catch (error) {
    console.error('❌ Migration failed:', error.message)
    process.exit(1)
  }
}

runMigration()
