/**
 * Debug script to check user mint count
 * Usage: node scripts/debug-user-mint-count.js <walletAddress> [collectionId]
 * If collectionId is not provided, will find all collections with mints for this wallet
 */

require('dotenv').config({ path: '.env.local' })
const { neon } = require('@neondatabase/serverless')

async function debugMintCount() {
  const walletAddress = process.argv[2]
  const collectionId = process.argv[3]

  if (!walletAddress) {
    console.error('Usage: node scripts/debug-user-mint-count.js <walletAddress> [collectionId]')
    process.exit(1)
  }

  const databaseUrl = process.env.NEON_DATABASE || process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('❌ No database URL found')
    process.exit(1)
  }

  const sql = neon(databaseUrl)

  try {
    console.log(`\nChecking mints for wallet: ${walletAddress}\n`)

    // If no collection ID provided, find all collections with mints for this wallet
    let collectionsToCheck = []
    if (!collectionId) {
      const collectionsResult = await sql`
        SELECT DISTINCT mi.collection_id, c.name as collection_name, MAX(mi.created_at) as latest_mint
        FROM mint_inscriptions mi
        LEFT JOIN collections c ON mi.collection_id = c.id
        WHERE mi.minter_wallet = ${walletAddress}
        GROUP BY mi.collection_id, c.name
        ORDER BY latest_mint DESC
      `
      collectionsToCheck = collectionsResult
      
      if (collectionsToCheck.length === 0) {
        console.log('❌ No collections found with mints for this wallet')
        process.exit(0)
      }
      
      console.log(`Found ${collectionsToCheck.length} collection(s) with mints:\n`)
      collectionsToCheck.forEach((c, i) => {
        console.log(`  ${i + 1}. ${c.collection_name || c.collection_id} (${c.collection_id})`)
      })
      console.log('')
    } else {
      collectionsToCheck = [{ collection_id: collectionId, collection_name: null }]
    }

    for (const collection of collectionsToCheck) {
      const currentCollectionId = collection.collection_id
      console.log(`\n${'='.repeat(60)}`)
      console.log(`Collection: ${collection.collection_name || currentCollectionId}`)
      console.log(`Collection ID: ${currentCollectionId}`)
      console.log(`${'='.repeat(60)}\n`)

      // Get all mint_inscriptions for this user and collection
      const allMints = await sql`
        SELECT 
          mi.id,
          mi.ordinal_id,
          mi.commit_tx_id,
          mi.reveal_tx_id,
          mi.mint_status,
          mi.error_message,
          mi.error_code,
          mi.is_test_mint,
          mi.created_at,
          mi.phase_id,
          mp.phase_name
        FROM mint_inscriptions mi
        LEFT JOIN mint_phases mp ON mi.phase_id = mp.id
        WHERE mi.minter_wallet = ${walletAddress}
          AND mi.collection_id = ${currentCollectionId}
        ORDER BY mi.created_at DESC
      `

      console.log(`Total mint_inscriptions found: ${allMints.length}\n`)

      // Group by phase
      const byPhase = {}
      for (const mint of allMints) {
        const phaseName = mint.phase_name || 'Unknown'
        if (!byPhase[phaseName]) {
          byPhase[phaseName] = []
        }
        byPhase[phaseName].push(mint)
      }

      for (const [phaseName, mints] of Object.entries(byPhase)) {
        console.log(`\n=== Phase: ${phaseName} ===`)
        console.log(`Total mints in phase: ${mints.length}\n`)

        // Count with current logic (matches production code)
        // A mint counts if commit_tx_id exists (was broadcast), regardless of final status
        const currentCount = mints.filter(m => 
          m.commit_tx_id && 
          m.commit_tx_id.trim().length > 0 &&
          !m.is_test_mint
        ).length

        console.log(`Count with current logic: ${currentCount}`)
        console.log(`\nDetails:`)

        for (const mint of mints) {
          const hasCommit = mint.commit_tx_id && mint.commit_tx_id.trim().length > 0
          const isTest = mint.is_test_mint
          const isFailed = mint.mint_status === 'failed'
          // Count if commit exists (was broadcast), regardless of final status
          const wouldCount = hasCommit && !isTest

          console.log(`  ID: ${mint.id}`)
          console.log(`    Commit TX: ${mint.commit_tx_id || 'NULL'}`)
          console.log(`    Reveal TX: ${mint.reveal_tx_id || 'NULL'}`)
          console.log(`    Status: ${mint.mint_status || 'NULL'}`)
          console.log(`    Error: ${mint.error_message || 'None'}`)
          console.log(`    Error Code: ${mint.error_code || 'None'}`)
          console.log(`    Test Mint: ${isTest}`)
          console.log(`    Would Count: ${wouldCount ? '✅ YES' : '❌ NO'}`)
          if (!wouldCount) {
            if (!hasCommit) console.log(`      ❌ No commit_tx_id`)
            if (isTest) console.log(`      ❌ Is test mint`)
            if (isFailed) console.log(`      ❌ Status is 'failed'`)
          }
          console.log('')
        }
      }

      // Also check what calculatePublicPhaseRemaining would return
      const activePhase = await sql`
        SELECT id, phase_name, max_per_wallet
        FROM mint_phases
        WHERE collection_id = ${currentCollectionId}
          AND is_active = true
        LIMIT 1
      `

      if (activePhase.length > 0) {
        const phase = activePhase[0]
        console.log(`\n=== Active Phase: ${phase.phase_name} ===`)
        
        const mintCountResult = await sql`
          SELECT COUNT(DISTINCT mi.id) as count
          FROM mint_inscriptions mi
          WHERE mi.minter_wallet = ${walletAddress}
            AND mi.collection_id = ${currentCollectionId}
            AND mi.phase_id = ${phase.id}
            AND mi.commit_tx_id IS NOT NULL
            AND LENGTH(TRIM(mi.commit_tx_id)) > 0
            AND mi.is_test_mint = false
        `

        const count = parseInt(mintCountResult?.[0]?.count || '0', 10)
        console.log(`calculatePublicPhaseRemaining would return: ${count}`)
        console.log(`Max per wallet: ${phase.max_per_wallet || 'Unlimited'}`)
      } else {
        console.log(`\n⚠️  No active phase found for this collection`)
      }
    }

  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  } finally {
    process.exit(0)
  }
}

debugMintCount()

