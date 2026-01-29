require('dotenv').config({ path: '.env.local' })
const { neon } = require('@neondatabase/serverless')

async function addPhaseIdColumn() {
  const databaseUrl = process.env.NEON_DATABASE || process.env.DATABASE_URL
  
  if (!databaseUrl) {
    console.error('❌ No database URL found')
    process.exit(1)
  }

  const sql = neon(databaseUrl)
  try {
    console.log('🚀 Adding phase_id column to mint_inscriptions...')
    
    await sql`
      ALTER TABLE mint_inscriptions 
      ADD COLUMN IF NOT EXISTS phase_id UUID REFERENCES mint_phases(id) ON DELETE SET NULL
    `
    console.log('✅ phase_id column added')
    
    console.log('🔧 Creating index...')
    await sql`
      CREATE INDEX IF NOT EXISTS idx_mint_inscriptions_phase 
      ON mint_inscriptions(phase_id)
    `
    console.log('✅ Index created')
    
    console.log('🔄 Backfilling phase_id from ordinal_reservations...')
    const result = await sql`
      UPDATE mint_inscriptions mi
      SET phase_id = r.phase_id
      FROM ordinal_reservations r
      WHERE mi.ordinal_id = r.ordinal_id
        AND mi.phase_id IS NULL
        AND r.phase_id IS NOT NULL
    `
    console.log(`✅ Backfilled ${result.count || 0} records`)
    
    console.log('✅ Migration complete!')
    process.exit(0)
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

addPhaseIdColumn()

