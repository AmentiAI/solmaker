/**
 * Platform wallet for receiving fees and payments
 * This wallet is controlled by the platform and receives:
 * - Credit purchase payments
 * - Optional platform minting fees
 * - Other platform revenue
 */

import { Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { getConnectionAsync } from './connection'
import bs58 from 'bs58'

/**
 * Get the platform wallet public key (address)
 * Returns null during build time if not configured
 */
export function getPlatformWalletAddress(): string | null {
  const address = process.env.SOLANA_PLATFORM_WALLET
  
  if (!address) {
    return null
  }
  
  return address
}

/**
 * Get the platform wallet as a PublicKey object
 */
export function getPlatformWalletPublicKey(): PublicKey | null {
  const address = getPlatformWalletAddress()
  if (!address) return null
  return new PublicKey(address)
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
export async function getPlatformWalletBalance(): Promise<number | null> {
  const publicKey = getPlatformWalletPublicKey()
  if (!publicKey) return null
  
  const connection = await getConnectionAsync()
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
 * Get the platform mint fee in SOL from environment.
 * Uses NEXT_PUBLIC_ prefix so it's available on both server and client.
 * Defaults to 0 if not set (no platform fee).
 */
export function getPlatformFeeSol(): number {
  const feeSol = parseFloat(process.env.NEXT_PUBLIC_SOLANA_PLATFORM_FEE_SOL || '0')
  return isNaN(feeSol) ? 0 : feeSol
}

/**
 * Get the platform mint fee in lamports.
 */
export function getPlatformFeeLamports(): number {
  return Math.floor(getPlatformFeeSol() * LAMPORTS_PER_SOL)
}

/**
 * Platform fee constants - derived from environment.
 * PLATFORM_FEES.MINT_FEE_LAMPORTS reads from NEXT_PUBLIC_SOLANA_PLATFORM_FEE_SOL.
 */
export const PLATFORM_FEES = {
  get MINT_FEE_LAMPORTS() {
    return getPlatformFeeLamports()
  },
  get MINT_FEE_SOL() {
    return getPlatformFeeSol()
  },
  // Credit purchase minimum
  MIN_CREDIT_PURCHASE_LAMPORTS: 10_000_000, // 0.01 SOL minimum
}

/**
 * Calculate platform mint fee
 */
export function calculatePlatformMintFee(
  enablePlatformFee: boolean = false
): number {
  return enablePlatformFee ? getPlatformFeeLamports() : 0
}

/**
 * Get platform fee destination for Candy Machine guards
 */
export function getPlatformFeeDestination(): string | null {
  return getPlatformWalletAddress()
}
