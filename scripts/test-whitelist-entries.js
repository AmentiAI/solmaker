/**
 * Test script to check whitelist entries for a collection phase
 * Run with: node scripts/test-whitelist-entries.js
 */

require('dotenv').config({ path: '.env.local' })
const { neon } = require('@neondatabase/serverless')

const COLLECTION_ID = 'ddaa4e7c-0a00-4d07-ab41-06ee3991a2f8'
const TEST_WALLET = process.env.TEST_WALLET || null

async function testWhitelistEntries() {
  const databaseUrl = process.env.NEON_DATABASE || process.env.DATABASE_URL
  
  if (!databaseUrl) {
    console.error('❌ No database URL found. Please set NEON_DATABASE or DATABASE_URL')
    process.exit(1)
  }

  console.log('🧪 Testing Whitelist Entries for Collection:', COLLECTION_ID)
  console.log('=' .repeat(80))
  
  const sql = neon(databaseUrl)

  try {
    // Get active phase
    const now = new Date()
    const phasesResult = await sql`
      SELECT 
        id,
        phase_name,
        whitelist_id,
        whitelist_only,
        max_per_wallet,
        start_time,
        end_time,
        is_completed
      FROM mint_phases
      WHERE collection_id = ${COLLECTION_ID}
        AND is_completed = false
        AND start_time <= ${now.toISOString()}
        AND (end_time IS NULL OR end_time > ${now.toISOString()})
      ORDER BY phase_order ASC
      LIMIT 1
    `
    
    const activePhase = Array.isArray(phasesResult) ? phasesResult[0] : phasesResult
    
    if (!activePhase) {
      console.log('❌ No active phase found')
      process.exit(1)
    }
    
    console.log('\n📋 Active Phase:')
    console.log(`   Name: ${activePhase.phase_name}`)
    console.log(`   Max per Wallet: ${activePhase.max_per_wallet ?? 'Unlimited'}`)
    console.log(`   Whitelist Only: ${activePhase.whitelist_only}`)
    console.log(`   Whitelist ID: ${activePhase.whitelist_id || 'None'}`)
    
    if (!activePhase.whitelist_only || !activePhase.whitelist_id) {
      console.log('\n⚠️  Phase is not whitelist-only or has no whitelist_id')
      process.exit(0)
    }
    
    // Get whitelist info
    console.log('\n📝 Whitelist Info:')
    const whitelistResult = await sql`
      SELECT 
        id,
        name,
        description,
        max_entries,
        entries_count
      FROM mint_phase_whitelists
      WHERE id = ${activePhase.whitelist_id}
    `
    
    const whitelist = Array.isArray(whitelistResult) ? whitelistResult[0] : whitelistResult
    if (whitelist) {
      console.log(`   Name: ${whitelist.name}`)
      console.log(`   Description: ${whitelist.description || 'None'}`)
      console.log(`   Max Entries: ${whitelist.max_entries ?? 'Unlimited'}`)
      console.log(`   Entries Count: ${whitelist.entries_count || 0}`)
    }
    
    // Get all whitelist entries
    console.log('\n👥 Whitelist Entries:')
    const entriesResult = await sql`
      SELECT 
        wallet_address,
        allocation,
        minted_count,
        notes,
        created_at
      FROM whitelist_entries
      WHERE whitelist_id = ${activePhase.whitelist_id}
      ORDER BY created_at ASC
    `
    
    const entries = Array.isArray(entriesResult) ? entriesResult : []
    console.log(`   Total Entries: ${entries.length}`)
    
    if (entries.length > 0) {
      console.log('\n   Entry Details:')
      for (let idx = 0; idx < entries.length; idx++) {
        const entry = entries[idx]
        const remaining = Math.max(0, (entry.allocation || 1) - (entry.minted_count || 0))
        console.log(`\n   Entry ${idx + 1}:`)
        console.log(`      Wallet: ${entry.wallet_address}`)
        console.log(`      Allocation: ${entry.allocation || 1}`)
        console.log(`      Minted Count (from entry): ${entry.minted_count || 0}`)
        console.log(`      Remaining: ${remaining}`)
        console.log(`      Notes: ${entry.notes || 'None'}`)
        
        // Count actual mints from database
        const actualMintsResult = await sql`
          SELECT COUNT(DISTINCT mi.id) as count
          FROM mint_inscriptions mi
          WHERE mi.minter_wallet = ${entry.wallet_address}
            AND mi.collection_id = ${COLLECTION_ID}
            AND mi.phase_id = ${activePhase.id}
            AND mi.commit_tx_id IS NOT NULL
            AND LENGTH(TRIM(mi.commit_tx_id)) > 0
            AND mi.is_test_mint = false
        `
        const actualMints = parseInt(Array.isArray(actualMintsResult) ? actualMintsResult[0]?.count || '0' : actualMintsResult?.count || '0', 10)
        console.log(`      Actual Mints (from DB): ${actualMints}`)
        console.log(`      DB vs Entry Count: ${actualMints} vs ${entry.minted_count || 0}`)
      }
    } else {
      console.log('   ⚠️  No entries found in whitelist')
    }
    
    // If test wallet provided, check specific entry
    if (TEST_WALLET) {
      console.log(`\n🔍 Checking specific wallet: ${TEST_WALLET}`)
      const walletEntry = entries.find(e => e.wallet_address.toLowerCase() === TEST_WALLET.toLowerCase())
      
      if (walletEntry) {
        console.log('   ✅ Wallet found in whitelist')
        console.log(`      Allocation: ${walletEntry.allocation || 1}`)
        console.log(`      Minted Count: ${walletEntry.minted_count || 0}`)
        console.log(`      Remaining: ${Math.max(0, (walletEntry.allocation || 1) - (walletEntry.minted_count || 0))}`)
      } else {
        console.log('   ❌ Wallet NOT found in whitelist')
        console.log(`   This explains why "Your Mints" might show wrong values`)
      }
    } else {
      console.log('\n💡 Tip: Set TEST_WALLET in .env.local to check a specific wallet')
    }
    
    // Summary
    console.log('\n' + '=' .repeat(80))
    console.log('📊 Summary:')
    console.log(`   Phase: ${activePhase.phase_name}`)
    console.log(`   Phase Max per Wallet: ${activePhase.max_per_wallet ?? 'Unlimited'}`)
    console.log(`   Whitelist Entries: ${entries.length}`)
    
    if (entries.length > 0) {
      const allocations = entries.map(e => e.allocation || 1)
      const minAllocation = Math.min(...allocations)
      const maxAllocation = Math.max(...allocations)
      const avgAllocation = allocations.reduce((a, b) => a + b, 0) / allocations.length
      
      console.log(`   Allocation Range: ${minAllocation} - ${maxAllocation}`)
      console.log(`   Average Allocation: ${avgAllocation.toFixed(2)}`)
      
      if (minAllocation === 1 && maxAllocation === 22) {
        console.log('\n   ⚠️  Mixed allocations detected!')
        console.log('      Some users have allocation=1, others have allocation=22')
        console.log('      This explains why different users see different "Your Mints" values')
      }
    }
    
    console.log('\n✅ Test completed!')

  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

testWhitelistEntries()

