#!/usr/bin/env node

/**
 * Setup script for Bitcoin minting functionality
 * Runs the database migration to add minting tables
 */

const { neon } = require('@neondatabase/serverless')
const fs = require('fs')
const path = require('path')

async function setupMinting() {
  console.log('🚀 Setting up Bitcoin minting system...\n')

  // Get database URL
  const databaseUrl =
    process.env.NEON_DATABASE ||
    process.env.DATABASE_URL ||
    process.env.NEXT_PUBLIC_NEON_DATABASE

  if (!databaseUrl) {
    console.error('❌ Error: No database URL found in environment variables')
    console.log('Please set one of: NEON_DATABASE, DATABASE_URL, or NEXT_PUBLIC_NEON_DATABASE')
    process.exit(1)
  }

  console.log('✓ Database URL found')

  const sql = neon(databaseUrl)

  try {
    // Read migration file
    const migrationPath = path.join(__dirname, 'migrations', '008_add_mint_tracking.sql')
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8')

    console.log('✓ Migration file loaded')
    console.log('Running migration...\n')

    // Split by semicolon and execute each statement
    const statements = migrationSQL
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith('--'))

    for (const statement of statements) {
      if (statement.trim()) {
        await sql([statement])
      }
    }

    console.log('✅ Database migration completed successfully!\n')
    console.log('Minting tables created:')
    console.log('  - mint_sessions (for tracking mint operations)')
    console.log('  - generated_ordinals (extended with minting columns)\n')
    console.log('Next steps:')
    console.log('  1. Run: npm run dev')
    console.log('  2. Generate some ordinals in a collection')
    console.log('  3. Navigate to /mint/{collectionId} to mint them')
    console.log('  4. Connect your Bitcoin wallet and mint!\n')
    console.log('📖 See BITCOIN_MINTING_SYSTEM.md for detailed documentation')
  } catch (error) {
    console.error('❌ Error during setup:', error.message)
    console.error('\nFull error:', error)
    process.exit(1)
  }
}

setupMinting()

