#!/usr/bin/env node

/**
 * Run Migration 086 - Add ordinal_number and trait_overrides to generation_jobs
 * Adds columns to track which specific NFT is being generated and custom traits
 */

const { neon } = require('@neondatabase/serverless')

async function runMigration() {
  console.log('🚀 Running Migration 086: Add ordinal_number and trait_overrides to generation_jobs...\n')

  const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL or NEON_DATABASE environment variable is required')
    process.exit(1)
  }

  const sql = neon(databaseUrl)

  try {
    console.log('📝 Executing migration statements...\n')
    
    console.log('  Adding ordinal_number column...')
    await sql`
      ALTER TABLE generation_jobs 
      ADD COLUMN IF NOT EXISTS ordinal_number INTEGER
    `
    
    console.log('  Adding trait_overrides column...')
    await sql`
      ALTER TABLE generation_jobs 
      ADD COLUMN IF NOT EXISTS trait_overrides JSONB
    `
    
    console.log('  Creating ordinal_number index...')
    await sql`
      CREATE INDEX IF NOT EXISTS idx_generation_jobs_ordinal_number 
      ON generation_jobs(collection_id, ordinal_number) 
      WHERE ordinal_number IS NOT NULL
    `
    
    console.log('  Creating trait_overrides index...')
    await sql`
      CREATE INDEX IF NOT EXISTS idx_generation_jobs_trait_overrides 
      ON generation_jobs USING GIN (trait_overrides)
      WHERE trait_overrides IS NOT NULL
    `
    
    console.log('✅ Migration 086 completed successfully!\n')
    console.log('📊 Added columns:')
    console.log('  - ordinal_number (INTEGER, nullable)')
    console.log('  - trait_overrides (JSONB, nullable)')

    // Verify columns exist
    const columns = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'generation_jobs' 
      AND column_name IN ('ordinal_number', 'trait_overrides')
      ORDER BY column_name
    `

    if (columns.length > 0) {
      console.log('\n✅ Verified columns in generation_jobs table:')
      columns.forEach(col => {
        console.log(`  - ${col.column_name} (${col.data_type}, nullable: ${col.is_nullable})`)
      })
    }

    // Show some sample data
    const sampleJobs = await sql`
      SELECT id, collection_id, ordinal_number, trait_overrides, status, created_at
      FROM generation_jobs 
      ORDER BY created_at DESC 
      LIMIT 5
    `

    if (sampleJobs.length > 0) {
      console.log('\n📋 Sample generation jobs:')
      sampleJobs.forEach(job => {
        const hasTraits = job.trait_overrides ? 'has traits' : 'no traits'
        console.log(`  - Job ${job.id.substring(0, 8)}...: ordinal_number=${job.ordinal_number || 'NULL'}, ${hasTraits}, status=${job.status}`)
      })
    } else {
      console.log('\n⚠️  No generation jobs found yet.')
    }

    console.log('\n🎉 Migration complete! Generation jobs can now track ordinal numbers and trait overrides.')

  } catch (error) {
    console.error('❌ Migration failed:', error.message)
    console.error(error)
    process.exit(1)
  }
}

runMigration()
