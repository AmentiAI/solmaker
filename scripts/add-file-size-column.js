const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

const DATABASE_URL = process.env.NEON_DATABASE || 
                     process.env.DATABASE_URL || 
                     'postgresql://neondb_owner:npg_Fuz8VsTtkwC5@ep-sparkling-cherry-adpxcdzr-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'

async function addFileSizeColumn() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  })

  try {
    console.log('🔌 Connecting to Neon database...')
    await client.connect()
    console.log('✅ Connected successfully!')
    
    console.log('📊 Adding file_size_bytes column to generated_ordinals table...\n')

    // Read the migration file
    const migrationPath = path.join(__dirname, 'migrations', '011_add_file_size.sql')
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8')

    // Split by semicolons and execute each statement
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'))

    for (const statement of statements) {
      if (statement.toLowerCase().includes('comment on')) {
        // Skip COMMENT statements as they might not be supported
        console.log('⏭️  Skipping COMMENT statement')
        continue
      }
      
      console.log(`Executing: ${statement.substring(0, 80)}...`)
      await client.query(statement)
      console.log('✅ Success!')
    }

    console.log('\n✅ Successfully added file_size_bytes column!')
    console.log('\nℹ️  The column will be populated automatically when:')
    console.log('   - New ordinals are generated')
    console.log('   - Users select ordinals for minting (lazy loading)')
    console.log('   - The cost estimation API is called\n')

  } catch (error) {
    console.error('❌ Error adding file_size_bytes column:', error.message)
    console.error('Full error:', error)
    process.exit(1)
  } finally {
    await client.end()
  }
}

addFileSizeColumn()

