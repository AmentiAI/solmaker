/**
 * Run all whitelist and mint phase tests
 * Run with: node scripts/run-all-tests.js
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const tests = [
  {
    name: 'Whitelist Entries',
    script: 'test-whitelist-entries.js',
    description: 'Tests whitelist entries in database',
  },
  {
    name: 'Mint Availability',
    script: 'test-mint-availability.js',
    description: 'Tests mint availability calculations',
  },
  {
    name: 'API Responses',
    script: 'test-api-responses.js',
    description: 'Tests API endpoint responses',
  },
  {
    name: 'Whitelist & Mint Flow',
    script: 'test-whitelist-mint-flow.js',
    description: 'Comprehensive end-to-end flow testing',
  },
]

console.log('🧪 Running All Whitelist & Mint Phase Tests')
console.log('='.repeat(80))
console.log(`Total Tests: ${tests.length}\n`)

const results = []

for (const test of tests) {
  console.log(`\n${'='.repeat(80)}`)
  console.log(`📋 Test: ${test.name}`)
  console.log(`📝 Description: ${test.description}`)
  console.log(`📄 Script: ${test.script}`)
  console.log('-'.repeat(80))

  try {
    const startTime = Date.now()
    execSync(`node scripts/${test.script}`, {
      stdio: 'inherit',
      cwd: process.cwd(),
    })
    const duration = ((Date.now() - startTime) / 1000).toFixed(2)
    
    results.push({
      name: test.name,
      status: 'passed',
      duration: `${duration}s`,
    })
    console.log(`\n✅ ${test.name} completed in ${duration}s`)
  } catch (error) {
    results.push({
      name: test.name,
      status: 'failed',
      error: error.message,
    })
    console.log(`\n❌ ${test.name} failed: ${error.message}`)
  }
}

// Summary
console.log('\n\n' + '='.repeat(80))
console.log('📊 TEST SUMMARY')
console.log('='.repeat(80))

const passed = results.filter(r => r.status === 'passed').length
const failed = results.filter(r => r.status === 'failed').length

console.log(`✅ Passed: ${passed}/${tests.length}`)
console.log(`❌ Failed: ${failed}/${tests.length}`)

if (failed > 0) {
  console.log('\nFailed Tests:')
  results.filter(r => r.status === 'failed').forEach(r => {
    console.log(`   - ${r.name}`)
  })
}

console.log('\n' + '='.repeat(80))

if (failed === 0) {
  console.log('✅ All tests passed!')
  process.exit(0)
} else {
  console.log('❌ Some tests failed. Please review the output above.')
  process.exit(1)
}


