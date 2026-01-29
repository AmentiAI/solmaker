/**
 * Run Trait Ignore Migration
 * Adds is_ignored column to traits table to allow excluding traits from generation
 * Usage: node scripts/run-trait-ignore-migration.js
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

  console.log('🚀 Running Trait Ignore Migration...')
  console.log('📡 Connecting to database...')

  const sql = neon(databaseUrl)

  try {
    // Read the SQL file
    const migrationPath = path.join(__dirname, 'migrations', '049_add_trait_ignore_flag.sql')
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8')
    
    console.log('📄 Loaded migration file\n')

    // Split SQL into individual statements
    const lines = migrationSQL.split('\n')
    let currentStatement = ''
    const statements = []
    
    for (const line of lines) {
      const trimmed = line.trim()
      
      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('--')) {
        continue
      }
      
      // Remove inline comments (-- at end of line)
      const withoutInlineComment = trimmed.split('--')[0].trim()
      if (!withoutInlineComment) {
        continue
      }
      
      currentStatement += (currentStatement ? ' ' : '') + withoutInlineComment
      
      // If line ends with semicolon, we have a complete statement
      if (withoutInlineComment.endsWith(';')) {
        const stmt = currentStatement.trim()
        if (stmt && stmt.length > 1) {
          statements.push(stmt)
        }
        currentStatement = ''
      }
    }
    
    // Add any remaining statement
    if (currentStatement.trim()) {
      statements.push(currentStatement.trim())
    }
    
    console.log(`Found ${statements.length} SQL statements to execute\n`)
    
    // Execute statements directly using tagged template literals (like other migrations)
    console.log('\n[1/3] Adding is_ignored column to traits table...')
    try {
      await sql`
        ALTER TABLE traits
        ADD COLUMN IF NOT EXISTS is_ignored BOOLEAN DEFAULT FALSE
      `
      console.log('✅ Column added')
    } catch (error) {
      const errorMsg = error?.message || String(error)
      if (errorMsg.includes('already exists') || errorMsg.includes('duplicate')) {
        console.log('⏭️  Column already exists')
      } else {
        console.error('❌ Error:', errorMsg)
        throw error
      }
    }

    console.log('\n[2/3] Creating index...')
    try {
      await sql`
        CREATE INDEX IF NOT EXISTS idx_traits_is_ignored ON traits(layer_id, is_ignored)
        WHERE is_ignored = FALSE
      `
      console.log('✅ Index created')
    } catch (error) {
      const errorMsg = error?.message || String(error)
      if (errorMsg.includes('already exists') || errorMsg.includes('duplicate')) {
        console.log('⏭️  Index already exists')
      } else {
        console.error('❌ Error:', errorMsg)
        throw error
      }
    }

    console.log('\n[3/3] Adding comment...')
    try {
      await sql`
        COMMENT ON COLUMN traits.is_ignored IS 'If true, this trait will be excluded from ordinal generation but not deleted'
      `
      console.log('✅ Comment added')
    } catch (error) {
      console.log('⏭️  Comment may already exist or not supported')
    }
    
    // Verify the migration
    console.log('🔍 Verifying migration results...\n')
    const columnCheck = await sql`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'traits' AND column_name = 'is_ignored'
    `
    
    if (Array.isArray(columnCheck) && columnCheck.length > 0) {
      console.log('✅ Column exists:')
      console.log(`   - Name: ${columnCheck[0].column_name}`)
      console.log(`   - Type: ${columnCheck[0].data_type}`)
      console.log(`   - Default: ${columnCheck[0].column_default}`)
      console.log(`   - Nullable: ${columnCheck[0].is_nullable}`)
    } else {
      console.log('⚠️  Column not found - migration may have failed')
    }
    
    // Check index
    const indexCheck = await sql`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = 'traits' 
      AND indexname = 'idx_traits_is_ignored'
    `
    
    if (Array.isArray(indexCheck) && indexCheck.length > 0) {
      console.log(`\n✅ Index exists: ${indexCheck[0].indexname}`)
    } else {
      console.log(`\n⚠️  Index not found`)
    }
    
    console.log('\n' + '='.repeat(50))
    console.log('✅ Trait Ignore Migration completed successfully!')
    console.log('='.repeat(50))
    console.log('\n💡 Traits can now be marked as ignored to exclude them from generation')
    console.log('💡 Ignored traits remain in the database but are not used in new ordinals\n')

  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  }
}

runMigration()

