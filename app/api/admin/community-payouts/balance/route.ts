import { NextRequest, NextResponse } from 'next/server'
import * as bip39 from 'bip39'
import { BIP32Factory } from 'bip32'
import * as bitcoin from 'bitcoinjs-lib'
import * as ecc from '@bitcoinerlab/secp256k1'
import { ECPairFactory } from 'ecpair'
import { fetchUtxos, filterAndSortUtxos, convertSandshrewToMempoolFormat } from '@/lib/utxo-fetcher'
import { getBitcoinNetwork } from '@/lib/bitcoin-utils'
import { isAdmin } from '@/lib/auth/access-control'

// Initialize ECC library
bitcoin.initEccLib(ecc)
const ECPair = ECPairFactory(ecc)
const bip32 = BIP32Factory(ecc)

/**
 * Derive P2TR wallet from seed phrase
 */
function deriveP2TRWallet(phrase: string): { address: string } {
  if (!bip39.validateMnemonic(phrase)) {
    throw new Error('Invalid mnemonic phrase')
  }

  const seed = bip39.mnemonicToSeedSync(phrase)
  const seedBuffer = Buffer.isBuffer(seed) ? seed : Buffer.from(seed)
  const root = bip32.fromSeed(seedBuffer)
  const network = getBitcoinNetwork()

  const ensureBuffer = (key: Buffer | Uint8Array | undefined): Buffer => {
    if (!key) throw new Error('Private key is undefined')
    return Buffer.isBuffer(key) ? key : Buffer.from(key)
  }

  const p2trPath = "m/86'/0'/0'/0/0"
  const p2trNode = root.derivePath(p2trPath)
  const p2trPrivateKey = ensureBuffer(p2trNode.privateKey)
  const p2trKeyPair = ECPair.fromPrivateKey(p2trPrivateKey)
  const p2trAddress = bitcoin.payments.p2tr({
    internalPubkey: p2trKeyPair.publicKey.subarray(1, 33),
    network,
  }).address!

  return { address: p2trAddress }
}

/**
 * GET /api/admin/community-payouts/balance
 * Get wallet balance (total UTXOs)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const walletAddress = searchParams.get('wallet_address')

    if (!walletAddress || !isAdmin(walletAddress)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Check for PHRASE environment variable
    const phrase = process.env.PHRASE
    if (!phrase) {
      return NextResponse.json(
        { error: 'PHRASE environment variable is not set' },
        { status: 500 }
      )
    }

    // Derive P2TR wallet
    const wallet = deriveP2TRWallet(phrase)

    // Fetch UTXOs
    const utxoResult = await fetchUtxos(wallet.address, [])
    const allUtxos = convertSandshrewToMempoolFormat(utxoResult.utxos)
    const filteredUtxos = filterAndSortUtxos(allUtxos)

    // Calculate total balance
    const totalBalance = filteredUtxos.reduce((sum, utxo) => sum + utxo.value, 0)

    return NextResponse.json({
      success: true,
      address: wallet.address,
      balance_sats: totalBalance,
      utxo_count: filteredUtxos.length,
    })
  } catch (error: any) {
    console.error('Balance fetch error:', error)
    return NextResponse.json({ 
      error: 'Failed to fetch balance',
      details: error.message 
    }, { status: 500 })
  }
}

