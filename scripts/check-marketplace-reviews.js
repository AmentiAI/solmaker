require('dotenv').config({ path: '.env.local' })
const { neon } = require('@neondatabase/serverless')

const databaseUrl = process.env.NEON_DATABASE || process.env.DATABASE_URL

if (!databaseUrl) {
  console.error('❌ No database URL found. Please set NEON_DATABASE or DATABASE_URL')
  process.exit(1)
}

const sql = neon(databaseUrl)

async function checkTable() {
  try {
    console.log('🔍 Checking if marketplace_reviews table exists...\n')
    
    // Check if table exists
    const tableCheck = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name = 'marketplace_reviews'
    `
    const tableExists = Array.isArray(tableCheck) && tableCheck.length > 0
    
    if (!tableExists) {
      console.log('❌ Table marketplace_reviews does NOT exist')
      process.exit(1)
    }
    
    console.log('✅ Table marketplace_reviews exists')
    
    // Check columns
    const columnsCheck = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'marketplace_reviews'
      ORDER BY ordinal_position
    `
    const columns = Array.isArray(columnsCheck) ? columnsCheck : []
    
    console.log(`\n📋 Found ${columns.length} columns:`)
    columns.forEach(col => {
      console.log(`   - ${col.column_name} (${col.data_type}, nullable: ${col.is_nullable === 'YES' ? 'YES' : 'NO'})`)
    })
    
    // Check indexes
    const indexesCheck = await sql`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = 'marketplace_reviews'
    `
    const indexes = Array.isArray(indexesCheck) ? indexesCheck : []
    
    console.log(`\n📊 Found ${indexes.length} indexes:`)
    indexes.forEach(idx => {
      console.log(`   - ${idx.indexname}`)
    })
    
    // Check constraints
    const constraintsCheck = await sql`
      SELECT constraint_name, constraint_type
      FROM information_schema.table_constraints
      WHERE table_name = 'marketplace_reviews'
    `
    const constraints = Array.isArray(constraintsCheck) ? constraintsCheck : []
    
    console.log(`\n🔒 Found ${constraints.length} constraints:`)
    constraints.forEach(con => {
      console.log(`   - ${con.constraint_name} (${con.constraint_type})`)
    })
    
    console.log('\n✅ All checks passed!')
    process.exit(0)
  } catch (error) {
    console.error('❌ Error checking table:', error.message)
    process.exit(1)
  }
}

checkTable()



