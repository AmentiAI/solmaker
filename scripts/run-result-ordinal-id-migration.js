#!/usr/bin/env node

const { neon } = require('@neondatabase/serverless')

async function runMigration() {
  console.log('🚀 Running Migration 097: Add result_ordinal_id...\n')

  const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL required')
    process.exit(1)
  }

  const sql = neon(databaseUrl)

  try {
    console.log('  Adding result_ordinal_id column to generation_jobs table...')
    await sql`
      ALTER TABLE generation_jobs 
      ADD COLUMN IF NOT EXISTS result_ordinal_id UUID
    `
    
    console.log('  Creating index...')
    await sql`
      CREATE INDEX IF NOT EXISTS idx_generation_jobs_result_ordinal_id 
      ON generation_jobs(result_ordinal_id) 
      WHERE result_ordinal_id IS NOT NULL
    `
    
    console.log('  Adding foreign key constraint...')
    try {
      await sql`
        ALTER TABLE generation_jobs 
        ADD CONSTRAINT fk_generation_jobs_result_ordinal 
        FOREIGN KEY (result_ordinal_id) 
        REFERENCES generated_ordinals(id) 
        ON DELETE SET NULL
      `
    } catch (fkError) {
      if (fkError.message && fkError.message.includes('already exists')) {
        console.log('  ⚠️  Foreign key constraint already exists, skipping...')
      } else {
        throw fkError
      }
    }
    
    console.log('✅ Migration 097 completed!\n')

    const columns = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'generation_jobs' 
      AND column_name = 'result_ordinal_id'
    `

    if (columns.length > 0) {
      const col = columns[0]
      console.log(`✅ Verified: result_ordinal_id (${col.data_type}, nullable: ${col.is_nullable})`)
    }

  } catch (error) {
    console.error('❌ Migration failed:', error.message)
    process.exit(1)
  }
}

runMigration()
