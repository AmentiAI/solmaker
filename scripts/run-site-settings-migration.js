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

  console.log('🚀 Running Site Settings Migration...')
  console.log('📡 Connecting to database...')

  const sql = neon(databaseUrl)

  try {
    const migrationPath = path.join(__dirname, 'migrations', '050_create_site_settings.sql')
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8')
    
    console.log('📄 Loaded migration file\n')

    // Split SQL into individual statements, handling multi-line statements
    const lines = migrationSQL.split('\n')
    let currentStatement = ''
    const statements = []
    
    for (const line of lines) {
      const trimmed = line.trim()
      
      // Skip empty lines and full-line comments
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
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i]
      const preview = statement.substring(0, 80).replace(/\n/g, ' ')
      
      try {
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
          console.error('Statement preview:', preview)
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

