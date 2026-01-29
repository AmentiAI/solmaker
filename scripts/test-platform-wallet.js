#!/usr/bin/env node

/**
 * Test platform wallet configuration
 */

require('dotenv').config({ path: '.env.local' })
const { Keypair, PublicKey, Connection, LAMPORTS_PER_SOL } = require('@solana/web3.js')
const bs58 = require('bs58')

console.log('🔐 Testing Platform Wallet Configuration...\n')

// Get env vars
const publicKeyStr = process.env.SOLANA_PLATFORM_WALLET
const privateKeyStr = process.env.SOLANA_PLATFORM_PRIVATE_KEY
const rpcUrl = process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL

console.log('Environment Variables:')
console.log(`  SOLANA_PLATFORM_WALLET: ${publicKeyStr ? '✅ Set' : '❌ Missing'}`)
console.log(`  SOLANA_PLATFORM_PRIVATE_KEY: ${privateKeyStr ? '✅ Set' : '❌ Missing'}`)
console.log(`  RPC URL: ${rpcUrl}\n`)

if (!publicKeyStr || !privateKeyStr) {
  console.error('❌ Missing required environment variables')
  process.exit(1)
}

try {
  // Test 1: Load keypair from private key
  console.log('Test 1: Loading Keypair from Private Key...')
  const secretKey = bs58.default ? bs58.default.decode(privateKeyStr) : bs58.decode(privateKeyStr)
  const keypair = Keypair.fromSecretKey(secretKey)
  console.log('  ✅ Keypair loaded successfully\n')

  // Test 2: Verify public key matches
  console.log('Test 2: Verifying Public Key Match...')
  const derivedPublicKey = keypair.publicKey.toBase58()
  if (derivedPublicKey === publicKeyStr) {
    console.log('  ✅ Public key matches!\n')
  } else {
    console.error('  ❌ Public key mismatch!')
    console.error(`  Expected: ${publicKeyStr}`)
    console.error(`  Got: ${derivedPublicKey}\n`)
    process.exit(1)
  }

  // Test 3: Check balance on-chain
  console.log('Test 3: Checking Balance On-Chain...')
  const connection = new Connection(rpcUrl, 'confirmed')
  const publicKey = new PublicKey(publicKeyStr)
  
  connection.getBalance(publicKey)
    .then(balance => {
      const solBalance = balance / LAMPORTS_PER_SOL
      console.log(`  Balance: ${solBalance.toFixed(4)} SOL`)
      console.log(`  Address: ${publicKeyStr}\n`)
      
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log('✅ ALL TESTS PASSED!')
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
      console.log('Platform wallet is correctly configured and accessible.\n')
      console.log('View wallet on Solscan:')
      console.log(`  https://solscan.io/account/${publicKeyStr}\n`)
      
      if (solBalance < 0.01) {
        console.log('⚠️  Note: Wallet has low/zero balance')
        console.log('    This is fine - wallet only needs SOL for outgoing transactions')
        console.log('    It will receive SOL from credit purchases automatically\n')
      }
    })
    .catch(error => {
      console.error('  ❌ Failed to check balance:', error.message)
      console.log('  (This might be a network issue, wallet is still configured correctly)\n')
    })

} catch (error) {
  console.error('❌ Test failed:', error.message)
  process.exit(1)
}
