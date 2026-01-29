/**
 * Run Mint Type Migration
 * Adds mint_type column to collections table for Ordinal Choices Mint feature
 * Usage: node scripts/run-mint-type-migration.js
 */

require('dotenv').config({ path: '.env.local' })
const { neon } = require('@neondatabase/serverless')
const fs = require('fs')
const path = require('path')

async function runMigration() {
  const databaseUrl = process.env.NEON_DATABASE || process.env.DATABASE_URL

  if (!databaseUrl) {
    console.error('❌ No database URL found. Please set NEON_DATABASE or DATABASE_URL')
    process.exit(1)
  }

  console.log('🚀 Running Mint Type Migration...')
  console.log('📡 Connecting to database...')

  const sql = neon(databaseUrl)

  try {
    const migrationPath = path.join(__dirname, 'migrations', '064_add_mint_type.sql')
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8')
    
    console.log('📄 Loaded migration file\n')

    // Remove comments and split by semicolons (simpler approach like other migrations)
    const cleanedSQL = migrationSQL
      .split('\n')
      .map(line => {
        // Remove full-line comments
        if (line.trim().startsWith('--')) {
          return ''
        }
        // Remove inline comments
        return line.split('--')[0]
      })
      .join('\n')
      .trim()

    // Split by semicolons and filter out empty statements
    const statements = cleanedSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.match(/^\s*$/) && !stmt.match(/^--/))
    
    console.log(`Found ${statements.length} SQL statements to execute\n`)
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i]
      
      try {
        const preview = statement.substring(0, 80).replace(/\n/g, ' ')
        console.log(`[${i + 1}/${statements.length}] Executing: ${preview}...`)
        await sql.unsafe(statement)
        console.log(`✅ [${i + 1}/${statements.length}] Completed`)
      } catch (error) {
        const errorMsg = error?.message || String(error)
        if (errorMsg.includes('already exists') || 
            errorMsg.includes('duplicate') ||
            (errorMsg.includes('does not exist') && errorMsg.includes('IF NOT EXISTS'))) {
          console.log(`⏭️  [${i + 1}/${statements.length}] Already applied, skipping`)
        } else {
          console.error(`❌ [${i + 1}/${statements.length}] Error:`, errorMsg)
          console.error('Statement preview:', statement.substring(0, 80))
          throw error
        }
      }
    }
    
    console.log('\n✅ Migration completed successfully!')
    process.exit(0)
  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  }
}

runMigration()

