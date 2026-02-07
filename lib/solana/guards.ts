/**
 * Core Candy Machine Guards Configuration
 * Guards control who can mint, when, how much, etc.
 *
 * Uses the new mpl-core-candy-machine guard system.
 */

import {
  updateCandyGuard,
} from '@metaplex-foundation/mpl-core-candy-machine'
import {
  publicKey,
  some,
  none,
  sol,
  TransactionBuilder,
  Umi,
  dateTime,
} from '@metaplex-foundation/umi'

export interface SolPaymentGuard {
  amountSol: number
  destination: string
}

export interface SolFixedFeeGuard {
  amountSol: number
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

export interface GuardConfig {
  solPayment?: SolPaymentGuard
  solFixedFee?: SolFixedFeeGuard
  startDate?: StartDateGuard
  endDate?: EndDateGuard
  mintLimit?: MintLimitGuard
}

/**
 * Update Core Candy Machine guards
 */
export async function updateCandyMachineGuards(
  umi: Umi,
  candyGuardAddress: string,
  guards: GuardConfig
): Promise<TransactionBuilder> {
  const guardSet: any = {}

  // SOL Payment guard (mint price to creator)
  if (guards.solPayment) {
    guardSet.solPayment = some({
      lamports: sol(guards.solPayment.amountSol),
      destination: publicKey(guards.solPayment.destination),
    })
  }

  // SOL Fixed Fee guard (platform fee)
  if (guards.solFixedFee) {
    guardSet.solFixedFee = some({
      lamports: sol(guards.solFixedFee.amountSol),
      destination: publicKey(guards.solFixedFee.destination),
    })
  }

  // Start date guard
  if (guards.startDate) {
    guardSet.startDate = some({
      date: dateTime(guards.startDate.date.toISOString()),
    })
  }

  // End date guard
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

  return updateCandyGuard(umi, {
    candyGuard: publicKey(candyGuardAddress),
    guards: guardSet,
  })
}

/**
 * Build basic guards for single-phase launch
 */
export function buildBasicGuards(params: {
  mintPriceSol: number
  creatorWallet: string
  platformFeeSol: number
  platformWallet: string
  startDate: Date
  endDate?: Date
  maxPerWallet?: number
}): GuardConfig {
  const guards: GuardConfig = {
    solPayment: {
      amountSol: params.mintPriceSol,
      destination: params.creatorWallet,
    },
    startDate: {
      date: params.startDate,
    },
  }

  if (params.platformFeeSol > 0) {
    guards.solFixedFee = {
      amountSol: params.platformFeeSol,
      destination: params.platformWallet,
    }
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
 * Estimate if guards will allow minting at current time
 */
export function canMintWithGuards(guards: GuardConfig): {
  canMint: boolean
  reason?: string
} {
  const now = new Date()

  if (guards.startDate && guards.startDate.date > now) {
    return {
      canMint: false,
      reason: `Minting starts at ${guards.startDate.date.toISOString()}`,
    }
  }

  if (guards.endDate && guards.endDate.date < now) {
    return {
      canMint: false,
      reason: `Minting ended at ${guards.endDate.date.toISOString()}`,
    }
  }

  return { canMint: true }
}
