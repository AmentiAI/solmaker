require('dotenv').config({ path: '.env.local' })
const { neon } = require('@neondatabase/serverless')

async function checkColumn() {
  const databaseUrl = process.env.NEON_DATABASE || process.env.DATABASE_URL

  if (!databaseUrl) {
    console.error('❌ No database URL found')
    process.exit(1)
  }

  const sql = neon(databaseUrl)

  try {
    // Check if column exists
    const result = await sql`
      SELECT column_name, data_type, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'collections' 
        AND column_name = 'mint_type'
    `
    
    console.log('Column check result:', JSON.stringify(result, null, 2))
    
    if (result && result.length > 0) {
      console.log('✅ Column exists!')
      console.log('Details:', result[0])
    } else {
      console.log('❌ Column does NOT exist')
      console.log('Running migration again...')
      
      // Try to add it directly
      await sql`ALTER TABLE collections ADD COLUMN IF NOT EXISTS mint_type VARCHAR(20) DEFAULT 'hidden'`
      console.log('✅ Column added directly')
    }
  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
}

checkColumn()

