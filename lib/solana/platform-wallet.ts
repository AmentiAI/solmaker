/**
 * Platform wallet for receiving fees and payments
 * This wallet is controlled by the platform and receives:
 * - Credit purchase payments
 * - Optional platform minting fees
 * - Other platform revenue
 */

import { Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { getConnection } from './connection'
import bs58 from 'bs58'

/**
 * Get the platform wallet public key (address)
 */
export function getPlatformWalletAddress(): string {
  const address = process.env.SOLANA_PLATFORM_WALLET
  
  if (!address) {
    throw new Error('SOLANA_PLATFORM_WALLET not configured in environment')
  }
  
  return address
}

/**
 * Get the platform wallet as a PublicKey object
 */
export function getPlatformWalletPublicKey(): PublicKey {
  return new PublicKey(getPlatformWalletAddress())
}

/**
 * Get the platform wallet keypair (private key access)
 * ⚠️ ONLY USE ON SERVER SIDE - NEVER EXPOSE TO CLIENT
 */
export function getPlatformWalletKeypair(): Keypair {
  const privateKey = process.env.SOLANA_PLATFORM_PRIVATE_KEY
  
  if (!privateKey) {
    throw new Error('SOLANA_PLATFORM_PRIVATE_KEY not configured in environment')
  }
  
  try {
    // Decode base58 private key to Uint8Array
    const secretKey = bs58.decode(privateKey)
    return Keypair.fromSecretKey(secretKey)
  } catch (error: any) {
    throw new Error(`Failed to load platform wallet keypair: ${error.message}`)
  }
}

/**
 * Get platform wallet balance
 */
export async function getPlatformWalletBalance(): Promise<number> {
  const connection = getConnection()
  const publicKey = getPlatformWalletPublicKey()
  const balance = await connection.getBalance(publicKey)
  return balance / LAMPORTS_PER_SOL
}

/**
 * Verify platform wallet is configured and accessible
 */
export async function verifyPlatformWallet(): Promise<{
  configured: boolean
  address?: string
  balance?: number
  error?: string
}> {
  try {
    const address = getPlatformWalletAddress()
    const keypair = getPlatformWalletKeypair()
    const balance = await getPlatformWalletBalance()
    
    // Verify keypair matches address
    if (keypair.publicKey.toBase58() !== address) {
      return {
        configured: false,
        error: 'Private key does not match public address',
      }
    }
    
    return {
      configured: true,
      address,
      balance,
    }
  } catch (error: any) {
    return {
      configured: false,
      error: error.message,
    }
  }
}

/**
 * Platform fee constants (in lamports)
 */
export const PLATFORM_FEES = {
  // Optional platform fee per mint (in lamports)
  // 0.01 SOL = 10,000,000 lamports
  MINT_FEE_LAMPORTS: 10_000_000, // 0.01 SOL per mint (optional, configurable)
  
  // Credit purchase minimum
  MIN_CREDIT_PURCHASE_LAMPORTS: 10_000_000, // 0.01 SOL minimum
}

/**
 * Calculate platform mint fee
 */
export function calculatePlatformMintFee(
  enablePlatformFee: boolean = false
): number {
  return enablePlatformFee ? PLATFORM_FEES.MINT_FEE_LAMPORTS : 0
}

/**
 * Get platform fee destination for Candy Machine guards
 */
export function getPlatformFeeDestination(): string {
  return getPlatformWalletAddress()
}
