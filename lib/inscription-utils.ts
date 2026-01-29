/**
 * Inscription / ordinal commit-reveal utilities.
 * Used by admin test-mint and reveal routes.
 */

import * as bitcoin from 'bitcoinjs-lib'
import { getBitcoinNetwork as getNetwork } from '@/lib/bitcoin-utils'
import { getAddressType } from '@/lib/bitcoin-utils'

export { getBitcoinNetwork } from '@/lib/bitcoin-utils'

const DEFAULT_MIN_OUTPUT_P2TR = 330
const DEFAULT_MIN_OUTPUT_OTHER = 546

/**
 * Minimum output value (sats) for an address - Taproot uses 330, others 546.
 */
export function getMinimumOutputValue(address: string): number {
  return getAddressType(address) === 'p2tr' ? DEFAULT_MIN_OUTPUT_P2TR : DEFAULT_MIN_OUTPUT_OTHER
}

/**
 * Generate a random 32-byte private key for inscription keypair.
 */
export function generatePrivateKey(): Buffer {
  if (typeof require !== 'undefined' && require('crypto').randomBytes) {
    return require('crypto').randomBytes(32)
  }
  const arr = new Uint8Array(32)
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(arr)
    return Buffer.from(arr)
  }
  throw new Error('No secure random available')
}

/**
 * Estimate commit and reveal vSize and fees.
 */
export function estimateInscriptionCost(
  contentSizeBytes: number,
  inscriptionCount: number,
  feeRateSatPerVb: number,
  _paymentAddress: string,
  receivingAddress: string,
  commitInputCount: number
): { commitVSize: number; revealVSize: number; commitFee: number; revealFee: number } {
  const minOut = getMinimumOutputValue(receivingAddress)
  const commitVSize = calculateCommitVSize(receivingAddress, commitInputCount)
  const revealVSize = estimateRevealVSize(contentSizeBytes, inscriptionCount)
  return {
    commitVSize,
    revealVSize,
    commitFee: Math.ceil(commitVSize * feeRateSatPerVb),
    revealFee: Math.ceil(revealVSize * feeRateSatPerVb),
  }
}

/**
 * Estimate commit transaction vSize from payment address type and input count.
 */
export function calculateCommitVSize(paymentAddress: string, inputCount: number): number {
  const addrType = getAddressType(paymentAddress)
  const inputVb = addrType === 'p2tr' ? 57 : addrType === 'p2wpkh' ? 68 : 148
  const outputVb = 43
  const baseVb = 10
  return baseVb + inputCount * inputVb + 2 * outputVb
}

function estimateRevealVSize(contentSizeBytes: number, _inscriptionCount: number): number {
  const witnessContent = 4 + 4 + 2 + contentSizeBytes + 64
  const witnessVb = Math.ceil(witnessContent / 4)
  return 10 + 57 + 43 + witnessVb
}

/**
 * Create taproot inscription address and script from pubkey and inscription data.
 * Uses @cmdcode/tapscript.
 */
export function createInscriptionRevealAddressAndKeys(
  pubKey: { hex?: string } | Buffer | Uint8Array,
  inscriptionData: Array<{ content: string; mimeType: string }>
): { inscriberAddress: string; tpubkey: string; tapleaf: string; script: Buffer } {
  const { Tap, Address } = require('@cmdcode/tapscript')
  const pubKeyHex = typeof pubKey === 'object' && pubKey !== null && 'hex' in pubKey
    ? (pubKey as { hex: string }).hex
    : Buffer.isBuffer(pubKey)
      ? pubKey.toString('hex')
      : Buffer.from(pubKey as Uint8Array).toString('hex')
  const network = getNetwork() === bitcoin.networks.bitcoin ? 'main' : 'testnet'
  const scriptData = inscriptionData.flatMap((d) => [
    Buffer.from('ord', 'utf8'),
    Buffer.from(JSON.stringify([['text/plain;charset=utf-8', d.content], d.mimeType]), 'utf8'),
  ])
  const scriptEnc = Tap.encodeScript(scriptData)
  const tapleaf = Tap.tree.getLeaf(scriptEnc)
  const [tpubkey, _cblock] = Tap.getPubKey(pubKeyHex, { target: tapleaf })
  const inscriberAddress = Address.p2tr.fromPubKey(tpubkey, network)
  return {
    inscriberAddress,
    tpubkey: typeof tpubkey === 'string' ? tpubkey : Buffer.from(tpubkey).toString('hex'),
    tapleaf,
    script: Buffer.isBuffer(scriptEnc) ? scriptEnc : Buffer.from(scriptEnc),
  }
}

/**
 * Build reveal transaction hex and inscription IDs.
 * Uses @cmdcode/tapscript Tx and Signer.
 */
export function createRevealTransaction(
  commitTxid: string,
  commitOutputIndex: number,
  commitOutputValue: number,
  inscriptionPrivKey: Uint8Array,
  pubKeyHex: string,
  inscriptions: Array<{ content: string; mimeType: string }>,
  receivingWallet: string,
  feeRate: number
): { txHex: string; inscriptionIds: string[] } {
  const { Tap, Tx, Address } = require('@cmdcode/tapscript')
  const network = getNetwork() === bitcoin.networks.bitcoin ? 'main' : 'testnet'
  const scriptData = inscriptions.flatMap((d) => [
    Buffer.from('ord', 'utf8'),
    Buffer.from(JSON.stringify([['text/plain;charset=utf-8', d.content], d.mimeType]), 'utf8'),
  ])
  const scriptEnc = Tap.encodeScript(scriptData)
  const tapleaf = Tap.tree.getLeaf(scriptEnc)
  const [tweakedPubkey, cblock] = Tap.getPubKey(pubKeyHex, { target: tapleaf })
  const outVal = getMinimumOutputValue(receivingWallet)
  const tx = Tx.create({
    vin: [{ txid: commitTxid, vout: commitOutputIndex, prevout: { value: commitOutputValue, scriptPubKey: ['OP_1', Address.p2tr.fromPubKey(tweakedPubkey, network)] }, witness: [] }],
    vout: [{ value: outVal, scriptPubKey: ['OP_1', Address.p2tr.decode(receivingWallet)] }],
  })
  const sig = Tap.util.sign(tx, inscriptionPrivKey, 0, { extension: tapleaf, cblock })
  if (Array.isArray(tx.vin[0].witness)) tx.vin[0].witness = sig
  const txHex = Tx.encode(tx).hex
  const txid = Tx.util.getTxid(tx)
  const inscriptionIds = inscriptions.map((_, i) => `${txid}i${i}`)
  return { txHex, inscriptionIds }
}
