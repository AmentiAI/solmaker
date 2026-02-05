import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js'
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import { getConnection } from './connection'
import { PLATFORM_FEE_BPS } from './cost-estimation'

/**
 * Escrow marketplace utilities for Solana NFT trading
 * Uses a custodial approach where NFTs are transferred to a platform wallet
 * during listing, and released to the buyer upon purchase.
 */

export interface ListingParams {
  mintAddress: string
  sellerWallet: string
  priceLamports: number
}

export interface PurchaseParams {
  listingId: string
  mintAddress: string
  sellerWallet: string
  buyerWallet: string
  priceLamports: number
}

/**
 * Calculate platform fee for a sale
 */
export function calculatePlatformFee(priceLamports: number): number {
  const fee = Math.floor((priceLamports * PLATFORM_FEE_BPS) / 10000)
  // Minimum fee of 5000 lamports (0.000005 SOL)
  return Math.max(fee, 5000)
}

/**
 * Build a purchase transaction that pays seller + platform fee
 * Also creates buyer's token account if needed (buyer pays for it)
 */
export async function buildPurchaseTransaction(
  buyerPubkey: PublicKey,
  sellerPubkey: PublicKey,
  priceLamports: number,
  mintAddress?: string
): Promise<{ transaction: Transaction; platformFee: number; needsTokenAccount: boolean }> {
  const connection = getConnection()
  const { blockhash } = await connection.getLatestBlockhash('finalized')

  const platformWallet = process.env.SOLANA_PLATFORM_WALLET
  if (!platformWallet) {
    throw new Error('SOLANA_PLATFORM_WALLET not configured')
  }

  const platformPubkey = new PublicKey(platformWallet)
  
  // Check if platform wallet exists and has balance
  const platformAccountInfo = await connection.getAccountInfo(platformPubkey)
  const RENT_EXEMPT_MINIMUM = 890880 // lamports (~0.00089 SOL)
  
  let platformFee = calculatePlatformFee(priceLamports)
  
  // If platform wallet doesn't exist or has 0 balance, ensure first transfer meets rent exemption
  if (!platformAccountInfo || platformAccountInfo.lamports === 0) {
    if (platformFee < RENT_EXEMPT_MINIMUM) {
      platformFee = RENT_EXEMPT_MINIMUM
    }
  }
  
  const sellerAmount = priceLamports - platformFee
  if (sellerAmount < 0) {
    throw new Error('Price too low to cover platform fee and rent exemption')
  }

  const transaction = new Transaction()
  transaction.recentBlockhash = blockhash
  transaction.feePayer = buyerPubkey

  let needsTokenAccount = false

  // If mintAddress provided, check if buyer needs a token account
  if (mintAddress) {
    try {
      const mintPubkey = new PublicKey(mintAddress)
      
      // Check both token programs
      const TOKEN_2022_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb')
      
      // Try to detect which token program (check escrow account to determine)
      const escrowTokenAccount = await getAssociatedTokenAddress(
        mintPubkey,
        platformPubkey,
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      )
      
      const escrowAccountInfo = await connection.getAccountInfo(escrowTokenAccount)
      const tokenProgramId = escrowAccountInfo ? TOKEN_PROGRAM_ID : TOKEN_2022_PROGRAM_ID

      const buyerTokenAccount = await getAssociatedTokenAddress(
        mintPubkey,
        buyerPubkey,
        false,
        tokenProgramId,
        ASSOCIATED_TOKEN_PROGRAM_ID
      )

      const buyerAccountInfo = await connection.getAccountInfo(buyerTokenAccount)
      if (!buyerAccountInfo) {
        needsTokenAccount = true
        // NOTE: Token account creation is now handled by the platform during NFT delivery
        // We don't include it in the purchase transaction to avoid rent calculation issues
      }
    } catch (error) {
      console.error('Error checking buyer token account:', error)
      // Continue without token account creation - it might not be needed
    }
  }

  // Pay seller
  transaction.add(
    SystemProgram.transfer({
      fromPubkey: buyerPubkey,
      toPubkey: sellerPubkey,
      lamports: sellerAmount,
    })
  )

  // Pay platform fee
  transaction.add(
    SystemProgram.transfer({
      fromPubkey: buyerPubkey,
      toPubkey: platformPubkey,
      lamports: platformFee,
    })
  )

  return { transaction, platformFee, needsTokenAccount }
}

/**
 * Verify that a purchase transaction includes correct payments
 */
export async function verifyPurchaseTransaction(
  signature: string,
  expectedSellerWallet: string,
  expectedPriceLamports: number
): Promise<{ valid: boolean; error?: string }> {
  const connection = getConnection()

  try {
    const tx = await connection.getTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    })

    if (!tx || !tx.meta) {
      return { valid: false, error: 'Transaction not found' }
    }

    if (tx.meta.err) {
      return { valid: false, error: 'Transaction failed on-chain' }
    }

    // Verify the seller received payment
    const sellerPubkey = new PublicKey(expectedSellerWallet)
    const platformFee = calculatePlatformFee(expectedPriceLamports)
    const expectedSellerAmount = expectedPriceLamports - platformFee

    // Check balance changes in the transaction
    const accountKeys = tx.transaction.message.getAccountKeys()
    let sellerReceived = false

    for (let i = 0; i < accountKeys.length; i++) {
      const key = accountKeys.get(i)
      if (key && key.equals(sellerPubkey)) {
        const preBalance = tx.meta.preBalances[i]
        const postBalance = tx.meta.postBalances[i]
        const received = postBalance - preBalance

        // Allow 1% tolerance for rounding
        if (received >= expectedSellerAmount * 0.99) {
          sellerReceived = true
        }
      }
    }

    if (!sellerReceived) {
      return { valid: false, error: 'Seller did not receive expected payment' }
    }

    return { valid: true }
  } catch (error: any) {
    return { valid: false, error: error.message }
  }
}
