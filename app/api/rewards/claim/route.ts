import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import * as bip39 from 'bip39'
import { BIP32Factory } from 'bip32'
import * as bitcoin from 'bitcoinjs-lib'
import * as ecc from '@bitcoinerlab/secp256k1'
import { ECPairFactory } from 'ecpair'
import { TweakedSigner } from '@btc-vision/transaction'
import { getBitcoinNetwork, getAddressType, addInputSigningInfo } from '@/lib/bitcoin-utils'
import { fetchUtxos, filterAndSortUtxos, convertSandshrewToMempoolFormat } from '@/lib/utxo-fetcher'

// Initialize ECC library
bitcoin.initEccLib(ecc)
const ECPair = ECPairFactory(ecc)
const bip32 = BIP32Factory(ecc)

/**
 * Derive all Bitcoin address types from a seed phrase (same as community payouts)
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
 * POST /api/rewards/claim
 * Claim a won ordinal by transferring it to the winner's wallet
 * Requires: attempt_id, winner_wallet_address
 */
export async function POST(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const body = await request.json()
    const { attempt_id, winner_wallet_address } = body

    if (!attempt_id) {
      return NextResponse.json({ error: 'attempt_id is required' }, { status: 400 })
    }

    if (!winner_wallet_address) {
      return NextResponse.json({ error: 'winner_wallet_address is required' }, { status: 400 })
    }

    // Get the reward attempt
    const attempts = await sql`
      SELECT 
        id,
        wallet_address,
        result,
        won_ordinal_id,
        won_ordinal_inscription_id,
        won_ordinal_inscription_number,
        claimed,
        claim_txid
      FROM reward_attempts
      WHERE id = ${attempt_id}
    ` as any[]

    if (!attempts || attempts.length === 0) {
      return NextResponse.json({ error: 'Reward attempt not found' }, { status: 404 })
    }

    const attempt = attempts[0]

    // SECURITY: Verify ownership (case-insensitive comparison)
    if (attempt.wallet_address.toLowerCase() !== winner_wallet_address.toLowerCase()) {
      console.error(`[SECURITY] Claim attempt by wrong wallet. Attempt wallet: ${attempt.wallet_address}, Claimer: ${winner_wallet_address}`)
      return NextResponse.json({ error: 'Unauthorized: This reward does not belong to you' }, { status: 403 })
    }

    // Check if already claimed
    if (attempt.claimed) {
      return NextResponse.json({ 
        error: 'This reward has already been claimed',
        claim_txid: attempt.claim_txid 
      }, { status: 400 })
    }

    // Check if it was a win
    if (attempt.result !== 'win') {
      return NextResponse.json({ error: 'This reward attempt was not a win' }, { status: 400 })
    }

    // SECURITY: Double-check that the ordinal still exists in the payout wallet
    // This prevents claiming ordinals that were already transferred
    const phrase = process.env.PHRASE
    if (!phrase) {
      return NextResponse.json({ error: 'Payout wallet not configured' }, { status: 500 })
    }

    // Derive platform wallet (same as community payouts)
    const allWallets = deriveAllWalletsFromPhrase(phrase)
    const platformWallet = allWallets.p2tr
    
    // Verify ordinal is still in payout wallet
    const verifyApiKey = process.env.MAGIC_EDEN_API_KEY
    const verifyHeaders: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'OrdMaker/1.0',
    }

    if (verifyApiKey) {
      verifyHeaders['X-API-Key'] = verifyApiKey
      verifyHeaders['Authorization'] = `Bearer ${verifyApiKey}`
    }

    try {
      const verifyResponse = await fetch(
        `https://api-mainnet.magiceden.dev/v2/ord/btc/tokens/${attempt.won_ordinal_inscription_id}`,
        { headers: verifyHeaders }
      )

      if (verifyResponse.ok) {
        const ordinalData = await verifyResponse.json()
        const ownerAddress = ordinalData.owner || ordinalData.ownerAddress || ordinalData.currentOwner || ordinalData.owner_address
        
        if (ownerAddress && ownerAddress.toLowerCase() !== platformWallet.address.toLowerCase()) {
          console.error(`[SECURITY] Ordinal ${attempt.won_ordinal_inscription_id} is no longer in payout wallet. Owner: ${ownerAddress}`)
          return NextResponse.json({ 
            error: 'This ordinal is no longer available in the payout wallet',
            details: 'It may have already been transferred or moved'
          }, { status: 400 })
        }
      }
    } catch (error: any) {
      console.error('Error verifying ordinal ownership:', error)
      // Continue anyway - the transaction will fail if ordinal is not available
    }

    // Check if ordinal info exists
    if (!attempt.won_ordinal_inscription_id) {
      return NextResponse.json({ error: 'No ordinal information found for this reward' }, { status: 400 })
    }

    // Fetch ordinal details from Magic Eden to get UTXO info
    // (phrase and platformWallet already declared above for security check)
    const fetchApiKey = process.env.MAGIC_EDEN_API_KEY
    const fetchHeaders: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'OrdMaker/1.0',
    }

    if (fetchApiKey) {
      fetchHeaders['X-API-Key'] = fetchApiKey
      fetchHeaders['Authorization'] = `Bearer ${fetchApiKey}`
    }

    // Get ordinal details from Magic Eden
    const ordinalResponse = await fetch(
      `https://api-mainnet.magiceden.dev/v2/ord/btc/tokens/${attempt.won_ordinal_inscription_id}`,
      { headers: fetchHeaders }
    )

    if (!ordinalResponse.ok) {
      return NextResponse.json({ 
        error: `Failed to fetch ordinal details: ${ordinalResponse.status}` 
      }, { status: 500 })
    }

    const ordinal = await ordinalResponse.json()

    // Extract UTXO info from Magic Eden response
    // Magic Eden provides: location (txid:vout:value), output (txid:vout), outputValue
    let ordinalTxid: string | null = null
    let ordinalVout: number | null = null
    let ordinalValue: number | null = null

    console.log('📦 Magic Eden ordinal response:', JSON.stringify(ordinal, null, 2))

    // Use outputValue from Magic Eden if available (most accurate)
    if (ordinal.outputValue && typeof ordinal.outputValue === 'number') {
      ordinalValue = ordinal.outputValue
    }

    // Extract txid and vout from location or output
    if (ordinal.location) {
      // Location format: "txid:vout:value" or "txid:vout"
      const parts = ordinal.location.split(':')
      if (parts.length >= 2) {
        ordinalTxid = parts[0]
        ordinalVout = parseInt(parts[1], 10)
        // If value in location, use it (but outputValue takes priority)
        if (parts[2] && !ordinalValue) {
          ordinalValue = parseInt(parts[2], 10)
        }
      }
    } else if (ordinal.output) {
      // Output format: "txid:vout"
      const parts = ordinal.output.split(':')
      if (parts.length >= 2) {
        ordinalTxid = parts[0]
        ordinalVout = parseInt(parts[1], 10)
      }
    } else if (ordinal.genesisTransaction && ordinal.inscriptionNumber !== undefined) {
      // Fallback: use genesis transaction
      ordinalTxid = ordinal.genesisTransaction
      ordinalVout = 0 // Ordinals are typically in output 0
    }

    if (!ordinalTxid || ordinalVout === null) {
      return NextResponse.json({ 
        error: 'Could not extract UTXO information from ordinal. Location/UTXO data missing.' 
      }, { status: 500 })
    }

    // If value still not found, fetch from mempool.space
    if (!ordinalValue) {
      try {
        const txResponse = await fetch(`https://mempool.space/api/tx/${ordinalTxid}`)
        if (txResponse.ok) {
          const txData = await txResponse.json()
          if (txData.vout && txData.vout[ordinalVout]) {
            ordinalValue = txData.vout[ordinalVout].value
          }
        }
      } catch (error) {
        console.warn('Failed to fetch ordinal value from mempool.space:', error)
      }
    }

    // Default to 330 sats (typical ordinal value) if value still unknown, but warn
    if (!ordinalValue || ordinalValue < 330) {
      console.warn(`⚠️  Using default value 330 sats for ordinal (could not determine actual value)`)
      ordinalValue = 330
    }

    console.log(`📦 Ordinal UTXO: ${ordinalTxid}:${ordinalVout} (${ordinalValue} sats)`)

    // Get fee rate
    let feeRate = 1
    try {
      const feeResponse = await fetch('https://mempool.space/api/v1/fees/recommended', {
        signal: AbortSignal.timeout(5000),
      })
      if (feeResponse.ok) {
        const feeData = await feeResponse.json()
        feeRate = feeData.economyFee || feeData.hourFee || 1
      }
    } catch (error) {
      console.warn('Failed to fetch fee rate, using default 1 sat/vB:', error)
    }

    // Fetch payment UTXOs from platform wallet
    console.log('🔍 Fetching payment UTXOs...')
    const utxoResult = await fetchUtxos(platformWallet.address, [])
    const allUtxos = convertSandshrewToMempoolFormat(utxoResult.utxos)
    const filteredUtxos = filterAndSortUtxos(allUtxos)

    if (filteredUtxos.length === 0) {
      return NextResponse.json(
        { error: 'No spendable UTXOs found in platform wallet for fees' },
        { status: 400 }
      )
    }

    // Estimate fee: base + inputs (ordinal + payment) + outputs (winner + change)
    // Rough estimate: ~250 vB base + ~68 vB per input + ~34 vB per output
    const estimatedInputs = 1 + filteredUtxos.length // ordinal + payment UTXOs
    const estimatedOutputs = 2 // winner + change
    const estimatedFee = Math.ceil((250 + (estimatedInputs * 68) + (estimatedOutputs * 34)) * feeRate)

    // Select payment UTXOs for fees
    let selectedPaymentUtxos: any[] = []
    let totalPaymentInput = 0

    for (const utxo of filteredUtxos) {
      selectedPaymentUtxos.push(utxo)
      totalPaymentInput += utxo.value
      if (totalPaymentInput >= estimatedFee + 1000) { // Add buffer
        break
      }
    }

    // Recalculate fee with actual counts
    const willHaveChange = totalPaymentInput - estimatedFee > 546
    const actualOutputs = 1 + (willHaveChange ? 1 : 0) // winner + (change if any)
    const actualInputs = 1 + selectedPaymentUtxos.length // ordinal + payment
    const actualFee = Math.ceil((250 + (actualInputs * 68) + (actualOutputs * 34)) * feeRate)

    if (totalPaymentInput < actualFee) {
      return NextResponse.json(
        { error: `Insufficient funds for fees: need ${actualFee} sats but only have ${totalPaymentInput} sats` },
        { status: 400 }
      )
    }

    console.log(`💰 Fee: ${actualFee} sats (${feeRate} sat/vB)`)
    console.log(`📥 Selected ${selectedPaymentUtxos.length} payment UTXOs (${totalPaymentInput} sats)`)

    // Create PSBT
    console.log('📝 Creating PSBT...')
    const network = getBitcoinNetwork()
    const psbt = new bitcoin.Psbt({ network })

    // Add ordinal input (Input 0)
    const ordinalInputData: any = {
      hash: ordinalTxid,
      index: ordinalVout,
      witnessUtxo: {
        script: bitcoin.address.toOutputScript(platformWallet.address, network),
        value: ordinalValue,
      },
    }

    psbt.addInput(ordinalInputData)
    const ordinalInputIndex = psbt.data.inputs.length - 1

    // Add taproot signing info for ordinal input (AFTER adding input)
    const tapKeyHex = platformWallet.tapInternalKey
    addInputSigningInfo(
      psbt,
      ordinalInputIndex,
      platformWallet.address,
      undefined,
      tapKeyHex,
      ordinalValue
    )

    // Add payment inputs (Input 1+)
    for (const utxo of selectedPaymentUtxos) {
      const inputData: any = {
        hash: utxo.txid,
        index: utxo.vout,
        witnessUtxo: {
          script: bitcoin.address.toOutputScript(platformWallet.address, network),
          value: utxo.value,
        },
      }

      psbt.addInput(inputData)
      const inputIndex = psbt.data.inputs.length - 1

      // Add taproot signing info (AFTER adding input)
      const tapKeyHex = platformWallet.tapInternalKey
      addInputSigningInfo(
        psbt,
        inputIndex,
        platformWallet.address,
        undefined,
        tapKeyHex,
        utxo.value
      )
    }

    // Add output 0: Ordinal to winner (same value as ordinal input)
    psbt.addOutput({
      address: winner_wallet_address,
      value: ordinalValue,
    })
    console.log(`   Output 0: ${ordinalValue} sats → ${winner_wallet_address.substring(0, 20)}... (ordinal)`)

    // Add change output if needed
    const change = totalPaymentInput - actualFee
    if (change > 546) {
      psbt.addOutput({
        address: platformWallet.address,
        value: change,
      })
      console.log(`   Change: ${change} sats → ${platformWallet.address.substring(0, 20)}...`)
    }

    // Sign the PSBT (same as community payouts)
    console.log('✍️ Signing PSBT...')
    
    // Create base key pair from private key
    const baseKeyPair = ECPair.fromPrivateKey(platformWallet.privateKey, { network })
    
    // Get address type
    const addrType = getAddressType(platformWallet.address)
    
    // For P2TR, we need to use TweakedSigner which handles the taproot tweak
    // This is required because taproot uses key tweaking - the internal key is
    // cryptographically modified to create the final address
    let signingKeyPair: any = baseKeyPair
    
    if (addrType === 'p2tr') {
      console.log(`   🔧 Creating tweaked signer for P2TR address...`)
      console.log(`   Address: ${platformWallet.address}`)
      console.log(`   Tap Internal Key: ${platformWallet.tapInternalKey}`)
      
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
            const tapInternalKeyBuffer = Buffer.from(platformWallet.tapInternalKey, 'hex')
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
      // For P2TR, re-throw the error as it should have been handled by TweakedSigner
      throw finalizeError
    }

    // Extract transaction
    const tx = psbt.extractTransaction()
    const txId = tx.getId()
    const txHex = tx.toHex()

    console.log(`✅ Transaction created: ${txId}`)

    // Broadcast transaction
    console.log('📡 Broadcasting transaction...')
    const broadcastResponse = await fetch('https://mempool.space/api/tx', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: txHex,
    })

    if (!broadcastResponse.ok) {
      const errorText = await broadcastResponse.text()
      console.error('❌ Broadcast failed:', errorText)
      return NextResponse.json({ 
        error: 'Failed to broadcast transaction',
        details: errorText 
      }, { status: 500 })
    }

    const broadcastTxId = await broadcastResponse.text()
    console.log(`✅ Transaction broadcasted: ${broadcastTxId}`)

    // Mark as claimed in database
    await sql`
      UPDATE reward_attempts
      SET 
        claimed = true,
        claim_txid = ${txId},
        claim_timestamp = CURRENT_TIMESTAMP
      WHERE id = ${attempt_id}
    `

    return NextResponse.json({
      success: true,
      txid: txId,
      message: 'Ordinal successfully transferred to your wallet',
    })

  } catch (error: any) {
    console.error('Error claiming reward:', error)
    return NextResponse.json({ 
      error: 'Failed to claim reward',
      details: error.message 
    }, { status: 500 })
  }
}
