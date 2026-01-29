const { Client } = require('pg')

const DATABASE_URL = process.env.NEON_DATABASE || 
                     process.env.DATABASE_URL || 
                     'postgresql://neondb_owner:npg_Fuz8VsTtkwC5@ep-sparkling-cherry-adpxcdzr-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'

async function verifyAndAddColumn() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  })

  try {
    console.log('🔌 Connecting to Neon database...')
    await client.connect()
    console.log('✅ Connected!\n')
    
    console.log('🔍 Checking if trait_overrides column exists...\n')

    // Check if column exists
    const result = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'generation_jobs'
        AND column_name = 'trait_overrides'
    `)

    if (result.rows.length > 0) {
      console.log('✅ Column EXISTS!')
      console.log('   Column name:', result.rows[0].column_name)
      console.log('   Data type:', result.rows[0].data_type)
      console.log('   Nullable:', result.rows[0].is_nullable)
      console.log('\n✅ The column is properly configured!\n')
    } else {
      console.log('❌ Column DOES NOT EXIST!')
      console.log('\nAdding it now...\n')
      
      await client.query(`
        ALTER TABLE generation_jobs
        ADD COLUMN IF NOT EXISTS trait_overrides JSONB DEFAULT NULL
      `)
      
      console.log('✅ Column added successfully!')
      
      // Create index
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_generation_jobs_trait_overrides 
        ON generation_jobs(trait_overrides) 
        WHERE trait_overrides IS NOT NULL
      `)
      
      console.log('✅ Index created successfully!\n')
    }

    // Show all columns in the table
    console.log('📋 All columns in generation_jobs table:')
    const allColumns = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'generation_jobs'
      ORDER BY ordinal_position
    `)
    
    allColumns.rows.forEach(col => {
      console.log(`   - ${col.column_name} (${col.data_type})`)
    })
    console.log()

  } catch (error) {
    console.error('❌ Error:', error.message)
    console.error('Full error:', error)
    process.exit(1)
  } finally {
    await client.end()
  }
}

verifyAndAddColumn()

