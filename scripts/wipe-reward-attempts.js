#!/usr/bin/env node

require('dotenv').config({ path: '.env.local' })
const { Client } = require('pg')

// Database connection configuration
const DATABASE_URL = process.env.NEON_DATABASE || process.env.DATABASE_URL || process.env.NEXT_PUBLIC_NEON_DATABASE

async function wipeRewardAttempts() {
  if (!DATABASE_URL) {
    console.error('❌ No database URL found. Please set NEON_DATABASE, DATABASE_URL, or NEXT_PUBLIC_NEON_DATABASE')
    process.exit(1)
  }

  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('neon') ? {
      rejectUnauthorized: false
    } : undefined
  })

  try {
    console.log('🔌 Connecting to database...')
    await client.connect()
    console.log('✅ Connected successfully!')

    // Get count before deletion
    const countResult = await client.query('SELECT COUNT(*) as count FROM reward_attempts')
    const countBefore = parseInt(countResult.rows[0].count, 10)

    if (countBefore === 0) {
      console.log('ℹ️  No reward attempts found in database')
      return
    }

    console.log(`\n⚠️  WARNING: About to delete ${countBefore} reward attempt(s) from the database`)
    console.log('   This will remove all spins, wins, and claim records')
    console.log('   This action cannot be undone!\n')

    // Ask for confirmation (in a real script, you might want to use readline)
    // For now, we'll require a command line flag
    const args = process.argv.slice(2)
    if (!args.includes('--confirm')) {
      console.error('❌ This is a destructive operation!')
      console.error('   To confirm, run: node scripts/wipe-reward-attempts.js --confirm')
      process.exit(1)
    }

    console.log('🗑️  Deleting all reward attempts...')

    await client.query('BEGIN')

    const deleteResult = await client.query('DELETE FROM reward_attempts')

    await client.query('COMMIT')

    console.log(`✅ Successfully deleted ${deleteResult.rowCount} reward attempt(s)`)

    // Verify deletion
    const verifyResult = await client.query('SELECT COUNT(*) as count FROM reward_attempts')
    const countAfter = parseInt(verifyResult.rows[0].count, 10)

    if (countAfter === 0) {
      console.log('✅ Verification: All reward attempts have been removed')
    } else {
      console.log(`⚠️  Warning: ${countAfter} record(s) still remain`)
    }

    console.log('\n🎉 Wipe completed successfully!')

  } catch (error) {
    console.error('❌ Error wiping reward attempts:', error.message)
    process.exit(1)
  } finally {
    await client.end()
    console.log('🔌 Database connection closed')
  }
}

// Run the wipe
if (require.main === module) {
  wipeRewardAttempts().catch(console.error)
}

module.exports = { wipeRewardAttempts }
