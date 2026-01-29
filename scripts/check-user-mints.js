require('dotenv').config({ path: '.env.local' })
const { neon } = require('@neondatabase/serverless')

async function checkMints() {
  const databaseUrl = process.env.NEON_DATABASE || process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('❌ No database URL found')
    process.exit(1)
  }

  const sql = neon(databaseUrl)
  const collectionId = 'ddaa4e7c-0a00-4d07-ab41-06ee3991a2f8'

  try {
    // Get all mints for this collection
    const mints = await sql`
      SELECT 
        mi.id,
        mi.minter_wallet,
        mi.phase_id,
        mi.commit_tx_id,
        mi.mint_status,
        mi.created_at,
        mp.id as phase_id_from_phases,
        mp.phase_name,
        r.phase_id as reservation_phase_id
      FROM mint_inscriptions mi
      LEFT JOIN mint_phases mp ON mi.phase_id = mp.id
      LEFT JOIN ordinal_reservations r ON mi.ordinal_id = r.ordinal_id AND r.status = 'completed'
      WHERE mi.collection_id = ${collectionId}
        AND mi.commit_tx_id IS NOT NULL
        AND mi.is_test_mint = false
      ORDER BY mi.created_at DESC
      LIMIT 20
    `

    console.log(`Found ${mints.length} mints for collection ${collectionId}:\n`)
    mints.forEach((m, i) => {
      console.log(`${i + 1}. Mint ${m.id.slice(0, 8)}...`)
      console.log(`   Wallet: ${m.minter_wallet?.slice(0, 12)}...`)
      console.log(`   Phase ID in mint_inscriptions: ${m.phase_id || 'NULL'}`)
      console.log(`   Phase from phases table: ${m.phase_id_from_phases || 'NULL'} (${m.phase_name || 'N/A'})`)
      console.log(`   Phase from reservation: ${m.reservation_phase_id || 'NULL'}`)
      console.log(`   Status: ${m.mint_status}`)
      console.log(`   Commit TX: ${m.commit_tx_id?.slice(0, 16)}...`)
      console.log('')
    })

    // Get active phase
    const activePhase = await sql`
      SELECT id, phase_name, phase_order
      FROM mint_phases
      WHERE collection_id = ${collectionId}
        AND is_active = true
      ORDER BY phase_order ASC
      LIMIT 1
    `

    if (activePhase && activePhase.length > 0) {
      const phase = activePhase[0]
      console.log(`\nActive Phase: ${phase.phase_name} (${phase.id})`)
      
      // Check mints without phase_id
      const mintsWithoutPhase = mints.filter(m => !m.phase_id)
      if (mintsWithoutPhase.length > 0) {
        console.log(`\n⚠️  Found ${mintsWithoutPhase.length} mints without phase_id`)
        console.log('These need to be backfilled from reservations or matched by time window')
      }
    }

  } catch (error) {
    console.error('Error:', error)
  }
}

checkMints()

