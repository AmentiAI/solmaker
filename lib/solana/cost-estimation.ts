import { LAMPORTS_PER_SOL } from '@solana/web3.js'
import { getPlatformFeeLamports } from './platform-wallet'

// Solana transaction fee constants
export const SOLANA_BASE_FEE = 5000 // 5000 lamports per signature (0.000005 SOL)
export const RENT_EXEMPT_MINIMUM = 0.00203928 * LAMPORTS_PER_SOL // ~0.002 SOL minimum rent exemption
// Core Assets don't need SPL token accounts - much cheaper than legacy
export const CORE_ASSET_RENT = 0.00203928 * LAMPORTS_PER_SOL // ~0.002 SOL for Core Asset account

export interface MintCostEstimate {
  totalLamports: number
  totalSol: number
  breakdown: {
    mintPrice: number
    platformFee: number
    rentExemption: number
    transactionFee: number
  }
}

/**
 * Estimate the total cost of minting NFTs.
 * Platform fee is a fixed amount per mint (from NEXT_PUBLIC_SOLANA_PLATFORM_FEE_SOL env var).
 */
export function estimateMintCost(
  mintPriceLamports: number = 0,
  numberOfNfts: number = 1
): MintCostEstimate {
  const rentPerNft = CORE_ASSET_RENT
  const txFeePerNft = SOLANA_BASE_FEE * 2 // signatures per mint

  const totalRent = rentPerNft * numberOfNfts
  const totalTxFee = txFeePerNft * numberOfNfts
  const totalMintPrice = mintPriceLamports * numberOfNfts
  const platformFeePerMint = getPlatformFeeLamports()
  const totalPlatformFee = platformFeePerMint * numberOfNfts

  const totalLamports = totalRent + totalTxFee + totalMintPrice + totalPlatformFee

  return {
    totalLamports,
    totalSol: totalLamports / LAMPORTS_PER_SOL,
    breakdown: {
      mintPrice: totalMintPrice,
      platformFee: totalPlatformFee,
      rentExemption: totalRent,
      transactionFee: totalTxFee,
    },
  }
}

export function lamportsToSol(lamports: number): number {
  return lamports / LAMPORTS_PER_SOL
}

export function solToLamports(sol: number): number {
  return Math.floor(sol * LAMPORTS_PER_SOL)
}

export function formatSol(lamports: number, decimals: number = 4): string {
  return (lamports / LAMPORTS_PER_SOL).toFixed(decimals)
}
