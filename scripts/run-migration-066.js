#!/usr/bin/env node

require('dotenv').config({ path: '.env.local' })
const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

// Database connection configuration
const DATABASE_URL = process.env.NEON_DATABASE || process.env.DATABASE_URL || process.env.NEXT_PUBLIC_NEON_DATABASE

async function runMigration() {
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

    const migrationFile = '066_add_claim_tracking_to_reward_attempts.sql'
    const migrationPath = path.join(__dirname, 'migrations', migrationFile)
    
    if (!fs.existsSync(migrationPath)) {
      console.error(`❌ Migration file not found: ${migrationPath}`)
      process.exit(1)
    }

    console.log(`🔄 Running migration: ${migrationFile}`)
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8')
    
    try {
      await client.query('BEGIN')
      
      // Remove comments and split SQL into individual statements
      const cleanedSQL = migrationSQL
        .split('\n')
        .filter(line => !line.trim().startsWith('--'))
        .join('\n')
      
      // Split by semicolon but be careful with DO blocks
      const statements = cleanedSQL
        .split(';')
        .map(stmt => stmt.trim())
        .filter(stmt => stmt.length > 0)
      
      for (const statement of statements) {
        if (statement.trim()) {
          try {
            // Execute with semicolon
            await client.query(statement + ';')
            console.log(`   ✅ Executed: ${statement.substring(0, 80)}...`)
          } catch (stmtError) {
            // Check if it's an already exists error
            if (stmtError.message.includes('already exists') || 
                stmtError.message.includes('duplicate key') ||
                stmtError.message.includes('column') && stmtError.message.includes('already exists') ||
                stmtError.message.includes('relation') && stmtError.message.includes('already exists')) {
              console.log(`⚠️  Skipping statement (already exists): ${statement.substring(0, 80)}...`)
              continue
            }
            throw stmtError
          }
        }
      }
      
      // Record migration in schema_migrations if table exists
      try {
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING', [migrationFile])
        console.log(`   ✅ Recorded migration in schema_migrations`)
      } catch (err) {
        // If schema_migrations table doesn't exist, that's okay
        console.log('⚠️  Could not record migration (schema_migrations table may not exist)')
      }
      
      await client.query('COMMIT')
      console.log(`✅ Migration ${migrationFile} completed successfully`)
    } catch (error) {
      await client.query('ROLLBACK')
      console.error(`❌ Error running migration ${migrationFile}:`, error.message)
      throw error
    }

    // Verify columns were added
    console.log('')
    console.log('🔍 Verifying columns...')
    const columns = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'reward_attempts'
      AND column_name IN ('claimed', 'claim_txid', 'claim_timestamp')
      ORDER BY column_name
    `)

    if (columns.rows.length === 3) {
      console.log(`   ✅ Found all 3 columns:`)
      columns.rows.forEach(col => {
        console.log(`      - ${col.column_name} (${col.data_type}, nullable: ${col.is_nullable})`)
      })
    } else {
      console.log(`   ⚠️  Expected 3 columns, found ${columns.rows.length}`)
    }

    console.log('')
    console.log('🎉 Migration completed successfully!')

  } catch (error) {
    console.error('❌ Migration failed:', error.message)
    process.exit(1)
  } finally {
    await client.end()
    console.log('🔌 Database connection closed')
  }
}

// Run the migration
if (require.main === module) {
  runMigration().catch(console.error)
}

module.exports = { runMigration }
