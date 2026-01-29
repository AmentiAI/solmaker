import { NextRequest, NextResponse } from 'next/server'
import * as bitcoin from 'bitcoinjs-lib'
import * as ecc from '@bitcoinerlab/secp256k1'
import { ECPairFactory } from 'ecpair'
import * as bip39 from 'bip39'
import { BIP32Factory } from 'bip32'
import { TweakedSigner } from '@btc-vision/transaction'
import { fetchUtxos, filterAndSortUtxos, convertSandshrewToMempoolFormat } from '@/lib/utxo-fetcher'
import { getAddressType, getBitcoinNetwork } from '@/lib/bitcoin-utils'
import { addInputSigningInfo } from '@/lib/bitcoin-utils'

// Initialize ECC library
bitcoin.initEccLib(ecc)
const ECPair = ECPairFactory(ecc)

// BIP32 factory
const bip32 = BIP32Factory(ecc)

// Standard derivation path for Bitcoin: m/84'/0'/0'/0/0 (P2WPKH)
// For P2TR (Taproot): m/86'/0'/0'/0/0
// We'll use P2WPKH as default, but can derive P2TR if needed
const DERIVATION_PATH = "m/84'/0'/0'/0/0"

/**
 * Derive all Bitcoin address types from a seed phrase
 */
function deriveAllWalletsFromPhrase(phrase: string): {
  p2wpkh: { address: string; privateKey: Buffer; publicKey: Buffer; path: string; pubKeyHex: string }
  p2tr: { address: string; privateKey: Buffer; publicKey: Buffer; path: string; pubKeyHex: string; tapInternalKey: string }
  p2sh: { address: string; privateKey: Buffer; publicKey: Buffer; path: string; pubKeyHex: string }
  p2pkh: { address: string; privateKey: Buffer; publicKey: Buffer; path: string; pubKeyHex: string }
} {
  // Validate mnemonic
  if (!bip39.validateMnemonic(phrase)) {
    throw new Error('Invalid mnemonic phrase')
  }

  // Convert mnemonic to seed
  const seed = bip39.mnemonicToSeedSync(phrase)
  
  // Ensure seed is a Buffer (convert Uint8Array to Buffer if needed)
  const seedBuffer = Buffer.isBuffer(seed) ? seed : Buffer.from(seed)
  
  // Derive root key
  const root = bip32.fromSeed(seedBuffer)
  const network = getBitcoinNetwork()
  
  // Helper to ensure private key is a Buffer
  const ensureBuffer = (key: Buffer | Uint8Array | undefined): Buffer => {
    if (!key) throw new Error('Private key is undefined')
    return Buffer.isBuffer(key) ? key : Buffer.from(key)
  }

  // Derive P2WPKH address (bc1q...) - m/84'/0'/0'/0/0
  const p2wpkhPath = "m/84'/0'/0'/0/0"
  const p2wpkhNode = root.derivePath(p2wpkhPath)
  const p2wpkhPrivateKey = ensureBuffer(p2wpkhNode.privateKey)
  const p2wpkhKeyPair = ECPair.fromPrivateKey(p2wpkhPrivateKey)
  const p2wpkhAddress = bitcoin.payments.p2wpkh({
    pubkey: p2wpkhKeyPair.publicKey,
    network,
  }).address!

  // Derive P2TR address (bc1p...) - m/86'/0'/0'/0/0
  const p2trPath = "m/86'/0'/0'/0/0"
  const p2trNode = root.derivePath(p2trPath)
  const p2trPrivateKey = ensureBuffer(p2trNode.privateKey)
  const p2trKeyPair = ECPair.fromPrivateKey(p2trPrivateKey)
  const p2trAddress = bitcoin.payments.p2tr({
    internalPubkey: p2trKeyPair.publicKey.subarray(1, 33), // Remove prefix byte for 32-byte internal key
    network,
  }).address!

  // Derive P2SH address (3...) - m/49'/0'/0'/0/0
  const p2shPath = "m/49'/0'/0'/0/0"
  const p2shNode = root.derivePath(p2shPath)
  const p2shPrivateKey = ensureBuffer(p2shNode.privateKey)
  const p2shKeyPair = ECPair.fromPrivateKey(p2shPrivateKey)
  const p2wpkhForP2sh = bitcoin.payments.p2wpkh({ pubkey: p2shKeyPair.publicKey, network })
  const p2shAddress = bitcoin.payments.p2sh({
    redeem: p2wpkhForP2sh,
    network,
  }).address!

  // Derive P2PKH address (1...) - m/44'/0'/0'/0/0
  const p2pkhPath = "m/44'/0'/0'/0/0"
  const p2pkhNode = root.derivePath(p2pkhPath)
  const p2pkhPrivateKey = ensureBuffer(p2pkhNode.privateKey)
  const p2pkhKeyPair = ECPair.fromPrivateKey(p2pkhPrivateKey)
  const p2pkhAddress = bitcoin.payments.p2pkh({
    pubkey: p2pkhKeyPair.publicKey,
    network,
  }).address!

  // Extract tapInternalKey for P2TR (32 bytes, remove prefix if present)
  let p2trTapInternalKey = p2trKeyPair.publicKey
  if (p2trTapInternalKey.length === 33) {
    p2trTapInternalKey = p2trTapInternalKey.subarray(1)
  }

  return {
    p2wpkh: {
      address: p2wpkhAddress,
      privateKey: p2wpkhPrivateKey,
      publicKey: p2wpkhKeyPair.publicKey,
      path: p2wpkhPath,
      pubKeyHex: p2wpkhKeyPair.publicKey.toString('hex'),
    },
    p2tr: {
      address: p2trAddress,
      privateKey: p2trPrivateKey,
      publicKey: p2trKeyPair.publicKey,
      path: p2trPath,
      pubKeyHex: p2trKeyPair.publicKey.toString('hex'),
      tapInternalKey: p2trTapInternalKey.toString('hex'),
    },
    p2sh: {
      address: p2shAddress,
      privateKey: p2shPrivateKey,
      publicKey: p2shKeyPair.publicKey,
      path: p2shPath,
      pubKeyHex: p2shKeyPair.publicKey.toString('hex'),
    },
    p2pkh: {
      address: p2pkhAddress,
      privateKey: p2pkhPrivateKey,
      publicKey: p2pkhKeyPair.publicKey,
      path: p2pkhPath,
      pubKeyHex: p2pkhKeyPair.publicKey.toString('hex'),
    },
  }
}

/**
 * Derive a Bitcoin wallet from a seed phrase (backward compatibility)
 */
function deriveWalletFromPhrase(phrase: string): {
  address: string
  privateKey: Buffer
  publicKey: Buffer
  addressType: 'p2wpkh' | 'p2tr'
} {
  // Validate mnemonic
  if (!bip39.validateMnemonic(phrase)) {
    throw new Error('Invalid mnemonic phrase')
  }

  // Convert mnemonic to seed
  const seed = bip39.mnemonicToSeedSync(phrase)
  
  // Ensure seed is a Buffer (convert Uint8Array to Buffer if needed)
  const seedBuffer = Buffer.isBuffer(seed) ? seed : Buffer.from(seed)
  
  // Derive root key
  const root = bip32.fromSeed(seedBuffer)
  const network = getBitcoinNetwork()
  
  // Helper to ensure private key is a Buffer
  const ensureBuffer = (key: Buffer | Uint8Array | undefined): Buffer => {
    if (!key) throw new Error('Private key is undefined')
    return Buffer.isBuffer(key) ? key : Buffer.from(key)
  }

  // Use P2WPKH as default
  const p2wpkhPath = "m/84'/0'/0'/0/0"
  const p2wpkhNode = root.derivePath(p2wpkhPath)
  const p2wpkhPrivateKey = ensureBuffer(p2wpkhNode.privateKey)
  const p2wpkhKeyPair = ECPair.fromPrivateKey(p2wpkhPrivateKey)
  const p2wpkhAddress = bitcoin.payments.p2wpkh({
    pubkey: p2wpkhKeyPair.publicKey,
    network,
  }).address!

  return {
    address: p2wpkhAddress,
    privateKey: p2wpkhPrivateKey,
    publicKey: p2wpkhKeyPair.publicKey,
    addressType: 'p2wpkh',
  }
}

/**
 * GET /api/admin/payout-testing - Get wallet information from PHRASE
 */
export async function GET(request: NextRequest) {
  try {
    const phrase = process.env.PHRASE
    if (!phrase) {
      return NextResponse.json(
        { error: 'PHRASE environment variable is not set' },
        { status: 500 }
      )
    }

    const feeWallet = process.env.FEE_WALLET || 'bc1p693zz6n9cvmsewemg4j0pmvfvs4th3ft9c74afrc90l6sah300uqt99vee'
    const wallets = deriveAllWalletsFromPhrase(phrase)

    // Check which address matches FEE_WALLET
    const matchingAddress = Object.values(wallets).find(w => w.address === feeWallet)
    const matchedType = matchingAddress 
      ? Object.keys(wallets).find(key => wallets[key as keyof typeof wallets].address === feeWallet)
      : null

    return NextResponse.json({
      success: true,
      feeWallet,
      feeWalletMatches: !!matchingAddress,
      matchedType,
      wallets: {
        p2wpkh: {
          address: wallets.p2wpkh.address,
          path: wallets.p2wpkh.path,
          pubKeyHex: wallets.p2wpkh.pubKeyHex,
          pubKeyLength: wallets.p2wpkh.publicKey.length,
        },
        p2tr: {
          address: wallets.p2tr.address,
          path: wallets.p2tr.path,
          pubKeyHex: wallets.p2tr.pubKeyHex,
          tapInternalKey: wallets.p2tr.tapInternalKey,
          tapInternalKeyLength: wallets.p2tr.tapInternalKey.length / 2, // hex to bytes
          pubKeyLength: wallets.p2tr.publicKey.length,
        },
        p2sh: {
          address: wallets.p2sh.address,
          path: wallets.p2sh.path,
          pubKeyHex: wallets.p2sh.pubKeyHex,
          pubKeyLength: wallets.p2sh.publicKey.length,
        },
        p2pkh: {
          address: wallets.p2pkh.address,
          path: wallets.p2pkh.path,
          pubKeyHex: wallets.p2pkh.pubKeyHex,
          pubKeyLength: wallets.p2pkh.publicKey.length,
        },
      },
    })
  } catch (error: any) {
    console.error('Wallet info error:', error)
    return NextResponse.json(
      { 
        error: error.message || 'Failed to derive wallet information',
        success: false,
      },
      { status: 500 }
    )
  }
}

/**
 * POST /api/admin/payout-testing - Test sending a payout from the PHRASE wallet
 */
export async function POST(request: NextRequest) {
  try {
    // Check for PHRASE environment variable
    const phrase = process.env.PHRASE
    if (!phrase) {
      return NextResponse.json(
        { error: 'PHRASE environment variable is not set' },
        { status: 500 }
      )
    }

    const body = await request.json()
    const { recipientAddress, amount } = body

    if (!recipientAddress || typeof recipientAddress !== 'string') {
      return NextResponse.json(
        { error: 'Recipient address is required' },
        { status: 400 }
      )
    }

    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json(
        { error: 'Valid amount is required (greater than 0)' },
        { status: 400 }
      )
    }

    // Convert amount to satoshis
    const amountSats = Math.round(amount * 100000000)
    if (amountSats < 546) {
      return NextResponse.json(
        { error: 'Amount must be at least 546 sats (Bitcoin dust limit)' },
        { status: 400 }
      )
    }

    console.log('🔐 Deriving P2TR (Taproot) wallet from seed phrase...')
    const allWallets = deriveAllWalletsFromPhrase(phrase)
    const p2trWallet = allWallets.p2tr
    
    console.log(`   P2TR Address: ${p2trWallet.address}`)
    console.log(`   Tap Internal Key: ${p2trWallet.tapInternalKey}`)

    // Build wallet object for P2TR
    const wallet: { address: string; privateKey: Buffer; publicKey: Buffer; addressType: string; tapInternalKey: string } = {
      address: p2trWallet.address,
      privateKey: p2trWallet.privateKey,
      publicKey: p2trWallet.publicKey,
      addressType: 'p2tr',
      tapInternalKey: p2trWallet.tapInternalKey,
    }

    // Fetch UTXOs from the P2TR address
    console.log('🔍 Fetching UTXOs from P2TR address...')
    const utxoResult = await fetchUtxos(wallet.address, [])
    const allUtxos = convertSandshrewToMempoolFormat(utxoResult.utxos)
    const filteredUtxos = filterAndSortUtxos(allUtxos)

    if (filteredUtxos.length === 0) {
      return NextResponse.json(
        { 
          error: `No spendable UTXOs found in P2TR address: ${wallet.address}`,
        },
        { status: 400 }
      )
    }

    console.log(`   ✅ Found ${filteredUtxos.length} spendable UTXOs in P2TR address`)

    // Get fee rate
    let feeRate = 10
    try {
      const feeResponse = await fetch('https://mempool.space/api/v1/fees/recommended', {
        signal: AbortSignal.timeout(5000),
      })
      if (feeResponse.ok) {
        const feeData = await feeResponse.json()
        feeRate = feeData.economyFee || 10
      }
    } catch (error) {
      console.warn('Failed to fetch fee rate, using default:', error)
    }

    console.log(`   Using fee rate: ${feeRate} sat/vB`)

    // Select UTXOs to cover the amount + fees
    // Estimate fee: base transaction size + outputs (payment + change)
    // Rough estimate: ~250 vB base + ~34 vB per output
    const estimatedOutputCount = 2 // payment + change
    const estimatedFee = Math.ceil((250 + (estimatedOutputCount * 34)) * feeRate)
    const totalNeeded = amountSats + estimatedFee

    let selectedUtxos: any[] = []
    let totalInput = 0

    for (const utxo of filteredUtxos) {
      selectedUtxos.push(utxo)
      totalInput += utxo.value
      if (totalInput >= totalNeeded) {
        break
      }
    }

    // Recalculate fee with actual input/output count
    const willHaveChange = totalInput - amountSats - estimatedFee > 546
    const actualOutputCount = 1 + (willHaveChange ? 1 : 0) // payment + (maybe change)
    const actualFee = Math.ceil((250 + (selectedUtxos.length * 68) + (actualOutputCount * 34)) * feeRate)

    if (totalInput < amountSats + actualFee) {
      return NextResponse.json(
        { 
          error: `Insufficient funds: need ${amountSats + actualFee} sats but only have ${totalInput} sats available` 
        },
        { status: 400 }
      )
    }

    console.log(`   Selected ${selectedUtxos.length} UTXOs (${totalInput} sats total)`)
    console.log(`   Estimated fee: ${actualFee} sats`)

    // Create PSBT
    console.log('📝 Creating PSBT...')
    const network = getBitcoinNetwork()
    const psbt = new bitcoin.Psbt({ network })
    const addrType = getAddressType(wallet.address)

    console.log(`   Address type: ${addrType}`)
    if (wallet.addressType === 'p2tr') {
      console.log(`   Tap Internal Key: ${wallet.tapInternalKey}`)
    }

    // Add inputs
    for (const utxo of selectedUtxos) {
      const inputData: any = {
        hash: utxo.txid,
        index: utxo.vout,
      }

      // All modern address types use witnessUtxo
      inputData.witnessUtxo = {
        script: bitcoin.address.toOutputScript(wallet.address, network),
        value: utxo.value,
      }

      // For P2SH, we need redeemScript
      if (addrType === 'p2sh') {
        const pubkeyBuffer = wallet.publicKey
        const nested = bitcoin.payments.p2sh({
          redeem: bitcoin.payments.p2wpkh({ pubkey: pubkeyBuffer, network }),
          network,
        })
        if (nested.redeem?.output) {
          inputData.redeemScript = nested.redeem.output
          console.log(`   ✅ Added redeemScript for P2SH input`)
        }
      }

      psbt.addInput(inputData)
      const inputIndex = psbt.data.inputs.length - 1

      // Add signing info - for P2TR, addInputSigningInfo will set tapInternalKey
      if (addrType === 'p2tr') {
        // For P2TR, use tapInternalKey (32 bytes) or derive from public key
        let tapKeyHex = wallet.tapInternalKey
        if (!tapKeyHex) {
          // Fallback: derive from public key
          let pubKeyBuffer = Buffer.from(wallet.publicKey)
          if (pubKeyBuffer.length === 33) {
            pubKeyBuffer = pubKeyBuffer.subarray(1)
          }
          tapKeyHex = pubKeyBuffer.toString('hex')
        }
        addInputSigningInfo(
          psbt,
          inputIndex,
          wallet.address,
          undefined,
          tapKeyHex,
          utxo.value
        )
      } else if (addrType === 'p2sh') {
        // For P2SH, use paymentPublicKey
        const pubKeyHex = wallet.publicKey.toString('hex')
        addInputSigningInfo(
          psbt,
          inputIndex,
          wallet.address,
          pubKeyHex,
          undefined,
          utxo.value
        )
      } else {
        // For P2WPKH, P2PKH, and others, use the public key
        const pubKeyHex = wallet.publicKey.toString('hex')
        addInputSigningInfo(
          psbt,
          inputIndex,
          wallet.address,
          pubKeyHex,
          undefined,
          utxo.value
        )
      }
    }

    // Add output to recipient
    psbt.addOutput({
      address: recipientAddress,
      value: amountSats,
    })
    console.log(`   Output: ${amountSats} sats → ${recipientAddress.substring(0, 20)}...`)

    // Add change output (if any)
    const change = totalInput - amountSats - actualFee
    if (change > 546) {
      psbt.addOutput({
        address: wallet.address,
        value: change,
      })
      console.log(`   Change output: ${change} sats → ${wallet.address.substring(0, 20)}...`)
    }

    // Sign the PSBT
    console.log('✍️ Signing PSBT...')
    
    // Create base key pair from private key
    const baseKeyPair = ECPair.fromPrivateKey(wallet.privateKey, { network })
    
    // For P2TR, we need to use TweakedSigner which handles the taproot tweak
    // This is required because taproot uses key tweaking - the internal key is
    // cryptographically modified to create the final address
    let signingKeyPair: any = baseKeyPair
    
    if (addrType === 'p2tr') {
      console.log(`   🔧 Creating tweaked signer for P2TR address...`)
      console.log(`   Address: ${wallet.address}`)
      console.log(`   Tap Internal Key: ${wallet.tapInternalKey}`)
      
      // Use TweakedSigner.tweakSigner() to create a signer that handles taproot tweak
      // This automatically computes the tweak and adjusts the signing process
      signingKeyPair = TweakedSigner.tweakSigner(baseKeyPair, {
        network,
      })
      
      console.log(`   ✅ Tweaked signer created`)
    }
    
    // Sign all inputs
    // For P2TR, use the tweaked signer with signInput (TweakedSigner handles the tweak)
    // For other address types, use standard signing
    for (let i = 0; i < psbt.inputCount; i++) {
      try {
        if (addrType === 'p2tr') {
          // For P2TR, use the tweaked signer with regular signInput
          // The TweakedSigner automatically handles the taproot tweak
          console.log(`   🔧 Signing P2TR input ${i} with tweaked signer...`)
          psbt.signInput(i, signingKeyPair)
          console.log(`   ✅ Signed P2TR input ${i}`)
        } else {
          // For other address types, use standard signing
          psbt.signInput(i, signingKeyPair)
          console.log(`   ✅ Signed input ${i}`)
        }
      } catch (signError: any) {
        console.error(`   ❌ Error signing input ${i}:`, signError)
        
        // For P2TR, verify tapInternalKey is set correctly
        if (addrType === 'p2tr') {
          const input = psbt.data.inputs[i]
          if (!input.tapInternalKey) {
            console.log(`   🔄 Input ${i} missing tapInternalKey, adding it...`)
            const tapInternalKeyBuffer = Buffer.from(wallet.tapInternalKey, 'hex')
            psbt.updateInput(i, {
              tapInternalKey: tapInternalKeyBuffer
            })
            
            // Try signing again
            try {
              psbt.signInput(i, signingKeyPair)
              console.log(`   ✅ Signed input ${i} after adding tapInternalKey`)
            } catch (retryError: any) {
              throw new Error(`Failed to sign P2TR input ${i}: ${retryError.message}`)
            }
          } else {
            throw new Error(`Failed to sign P2TR input ${i}: ${signError.message}`)
          }
        } else {
          throw new Error(`Failed to sign input ${i}: ${signError.message}`)
        }
      }
    }

    // Finalize all inputs
    console.log('🔒 Finalizing PSBT...')
    try {
      psbt.finalizeAllInputs()
    } catch (finalizeError: any) {
      console.error('Standard finalization failed:', finalizeError)
      // Try individual finalization for each input
      for (let i = 0; i < psbt.inputCount; i++) {
        const input = psbt.data.inputs[i]
        // Try to finalize without custom function first (library should handle it)
        try {
          psbt.finalizeInput(i)
          console.log(`   ✅ Input ${i} finalized automatically`)
        } catch (e: any) {
          // If automatic finalization fails, try manual finalization
          // For P2TR, the library should handle this automatically with TweakedSigner
          // This fallback is mainly for P2WPKH
          if (input.partialSig && input.partialSig.length > 0 && !input.finalScriptWitness) {
            // Import the utility function from psbtutils
            const { witnessStackToScriptWitness } = require('bitcoinjs-lib/src/psbt/psbtutils')
            
            psbt.finalizeInput(i, (inputIndex: number, psbtInput: any) => {
              if (!psbtInput.partialSig || psbtInput.partialSig.length === 0) {
                throw new Error(`Input ${inputIndex} has no partial signature`)
              }
              const signature = psbtInput.partialSig[0].signature
              const pubkey = psbtInput.partialSig[0].pubkey
              
              return {
                finalScriptSig: undefined,
                finalScriptWitness: witnessStackToScriptWitness([signature, pubkey])
              }
            })
            console.log(`   ✅ Input ${i} finalized with custom P2WPKH finalizer`)
          } else {
            console.error(`   ❌ Failed to finalize input ${i}:`, e.message)
            throw new Error(`Failed to finalize input ${i}: ${e.message}`)
          }
        }
      }
    }

    // Extract transaction
    const tx = psbt.extractTransaction()
    const txHex = tx.toHex()
    const txId = tx.getId()

    console.log(`   Transaction ID: ${txId}`)

    // Broadcast transaction
    console.log('📡 Broadcasting transaction...')
    const broadcastResponse = await fetch('https://mempool.space/api/tx', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
      },
      body: txHex,
    })

    if (!broadcastResponse.ok) {
      const errorText = await broadcastResponse.text()
      throw new Error(`Failed to broadcast transaction: ${errorText}`)
    }

    const broadcastTxId = await broadcastResponse.text()
    console.log(`   ✅ Transaction broadcast successfully: ${broadcastTxId}`)

    return NextResponse.json({
      success: true,
      txid: txId,
      message: `Successfully sent ${amount} BTC (${amountSats} sats) to ${recipientAddress}`,
      sourceAddress: wallet.address,
      sourceAddressType: wallet.addressType.toUpperCase(),
      fee: actualFee,
      change: change > 546 ? change : 0,
    })
  } catch (error: any) {
    console.error('Payout testing error:', error)
    return NextResponse.json(
      { 
        error: error.message || 'Failed to process payout',
        success: false,
        message: error.message || 'Failed to process payout',
      },
      { status: 500 }
    )
  }
}

