import dotenv from 'dotenv'
import { neon } from '@neondatabase/serverless'

dotenv.config({ path: '.env.local' })

const databaseUrl =
  process.env.NEON_DATABASE ||
  process.env.DATABASE_URL ||
  process.env.NEXT_PUBLIC_NEON_DATABASE ||
  ''

if (!databaseUrl) {
  console.error('❌ No database connection string found. Please set NEON_DATABASE in .env.local')
  process.exit(1)
}

const sql = neon(databaseUrl)

async function addColumn() {
  try {
    console.log('🔧 Ensuring collections.trait_selections column exists...')

    await sql`
      ALTER TABLE collections
      ADD COLUMN IF NOT EXISTS trait_selections JSONB DEFAULT '{}'::jsonb
    `

    await sql`
      UPDATE collections
      SET trait_selections = COALESCE(trait_selections, '{}'::jsonb)
    `

    await sql`
      ALTER TABLE collections
      ALTER COLUMN trait_selections SET DEFAULT '{}'::jsonb
    `

    console.log('✅ trait_selections column is ready.')
  } catch (error) {
    console.error('❌ Failed to ensure trait_selections column:', error)
    process.exit(1)
  }
}

addColumn()






