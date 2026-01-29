/**
 * Taproot TweakedSigner - wraps ECPair for P2TR (key-path) signing.
 * Replaces @btc-vision/transaction for compatibility with bitcoinjs-lib.
 */

import * as bitcoin from 'bitcoinjs-lib'
import * as ecc from '@bitcoinerlab/secp256k1'
import { ECPairFactory } from 'ecpair'

type Signer = bitcoin.Signer
type Network = bitcoin.Network

// Taproot tag for tweak hash (BIP341)
const TAPTWEAK_TAG = Buffer.from('TapTweak', 'utf8')

function taggedHash(tag: Buffer, data: Buffer): Buffer {
  const tagHash = require('crypto').createHash('sha256').update(tag).digest()
  const full = Buffer.concat([tagHash, tagHash, data])
  return Buffer.from(require('crypto').createHash('sha256').update(full).digest())
}

function tapTweakHash(pubKey: Uint8Array, _h?: Uint8Array | null): Buffer {
  return taggedHash(TAPTWEAK_TAG, Buffer.from(pubKey))
}

/**
 * Create a signer that applies the taproot tweak when signing.
 * Used for P2TR (bc1p) inputs: psbt.signInput(i, TweakedSigner.tweakSigner(keyPair, { network })).
 */
export const TweakedSigner = {
  tweakSigner(keyPair: Signer, opts: { network?: Network }): Signer {
    const internalPubkey = Buffer.from(keyPair.publicKey.subarray(1, 33))
    const tweakHash = tapTweakHash(internalPubkey, undefined)
    const privKey = (keyPair as any).privateKey
    if (!privKey) return keyPair
    const privKeyBuf = Buffer.isBuffer(privKey) ? privKey : Buffer.from(privKey)
    const tweakedPrivKey = ecc.privateAdd(privKeyBuf, tweakHash)
    if (!tweakedPrivKey) throw new Error('Failed to tweak private key')
    const ECPair = ECPairFactory(ecc)
    const tweakedPair = ECPair.fromPrivateKey(Buffer.from(tweakedPrivKey), { network: opts.network })
    return {
      publicKey: tweakedPair.publicKey,
      sign: (hash: Uint8Array) => tweakedPair.sign(hash),
      signSchnorr: (hash: Uint8Array) => ecc.signSchnorr(hash, tweakedPrivKey),
    } as Signer
  },
}
