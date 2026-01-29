require('dotenv').config({ path: '.env.local' })
const { neon } = require('@neondatabase/serverless')

async function runMigration() {
  const databaseUrl = process.env.NEON_DATABASE || process.env.DATABASE_URL
  
  if (!databaseUrl) {
    console.error('❌ No database URL found. Please set NEON_DATABASE or DATABASE_URL')
    process.exit(1)
  }

  console.log('🔧 Running Migration 041: Add transaction checking fields...')
  console.log('📡 Connecting to database...')

  const sql = neon(databaseUrl)

  try {
    console.log('  Adding commit_last_checked_at and reveal_last_checked_at columns...')
    await sql`
      ALTER TABLE mint_inscriptions
      ADD COLUMN IF NOT EXISTS commit_last_checked_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS reveal_last_checked_at TIMESTAMPTZ
    `
    
    console.log('  Creating indexes...')
    await sql`
      CREATE INDEX IF NOT EXISTS idx_mint_inscriptions_commit_check ON mint_inscriptions(commit_last_checked_at) 
      WHERE commit_tx_id IS NOT NULL AND commit_confirmed_at IS NULL
    `
    
    await sql`
      CREATE INDEX IF NOT EXISTS idx_mint_inscriptions_reveal_check ON mint_inscriptions(reveal_last_checked_at) 
      WHERE reveal_tx_id IS NOT NULL AND reveal_confirmed_at IS NULL
    `
    
    console.log('✅ Migration 041 complete!')
    process.exit(0)
  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  }
}

runMigration()

