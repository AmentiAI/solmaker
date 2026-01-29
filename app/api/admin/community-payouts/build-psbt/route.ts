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
import { sql } from '@/lib/database'
import { isAdmin } from '@/lib/auth/access-control'

// Initialize ECC library
bitcoin.initEccLib(ecc)
const ECPair = ECPairFactory(ecc)
const bip32 = BIP32Factory(ecc)

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
 * POST /api/admin/community-payouts/build-psbt
 * Build a PSBT to distribute 30% of revenue to ordmaker holders
 */
export async function POST(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const body = await request.json()
    const { wallet_address, holders, total_revenue_sats, payout_amount_sats, should_broadcast } = body

    if (!wallet_address || !isAdmin(wallet_address)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    if (!Array.isArray(holders) || holders.length === 0) {
      return NextResponse.json({ error: 'Holders array is required' }, { status: 400 })
    }

    if (!total_revenue_sats || !payout_amount_sats) {
      return NextResponse.json({ error: 'Revenue and payout amounts are required' }, { status: 400 })
    }

    // Check for PHRASE environment variable
    const phrase = process.env.PHRASE
    if (!phrase) {
      return NextResponse.json(
        { error: 'PHRASE environment variable is not set' },
        { status: 500 }
      )
    }

    // Match holders to profiles to get paymentAddress and filter by opt_in
    console.log(`🔍 Matching ${holders.length} holders to profiles and filtering by opt_in...`)
    
    // Get all wallet addresses from holders
    const holderAddresses = holders.map(h => h.wallet_address)
    
    // Fetch profiles for all holders in one query
    const profiles = await sql`
      SELECT wallet_address, payment_address, opt_in
      FROM profiles
      WHERE wallet_address = ANY(${holderAddresses})
    ` as any[]
    
    // Create a map of wallet_address -> profile for quick lookup
    const profileMap = new Map<string, { payment_address: string | null; opt_in: boolean }>()
    for (const profile of profiles) {
      profileMap.set(profile.wallet_address, {
        payment_address: profile.payment_address || null,
        opt_in: profile.opt_in || false,
      })
    }
    
    console.log(`   Found ${profiles.length} profiles out of ${holders.length} holders`)
    
    // Filter holders to only those who have opted in and have paymentAddress
    const optedInHolders = holders.filter(holder => {
      const profile = profileMap.get(holder.wallet_address)
      const isOptedIn = profile?.opt_in === true
      const hasPaymentAddress = profile?.payment_address && profile.payment_address.trim().length > 0
      
      if (!isOptedIn) {
        console.log(`   ⏭️  Skipping ${holder.wallet_address} (not opted in)`)
        return false
      }
      if (!hasPaymentAddress) {
        console.log(`   ⏭️  Skipping ${holder.wallet_address} (no paymentAddress)`)
        return false
      }
      return true
    })
    
    console.log(`   ✅ ${optedInHolders.length} holders opted in and have paymentAddress`)
    
    if (optedInHolders.length === 0) {
      return NextResponse.json({ 
        error: 'No opted-in holders with paymentAddress found. Holders must opt-in and have a paymentAddress set.' 
      }, { status: 400 })
    }

    // Calculate payout per holder (proportional to their holdings)
    const TOTAL_SUPPLY = 168
    const totalHoldings = optedInHolders.reduce((sum, h) => sum + h.count, 0)
    
    if (totalHoldings === 0) {
      return NextResponse.json({ error: 'Total holdings cannot be zero' }, { status: 400 })
    }

    // Calculate payout for each holder: (holder_count / total_supply) * payout_amount
    // Use paymentAddress from profile as the payout address
    const payouts = optedInHolders.map(holder => {
      const profile = profileMap.get(holder.wallet_address)!
      const share = holder.count / TOTAL_SUPPLY
      const amountSats = Math.floor(payout_amount_sats * share)
      return {
        wallet_address: holder.wallet_address, // Keep original for tracking
        payment_address: profile.payment_address!, // Use paymentAddress for payout
        count: holder.count,
        share,
        amount_sats: amountSats,
      }
    })

    // Filter out payouts that are too small (dust limit is 546 sats)
    let validPayouts = payouts.filter(p => p.amount_sats >= 546)
    
    if (validPayouts.length === 0) {
      return NextResponse.json({ error: 'No valid payouts (all below dust limit)' }, { status: 400 })
    }

    // Calculate total of all rounded payouts
    let totalPayoutAmount = validPayouts.reduce((sum, p) => sum + p.amount_sats, 0)
    
    // Distribute remainder to ensure total matches payout_amount_sats exactly
    // Sort by amount (largest first) to distribute remainder fairly
    const remainder = payout_amount_sats - totalPayoutAmount
    
    if (remainder > 0 && validPayouts.length > 0) {
      // Sort payouts by amount descending, then by count descending
      validPayouts.sort((a, b) => {
        if (b.amount_sats !== a.amount_sats) {
          return b.amount_sats - a.amount_sats
        }
        return b.count - a.count
      })
      
      // Distribute remainder to largest holders (1 sat at a time)
      let remainingToDistribute = remainder
      let index = 0
      
      while (remainingToDistribute > 0 && index < validPayouts.length) {
        validPayouts[index].amount_sats += 1
        remainingToDistribute -= 1
        index = (index + 1) % validPayouts.length // Round-robin distribution
      }
      
      // Recalculate total after distribution
      totalPayoutAmount = validPayouts.reduce((sum, p) => sum + p.amount_sats, 0)
      
      console.log(`   📊 Distributed ${remainder} sats remainder to ensure total matches ${payout_amount_sats} sats`)
    }

    console.log(`🔐 Deriving P2TR (Taproot) wallet from seed phrase...`)
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

    // Fetch UTXOs
    console.log('🔍 Fetching UTXOs...')
    const utxoResult = await fetchUtxos(wallet.address, [])
    const allUtxos = convertSandshrewToMempoolFormat(utxoResult.utxos)
    const filteredUtxos = filterAndSortUtxos(allUtxos)

    if (filteredUtxos.length === 0) {
      return NextResponse.json(
        { error: 'No spendable UTXOs found in the wallet' },
        { status: 400 }
      )
    }

    // Get fee rate from mempool.space
    // The API returns: fastestFee, halfHourFee, hourFee, economyFee (all in sat/vB)
    let feeRate = 1
    let feeRates = {
      fastest: 1,
      halfHour: 1,
      hour: 1,
      economy: 1,
    }
    try {
      const feeResponse = await fetch('https://mempool.space/api/v1/fees/recommended', {
        signal: AbortSignal.timeout(5000),
      })
      if (feeResponse.ok) {
        const feeData = await feeResponse.json()
        feeRates = {
          fastest: feeData.fastestFee || 1,
          halfHour: feeData.halfHourFee || 1,
          hour: feeData.hourFee || 1,
          economy: feeData.economyFee || 1,
        }
        feeRate = feeRates.economy // Use economyFee (lowest/cheapest)
        console.log(`   📊 Fee rates from mempool.space:`)
        console.log(`      Fastest: ${feeRates.fastest} sat/vB`)
        console.log(`      Half Hour: ${feeRates.halfHour} sat/vB`)
        console.log(`      Hour: ${feeRates.hour} sat/vB`)
        console.log(`      Economy: ${feeRates.economy} sat/vB (using this)`)
      }
    } catch (error) {
      console.warn('Failed to fetch fee rate, using default 10 sat/vB:', error)
    }

    console.log(`   💰 Using fee rate: ${feeRate} sat/vB`)

    // Estimate fee: base transaction size + inputs + outputs (all payouts + change)
    // Rough estimate: ~250 vB base + ~68 vB per input + ~34 vB per output
    const estimatedOutputCount = validPayouts.length + 1 // all payouts + change
    const estimatedFee = Math.ceil((250 + (filteredUtxos.length * 68) + (estimatedOutputCount * 34)) * feeRate)
    const totalNeeded = totalPayoutAmount + estimatedFee

    // Select UTXOs
    let selectedUtxos: any[] = []
    let totalInput = 0

    for (const utxo of filteredUtxos) {
      selectedUtxos.push(utxo)
      totalInput += utxo.value
      if (totalInput >= totalNeeded) {
        break
      }
    }

    // Recalculate fee with actual counts
    const willHaveChange = totalInput - totalPayoutAmount - estimatedFee > 546
    const actualOutputCount = validPayouts.length + (willHaveChange ? 1 : 0)
    const actualFee = Math.ceil((250 + (selectedUtxos.length * 68) + (actualOutputCount * 34)) * feeRate)

    if (totalInput < totalPayoutAmount + actualFee) {
      return NextResponse.json(
        { 
          error: `Insufficient funds: need ${totalPayoutAmount + actualFee} sats but only have ${totalInput} sats available` 
        },
        { status: 400 }
      )
    }

    console.log(`   Selected ${selectedUtxos.length} UTXOs (${totalInput} sats total)`)
    console.log(`   Estimated fee: ${actualFee} sats`)
    console.log(`   Total payout: ${totalPayoutAmount} sats to ${validPayouts.length} holders`)

    // Create PSBT
    console.log('📝 Creating PSBT...')
    const network = getBitcoinNetwork()
    const psbt = new bitcoin.Psbt({ network })
    const addrType = wallet.addressType

    // Add inputs
    for (const utxo of selectedUtxos) {
      const inputData: any = {
        hash: utxo.txid,
        index: utxo.vout,
      }

      // For all address types, use witnessUtxo (SegWit)
      inputData.witnessUtxo = {
        script: bitcoin.address.toOutputScript(wallet.address, network),
        value: utxo.value,
      }

      // For P2SH, we need to add redeemScript
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

    // Add outputs for each holder
    for (const payout of validPayouts) {
      psbt.addOutput({
        address: payout.payment_address,
        value: payout.amount_sats,
      })
      console.log(`   Output: ${payout.amount_sats} sats → ${payout.payment_address.substring(0, 20)}... (${payout.count} ordmakers, wallet: ${payout.wallet_address.substring(0, 10)}...)`)
    }

    // Add change output (if any)
    const change = totalInput - totalPayoutAmount - actualFee
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
      for (let i = 0; i < psbt.inputCount; i++) {
        const input = psbt.data.inputs[i]
        if (input.partialSig && input.partialSig.length > 0 && !input.finalScriptWitness) {
          // Try to finalize without custom function first (library should handle it)
          try {
            psbt.finalizeInput(i)
          } catch (finalizeError: any) {
            // If automatic finalization fails, try manual finalization
            // For P2TR, the library should handle this automatically with TweakedSigner
            // This fallback is mainly for P2WPKH
            if (addrType === 'p2wpkh') {
              psbt.finalizeInput(i, (inputIndex: number, psbtInput: any) => {
                if (!psbtInput.partialSig || psbtInput.partialSig.length === 0) {
                  throw new Error(`Input ${inputIndex} has no partial signature`)
                }
                const signature = psbtInput.partialSig[0].signature
                const pubkey = psbtInput.partialSig[0].pubkey
                
                // Use bitcoinjs-lib's utility to convert witness stack to buffer
                const witnessStack = [signature, pubkey]
                // Import the utility function from psbtutils
                const { witnessStackToScriptWitness } = require('bitcoinjs-lib/src/psbt/psbtutils')
                const finalScriptWitness = witnessStackToScriptWitness(witnessStack)
                
                return {
                  finalScriptSig: undefined,
                  finalScriptWitness: finalScriptWitness
                }
              })
            } else {
              // For P2TR, re-throw the error as it should have been handled by TweakedSigner
              throw finalizeError
            }
          }
        }
      }
    }

    // Extract transaction
    const tx = psbt.extractTransaction()
    const txHex = tx.toHex()
    const txId = tx.getId()

    console.log(`   Transaction ID: ${txId}`)

    // Broadcast transaction if requested
    let broadcasted = false
    let broadcastError = null
    if (should_broadcast) {
      console.log('📡 Broadcasting transaction to mempool.space...')
      try {
        const broadcastResponse = await fetch('https://mempool.space/api/tx', {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain',
          },
          body: txHex,
        })

        if (!broadcastResponse.ok) {
          const errorText = await broadcastResponse.text()
          throw new Error(`Broadcast failed: ${broadcastResponse.status} ${errorText}`)
        }

        const broadcastTxId = await broadcastResponse.text()
        console.log(`   ✅ Transaction broadcasted successfully: ${broadcastTxId}`)
        broadcasted = true
      } catch (broadcastErr: any) {
        console.error('   ❌ Broadcast error:', broadcastErr)
        broadcastError = broadcastErr.message
        // Continue even if broadcast fails - we still want to save the transaction
      }
    } else {
      console.log('   ⓘ Skipping broadcast (should_broadcast=false)')
    }

    // Only save to database if transaction was successfully broadcasted
    // This prevents test transactions from showing up in user payout history
    let communityPayoutId = null
    if (broadcasted) {
      console.log('   💾 Saving payout records to database...')
      
      // Save snapshot to database
      const snapshotData = {
        holders: validPayouts.map(p => ({
          wallet_address: p.wallet_address,
          count: p.count,
          amount_sats: p.amount_sats,
        })),
        total_holders: validPayouts.length,
        total_ordmakers: validPayouts.reduce((sum, p) => sum + p.count, 0),
      }

      // Insert community payout record and get the ID
      // Explicitly set snapshot_taken_at to current timestamp so it's used as the last payout date
      const communityPayoutResult = await sql`
        INSERT INTO community_payouts (
          snapshot_taken_at,
          payout_tx_id,
          total_revenue_sats,
          payout_amount_sats,
          total_holders,
          total_supply,
          holders_data
        ) VALUES (
          CURRENT_TIMESTAMP,
          ${txId},
          ${total_revenue_sats},
          ${totalPayoutAmount},
          ${validPayouts.length},
          168,
          ${JSON.stringify(snapshotData)}::jsonb
        )
        RETURNING id, snapshot_taken_at
      ` as any[]
      
      console.log(`   📅 Last payout timestamp set to: ${communityPayoutResult?.[0]?.snapshot_taken_at}`)

      communityPayoutId = communityPayoutResult?.[0]?.id

      // Save individual user payouts
      for (const payout of validPayouts) {
        const sharePercentage = (payout.count / TOTAL_SUPPLY) * 100
        
        await sql`
          INSERT INTO user_payouts (
            wallet_address,
            payout_tx_id,
            amount_sats,
            ordmaker_count,
            share_percentage,
            community_payout_id
          ) VALUES (
            ${payout.wallet_address},
            ${txId},
            ${payout.amount_sats},
            ${payout.count},
            ${sharePercentage},
            ${communityPayoutId}
          )
        `
      }

      console.log(`   ✅ Saved ${validPayouts.length} individual user payouts`)
    } else {
      console.log('   ⓘ Skipping database save (test transaction - not broadcasted)')
    }

    return NextResponse.json({
      success: true,
      psbt_base64: psbt.toBase64(),
      tx_hex: txHex,
      tx_id: txId,
      source_address: wallet.address,
      total_payout: totalPayoutAmount,
      fee: actualFee,
      change: change > 546 ? change : 0,
      payout_count: validPayouts.length,
      payouts: validPayouts,
      broadcasted: broadcasted,
      broadcast_error: broadcastError || undefined,
      message: should_broadcast 
        ? (broadcasted ? 'PSBT created and broadcasted successfully.' : `PSBT created but broadcast failed: ${broadcastError}`)
        : 'PSBT created successfully. Review before broadcasting.',
    })
  } catch (error: any) {
    console.error('PSBT build error:', error)
    return NextResponse.json({ 
      error: 'Failed to build PSBT',
      details: error.message 
    }, { status: 500 })
  }
}

