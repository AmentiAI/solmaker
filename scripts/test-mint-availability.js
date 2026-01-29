/**
 * Test script to verify mint availability calculations for a collection
 * Run with: node scripts/test-mint-availability.js
 */

require('dotenv').config({ path: '.env.local' })
const { neon } = require('@neondatabase/serverless')

const COLLECTION_ID = 'ddaa4e7c-0a00-4d07-ab41-06ee3991a2f8'
const TEST_WALLET = process.env.TEST_WALLET || 'bc1qtest123...' // Replace with actual test wallet

async function testMintAvailability() {
  const databaseUrl = process.env.NEON_DATABASE || process.env.DATABASE_URL
  
  if (!databaseUrl) {
    console.error('❌ No database URL found. Please set NEON_DATABASE or DATABASE_URL')
    process.exit(1)
  }

  console.log('🧪 Testing Mint Availability for Collection:', COLLECTION_ID)
  console.log('=' .repeat(80))
  
  const sql = neon(databaseUrl)

  try {
    // 1. Get collection data
    console.log('\n📦 Step 1: Fetching collection data...')
    const collectionResult = await sql`
      SELECT 
        id,
        name,
        wallet_address,
        is_locked,
        collection_status
      FROM collections
      WHERE id = ${COLLECTION_ID}
    `
    
    const collection = Array.isArray(collectionResult) ? collectionResult[0] : collectionResult
    if (!collection) {
      console.error('❌ Collection not found!')
      process.exit(1)
    }
    
    // Calculate total supply and minted
    const totalSupplyResult = await sql`
      SELECT COUNT(*) as count
      FROM generated_ordinals
      WHERE collection_id = ${COLLECTION_ID}
    `
    const totalSupply = parseInt(Array.isArray(totalSupplyResult) ? totalSupplyResult[0]?.count || '0' : totalSupplyResult?.count || '0', 10)
    
    const totalMintedResult = await sql`
      SELECT COUNT(*) as count
      FROM mint_inscriptions
      WHERE collection_id = ${COLLECTION_ID}
        AND commit_tx_id IS NOT NULL
        AND LENGTH(TRIM(commit_tx_id)) > 0
        AND is_test_mint = false
    `
    const totalMinted = parseInt(Array.isArray(totalMintedResult) ? totalMintedResult[0]?.count || '0' : totalMintedResult?.count || '0', 10)
    
    console.log('✅ Collection found:')
    console.log(`   Name: ${collection.name}`)
    console.log(`   Owner: ${collection.wallet_address}`)
    console.log(`   Total Supply: ${totalSupply}`)
    console.log(`   Total Minted: ${totalMinted}`)
    console.log(`   Available: ${totalSupply - totalMinted}`)
    console.log(`   Status: ${collection.collection_status}`)
    console.log(`   Locked: ${collection.is_locked}`)

    // 2. Get all phases
    console.log('\n📋 Step 2: Fetching mint phases...')
    const phasesResult = await sql`
      SELECT 
        id,
        phase_name,
        phase_order,
        start_time,
        end_time,
        mint_price_sats,
        max_per_wallet,
        max_per_transaction,
        phase_allocation,
        whitelist_only,
        whitelist_id,
        is_active,
        is_completed
      FROM mint_phases
      WHERE collection_id = ${COLLECTION_ID}
      ORDER BY phase_order ASC
    `
    
    const phases = Array.isArray(phasesResult) ? phasesResult : []
    console.log(`✅ Found ${phases.length} phase(s):`)
    phases.forEach((phase, idx) => {
      console.log(`\n   Phase ${idx + 1}: ${phase.phase_name}`)
      console.log(`   - ID: ${phase.id}`)
      console.log(`   - Order: ${phase.phase_order}`)
      console.log(`   - Start: ${phase.start_time}`)
      console.log(`   - End: ${phase.end_time || 'No end time'}`)
      console.log(`   - Price: ${phase.mint_price_sats} sats`)
      console.log(`   - Max per Wallet: ${phase.max_per_wallet ?? 'Unlimited'}`)
      console.log(`   - Max per Transaction: ${phase.max_per_transaction ?? 'N/A'}`)
      console.log(`   - Phase Allocation: ${phase.phase_allocation ?? 'Unlimited'}`)
      console.log(`   - Whitelist Only: ${phase.whitelist_only ? 'Yes' : 'No'}`)
      console.log(`   - Whitelist ID: ${phase.whitelist_id || 'None'}`)
      console.log(`   - Is Active: ${phase.is_active}`)
      console.log(`   - Is Completed: ${phase.is_completed}`)
    })

    // 3. Find active phase
    console.log('\n🔍 Step 3: Finding active phase...')
    const now = new Date()
    const activePhase = phases.find(p => {
      const startTime = new Date(p.start_time)
      const endTime = p.end_time ? new Date(p.end_time) : null
      return !p.is_completed && startTime <= now && (!endTime || endTime > now)
    })
    
    if (!activePhase) {
      console.log('⚠️  No active phase found')
      console.log('   Checking all phases:')
      phases.forEach(p => {
        const startTime = new Date(p.start_time)
        const endTime = p.end_time ? new Date(p.end_time) : null
        const isStarted = startTime <= now
        const isEnded = endTime ? endTime < now : false
        console.log(`   - ${p.phase_name}: Started=${isStarted}, Ended=${isEnded}, Completed=${p.is_completed}`)
      })
    } else {
      console.log(`✅ Active phase: ${activePhase.phase_name}`)
      console.log(`   Max per Wallet: ${activePhase.max_per_wallet ?? 'Unlimited'}`)
    }

    // 4. Calculate phase_minted for each phase
    console.log('\n📊 Step 4: Calculating phase minted counts...')
    for (const phase of phases) {
      const phaseMintedResult = await sql`
        SELECT COUNT(*) as count
        FROM mint_inscriptions
        WHERE phase_id = ${phase.id}
          AND is_test_mint = false
          AND (
            reveal_tx_id IS NOT NULL 
            OR reveal_broadcast_at IS NOT NULL
            OR mint_status IN ('reveal_broadcast', 'reveal_confirming', 'completed')
          )
      `
      
      const phaseMinted = parseInt(Array.isArray(phaseMintedResult) ? phaseMintedResult[0]?.count || '0' : phaseMintedResult?.count || '0', 10)
      console.log(`   ${phase.phase_name}: ${phaseMinted} minted`)
    }

    // 5. Test with a wallet address (if provided)
    if (TEST_WALLET && TEST_WALLET !== 'bc1qtest123...') {
      console.log('\n👤 Step 5: Testing wallet mint status...')
      console.log(`   Wallet: ${TEST_WALLET}`)
      
      if (activePhase) {
        if (activePhase.whitelist_only && activePhase.whitelist_id) {
          // Check whitelist status
          console.log('\n   📝 Whitelist Phase:')
          const whitelistEntry = await sql`
            SELECT 
              allocation,
              minted_count,
              notes
            FROM whitelist_entries
            WHERE whitelist_id = ${activePhase.whitelist_id}
            AND wallet_address = ${TEST_WALLET}
          `
          
          const entries = Array.isArray(whitelistEntry) ? whitelistEntry : []
          if (entries.length > 0) {
            const entry = entries[0]
            console.log(`   ✅ On whitelist`)
            console.log(`      Allocation: ${entry.allocation}`)
            console.log(`      Minted Count (from entry): ${entry.minted_count || 0}`)
            
            // Count actual mints
            const actualMints = await sql`
              SELECT COUNT(DISTINCT mi.id) as count
              FROM mint_inscriptions mi
              WHERE mi.minter_wallet = ${TEST_WALLET}
                AND mi.collection_id = ${COLLECTION_ID}
                AND mi.phase_id = ${activePhase.id}
                AND mi.commit_tx_id IS NOT NULL
                AND LENGTH(TRIM(mi.commit_tx_id)) > 0
                AND mi.is_test_mint = false
            `
            
            const actualMintCount = parseInt(Array.isArray(actualMints) ? actualMints[0]?.count || '0' : actualMints?.count || '0', 10)
            console.log(`      Actual Mints (from DB): ${actualMintCount}`)
            console.log(`      Remaining: ${Math.max(0, entry.allocation - actualMintCount)}`)
          } else {
            console.log(`   ❌ Not on whitelist`)
          }
        } else {
          // Public phase
          console.log('\n   🌐 Public Phase:')
          console.log(`      Max per Wallet: ${activePhase.max_per_wallet ?? 'Unlimited'}`)
          
          // Count actual mints
          const actualMints = await sql`
            SELECT COUNT(DISTINCT mi.id) as count
            FROM mint_inscriptions mi
            WHERE mi.minter_wallet = ${TEST_WALLET}
              AND mi.collection_id = ${COLLECTION_ID}
              AND mi.phase_id = ${activePhase.id}
              AND mi.commit_tx_id IS NOT NULL
              AND LENGTH(TRIM(mi.commit_tx_id)) > 0
              AND mi.is_test_mint = false
          `
          
          const actualMintCount = parseInt(Array.isArray(actualMints) ? actualMints[0]?.count || '0' : actualMints?.count || '0', 10)
          console.log(`      Actual Mints: ${actualMintCount}`)
          
          if (activePhase.max_per_wallet) {
            const remaining = Math.max(0, activePhase.max_per_wallet - actualMintCount)
            console.log(`      Remaining: ${remaining}`)
            console.log(`      Calculation: ${activePhase.max_per_wallet} - ${actualMintCount} = ${remaining}`)
          } else {
            console.log(`      Remaining: Unlimited (capped at 10 per transaction)`)
          }
        }
      }
    }

    // 6. Test API endpoints
    console.log('\n🌐 Step 6: Testing API endpoints...')
    
    // Test main collection endpoint
    console.log('\n   Testing GET /api/launchpad/[collectionId]...')
    try {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
      const apiUrl = `${baseUrl}/api/launchpad/${COLLECTION_ID}`
      console.log(`   URL: ${apiUrl}`)
      
      const response = await fetch(apiUrl)
      if (response.ok) {
        const data = await response.json()
        console.log('   ✅ API Response received')
        if (data.collection) {
          console.log(`      Collection: ${data.collection.name}`)
          console.log(`      Total Minted: ${data.collection.total_minted}`)
          if (data.phases) {
            const apiActivePhase = data.phases.find((p) => p.is_active)
            if (apiActivePhase) {
              console.log(`      Active Phase: ${apiActivePhase.phase_name}`)
              console.log(`      Max per Wallet (from API): ${apiActivePhase.max_per_wallet ?? 'Unlimited'}`)
              console.log(`      Phase Minted: ${apiActivePhase.phase_minted || 0}`)
            }
          }
        }
      } else {
        console.log(`   ⚠️  API returned status: ${response.status}`)
      }
    } catch (error) {
      console.log(`   ⚠️  Could not test API (server may not be running): ${error.message}`)
    }

    // Test poll endpoint
    if (TEST_WALLET && TEST_WALLET !== 'bc1qtest123...') {
      console.log('\n   Testing GET /api/launchpad/[collectionId]/poll...')
      try {
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
        const pollUrl = `${baseUrl}/api/launchpad/${COLLECTION_ID}/poll?wallet_address=${encodeURIComponent(TEST_WALLET)}`
        console.log(`   URL: ${pollUrl}`)
        
        const response = await fetch(pollUrl)
        if (response.ok) {
          const data = await response.json()
          console.log('   ✅ Poll API Response received')
          if (data.active_phase) {
            console.log(`      Active Phase: ${data.active_phase.phase_name}`)
            console.log(`      Max per Wallet (from poll): ${data.active_phase.max_per_wallet ?? 'Unlimited'}`)
          }
          if (data.user_mint_status) {
            console.log(`      User Mint Status:`)
            console.log(`         Minted Count: ${data.user_mint_status.minted_count || 0}`)
            console.log(`         Max per Wallet: ${data.user_mint_status.max_per_wallet ?? 'N/A'}`)
            console.log(`         Remaining: ${data.user_mint_status.remaining ?? 'N/A'}`)
          }
        } else {
          console.log(`   ⚠️  Poll API returned status: ${response.status}`)
        }
      } catch (error) {
        console.log(`   ⚠️  Could not test Poll API (server may not be running): ${error.message}`)
      }
    }

    console.log('\n' + '=' .repeat(80))
    console.log('✅ Test completed!')
    console.log('\n📝 Summary:')
    console.log(`   Collection: ${collection.name}`)
    console.log(`   Total Minted: ${collection.total_minted} / ${collection.total_supply}`)
    if (activePhase) {
      console.log(`   Active Phase: ${activePhase.phase_name}`)
      console.log(`   Max per Wallet: ${activePhase.max_per_wallet ?? 'Unlimited'}`)
    } else {
      console.log(`   Active Phase: None`)
    }

  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

testMintAvailability()

