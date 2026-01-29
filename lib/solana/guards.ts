/**
 * Candy Machine Guards Configuration
 * Guards control who can mint, when, how much, etc.
 */

import {
  updateCandyGuard,
  CandyGuard,
  GuardSet,
  DefaultGuardSet,
} from '@metaplex-foundation/mpl-candy-machine'
import {
  publicKey,
  some,
  none,
  TransactionBuilder,
  Umi,
  dateTime,
} from '@metaplex-foundation/umi'

export interface SolPaymentGuard {
  lamports: bigint
  destination: string
}

export interface StartDateGuard {
  date: Date
}

export interface EndDateGuard {
  date: Date
}

export interface MintLimitGuard {
  id: number
  limit: number
}

export interface AllowListGuard {
  merkleRoot: Uint8Array
}

export interface GuardConfig {
  solPayment?: SolPaymentGuard
  startDate?: StartDateGuard
  endDate?: EndDateGuard
  mintLimit?: MintLimitGuard
  allowList?: AllowListGuard
  redeemedAmount?: number
}

/**
 * Update Candy Machine guards
 * Guards control access to minting
 */
export async function updateCandyMachineGuards(
  umi: Umi,
  candyGuardAddress: string,
  guards: GuardConfig
): Promise<TransactionBuilder> {
  const guardSet: Partial<DefaultGuardSet> = {}

  // SOL Payment guard (mint price)
  if (guards.solPayment) {
    guardSet.solPayment = some({
      lamports: guards.solPayment.lamports,
      destination: publicKey(guards.solPayment.destination),
    })
  }

  // Start date guard (when minting begins)
  if (guards.startDate) {
    guardSet.startDate = some({
      date: dateTime(guards.startDate.date.toISOString()),
    })
  }

  // End date guard (when minting ends)
  if (guards.endDate) {
    guardSet.endDate = some({
      date: dateTime(guards.endDate.date.toISOString()),
    })
  }

  // Mint limit guard (max per wallet)
  if (guards.mintLimit) {
    guardSet.mintLimit = some({
      id: guards.mintLimit.id,
      limit: guards.mintLimit.limit,
    })
  }

  // Allow list guard (whitelist via Merkle tree)
  if (guards.allowList) {
    guardSet.allowList = some({
      merkleRoot: guards.allowList.merkleRoot,
    })
  }

  return updateCandyGuard(umi, {
    candyGuard: publicKey(candyGuardAddress),
    guards: guardSet as DefaultGuardSet,
  })
}

/**
 * Configure guards for a specific phase
 * Use for multi-phase launches
 */
export interface PhaseGuardConfig {
  label: string // Phase identifier
  guards: GuardConfig
}

export async function configurePhaseGuards(
  umi: Umi,
  candyGuardAddress: string,
  phases: PhaseGuardConfig[]
): Promise<TransactionBuilder[]> {
  // Create guard group for each phase
  const transactions: TransactionBuilder[] = []

  for (const phase of phases) {
    const tx = await updateCandyMachineGuards(umi, candyGuardAddress, phase.guards)
    transactions.push(tx)
  }

  return transactions
}

/**
 * Build basic guards for single-phase launch
 */
export function buildBasicGuards(params: {
  mintPriceLamports: bigint
  destinationWallet: string
  startDate: Date
  endDate?: Date
  maxPerWallet?: number
}): GuardConfig {
  const guards: GuardConfig = {
    solPayment: {
      lamports: params.mintPriceLamports,
      destination: params.destinationWallet,
    },
    startDate: {
      date: params.startDate,
    },
  }

  if (params.endDate) {
    guards.endDate = {
      date: params.endDate,
    }
  }

  if (params.maxPerWallet) {
    guards.mintLimit = {
      id: 1,
      limit: params.maxPerWallet,
    }
  }

  return guards
}

/**
 * Build whitelist guards using Merkle tree
 */
export function buildWhitelistGuards(params: {
  merkleRoot: Uint8Array
  mintPriceLamports: bigint
  destinationWallet: string
  startDate: Date
  endDate?: Date
}): GuardConfig {
  return {
    allowList: {
      merkleRoot: params.merkleRoot,
    },
    solPayment: {
      lamports: params.mintPriceLamports,
      destination: params.destinationWallet,
    },
    startDate: {
      date: params.startDate,
    },
    endDate: params.endDate ? { date: params.endDate } : undefined,
  }
}

/**
 * Estimate if guards will allow minting at current time
 */
export function canMintWithGuards(guards: GuardConfig): {
  canMint: boolean
  reason?: string
} {
  const now = new Date()

  // Check start date
  if (guards.startDate && guards.startDate.date > now) {
    return {
      canMint: false,
      reason: `Minting starts at ${guards.startDate.date.toISOString()}`,
    }
  }

  // Check end date
  if (guards.endDate && guards.endDate.date < now) {
    return {
      canMint: false,
      reason: `Minting ended at ${guards.endDate.date.toISOString()}`,
    }
  }

  return { canMint: true }
}
