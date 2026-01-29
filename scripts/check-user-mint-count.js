require('dotenv').config({ path: '.env.local' })
const { neon } = require('@neondatabase/serverless')

async function checkMintCount() {
  const databaseUrl = process.env.NEON_DATABASE || process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('❌ No database URL found')
    process.exit(1)
  }

  const sql = neon(databaseUrl)
  const collectionId = 'ddaa4e7c-0a00-4d07-ab41-06ee3991a2f8'

  try {
    // Get all unique wallet addresses that have mints
    const wallets = await sql`
      SELECT DISTINCT minter_wallet
      FROM mint_inscriptions
      WHERE collection_id = ${collectionId}
        AND commit_tx_id IS NOT NULL
        AND is_test_mint = false
      ORDER BY minter_wallet
    `

    console.log(`Found ${wallets.length} unique wallets with mints:\n`)

    // Get active phase
    const activePhase = await sql`
      SELECT id, phase_name
      FROM mint_phases
      WHERE collection_id = ${collectionId}
        AND is_active = true
      ORDER BY phase_order ASC
      LIMIT 1
    `

    if (!activePhase || activePhase.length === 0) {
      console.log('❌ No active phase found')
      return
    }

    const phase = activePhase[0]
    console.log(`Active Phase: ${phase.phase_name} (${phase.id})\n`)

    for (const wallet of wallets) {
      const walletAddr = wallet.minter_wallet
      
      // Count using the exact query from poll endpoint
      const countResult = await sql`
        SELECT COUNT(DISTINCT mi.id) as count
        FROM mint_inscriptions mi
        WHERE mi.minter_wallet = ${walletAddr}
          AND mi.collection_id = ${collectionId}
          AND mi.phase_id = ${phase.id}
          AND mi.commit_tx_id IS NOT NULL
          AND LENGTH(TRIM(mi.commit_tx_id)) > 0
          AND mi.is_test_mint = false
      `

      const count = parseInt(countResult?.[0]?.count || '0', 10)

      // Also get all mints for this wallet to see what's happening
      const allMints = await sql`
        SELECT 
          mi.id,
          mi.phase_id,
          mi.commit_tx_id,
          mi.mint_status,
          CASE WHEN mi.phase_id = ${phase.id} THEN 'MATCHES' ELSE 'NO MATCH' END as phase_match
        FROM mint_inscriptions mi
        WHERE mi.minter_wallet = ${walletAddr}
          AND mi.collection_id = ${collectionId}
          AND mi.commit_tx_id IS NOT NULL
          AND mi.is_test_mint = false
        ORDER BY mi.created_at DESC
      `

      console.log(`Wallet: ${walletAddr.slice(0, 20)}...`)
      console.log(`  Count for phase ${phase.phase_name}: ${count}`)
      console.log(`  Total mints: ${allMints.length}`)
      allMints.forEach(m => {
        console.log(`    - ${m.id.slice(0, 8)}... phase=${m.phase_id?.slice(0, 8)}... ${m.phase_match} status=${m.mint_status}`)
      })
      console.log('')
    }

  } catch (error) {
    console.error('Error:', error)
  }
}

checkMintCount()

