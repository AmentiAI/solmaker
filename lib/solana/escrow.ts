import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js'
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
 */
export async function buildPurchaseTransaction(
  buyerPubkey: PublicKey,
  sellerPubkey: PublicKey,
  priceLamports: number
): Promise<{ transaction: Transaction; platformFee: number }> {
  const connection = getConnection()
  const { blockhash } = await connection.getLatestBlockhash('finalized')

  const platformFee = calculatePlatformFee(priceLamports)
  const sellerAmount = priceLamports - platformFee

  const platformWallet = process.env.PLATFORM_FEE_WALLET
  if (!platformWallet) {
    throw new Error('PLATFORM_FEE_WALLET not configured')
  }

  const platformPubkey = new PublicKey(platformWallet)

  const transaction = new Transaction()
  transaction.recentBlockhash = blockhash
  transaction.feePayer = buyerPubkey

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

  return { transaction, platformFee }
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
