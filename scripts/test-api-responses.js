/**
 * Test script to verify API responses match database data
 * Run with: node scripts/test-api-responses.js
 */

require('dotenv').config({ path: '.env.local' })

const COLLECTION_ID = 'ddaa4e7c-0a00-4d07-ab41-06ee3991a2f8'
const TEST_WALLET = process.env.TEST_WALLET || null

async function testAPIResponses() {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
  
  console.log('🧪 Testing API Responses for Collection:', COLLECTION_ID)
  console.log('=' .repeat(80))
  console.log(`🌐 Base URL: ${baseUrl}\n`)

  try {
    // Test 1: Main collection endpoint
    console.log('📡 Test 1: GET /api/launchpad/[collectionId]')
    console.log('-'.repeat(80))
    const mainUrl = `${baseUrl}/api/launchpad/${COLLECTION_ID}`
    console.log(`URL: ${mainUrl}\n`)
    
    const mainResponse = await fetch(mainUrl)
    const mainData = await mainResponse.json()
    
    if (mainResponse.ok && mainData.success) {
      console.log('✅ Response OK')
      console.log('\nCollection Data:')
      console.log(JSON.stringify({
        name: mainData.collection?.name,
        total_supply: mainData.collection?.total_supply,
        total_minted: mainData.collection?.total_minted,
        available_count: mainData.collection?.available_count,
        collection_status: mainData.collection?.collection_status,
      }, null, 2))
      
      if (mainData.phases && mainData.phases.length > 0) {
        console.log('\nPhases:')
        mainData.phases.forEach((phase, idx) => {
          console.log(`\n  Phase ${idx + 1}: ${phase.phase_name}`)
          console.log(JSON.stringify({
            id: phase.id,
            is_active: phase.is_active,
            max_per_wallet: phase.max_per_wallet,
            phase_minted: phase.phase_minted,
            phase_allocation: phase.phase_allocation,
            whitelist_only: phase.whitelist_only,
            mint_price_sats: phase.mint_price_sats,
          }, null, 2))
        })
        
        const activePhase = mainData.phases.find((p) => p.is_active)
        if (activePhase) {
          console.log('\n🎯 Active Phase:')
          console.log(JSON.stringify({
            name: activePhase.phase_name,
            max_per_wallet: activePhase.max_per_wallet,
            phase_minted: activePhase.phase_minted,
            phase_allocation: activePhase.phase_allocation,
            whitelist_only: activePhase.whitelist_only,
          }, null, 2))
        }
      }
      
      if (mainData.active_phase) {
        console.log('\n📊 Active Phase (from active_phase field):')
        console.log(JSON.stringify({
          name: mainData.active_phase.phase_name,
          max_per_wallet: mainData.active_phase.max_per_wallet,
          phase_minted: mainData.active_phase.phase_minted,
          phase_allocation: mainData.active_phase.phase_allocation,
          whitelist_only: mainData.active_phase.whitelist_only,
        }, null, 2))
      }
    } else {
      console.log('❌ Response failed:', mainData.error || mainResponse.statusText)
    }

    // Test 2: Poll endpoint (without wallet)
    console.log('\n\n📡 Test 2: GET /api/launchpad/[collectionId]/poll (no wallet)')
    console.log('-'.repeat(80))
    const pollUrl = `${baseUrl}/api/launchpad/${COLLECTION_ID}/poll`
    console.log(`URL: ${pollUrl}\n`)
    
    const pollResponse = await fetch(pollUrl)
    const pollData = await pollResponse.json()
    
    if (pollResponse.ok && pollData.success) {
      console.log('✅ Response OK')
      console.log('\nCounts:')
      console.log(JSON.stringify(pollData.counts, null, 2))
      
      if (pollData.active_phase) {
        console.log('\nActive Phase (from poll):')
        console.log(JSON.stringify({
          name: pollData.active_phase.phase_name,
          max_per_wallet: pollData.active_phase.max_per_wallet,
          phase_minted: pollData.active_phase.phase_minted,
          phase_allocation: pollData.active_phase.phase_allocation,
          whitelist_only: pollData.active_phase.whitelist_only,
        }, null, 2))
      }
    } else {
      console.log('❌ Response failed:', pollData.error || pollResponse.statusText)
    }

    // Test 3: Poll endpoint (with wallet if provided)
    if (TEST_WALLET) {
      console.log('\n\n📡 Test 3: GET /api/launchpad/[collectionId]/poll (with wallet)')
      console.log('-'.repeat(80))
      const pollWalletUrl = `${baseUrl}/api/launchpad/${COLLECTION_ID}/poll?wallet_address=${encodeURIComponent(TEST_WALLET)}`
      console.log(`URL: ${pollWalletUrl}`)
      console.log(`Wallet: ${TEST_WALLET}\n`)
      
      const pollWalletResponse = await fetch(pollWalletUrl)
      const pollWalletData = await pollWalletResponse.json()
      
      if (pollWalletResponse.ok && pollWalletData.success) {
        console.log('✅ Response OK')
        
        if (pollWalletData.active_phase) {
          console.log('\nActive Phase:')
          console.log(JSON.stringify({
            name: pollWalletData.active_phase.phase_name,
            max_per_wallet: pollWalletData.active_phase.max_per_wallet,
            phase_minted: pollWalletData.active_phase.phase_minted,
            whitelist_only: pollWalletData.active_phase.whitelist_only,
          }, null, 2))
        }
        
        if (pollWalletData.user_mint_status) {
          console.log('\nUser Mint Status:')
          console.log(JSON.stringify(pollWalletData.user_mint_status, null, 2))
        } else {
          console.log('\n⚠️  No user_mint_status in response')
        }
        
        if (pollWalletData.user_whitelist_status) {
          console.log('\nUser Whitelist Status:')
          console.log(JSON.stringify(pollWalletData.user_whitelist_status, null, 2))
        }
      } else {
        console.log('❌ Response failed:', pollWalletData.error || pollWalletResponse.statusText)
      }
    } else {
      console.log('\n\n⚠️  Test 3: Skipped (no TEST_WALLET set)')
      console.log('   Set TEST_WALLET in .env.local to test wallet-specific endpoints')
    }

    console.log('\n' + '=' .repeat(80))
    console.log('✅ API tests completed!')

  } catch (error) {
    console.error('❌ Error:', error.message)
    if (error.code === 'ECONNREFUSED') {
      console.error('\n💡 Tip: Make sure your Next.js server is running on', baseUrl)
    }
    process.exit(1)
  }
}

testAPIResponses()

