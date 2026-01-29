/**
 * Bitcoin / PSBT utilities for signing and address detection.
 * Used by credit purchase, marketplace, rewards, and admin payout flows.
 */

import * as bitcoin from 'bitcoinjs-lib'

export type AddressType = 'p2tr' | 'p2wpkh' | 'p2sh' | 'p2pkh'

const isTestnet = process.env.BITCOIN_NETWORK === 'testnet'

/**
 * Get Bitcoin network (mainnet or testnet) from env.
 */
export function getBitcoinNetwork(): bitcoin.Network {
  return isTestnet ? bitcoin.networks.testnet : bitcoin.networks.bitcoin
}

/**
 * Detect address type from string (bc1p = taproot, bc1 + 42 chars = segwit v0, 3 = p2sh, 1 = p2pkh).
 */
export function getAddressType(address: string): AddressType {
  if (!address || typeof address !== 'string') return 'p2pkh'
  const trimmed = address.trim()
  if (trimmed.startsWith('bc1p') || trimmed.startsWith('tb1p')) return 'p2tr'
  if ((trimmed.startsWith('bc1') && trimmed.length >= 42) || (trimmed.startsWith('tb1') && trimmed.length >= 42)) return 'p2wpkh'
  if (trimmed.startsWith('3') || trimmed.startsWith('2')) return 'p2sh'
  if (trimmed.startsWith('1') || trimmed.startsWith('m') || trimmed.startsWith('n')) return 'p2pkh'
  return 'p2pkh'
}

/**
 * Add signing metadata to a PSBT input so the wallet can sign it.
 * - For P2TR: sets tapInternalKey (32-byte x-only pubkey).
 * - For others: sets bip32Derivation with pubkey so the signer can match and sign.
 */
export function addInputSigningInfo(
  psbt: bitcoin.Psbt,
  inputIndex: number,
  _address: string,
  paymentKeyHex: string | undefined,
  taprootKeyHex: string | undefined,
  _value?: number | bigint | string
): void {
  if (taprootKeyHex) {
    let keyBuf = Buffer.from(taprootKeyHex, 'hex')
    if (keyBuf.length === 33) keyBuf = keyBuf.subarray(1)
    if (keyBuf.length !== 32) return
    psbt.updateInput(inputIndex, { tapInternalKey: keyBuf })
    return
  }
  if (paymentKeyHex) {
    const pubkey = Buffer.from(paymentKeyHex, 'hex')
    if (pubkey.length !== 33 && pubkey.length !== 32) return
    const masterFingerprint = Buffer.alloc(4, 0)
    const path = "m/84'/0'/0'/0/0"
    psbt.updateInput(inputIndex, {
      bip32Derivation: [{ masterFingerprint, pubkey, path }],
    })
  }
}
