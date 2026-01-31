#!/usr/bin/env node

const { neon } = require('@neondatabase/serverless')

async function verify() {
  const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL required')
    process.exit(1)
  }

  const sql = neon(databaseUrl)

  try {
    const columns = await sql`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'collections' 
      AND column_name = 'mint_type'
    `

    if (columns.length > 0) {
      const col = columns[0]
      console.log('✅ mint_type column exists in collections table:')
      console.log(`   Type: ${col.data_type}`)
      console.log(`   Default: ${col.column_default}`)
      console.log(`   Nullable: ${col.is_nullable}`)
    } else {
      console.log('❌ mint_type column not found')
    }
  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
}

verify()
