import { LAMPORTS_PER_SOL } from '@solana/web3.js'

// Solana minting constants
export const MAX_PER_TRANSACTION = 5 // Max NFTs per transaction
export const PLATFORM_FEE_LAMPORTS = 25000 // 0.000025 SOL platform fee per mint
export const MIN_MINT_PRICE_LAMPORTS = 0 // Free mints allowed
export const DEFAULT_ROYALTY_BPS = 500 // 5% default royalty

// Reservation
export const RESERVATION_EXPIRY_MINUTES = 2 // How long a reservation lasts
export const MAX_RESERVATIONS_PER_WALLET = 10
