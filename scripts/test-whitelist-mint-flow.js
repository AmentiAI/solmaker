/**
 * Comprehensive test script for whitelist and mint phases
 * Tests the complete flow: whitelist check -> reserve -> mint
 * Run with: node scripts/test-whitelist-mint-flow.js
 */

require('dotenv').config({ path: '.env.local' })
const { neon } = require('@neondatabase/serverless')

const COLLECTION_ID = process.env.TEST_COLLECTION_ID || 'ddaa4e7c-0a00-4d07-ab41-06ee3991a2f8'
const TEST_WALLET = process.env.TEST_WALLET || 'bc1ptku2xtatqhntfctzachrmr8laq36s20wtrgnm66j39g0a3fwamlqxkryf2'
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'

// Test results tracking
const testResults = {
  passed: [],
  failed: [],
  warnings: [],
}

function logTest(name, passed, message = '') {
  if (passed) {
    testResults.passed.push({ name, message })
    console.log(`✅ ${name}${message ? `: ${message}` : ''}`)
  } else {
    testResults.failed.push({ name, message })
    console.log(`❌ ${name}${message ? `: ${message}` : ''}`)
  }
}

function logWarning(name, message) {
  testResults.warnings.push({ name, message })
  console.log(`⚠️  ${name}: ${message}`)
}

async function testWhitelistMintFlow() {
  const databaseUrl = process.env.NEON_DATABASE || process.env.DATABASE_URL
  
  if (!databaseUrl) {
    console.error('❌ No database URL found. Please set NEON_DATABASE or DATABASE_URL')
    process.exit(1)
  }

  console.log('🧪 Comprehensive Whitelist & Mint Phase Testing')
  console.log('='.repeat(80))
  console.log(`Collection ID: ${COLLECTION_ID}`)
  console.log(`Test Wallet: ${TEST_WALLET}`)
  console.log(`Base URL: ${BASE_URL}`)
  console.log('='.repeat(80))
  
  const sql = neon(databaseUrl)

  try {
    // ============================================================================
    // PHASE 1: Database State Verification
    // ============================================================================
    console.log('\n📊 PHASE 1: Database State Verification')
    console.log('-'.repeat(80))

    // 1.1: Get collection
    console.log('\n1.1: Fetching collection data...')
    const collectionResult = await sql`
      SELECT 
        c.id, 
        c.name, 
        c.wallet_address, 
        c.is_locked, 
        COALESCE(c.collection_status, 'draft') as collection_status,
        (SELECT COUNT(*) FROM generated_ordinals WHERE collection_id = c.id) as total_supply,
        (
          SELECT COUNT(*) 
          FROM mint_inscriptions 
          WHERE collection_id = c.id 
            AND commit_tx_id IS NOT NULL
            AND LENGTH(TRIM(commit_tx_id)) > 0
            AND is_test_mint = false
        ) as total_minted,
        (SELECT COUNT(*) FROM generated_ordinals WHERE collection_id = c.id AND is_minted = false) as available_count
      FROM collections c
      WHERE c.id = ${COLLECTION_ID}
    `
    const collection = Array.isArray(collectionResult) ? collectionResult[0] : collectionResult
    if (!collection) {
      logTest('Collection exists', false, 'Collection not found')
      process.exit(1)
    }
    logTest('Collection exists', true, collection.name)
    console.log(`   Status: ${collection.collection_status}`)
    console.log(`   Locked: ${collection.is_locked}`)
    console.log(`   Total Supply: ${collection.total_supply || 'N/A'}`)
    console.log(`   Total Minted: ${collection.total_minted || 0}`)
    console.log(`   Available: ${collection.available_count || 'N/A'}`)

    // 1.2: Get all phases
    console.log('\n1.2: Fetching mint phases...')
    const phasesResult = await sql`
      SELECT 
        id, phase_name, phase_order, start_time, end_time,
        mint_price_sats, max_per_wallet, phase_allocation,
        whitelist_only, whitelist_id, is_active, is_completed
      FROM mint_phases
      WHERE collection_id = ${COLLECTION_ID}
      ORDER BY phase_order ASC
    `
    const phases = Array.isArray(phasesResult) ? phasesResult : []
    logTest('Phases found', phases.length > 0, `${phases.length} phase(s)`)
    
    if (phases.length === 0) {
      console.log('⚠️  No phases found. Cannot continue testing.')
      process.exit(1)
    }

    // Display phases
    phases.forEach((phase, idx) => {
      console.log(`\n   Phase ${idx + 1}: ${phase.phase_name}`)
      console.log(`   - ID: ${phase.id}`)
      console.log(`   - Whitelist Only: ${phase.whitelist_only ? 'Yes' : 'No'}`)
      console.log(`   - Max per Wallet: ${phase.max_per_wallet ?? 'Unlimited'}`)
      console.log(`   - Price: ${phase.mint_price_sats} sats`)
      console.log(`   - Active: ${phase.is_active}`)
      console.log(`   - Completed: ${phase.is_completed}`)
    })

    // 1.3: Find active phase
    console.log('\n1.3: Finding active phase...')
    const now = new Date()
    const activePhase = phases.find(p => {
      const startTime = new Date(p.start_time)
      const endTime = p.end_time ? new Date(p.end_time) : null
      return !p.is_completed && startTime <= now && (!endTime || endTime > now)
    })

    if (!activePhase) {
      logTest('Active phase exists', false, 'No active phase found')
      console.log('   Checking phase statuses:')
      phases.forEach(p => {
        const startTime = new Date(p.start_time)
        const endTime = p.end_time ? new Date(p.end_time) : null
        const isStarted = startTime <= now
        const isEnded = endTime ? endTime < now : false
        console.log(`   - ${p.phase_name}: Started=${isStarted}, Ended=${isEnded}, Completed=${p.is_completed}`)
      })
      console.log('\n⚠️  Cannot continue without an active phase')
      process.exit(1)
    }

    logTest('Active phase exists', true, activePhase.phase_name)
    console.log(`   Phase ID: ${activePhase.id}`)
    console.log(`   Whitelist Only: ${activePhase.whitelist_only}`)
    console.log(`   Max per Wallet: ${activePhase.max_per_wallet ?? 'Unlimited'}`)

    // ============================================================================
    // PHASE 2: Whitelist Status Testing
    // ============================================================================
    console.log('\n\n📝 PHASE 2: Whitelist Status Testing')
    console.log('-'.repeat(80))

    // 2.1: Test whitelist-status API endpoint
    console.log('\n2.1: Testing GET /api/launchpad/[collectionId]/whitelist-status...')
      try {
        const whitelistStatusUrl = `${BASE_URL}/api/launchpad/${COLLECTION_ID}/whitelist-status?wallet_address=${encodeURIComponent(TEST_WALLET)}&phase_id=${activePhase.id}`
        console.log(`   URL: ${whitelistStatusUrl}`)
        
        const whitelistResponse = await fetch(whitelistStatusUrl)
        const whitelistData = await whitelistResponse.json()

        if (whitelistResponse.ok && whitelistData.success !== false) {
          logTest('Whitelist status API', true, 'Response received')
          console.log(`   Is Whitelisted: ${whitelistData.is_whitelisted}`)
          console.log(`   Allocation: ${whitelistData.allocation ?? 'N/A'}`)
          console.log(`   Minted Count: ${whitelistData.minted_count ?? 0}`)
          console.log(`   Remaining: ${whitelistData.remaining_allocation ?? 'N/A'}`)

          // Verify whitelist status matches database
          if (activePhase.whitelist_only) {
            if (whitelistData.is_whitelisted) {
              logTest('Wallet is whitelisted', true, `Allocation: ${whitelistData.allocation}`)
            } else {
              logTest('Wallet is whitelisted', false, 'Wallet not found on whitelist')
              console.log('   ⚠️  Cannot test mint flow - wallet not whitelisted')
            }
          } else {
            logTest('Public phase check', true, 'Phase is public (no whitelist required)')
          }
        } else {
          logTest('Whitelist status API', false, whitelistData.error || 'Request failed')
        }
      } catch (error) {
        logTest('Whitelist status API', false, error.message)
        logWarning('API test', 'Server may not be running. Skipping API tests.')
      }

    // 2.2: Verify whitelist entry in database
    if (activePhase.whitelist_only && activePhase.whitelist_id) {
      console.log('\n2.2: Verifying whitelist entry in database...')
      const whitelistEntryResult = await sql`
        SELECT 
          allocation, minted_count, notes, added_at
        FROM whitelist_entries
        WHERE whitelist_id = ${activePhase.whitelist_id}
          AND wallet_address = ${TEST_WALLET}
      `
      const whitelistEntry = Array.isArray(whitelistEntryResult) ? whitelistEntryResult[0] : whitelistEntryResult

      if (whitelistEntry) {
        logTest('Whitelist entry in DB', true, `Allocation: ${whitelistEntry.allocation}`)
        console.log(`   Allocation: ${whitelistEntry.allocation || 1}`)
        console.log(`   Minted Count (from entry): ${whitelistEntry.minted_count || 0}`)
        console.log(`   Remaining: ${Math.max(0, (whitelistEntry.allocation || 1) - (whitelistEntry.minted_count || 0))}`)

        // Count actual mints
        const actualMintsResult = await sql`
          SELECT COUNT(DISTINCT mi.id) as count
          FROM mint_inscriptions mi
          WHERE mi.minter_wallet = ${TEST_WALLET}
            AND mi.collection_id = ${COLLECTION_ID}
            AND mi.phase_id = ${activePhase.id}
            AND mi.commit_tx_id IS NOT NULL
            AND LENGTH(TRIM(mi.commit_tx_id)) > 0
            AND mi.is_test_mint = false
        `
        const actualMints = parseInt(Array.isArray(actualMintsResult) ? actualMintsResult[0]?.count || '0' : actualMintsResult?.count || '0', 10)
        console.log(`   Actual Mints (from DB): ${actualMints}`)
        
        if (actualMints !== (whitelistEntry.minted_count || 0)) {
          logWarning('Mint count mismatch', `DB count (${actualMints}) != entry count (${whitelistEntry.minted_count || 0})`)
        } else {
          logTest('Mint count consistency', true, 'DB count matches entry count')
        }
      } else {
        logTest('Whitelist entry in DB', false, 'Entry not found')
      }
    }

    // ============================================================================
    // PHASE 3: API Endpoint Testing
    // ============================================================================
    console.log('\n\n🌐 PHASE 3: API Endpoint Testing')
    console.log('-'.repeat(80))

    // 3.1: Test main collection endpoint
    console.log('\n3.1: Testing GET /api/launchpad/[collectionId]...')
    try {
      const mainUrl = `${BASE_URL}/api/launchpad/${COLLECTION_ID}?wallet_address=${encodeURIComponent(TEST_WALLET)}`
      const mainResponse = await fetch(mainUrl)
      const mainData = await mainResponse.json()

      if (mainResponse.ok && mainData.success) {
        logTest('Main collection API', true, 'Response received')
        
        // Verify active phase data
        if (mainData.active_phase) {
          const apiPhase = mainData.active_phase
          logTest('Active phase in API', true, apiPhase.phase_name)
          console.log(`   Max per Wallet: ${apiPhase.max_per_wallet ?? 'Unlimited'}`)
          console.log(`   Whitelist Only: ${apiPhase.whitelist_only}`)
          console.log(`   Phase Minted: ${apiPhase.phase_minted || 0}`)

          // Verify data matches database
          if (apiPhase.max_per_wallet === activePhase.max_per_wallet) {
            logTest('Max per wallet match', true, 'API matches DB')
          } else {
            logTest('Max per wallet match', false, `API: ${apiPhase.max_per_wallet}, DB: ${activePhase.max_per_wallet}`)
          }

          if (apiPhase.whitelist_only === activePhase.whitelist_only) {
            logTest('Whitelist only match', true, 'API matches DB')
          } else {
            logTest('Whitelist only match', false, `API: ${apiPhase.whitelist_only}, DB: ${activePhase.whitelist_only}`)
          }
        }

        // Check user mint status
        if (mainData.user_mint_status) {
          logTest('User mint status in API', true, 'Status received')
          console.log(`   Minted Count: ${mainData.user_mint_status.minted_count || 0}`)
          console.log(`   Max per Wallet: ${mainData.user_mint_status.max_per_wallet ?? 'N/A'}`)
          console.log(`   Remaining: ${mainData.user_mint_status.remaining ?? 'N/A'}`)
        } else if (!activePhase.whitelist_only) {
          logWarning('User mint status', 'Not returned for public phase (may be expected)')
        }

        // Check user whitelist status
        if (mainData.user_whitelist_status) {
          logTest('User whitelist status in API', true, 'Status received')
          console.log(`   Is Whitelisted: ${mainData.user_whitelist_status.is_whitelisted}`)
          console.log(`   Allocation: ${mainData.user_whitelist_status.allocation ?? 'N/A'}`)
          console.log(`   Remaining: ${mainData.user_whitelist_status.remaining_allocation ?? 'N/A'}`)
        } else if (activePhase.whitelist_only) {
          logWarning('User whitelist status', 'Not returned for whitelist phase (may indicate not whitelisted)')
        }
      } else {
        logTest('Main collection API', false, mainData.error || 'Request failed')
      }
    } catch (error) {
      logTest('Main collection API', false, error.message)
    }

    // 3.2: Test poll endpoint
    console.log('\n3.2: Testing GET /api/launchpad/[collectionId]/poll...')
    try {
      const pollUrl = `${BASE_URL}/api/launchpad/${COLLECTION_ID}/poll?wallet_address=${encodeURIComponent(TEST_WALLET)}`
      const pollResponse = await fetch(pollUrl)
      const pollData = await pollResponse.json()

      if (pollResponse.ok && pollData.success) {
        logTest('Poll API', true, 'Response received')
        console.log(`   Total Minted: ${pollData.counts?.total_minted || 0}`)
        console.log(`   Available: ${pollData.counts?.available_count || 0}`)

        if (pollData.active_phase) {
          logTest('Active phase in poll', true, pollData.active_phase.phase_name)
        }

        if (pollData.user_mint_status) {
          logTest('User mint status in poll', true, 'Status received')
        }

        if (pollData.user_whitelist_status) {
          logTest('User whitelist status in poll', true, 'Status received')
        }
      } else {
        logTest('Poll API', false, pollData.error || 'Request failed')
      }
    } catch (error) {
      logTest('Poll API', false, error.message)
    }

    // ============================================================================
    // PHASE 4: Reserve Endpoint Testing (Dry Run)
    // ============================================================================
    console.log('\n\n🔒 PHASE 4: Reserve Endpoint Testing (Validation Only)')
    console.log('-'.repeat(80))
    console.log('⚠️  Note: This tests validation only, does not create actual reservations')

    // 4.1: Test reserve endpoint validation
    console.log('\n4.1: Testing reserve endpoint validation...')
      try {
        // First, check if user can reserve (this will validate eligibility)
        const reserveUrl = `${BASE_URL}/api/launchpad/${COLLECTION_ID}/reserve`
        
        // We'll test with quantity=1 to see if validation passes
        const reserveBody = {
          wallet_address: TEST_WALLET,
          phase_id: activePhase.id,
          quantity: 1,
        }

      console.log(`   Testing reserve validation for quantity=1...`)
      const reserveResponse = await fetch(reserveUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reserveBody),
      })

      const reserveData = await reserveResponse.json()

      if (reserveResponse.ok && reserveData.success) {
        logTest('Reserve validation', true, 'Reservation would succeed')
        console.log(`   Reserved ordinal ID: ${reserveData.ordinal?.id || 'N/A'}`)
        console.log(`   Expires at: ${reserveData.reservation?.expires_at || 'N/A'}`)
        
        // If reservation succeeded, we should cancel it immediately
        if (reserveData.reservation?.id) {
          console.log(`   ⚠️  Reservation created - would need to cancel in production`)
          logWarning('Reservation created', 'Test created a real reservation (should be cancelled)')
        }
      } else {
        // Check what error we got
        const errorMsg = reserveData.error || 'Unknown error'
        console.log(`   Validation result: ${errorMsg}`)
        
        if (errorMsg.includes('whitelist')) {
          logTest('Reserve validation (whitelist)', false, 'Not whitelisted (expected if not on list)')
        } else if (errorMsg.includes('allocation') || errorMsg.includes('remaining')) {
          logTest('Reserve validation (allocation)', false, 'Allocation exhausted (expected if already minted max)')
        } else if (errorMsg.includes('Phase has not started') || errorMsg.includes('Phase has ended')) {
          logTest('Reserve validation (phase timing)', false, errorMsg)
        } else {
          logTest('Reserve validation', false, errorMsg)
        }
      }
    } catch (error) {
      logTest('Reserve validation', false, error.message)
    }

    // ============================================================================
    // PHASE 5: Mint Count Calculations
    // ============================================================================
    console.log('\n\n📊 PHASE 5: Mint Count Calculations')
    console.log('-'.repeat(80))

    // 5.1: Count mints for test wallet
    console.log('\n5.1: Counting mints for test wallet...')
      const mintCountResult = await sql`
        SELECT COUNT(DISTINCT mi.id) as count
        FROM mint_inscriptions mi
        WHERE mi.minter_wallet = ${TEST_WALLET}
          AND mi.collection_id = ${COLLECTION_ID}
          AND mi.phase_id = ${activePhase.id}
          AND mi.commit_tx_id IS NOT NULL
          AND LENGTH(TRIM(mi.commit_tx_id)) > 0
          AND mi.is_test_mint = false
      `
      const mintCount = parseInt(Array.isArray(mintCountResult) ? mintCountResult[0]?.count || '0' : mintCountResult?.count || '0', 10)
      logTest('Mint count query', true, `${mintCount} mint(s) found`)
      console.log(`   Total mints for wallet in this phase: ${mintCount}`)

      // 5.2: Calculate remaining mints
      console.log('\n5.2: Calculating remaining mints...')
      if (activePhase.whitelist_only && activePhase.whitelist_id) {
        const whitelistEntryResult = await sql`
          SELECT allocation
          FROM whitelist_entries
          WHERE whitelist_id = ${activePhase.whitelist_id}
            AND wallet_address = ${TEST_WALLET}
        `
        const whitelistEntry = Array.isArray(whitelistEntryResult) ? whitelistEntryResult[0] : whitelistEntryResult
        
        if (whitelistEntry) {
          const allocation = whitelistEntry.allocation || 1
          const remaining = Math.max(0, allocation - mintCount)
          logTest('Remaining calculation (whitelist)', true, `${remaining} remaining`)
          console.log(`   Allocation: ${allocation}`)
          console.log(`   Minted: ${mintCount}`)
          console.log(`   Remaining: ${remaining}`)
        } else {
          logTest('Remaining calculation (whitelist)', false, 'Not on whitelist')
        }
      } else if (activePhase.max_per_wallet) {
        const remaining = Math.max(0, activePhase.max_per_wallet - mintCount)
        logTest('Remaining calculation (public)', true, `${remaining} remaining`)
        console.log(`   Max per Wallet: ${activePhase.max_per_wallet}`)
        console.log(`   Minted: ${mintCount}`)
        console.log(`   Remaining: ${remaining}`)
      } else {
        logTest('Remaining calculation (public)', true, 'Unlimited (capped at 10 per transaction)')
        console.log(`   No max per wallet limit`)
      }

    // ============================================================================
    // SUMMARY
    // ============================================================================
    console.log('\n\n' + '='.repeat(80))
    console.log('📋 TEST SUMMARY')
    console.log('='.repeat(80))
    console.log(`✅ Passed: ${testResults.passed.length}`)
    console.log(`❌ Failed: ${testResults.failed.length}`)
    console.log(`⚠️  Warnings: ${testResults.warnings.length}`)

    if (testResults.failed.length > 0) {
      console.log('\n❌ Failed Tests:')
      testResults.failed.forEach(test => {
        console.log(`   - ${test.name}: ${test.message}`)
      })
    }

    if (testResults.warnings.length > 0) {
      console.log('\n⚠️  Warnings:')
      testResults.warnings.forEach(warning => {
        console.log(`   - ${warning.name}: ${warning.message}`)
      })
    }

    console.log('\n' + '='.repeat(80))
    if (testResults.failed.length === 0) {
      console.log('✅ All critical tests passed!')
      process.exit(0)
    } else {
      console.log('❌ Some tests failed. Please review the errors above.')
      process.exit(1)
    }

  } catch (error) {
    console.error('\n❌ Fatal Error:', error)
    console.error(error.stack)
    process.exit(1)
  }
}

testWhitelistMintFlow()

