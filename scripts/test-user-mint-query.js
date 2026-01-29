require('dotenv').config({ path: '.env.local' })
const { neon } = require('@neondatabase/serverless')

async function testQuery() {
  const databaseUrl = process.env.NEON_DATABASE || process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('❌ No database URL found')
    process.exit(1)
  }

  const sql = neon(databaseUrl)
  const collectionId = 'ddaa4e7c-0a00-4d07-ab41-06ee3991a2f8'
  const phaseId = '58091b87-f5e3-4b80-aee8-2b0bea24102d'

  try {
    // Get all wallets that have mints for this phase
    const wallets = await sql`
      SELECT DISTINCT minter_wallet
      FROM mint_inscriptions
      WHERE collection_id = ${collectionId}
        AND phase_id = ${phaseId}
        AND commit_tx_id IS NOT NULL
        AND is_test_mint = false
    `

    console.log(`Found ${wallets.length} unique wallets with mints for phase B2:\n`)

    for (const wallet of wallets) {
      const walletAddr = wallet.minter_wallet
      
      // Test the exact query from poll endpoint
      const result = await sql`
        SELECT COUNT(DISTINCT mi.id) as count
        FROM mint_inscriptions mi
        WHERE mi.minter_wallet = ${walletAddr}
          AND mi.collection_id = ${collectionId}
          AND mi.phase_id = ${phaseId}
          AND mi.commit_tx_id IS NOT NULL
          AND LENGTH(TRIM(mi.commit_tx_id)) > 0
          AND mi.is_test_mint = false
      `

      const count = parseInt(result?.[0]?.count || '0', 10)
      
      // Also check what mints exist
      const mints = await sql`
        SELECT 
          mi.id,
          mi.phase_id,
          mi.commit_tx_id,
          mi.mint_status,
          mi.minter_wallet = ${walletAddr} as wallet_matches,
          mi.collection_id = ${collectionId}::uuid as collection_matches,
          mi.phase_id = ${phaseId}::uuid as phase_matches
        FROM mint_inscriptions mi
        WHERE mi.minter_wallet = ${walletAddr}
          AND mi.collection_id = ${collectionId}
          AND mi.commit_tx_id IS NOT NULL
          AND mi.is_test_mint = false
      `

      console.log(`Wallet: ${walletAddr}`)
      console.log(`  Query result: ${count} mints`)
      console.log(`  Total mints for this wallet: ${mints.length}`)
      mints.forEach(m => {
        console.log(`    - ${m.id.slice(0, 8)}... phase=${m.phase_id}, matches: wallet=${m.wallet_matches}, collection=${m.collection_matches}, phase=${m.phase_matches}`)
      })
      console.log('')
    }

  } catch (error) {
    console.error('Error:', error)
  }
}

testQuery()

