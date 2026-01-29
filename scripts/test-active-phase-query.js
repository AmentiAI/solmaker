require('dotenv').config({ path: '.env.local' })
const { neon } = require('@neondatabase/serverless')

async function testActivePhase() {
  const databaseUrl = process.env.NEON_DATABASE || process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('❌ No database URL found')
    process.exit(1)
  }

  const sql = neon(databaseUrl)
  const collectionId = 'ddaa4e7c-0a00-4d07-ab41-06ee3991a2f8'

  try {
    // Test the exact query from poll endpoint
    const activePhaseResult = await sql`
      SELECT 
        mp.id,
        mp.phase_name,
        mp.start_time,
        mp.end_time,
        mp.is_active,
        mp.is_completed,
        mp.max_per_wallet
      FROM mint_phases mp
      WHERE mp.collection_id = ${collectionId}
        AND mp.is_completed = false
        AND mp.start_time <= NOW()
        AND (mp.end_time IS NULL OR mp.end_time > NOW())
      ORDER BY mp.phase_order ASC
      LIMIT 1
    `

    console.log('Active phase query result:')
    console.log(JSON.stringify(activePhaseResult, null, 2))

    if (activePhaseResult && activePhaseResult.length > 0) {
      const phase = activePhaseResult[0]
      console.log(`\n✅ Found active phase: ${phase.phase_name} (${phase.id})`)
      
      // Now test user mint count with this phase
      const walletAddr = 'bc1ptku2xtatqhntfctzachrmr8laq36s20wtrgnm66j39g0a3fwamlqxkryf2'
      const userMintsResult = await sql`
        SELECT COUNT(DISTINCT mi.id) as count
        FROM mint_inscriptions mi
        WHERE mi.minter_wallet = ${walletAddr}
          AND mi.collection_id = ${collectionId}
          AND mi.phase_id = ${phase.id}
          AND mi.commit_tx_id IS NOT NULL
          AND LENGTH(TRIM(mi.commit_tx_id)) > 0
          AND mi.is_test_mint = false
      `
      
      const count = parseInt(userMintsResult?.[0]?.count || '0', 10)
      console.log(`\nUser mint count for phase ${phase.phase_name}: ${count}`)
    } else {
      console.log('\n❌ No active phase found!')
    }

  } catch (error) {
    console.error('Error:', error)
  }
}

testActivePhase()

