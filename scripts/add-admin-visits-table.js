const { neon } = require('@neondatabase/serverless')
const fs = require('fs')
const path = require('path')

const sql = neon(process.env.NEXT_PUBLIC_NEON_DATABASE || process.env.NEON_DATABASE || '')

async function runMigration() {
  try {
    const migrationSQL = fs.readFileSync(
      path.join(__dirname, 'migrations', '024_add_admin_visits_table.sql'),
      'utf8'
    )

    // Split by semicolons and execute each statement
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0)

    for (const statement of statements) {
      await sql(statement)
      console.log('Executed:', statement.substring(0, 50) + '...')
    }

    console.log('✅ Migration completed: admin_visits table created')
  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  }
}

runMigration()

