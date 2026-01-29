const { Client } = require('pg')

const DATABASE_URL = process.env.NEON_DATABASE || 
                     process.env.DATABASE_URL || 
                     'postgresql://neondb_owner:npg_Fuz8VsTtkwC5@ep-sparkling-cherry-adpxcdzr-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'

async function verifyColumn() {
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
    
    console.log('🔍 Checking if file_size_bytes column exists...\n')

    // Check if column exists
    const result = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'generated_ordinals'
        AND column_name = 'file_size_bytes'
    `)

    if (result.rows.length > 0) {
      console.log('✅ Column EXISTS!')
      console.log('   Column name:', result.rows[0].column_name)
      console.log('   Data type:', result.rows[0].data_type)
      console.log('   Nullable:', result.rows[0].is_nullable)
      console.log('\n✅ The column is properly configured!\n')
    } else {
      console.log('❌ Column DOES NOT EXIST!')
      console.log('\nTrying to add it now...\n')
      
      await client.query(`
        ALTER TABLE generated_ordinals
        ADD COLUMN IF NOT EXISTS file_size_bytes INTEGER
      `)
      
      console.log('✅ Column added successfully!')
      
      // Create index
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_ordinals_file_size 
        ON generated_ordinals(file_size_bytes)
      `)
      
      console.log('✅ Index created successfully!\n')
    }

    // Show all columns in the table
    console.log('📋 All columns in generated_ordinals table:')
    const allColumns = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'generated_ordinals'
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

verifyColumn()

