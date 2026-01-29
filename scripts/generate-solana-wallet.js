#!/usr/bin/env node

/**
 * Generate a new Solana wallet for platform fees and payments
 * This will create a new keypair and display the address and secret key
 */

const { Keypair } = require('@solana/web3.js')
const bs58 = require('bs58')

console.log('🔐 Generating new Solana wallet...\n')

// Generate new keypair
const keypair = Keypair.generate()

// Get public key (wallet address)
const publicKey = keypair.publicKey.toBase58()

// Get secret key (private key) as base58 string
const secretKeyBase58 = bs58.default ? bs58.default.encode(keypair.secretKey) : bs58.encode(keypair.secretKey)

// Also show as array format (alternative format)
const secretKeyArray = Array.from(keypair.secretKey)

console.log('✅ Wallet Generated Successfully!\n')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('📍 WALLET ADDRESS (Public Key):')
console.log(publicKey)
console.log('')
console.log('🔑 SECRET KEY (Base58 - RECOMMENDED):')
console.log(secretKeyBase58)
console.log('')
console.log('🔑 SECRET KEY (Array format - alternative):')
console.log(JSON.stringify(secretKeyArray))
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

console.log('📝 Add these to your .env.local file:\n')
console.log('# Solana Platform Wallet (for fees & payments)')
console.log(`SOLANA_PLATFORM_WALLET=${publicKey}`)
console.log(`SOLANA_PLATFORM_PRIVATE_KEY=${secretKeyBase58}`)
console.log('')

console.log('⚠️  IMPORTANT SECURITY NOTES:')
console.log('1. NEVER commit the private key to git')
console.log('2. NEVER share the private key with anyone')
console.log('3. Store the private key in a secure password manager')
console.log('4. Add .env.local to .gitignore (should already be there)')
console.log('5. This wallet will receive all platform fees and credit payments')
console.log('')

console.log('💰 Fund this wallet:')
console.log(`   https://solscan.io/account/${publicKey}`)
console.log('')

console.log('🎯 This wallet will be used for:')
console.log('   - Receiving credit purchase payments')
console.log('   - Receiving platform minting fees (optional)')
console.log('   - Paying out creator royalties (if platform facilitates)')
console.log('')
