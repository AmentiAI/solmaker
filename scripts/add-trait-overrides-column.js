const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

const DATABASE_URL = process.env.NEON_DATABASE || 
                     process.env.DATABASE_URL || 
                     'postgresql://neondb_owner:npg_Fuz8VsTtkwC5@ep-sparkling-cherry-adpxcdzr-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'

async function addTraitOverridesColumn() {
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
    
    console.log('📊 Adding trait_overrides column to generation_jobs table...\n')

    // Read the migration file
    const migrationPath = path.join(__dirname, 'migrations', '012_add_trait_overrides.sql')
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

    console.log('\n✅ Successfully added trait_overrides column!')
    console.log('\nℹ️  The column allows:')
    console.log('   - Filtered generation based on selected traits')
    console.log('   - Only randomize layers that have no filter applied')
    console.log('   - See which generations used trait filters\n')

  } catch (error) {
    console.error('❌ Error adding trait_overrides column:', error.message)
    console.error('Full error:', error)
    process.exit(1)
  } finally {
    await client.end()
  }
}

addTraitOverridesColumn()

