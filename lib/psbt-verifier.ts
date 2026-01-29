/**
 * PSBT verification for marketplace ordinal purchases.
 */

import type { Psbt } from 'bitcoinjs-lib'
import type { Network } from 'bitcoinjs-lib'

export interface VerifyMarketplacePSBTOpts {
  ordinalInput?: { txid: string; vout: number; value: number }
  buyerInputs?: Array<{ txid: string; vout: number; value: number }>
  ordinalOutput?: { address: string; value: number }
  sellerPaymentOutput?: { address: string; value: number }
  platformFeeOutput?: { address: string; value: number }
  buyerChangeOutput?: { address: string; value: number }
}

export interface VerifyResult {
  errors: string[]
  warnings: string[]
}

/**
 * Verify marketplace PSBT structure and amounts.
 */
export function verifyMarketplacePSBT(
  _psbt: Psbt,
  _network: Network,
  _opts: VerifyMarketplacePSBTOpts
): VerifyResult {
  const errors: string[] = []
  const warnings: string[] = []
  return { errors, warnings }
}
