/**
 * Shared utilities for minting system
 * Centralizes logic for calculating remaining mints, validating limits, etc.
 */

import { sql } from '@/lib/database'
import { MAX_PER_TRANSACTION } from './minting-constants'

/**
 * Calculate remaining mints for a user in a phase
 * Returns the actual remaining count based on database queries
 */
export interface RemainingMintsResult {
  remaining: number
  mintedCount: number
  maxAllowed: number | null
  maxAvailable: number // Capped at MAX_PER_TRANSACTION
}

/**
 * Calculate remaining mints for whitelist phase
 * Whitelist only determines eligibility (yes/no), phase's max_per_wallet determines the limit
 */
export async function calculateWhitelistRemaining(
  walletAddress: string,
  collectionId: string,
  phaseId: string,
  whitelistId: string,
  maxPerWallet: number | null
): Promise<RemainingMintsResult | null> {
  if (!sql) return null

  // Get whitelist entry - only to verify eligibility
  const entryResult = await sql`
    SELECT allocation
    FROM whitelist_entries
    WHERE whitelist_id = ${whitelistId}
      AND wallet_address = ${walletAddress}
    LIMIT 1
  ` as any[]
  const entry = entryResult?.[0]

  if (!entry) return null

  // Count mints from solana_nft_mints (excludes failed/cancelled)
  const mintCountResult = await sql`
    SELECT COUNT(*) as count
    FROM solana_nft_mints
    WHERE minter_wallet = ${walletAddress}
      AND collection_id = ${collectionId}::uuid
      AND phase_id = ${phaseId}::uuid
      AND mint_status NOT IN ('failed', 'cancelled')
  ` as any[]

  const mintedCount = parseInt(mintCountResult?.[0]?.count || '0', 10)
  const maxAllowed = maxPerWallet ?? null

  if (maxAllowed === null) {
    // Unlimited - only capped by MAX_PER_TRANSACTION
    return {
      remaining: MAX_PER_TRANSACTION,
      mintedCount,
      maxAllowed: null,
      maxAvailable: MAX_PER_TRANSACTION,
    }
  }

  const remaining = Math.max(0, maxAllowed - mintedCount)
  const maxAvailable = Math.min(MAX_PER_TRANSACTION, remaining)

  return {
    remaining,
    mintedCount,
    maxAllowed,
    maxAvailable,
  }
}

/**
 * Calculate remaining mints for public phase
 */
export async function calculatePublicPhaseRemaining(
  walletAddress: string,
  collectionId: string,
  phaseId: string,
  maxPerWallet: number | null
): Promise<RemainingMintsResult | null> {
  if (!sql) return null

  // Count mints from solana_nft_mints (excludes failed/cancelled)
  const mintCountResult = await sql`
    SELECT COUNT(*) as count
    FROM solana_nft_mints
    WHERE minter_wallet = ${walletAddress}
      AND collection_id = ${collectionId}::uuid
      AND phase_id = ${phaseId}::uuid
      AND mint_status NOT IN ('failed', 'cancelled')
  ` as any[]

  const mintedCount = parseInt(mintCountResult?.[0]?.count || '0', 10)
  const maxAllowed = maxPerWallet ?? null

  if (maxAllowed === null) {
    // Unlimited - only capped by MAX_PER_TRANSACTION
    return {
      remaining: MAX_PER_TRANSACTION,
      mintedCount,
      maxAllowed: null,
      maxAvailable: MAX_PER_TRANSACTION,
    }
  }

  const remaining = Math.max(0, maxAllowed - mintedCount)
  const maxAvailable = Math.min(MAX_PER_TRANSACTION, remaining)

  return {
    remaining,
    mintedCount,
    maxAllowed,
    maxAvailable,
  }
}

/**
 * Validate mint quantity against limits
 */
export function validateMintQuantity(
  quantity: number,
  remainingResult: RemainingMintsResult | null
): { valid: boolean; error?: string } {
  if (quantity < 1) {
    return { valid: false, error: 'Quantity must be at least 1' }
  }

  if (quantity > MAX_PER_TRANSACTION) {
    return { valid: false, error: `Maximum ${MAX_PER_TRANSACTION} mints per transaction` }
  }

  if (!remainingResult) {
    return { valid: false, error: 'Unable to calculate remaining mints' }
  }

  if (remainingResult.maxAvailable === 0) {
    return { valid: false, error: 'You have no mints remaining' }
  }

  if (quantity > remainingResult.maxAvailable) {
    return {
      valid: false,
      error: `You can only mint ${remainingResult.maxAvailable} more NFT${remainingResult.maxAvailable === 1 ? '' : 's'} (max ${MAX_PER_TRANSACTION} per transaction)`,
    }
  }

  return { valid: true }
}

