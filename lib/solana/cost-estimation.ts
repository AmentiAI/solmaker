import { LAMPORTS_PER_SOL } from '@solana/web3.js'

// Solana transaction fee constants
export const SOLANA_BASE_FEE = 5000 // 5000 lamports per signature (0.000005 SOL)
export const NFT_RENT_EXEMPTION = 0.00203928 * LAMPORTS_PER_SOL // ~0.002 SOL for mint account
export const METADATA_RENT_EXEMPTION = 0.00561672 * LAMPORTS_PER_SOL // ~0.006 SOL for metadata account
export const TOKEN_ACCOUNT_RENT = 0.00203928 * LAMPORTS_PER_SOL // ~0.002 SOL for token account

// Platform fee in basis points (2% = 200 bps)
export const PLATFORM_FEE_BPS = parseInt(process.env.PLATFORM_FEE_BPS || '200', 10)

export interface MintCostEstimate {
  totalLamports: number
  totalSol: number
  breakdown: {
    rentExemption: number
    transactionFee: number
    metadataUpload: number
    platformFee: number
  }
}

export function estimateMintCost(
  mintPriceLamports: number = 0,
  numberOfNfts: number = 1
): MintCostEstimate {
  const rentPerNft = NFT_RENT_EXEMPTION + METADATA_RENT_EXEMPTION + TOKEN_ACCOUNT_RENT
  const txFeePerNft = SOLANA_BASE_FEE * 3 // multiple signatures per mint

  const totalRent = rentPerNft * numberOfNfts
  const totalTxFee = txFeePerNft * numberOfNfts
  const totalMintPrice = mintPriceLamports * numberOfNfts
  const platformFee = Math.floor((totalMintPrice * PLATFORM_FEE_BPS) / 10000)

  const totalLamports = totalRent + totalTxFee + totalMintPrice + platformFee

  return {
    totalLamports,
    totalSol: totalLamports / LAMPORTS_PER_SOL,
    breakdown: {
      rentExemption: totalRent,
      transactionFee: totalTxFee,
      metadataUpload: 0,
      platformFee,
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
