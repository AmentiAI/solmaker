import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import * as bitcoin from 'bitcoinjs-lib'
import * as ecc from '@bitcoinerlab/secp256k1'
import { getBitcoinNetwork } from '@/lib/bitcoin-utils'
import { fetchUtxos, filterAndSortUtxos, convertSandshrewToMempoolFormat } from '@/lib/utxo-fetcher'
import { addInputSigningInfo, getAddressType } from '@/lib/bitcoin-utils'
import { verifyMarketplacePSBT } from '@/lib/psbt-verifier'

// Initialize ECC library
bitcoin.initEccLib(ecc)

/**
 * POST /api/marketplace/ordinals/purchase
 * Completes the purchase of an ordinal by finishing the partial PSBT
 *
 * The listing already contains all the output details set at listing time:
 * - price_sats, seller_wallet (Output 0: seller payment)
 * - platform_fee_sats, platform_fee_wallet (Output 1: platform fee)
 * - utxo_value (Output 2: ordinal to buyer - same value as seller's input)
 *
 * Buyer's PSBT structure:
 * - Input 0: Ordinal UTXO (from seller's partial PSBT, already signed)
 * - Input 1+: Buyer's payment UTXOs (from payment address)
 * - Output 0: Seller payment (from listing)
 * - Output 1: Platform fee (from listing)
 * - Output 2: Ordinal to buyer (utxo_value to buyer_wallet)
 * - Output 3: Change to buyer's payment address (if > 546 sats)
 * - Remaining sats cover the transaction fee
 */
export async function POST(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const body = await request.json()
    const {
      listing_id,
      buyer_wallet,
      buyer_payment_address, // Address to pay from (may be different from receiving address)
      buyer_pubkey, // tapInternalKey for p2tr addresses
      payment_pubkey, // Public key for payment address (if different from buyer_pubkey)
    } = body

    if (!listing_id) {
      return NextResponse.json({ error: 'listing_id is required' }, { status: 400 })
    }

    if (!buyer_wallet) {
      return NextResponse.json({ error: 'buyer_wallet is required' }, { status: 400 })
    }

    // Fetch listing
    const listings = await sql`
      SELECT *
      FROM ordinal_listings
      WHERE id = ${listing_id}
      AND status = 'active'
    ` as any[]

    if (listings.length === 0) {
      return NextResponse.json({
        error: 'Listing not found or not available for purchase'
      }, { status: 404 })
    }

    const listing = listings[0]

    if (listing.seller_wallet === buyer_wallet) {
      return NextResponse.json({
        error: 'You cannot buy your own listing'
      }, { status: 400 })
    }

    // Use stored values from listing (set at listing time)
    // Ensure all values are integers (sats)
    // Handle both integer and decimal formats (in case of DB type issues)
    let priceSats: number
    if (typeof listing.price_sats === 'number') {
      // If it's a very small number (< 1), it might be in BTC, convert to sats
      if (listing.price_sats < 1 && listing.price_sats > 0) {
        priceSats = Math.round(listing.price_sats * 100000000)
        console.warn(`⚠️ price_sats appears to be in BTC format (${listing.price_sats}), converting to sats: ${priceSats}`)
      } else {
        priceSats = Math.round(listing.price_sats)
      }
    } else {
      const parsed = parseFloat(String(listing.price_sats))
      if (parsed < 1 && parsed > 0) {
        priceSats = Math.round(parsed * 100000000)
        console.warn(`⚠️ price_sats appears to be in BTC format (${parsed}), converting to sats: ${priceSats}`)
      } else {
        priceSats = parseInt(String(listing.price_sats), 10)
      }
    }
    
    if (isNaN(priceSats) || priceSats <= 0) {
      console.error(`❌ Invalid price_sats: ${listing.price_sats} (type: ${typeof listing.price_sats})`)
      return NextResponse.json({ 
        error: 'Invalid price_sats in listing',
        details: `Received: ${listing.price_sats} (${typeof listing.price_sats})`
      }, { status: 400 })
    }
    
    // Sanity check: price should be reasonable (not millions of BTC)
    if (priceSats > 1000000000000) { // > 10,000 BTC
      console.error(`❌ Suspiciously high price_sats: ${priceSats} sats (${(priceSats / 100000000).toFixed(8)} BTC)`)
      return NextResponse.json({ 
        error: 'Invalid price_sats: value too high',
        details: `Price appears to be ${(priceSats / 100000000).toFixed(8)} BTC, which seems incorrect`
      }, { status: 400 })
    }

    // Use stored platform fee from listing (calculated at listing time)
    const platformFeeSats = listing.platform_fee_sats 
      ? parseInt(String(listing.platform_fee_sats), 10)
      : null
    
    if (!platformFeeSats || isNaN(platformFeeSats) || platformFeeSats < 0) {
      console.error(`❌ Missing or invalid platform_fee_sats in listing: ${listing.platform_fee_sats}`)
      return NextResponse.json({ 
        error: 'Invalid platform_fee_sats in listing',
        details: 'Listing is missing platform fee information'
      }, { status: 400 })
    }

    const platformFeeWallet = listing.platform_fee_wallet || 'bc1p693zz6n9cvmsewemg4j0pmvfvs4th3ft9c74afrc90l6sah300uqt99vee'
    const ordinalOutputValue = parseInt(String(listing.utxo_value), 10) || 330 // Default to 330 if missing
    
    if (isNaN(ordinalOutputValue) || ordinalOutputValue <= 0) {
      return NextResponse.json({ error: 'Invalid utxo_value in listing' }, { status: 400 })
    }

    console.log(`💰 Processing purchase of listing ${listing_id}`)
    console.log(`   Inscription: ${listing.inscription_id}`)
    console.log(`   Price: ${priceSats} sats (${(priceSats / 100000000).toFixed(8)} BTC) → ${listing.seller_wallet.substring(0, 16)}...`)
    console.log(`   Platform fee: ${platformFeeSats} sats (${(platformFeeSats / 100000000).toFixed(8)} BTC) → ${platformFeeWallet.substring(0, 16)}...`)
    console.log(`   Ordinal output: ${ordinalOutputValue} sats`)
    console.log(`   Buyer ordinal addr: ${buyer_wallet}`)

    // Parse seller's partial PSBT (read-only, we won't modify it)
    const network = getBitcoinNetwork()
    let partialPsbt: bitcoin.Psbt
    try {
      partialPsbt = bitcoin.Psbt.fromBase64(listing.partial_psbt_base64, { network })
    } catch (e: any) {
      console.error('Failed to parse partial PSBT:', e)
      return NextResponse.json({
        error: 'Invalid partial PSBT in listing',
        details: e.message
      }, { status: 400 })
    }

    console.log(`   Loaded partial PSBT with ${partialPsbt.inputCount} input(s), ${partialPsbt.txOutputs.length} output(s)`)
    
    // CRITICAL: Load seller's PSBT and modify it IN-PLACE
    // DO NOT rebuild a fresh PSBT - signatures are tied to the transaction structure
    // We will:
    // 1. Clone the seller's PSBT (preserves structure and signatures)
    // 2. Modify Output 0 in-place to buyer's address
    // 3. Add buyer inputs
    // 4. Add buyer change output if needed
    // 5. Buyer signs their inputs
    // 6. Finalize and broadcast
    
    // CRITICAL: We need to add buyer padding inputs BEFORE the seller's ordinal input
    // This shifts the ordinal input index and allows the ordinal to land in output[1]
    // 
    // FINAL TRANSACTION STRUCTURE:
    // 
    // INPUTS:
    // - Input[0-1]: Buyer padding UTXOs (1-2 smallest UTXOs, for sat flow control)
    // - Input[2]: Seller ordinal UTXO (546 sats, signed with SIGHASH_SINGLE|ANYONECANPAY)
    // - Input[3+]: Buyer payment UTXOs (to cover seller payment + platform fee + change + gas)
    // 
    // OUTPUTS:
    // - Output[0]: Buyer change from padding inputs (sum of Input[0] + Input[1] value)
    // - Output[1]: Ordinal to buyer (546 sats to buyer's address - ordinal sat lands here via FIFO)
    // - Output[2]: Seller payment (protected by seller's signature at Input[2])
    // - Output[3]: Platform fee
    // - Output[4]: Buyer change from payment inputs (if > 546 sats, otherwise becomes part of fee)
    //
    // HOW ORDINAL SAT ASSIGNMENT WORKS:
    // - FIFO sat assignment across ALL inputs
    // - Input[0] sats → Output[0]
    // - Input[1] sats → Output[0] (continues)
    // - Input[2] (ordinal) first sat → Output[1] (ordinal lands here!)
    // - Input[2] remaining sats → Output[1] (continues)
    // - Input[3+] sats → Output[2], Output[3], Output[4] (payment, fee, change)
    
    // Extract seller's input data and signature (we'll re-add it after padding)
    const sellerInput = partialPsbt.txInputs[0]
    const sellerInputData = partialPsbt.data.inputs[0]
    // Seller's PSBT has: Output[0] = seller payment, Output[1] = platform fee
    const sellerPaymentOutput = partialPsbt.txOutputs[0] // Seller payment (will be output[2] after padding)
    const platformFeeOutput = partialPsbt.txOutputs[1] // Platform fee (will be output[3] after padding)
    
    // Build new PSBT (we need to reorder inputs, so we can't just clone)
    // But we'll preserve the seller's signature by keeping transaction structure identical
    const psbt = new bitcoin.Psbt({ network })
    
    // Copy transaction-level data from seller's PSBT to preserve structure
    psbt.setVersion(partialPsbt.version)
    psbt.setLocktime(partialPsbt.locktime)

    // Use buyer_payment_address for UTXOs (native segwit for payments)
    const paymentAddr = buyer_payment_address || buyer_wallet

    // Fetch buyer's UTXOs from payment address
    console.log(`   Fetching UTXOs from payment address: ${paymentAddr}`)
    const { utxos: rawUtxos } = await fetchUtxos(paymentAddr, [])
    const mempoolUtxos = convertSandshrewToMempoolFormat(rawUtxos)
    
    // CRITICAL: Filter for padding UTXOs BEFORE filterAndSortUtxos removes small ones
    // filterAndSortUtxos filters out UTXOs <= 800 sats, but we need 600-3000 sats for padding
    const MIN_PADDING_UTXO_VALUE = 600
    const MAX_PADDING_UTXO_VALUE = 3000
    const paddingUtxosFromRaw = mempoolUtxos
      .filter((utxo: any) => utxo && typeof utxo.value === 'number' && 
        utxo.value >= MIN_PADDING_UTXO_VALUE && utxo.value < MAX_PADDING_UTXO_VALUE)
      .sort((a: any, b: any) => (a.value || 0) - (b.value || 0)) // Sort smallest first
    
    console.log(`   Found ${paddingUtxosFromRaw.length} potential padding UTXOs (600-3000 sats) in raw UTXOs`)
    
    // Get fee rate (needed for padding UTXO creation if needed)
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
      console.warn('Using default fee rate')
    }

    console.log(`   Fee rate: ${feeRate} sat/vB`)
    
    const sortedUtxos = filterAndSortUtxos(mempoolUtxos)

    if (sortedUtxos.length === 0) {
      return NextResponse.json({
        error: 'No spendable UTXOs found in payment wallet',
        payment_address: paymentAddr,
      }, { status: 400 })
    }

    console.log(`   Found ${sortedUtxos.length} UTXOs in payment wallet (after filtering >800 sats)`)

    // Calculate total needed from buyer's payment wallet:
    // Transaction structure:
    // - Input 0: Ordinal UTXO (seller's, already signed, value = ordinal_output_value)
    // - Input 1+: Buyer's payment UTXOs
    // - Output 0: Seller payment (price_sats)
    // - Output 1: Platform fee (platform_fee_sats)
    // - Output 2: Ordinal to buyer (ordinal_output_value)
    // - Output 3: Buyer change (if > 546)
    //
    // For transaction to be valid: total_inputs = total_outputs + fee
    // ordinal_input + buyer_inputs = price + platform_fee + ordinal_output + change + fee
    // Since ordinal_input = ordinal_output, they cancel:
    // buyer_inputs = price + platform_fee + change + fee
    // Minimum buyer needs: price + platform_fee + fee (change will be calculated after)
    
    // Estimate transaction size more accurately:
    // Base transaction: ~10 vB
    // Each input: ~68 vB (witness data for taproot/native segwit)
    // Each output: ~34 vB (script + value)
    // We'll estimate with 1 ordinal input + 2 buyer inputs = 3 inputs
    // And 4 outputs (seller + fee + ordinal + change)
    const estimatedInputCount = 3 // 1 ordinal + 2 buyer inputs (conservative)
    const estimatedOutputCount = 4 // seller + fee + ordinal + change
    const estimatedVBytes = 10 + (estimatedInputCount * 68) + (estimatedOutputCount * 34)
    const estimatedFee = Math.ceil(estimatedVBytes * feeRate)

    console.log(`   Estimated tx size: ${estimatedVBytes} vB, fee: ${estimatedFee} sats (${feeRate} sat/vB)`)

    // Total buyer needs to provide (minimum, before change):
    const totalNeeded = priceSats + platformFeeSats + estimatedFee
    
    console.log(`   Total needed: ${totalNeeded} sats (${(totalNeeded / 100000000).toFixed(8)} BTC)`)
    console.log(`     - Price: ${priceSats} sats`)
    console.log(`     - Platform fee: ${platformFeeSats} sats`)
    console.log(`     - Estimated tx fee: ${estimatedFee} sats`)

    // Select UTXOs
    const selectedUtxos: any[] = []
    let totalInput = 0

    for (const utxo of sortedUtxos) {
      selectedUtxos.push(utxo)
      totalInput += utxo.value
      if (totalInput >= totalNeeded) {
        break
      }
    }

    if (totalInput < totalNeeded) {
      return NextResponse.json({
        error: `Insufficient balance. Need ${(totalNeeded / 100000000).toFixed(8)} BTC, have ${(totalInput / 100000000).toFixed(8)} BTC`
      }, { status: 400 })
    }

    console.log(`   Selected ${selectedUtxos.length} UTXOs totaling ${totalInput} sats`)

    // CRITICAL: Add buyer padding inputs FIRST (before seller's ordinal input)
    // This shifts the ordinal input index and allows ordinal to land in output[1]
    // We need SMALL UTXOs (< 3000 sats) for padding - these will be combined into output[0]
    // Structure must be:
    // - Input[0-1]: Small padding UTXOs (< 3000 sats each)
    // - Input[2]: Seller ordinal UTXO (signed)
    // - Input[3+]: Buyer payment UTXOs (to cover seller payment + platform fee + change)
    // - Output[0]: Change from padding inputs (Input[0] + Input[1])
    // - Output[1]: Ordinal to buyer (546 sats)
    // - Output[2]: Seller payment
    // - Output[3]: Platform fee
    // - Output[4]: Buyer change from payment inputs
    
    // Use exactly 2 small UTXOs for padding (Input[0-1]) to ensure ordinal is at Input[2]
    // Use the pre-filtered padding UTXOs from raw UTXOs (before filterAndSortUtxos removed them)
    // STRICT: Must have exactly 2 UTXOs in the 600-3000 sats range, fail if not found
    let paddingUtxos: any[] = []
    
    if (paddingUtxosFromRaw.length >= 2) {
      // Use 2 smallest UTXOs for padding (already sorted smallest first)
      paddingUtxos = paddingUtxosFromRaw.slice(0, 2)
      console.log(`   ✅ Found 2 small UTXOs for padding (${paddingUtxos[0].value} + ${paddingUtxos[1].value} sats, both in 600-3000 range)`)
    } else {
      // No padding UTXOs available - create a transaction to generate them
      // This will split one large UTXO into 5 outputs of 600 sats each
      const foundCount = paddingUtxosFromRaw.length
      console.log(`   ⚠️  Only found ${foundCount} padding UTXO(s), need 2. Creating padding UTXO generation transaction...`)
      
      if (sortedUtxos.length === 0) {
        return NextResponse.json({
          error: 'No UTXOs available for creating padding UTXOs',
          details: `Need at least one UTXO to split into padding UTXOs`
        }, { status: 400 })
      }
      
      // Use the largest available UTXO to create padding outputs
      const sourceUtxo = sortedUtxos[0] // Already sorted largest first
      const PADDING_OUTPUT_COUNT = 5
      const PADDING_OUTPUT_VALUE = 600 // Each output will be 600 sats
      const totalPaddingOutputs = PADDING_OUTPUT_COUNT * PADDING_OUTPUT_VALUE // 3000 sats
      
      // Estimate transaction size: 1 input + 6 outputs (5 padding + 1 change) + base
      const estimatedVBytes = 10 + (1 * 68) + (6 * 34) // 1 input, 6 outputs
      const estimatedFee = Math.ceil(estimatedVBytes * feeRate)
      
      // Calculate change
      const change = sourceUtxo.value - totalPaddingOutputs - estimatedFee
      
      if (change < 546) {
        return NextResponse.json({
          error: 'Insufficient UTXO value to create padding UTXOs',
          details: `Need at least ${totalPaddingOutputs + estimatedFee + 546} sats, have ${sourceUtxo.value} sats`,
          required: totalPaddingOutputs + estimatedFee + 546,
          available: sourceUtxo.value
        }, { status: 400 })
      }
      
      // Create PSBT to generate padding UTXOs
      const paddingPsbt = new bitcoin.Psbt({ network })
      
      // Add input
      const inputData: any = {
        hash: sourceUtxo.txid,
        index: sourceUtxo.vout,
      }
      
      const addressType = getAddressType(paymentAddr)
      if (addressType === 'p2tr') {
        inputData.witnessUtxo = {
          script: bitcoin.address.toOutputScript(paymentAddr, network),
          value: sourceUtxo.value,
        }
        if (payment_pubkey || buyer_pubkey) {
          const taprootKeyForInput = payment_pubkey || buyer_pubkey
          let keyBuffer = Buffer.from(taprootKeyForInput, 'hex')
          if (keyBuffer.length === 33) {
            keyBuffer = keyBuffer.subarray(1)
          }
          inputData.tapInternalKey = keyBuffer
        }
      } else if (addressType === 'p2sh') {
        if (!payment_pubkey) {
          return NextResponse.json({
            error: 'payment_pubkey required for P2SH addresses'
          }, { status: 400 })
        }
        const pubkeyBuffer = Buffer.from(payment_pubkey, 'hex')
        const p2wpkh = bitcoin.payments.p2wpkh({ pubkey: pubkeyBuffer, network })
        const p2sh = bitcoin.payments.p2sh({ redeem: p2wpkh, network })
        inputData.witnessUtxo = {
          script: p2sh.output!,
          value: sourceUtxo.value,
        }
        inputData.redeemScript = p2wpkh.output!
      } else {
        inputData.witnessUtxo = {
          script: bitcoin.address.toOutputScript(paymentAddr, network),
          value: sourceUtxo.value,
        }
      }
      
      paddingPsbt.addInput(inputData)
      const inputIndex = paddingPsbt.data.inputs.length - 1
      addInputSigningInfo(
        paddingPsbt,
        inputIndex,
        paymentAddr,
        payment_pubkey,
        buyer_pubkey,
        sourceUtxo.value
      )
      
      // Add 5 outputs of 600 sats each (padding UTXOs)
      for (let i = 0; i < PADDING_OUTPUT_COUNT; i++) {
        paddingPsbt.addOutput({
          address: paymentAddr,
          value: PADDING_OUTPUT_VALUE,
        })
      }
      
      // Add change output
      paddingPsbt.addOutput({
        address: paymentAddr,
        value: change,
      })
      
      const paddingPsbtBase64 = paddingPsbt.toBase64()
      
      console.log(`   ✅ Created padding UTXO generation PSBT:`)
      console.log(`      Input: ${sourceUtxo.value} sats`)
      console.log(`      Outputs: 5 × ${PADDING_OUTPUT_VALUE} sats (padding) + ${change} sats (change)`)
      console.log(`      Fee: ${estimatedFee} sats`)
      
      return NextResponse.json({
        requiresPaddingUtxos: true,
        message: 'Please sign and broadcast this transaction to create padding UTXOs, then retry the purchase',
        psbt: paddingPsbtBase64,
        details: {
          input: {
            txid: sourceUtxo.txid,
            vout: sourceUtxo.vout,
            value: sourceUtxo.value
          },
          outputs: {
            padding: PADDING_OUTPUT_COUNT,
            paddingValue: PADDING_OUTPUT_VALUE,
            change: change,
            fee: estimatedFee
          }
        }
      })
    }
    
    // Select payment UTXOs from selectedUtxos (excluding padding UTXOs)
    // We already selected enough UTXOs to cover totalNeeded, so we just need to exclude padding ones
    const paymentUtxos: any[] = []
    let paymentTotal = 0
    
    // Helper to check if UTXO is a padding UTXO
    const isPaddingUtxo = (utxo: any) => {
      const utxoId = utxo.outpoint || (utxo.txid && utxo.vout !== undefined ? `${utxo.txid}:${utxo.vout}` : null)
      return paddingUtxos.some(p => {
        const paddingId = p.outpoint || (p.txid && p.vout !== undefined ? `${p.txid}:${p.vout}` : null)
        return utxoId && paddingId && utxoId === paddingId
      })
    }
    
    // First, try to use remaining selectedUtxos (excluding padding ones)
    for (const utxo of selectedUtxos) {
      if (!isPaddingUtxo(utxo)) {
        paymentUtxos.push(utxo)
        paymentTotal += utxo.value
        // Stop once we have enough to cover totalNeeded
        if (paymentTotal >= totalNeeded) {
          break
        }
      }
    }
    
    // If we still don't have enough, add more from sortedUtxos (excluding padding and already selected)
    if (paymentTotal < totalNeeded) {
      const alreadySelectedIds = new Set(
        [...paymentUtxos, ...paddingUtxos].map(u => 
          u.outpoint || (u.txid && u.vout !== undefined ? `${u.txid}:${u.vout}` : null)
        )
      )
      
      for (const utxo of sortedUtxos) {
        const utxoId = utxo.outpoint || (utxo.txid && utxo.vout !== undefined ? `${utxo.txid}:${utxo.vout}` : null)
        if (!alreadySelectedIds.has(utxoId) && !isPaddingUtxo(utxo)) {
          paymentUtxos.push(utxo)
          paymentTotal += utxo.value
          // Stop once we have enough
          if (paymentTotal >= totalNeeded) {
            break
          }
        }
      }
    }
    
    const paddingTotal = paddingUtxos.reduce((sum, utxo) => sum + utxo.value, 0)
    
    // Final check - ensure we have enough
    if (paymentUtxos.length === 0 || paymentTotal < totalNeeded) {
      return NextResponse.json({
        error: 'Insufficient balance for payment after allocating padding UTXOs',
        details: `Need ${totalNeeded} sats for payment, have ${paymentTotal} sats in payment UTXOs`,
        paddingUtxos: paddingUtxos.length,
        paymentUtxos: paymentUtxos.length
      }, { status: 400 })
    }
    
    console.log(`   Using ${paddingUtxos.length} UTXO(s) for padding, ${paymentUtxos.length} UTXO(s) for payment`)
    
    const addressType = getAddressType(paymentAddr)
    console.log(`   Payment address type: ${addressType}`)
    console.log(`   Available keys: buyer_pubkey=${!!buyer_pubkey}, payment_pubkey=${!!payment_pubkey}`)
    
    // Validate we have the required keys for the payment address type
    if (addressType === 'p2tr' && !payment_pubkey && !buyer_pubkey) {
      return NextResponse.json({
        error: 'payment_pubkey or buyer_pubkey required for Taproot payment address'
      }, { status: 400 })
    }
    if (addressType === 'p2sh' && !payment_pubkey) {
      return NextResponse.json({
        error: 'payment_pubkey required for P2SH payment address'
      }, { status: 400 })
    }

    // STEP 1: Add buyer padding inputs FIRST (these will be input[0] and input[1])
    for (const utxo of paddingUtxos) {
      const inputData: any = {
        hash: utxo.txid,
        index: utxo.vout,
      }

      if (addressType === 'p2tr') {
        inputData.witnessUtxo = {
          script: bitcoin.address.toOutputScript(paymentAddr, network),
          value: utxo.value,
        }
        const taprootKeyForInput = payment_pubkey || buyer_pubkey
        if (taprootKeyForInput) {
          let keyBuffer = Buffer.from(taprootKeyForInput, 'hex')
          if (keyBuffer.length === 33) {
            keyBuffer = keyBuffer.subarray(1)
          }
          inputData.tapInternalKey = keyBuffer
        }
      } else if (addressType === 'p2sh') {
        if (!payment_pubkey) {
          throw new Error('payment_pubkey required for P2SH addresses')
        }
        const pubkeyBuffer = Buffer.from(payment_pubkey, 'hex')
        const p2wpkh = bitcoin.payments.p2wpkh({ pubkey: pubkeyBuffer, network })
        const p2sh = bitcoin.payments.p2sh({ redeem: p2wpkh, network })

        inputData.witnessUtxo = {
          script: p2sh.output!,
          value: utxo.value,
        }
        inputData.redeemScript = p2wpkh.output!
      } else {
        inputData.witnessUtxo = {
          script: bitcoin.address.toOutputScript(paymentAddr, network),
          value: utxo.value,
        }
      }

      psbt.addInput(inputData)
      const inputIndex = psbt.data.inputs.length - 1

      let taprootKey: string | undefined = undefined
      let paymentKey: string | undefined = undefined

      if (addressType === 'p2tr') {
        taprootKey = payment_pubkey || buyer_pubkey || undefined
      } else {
        paymentKey = payment_pubkey || buyer_pubkey || undefined
      }

      addInputSigningInfo(
        psbt,
        inputIndex,
        paymentAddr,
        paymentKey,
        taprootKey,
        utxo.value
      )
    }
    console.log(`   ✅ Added ${paddingUtxos.length} buyer padding input(s) (input[0-${paddingUtxos.length - 1}])`)

    // STEP 2: Add seller's ordinal input (will be at input[paddingCount])
    const ordinalInput: any = {
      hash: sellerInput.hash,
      index: sellerInput.index,
    }

    // Copy all seller input data
    if (sellerInputData.witnessUtxo) {
      ordinalInput.witnessUtxo = {
        script: Buffer.isBuffer(sellerInputData.witnessUtxo.script)
          ? sellerInputData.witnessUtxo.script
          : Buffer.from(sellerInputData.witnessUtxo.script),
        value: sellerInputData.witnessUtxo.value,
      }
    }
    if (sellerInputData.nonWitnessUtxo) {
      ordinalInput.nonWitnessUtxo = Buffer.isBuffer(sellerInputData.nonWitnessUtxo)
        ? sellerInputData.nonWitnessUtxo
        : Buffer.from(sellerInputData.nonWitnessUtxo)
    }
    if (sellerInputData.tapInternalKey) {
      ordinalInput.tapInternalKey = Buffer.isBuffer(sellerInputData.tapInternalKey)
        ? sellerInputData.tapInternalKey
        : Buffer.from(sellerInputData.tapInternalKey)
    }
    if (sellerInputData.tapMerkleRoot) {
      ordinalInput.tapMerkleRoot = Buffer.isBuffer(sellerInputData.tapMerkleRoot)
        ? sellerInputData.tapMerkleRoot
        : Buffer.from(sellerInputData.tapMerkleRoot)
    }
    if (sellerInputData.tapLeafScript) {
      ordinalInput.tapLeafScript = sellerInputData.tapLeafScript.map((script: any) => ({
        leafVersion: script.leafVersion,
        script: Buffer.isBuffer(script.script) ? script.script : Buffer.from(script.script),
        controlBlock: Buffer.isBuffer(script.controlBlock) ? script.controlBlock : Buffer.from(script.controlBlock),
      }))
    }
    
    // CRITICAL: Copy seller's signature data
    if (sellerInputData.tapScriptSig && sellerInputData.tapScriptSig.length > 0) {
      ordinalInput.tapScriptSig = sellerInputData.tapScriptSig.map((sig: any) => ({
        pubkey: Buffer.isBuffer(sig.pubkey) ? sig.pubkey : Buffer.from(sig.pubkey),
        signature: Buffer.isBuffer(sig.signature) ? sig.signature : Buffer.from(sig.signature),
        leafHash: Buffer.isBuffer(sig.leafHash) ? sig.leafHash : Buffer.from(sig.leafHash),
      }))
    }
    if (sellerInputData.tapKeySig) {
      ordinalInput.tapKeySig = Buffer.isBuffer(sellerInputData.tapKeySig)
        ? sellerInputData.tapKeySig
        : Buffer.from(sellerInputData.tapKeySig)
    }
    if (sellerInputData.partialSig && sellerInputData.partialSig.length > 0) {
      ordinalInput.partialSig = sellerInputData.partialSig.map((sig: any) => ({
        pubkey: Buffer.isBuffer(sig.pubkey) ? sig.pubkey : Buffer.from(sig.pubkey),
        signature: Buffer.isBuffer(sig.signature) ? sig.signature : Buffer.from(sig.signature),
      }))
    }
    if (sellerInputData.finalScriptWitness) {
      ordinalInput.finalScriptWitness = Buffer.isBuffer(sellerInputData.finalScriptWitness)
        ? sellerInputData.finalScriptWitness
        : Buffer.from(sellerInputData.finalScriptWitness)
    }
    if (sellerInputData.finalScriptSig) {
      ordinalInput.finalScriptSig = Buffer.isBuffer(sellerInputData.finalScriptSig)
        ? sellerInputData.finalScriptSig
        : Buffer.from(sellerInputData.finalScriptSig)
    }
    if (sellerInputData.sighashType !== undefined) {
      ordinalInput.sighashType = sellerInputData.sighashType
    }

    psbt.addInput(ordinalInput)
    const sellerInputIndex = paddingUtxos.length // Should be 2 (Input[2] = ordinal)
    console.log(`   ✅ Added seller's ordinal input at index ${sellerInputIndex} (with signature)`)
    
    // Verify structure: Input[0-1] should be padding, Input[2] should be ordinal
    if (sellerInputIndex !== 2) {
      console.warn(`   ⚠️  WARNING: Seller ordinal input is at index ${sellerInputIndex}, expected index 2`)
      console.warn(`   ⚠️  This means we have ${paddingUtxos.length} padding input(s), but need 2 for proper structure`)
    } else {
      console.log(`   ✅ Structure correct: Input[0-1] = padding, Input[2] = ordinal`)
    }

    // STEP 3: Add remaining buyer payment inputs
    for (const utxo of paymentUtxos) {
      const inputData: any = {
        hash: utxo.txid,
        index: utxo.vout,
      }

      if (addressType === 'p2tr') {
        inputData.witnessUtxo = {
          script: bitcoin.address.toOutputScript(paymentAddr, network),
          value: utxo.value,
        }
        // For payment address inputs, prioritize payment_pubkey (key for payment address)
        // buyer_pubkey is for the ordinal receiving address, not the payment address
        const taprootKeyForInput = payment_pubkey || buyer_pubkey
        if (taprootKeyForInput) {
          let keyBuffer = Buffer.from(taprootKeyForInput, 'hex')
          if (keyBuffer.length === 33) {
            keyBuffer = keyBuffer.subarray(1)
          }
          inputData.tapInternalKey = keyBuffer
        }
      } else if (addressType === 'p2sh') {
        if (!payment_pubkey) {
          throw new Error('payment_pubkey required for P2SH addresses')
        }
        const pubkeyBuffer = Buffer.from(payment_pubkey, 'hex')
        const p2wpkh = bitcoin.payments.p2wpkh({ pubkey: pubkeyBuffer, network })
        const p2sh = bitcoin.payments.p2sh({ redeem: p2wpkh, network })

        inputData.witnessUtxo = {
          script: p2sh.output!,
          value: utxo.value,
        }
        inputData.redeemScript = p2wpkh.output!
      } else if (addressType === 'p2wpkh') {
        inputData.witnessUtxo = {
          script: bitcoin.address.toOutputScript(paymentAddr, network),
          value: utxo.value,
        }
      } else {
        inputData.witnessUtxo = {
          script: bitcoin.address.toOutputScript(paymentAddr, network),
          value: utxo.value,
        }
      }

      psbt.addInput(inputData)
      const inputIndex = psbt.data.inputs.length - 1

      // Determine which keys to use based on payment address type
      // For payment address inputs, we should use payment_pubkey (key for payment address)
      // buyer_pubkey is for the ordinal receiving address, not the payment address
      let taprootKey: string | undefined = undefined
      let paymentKey: string | undefined = undefined

      if (addressType === 'p2tr') {
        // For Taproot payment address, use payment_pubkey (taproot key for payment address)
        // Fallback to buyer_pubkey only if payment_pubkey is missing
        taprootKey = payment_pubkey || buyer_pubkey || undefined
      } else {
        // For other address types, use payment_pubkey (payment key)
        // Fallback to buyer_pubkey only if payment_pubkey is missing
        paymentKey = payment_pubkey || buyer_pubkey || undefined
      }

      // Add wallet-specific signing info (same approach as credit purchase and launchpad mint)
      addInputSigningInfo(
        psbt,
        inputIndex,
        paymentAddr,
        paymentKey,
        taprootKey,
        utxo.value
      )
    }

    console.log(`   Added ${paymentUtxos.length} buyer payment input(s)`)

    // Now add outputs in the correct order:
    // Output[0]: Buyer change/padding (from padding inputs)
    // Output[1]: Ordinal to buyer (buyer-controlled, NOT signed by seller)
    // Output[2]: Seller payment (protected by seller's signature at input[paddingCount])
    // Output[3]: Platform fee
    
    // Output[0]: Buyer change from padding inputs (small amount, goes back to buyer)
    // paddingTotal was already calculated above
    // This ensures the ordinal sat lands in output[1] after FIFO sat assignment
    psbt.addOutput({
      address: paymentAddr, // Buyer's payment address
      value: paddingTotal, // All padding input value goes to output[0]
    })
    console.log(`   ✅ Output 0: ${paddingTotal} sats → ${paymentAddr.substring(0, 20)}... (buyer padding/change)`)
    
    // Output[1]: Ordinal to buyer (buyer-controlled, NOT signed)
    psbt.addOutput({
      address: buyer_wallet, // Buyer's taproot address for ordinal
      value: ordinalOutputValue, // 546 sats (ordinal value)
    })
    console.log(`   ✅ Output 1: ${ordinalOutputValue} sats → ${buyer_wallet.substring(0, 20)}... (ordinal to buyer)`)

    // Output[2]: Seller payment (protected by seller's signature at input[paddingCount])
    // Seller signed with SIGHASH_SINGLE | ANYONECANPAY, committing to input[paddingCount] ↔ output[2]
    if (sellerPaymentOutput.value !== priceSats) {
      console.error(`   ❌ Seller payment amount mismatch: expected ${priceSats}, got ${sellerPaymentOutput.value}`)
      return NextResponse.json({
        error: 'Seller payment amount does not match listing',
        details: `Expected ${priceSats} sats, PSBT has ${sellerPaymentOutput.value} sats`
      }, { status: 400 })
    }
    psbt.addOutput(sellerPaymentOutput)
    console.log(`   ✅ Output 2: ${sellerPaymentOutput.value} sats → seller payment (protected by signature at input[${sellerInputIndex}])`)
    
    // Output[3]: Platform fee
    if (platformFeeOutput.value !== platformFeeSats) {
      console.error(`   ❌ Platform fee amount mismatch: expected ${platformFeeSats}, got ${platformFeeOutput.value}`)
      return NextResponse.json({
        error: 'Platform fee amount does not match listing',
        details: `Expected ${platformFeeSats} sats, PSBT has ${platformFeeOutput.value} sats`
      }, { status: 400 })
    }
    psbt.addOutput(platformFeeOutput)
    console.log(`   ✅ Output 3: ${platformFeeOutput.value} sats → platform fee`)

    // Calculate what buyer must pay from payment inputs (padding inputs go to output[0])
    // Payment inputs need to cover:
    // - Output[2]: Seller payment
    // - Output[3]: Platform fee
    // - Output[4]: Buyer change (if any)
    // - Transaction fee
    // Note: Output[1] (ordinal) is funded by seller's ordinal input, not buyer's payment inputs
    
    const sellerPaymentValue = sellerPaymentOutput.value
    const platformFeeValue = platformFeeOutput.value
    
    // paymentTotal was already calculated above
    
    // First, estimate fee assuming we'll add a change output
    // Then calculate change, and if change is dust, recalculate fee without change output
    const actualInputCount = psbt.inputCount
    let outputCountWithChange = psbt.txOutputs.length + 1 // +1 for potential change output (output[4])
    let feeWithChange = Math.ceil((250 + (actualInputCount * 68) + (outputCountWithChange * 34)) * feeRate)
    
    // Calculate change with estimated fee (assuming change output will be added)
    // Payment inputs must cover: seller payment + platform fee + fee + change
    const totalBuyerPaysWithChange = sellerPaymentValue + platformFeeValue + feeWithChange
    let change = paymentTotal - totalBuyerPaysWithChange
    
    // If change is dust (<= 546), recalculate fee without change output
    let actualFee = feeWithChange
    let actualOutputCount = outputCountWithChange
    if (change <= 546) {
      // No change output, recalculate fee
      actualOutputCount = psbt.txOutputs.length // No change output (output[4] won't be added)
      actualFee = Math.ceil((250 + (actualInputCount * 68) + (actualOutputCount * 34)) * feeRate)
      // Recalculate change with correct fee (will be <= 546, becomes part of fee)
      const totalBuyerPaysCorrected = sellerPaymentValue + platformFeeValue + actualFee
      change = paymentTotal - totalBuyerPaysCorrected
    }
    
    console.log(`   Change calculation:`)
    console.log(`     Padding inputs: ${paddingTotal} sats → output[0]`)
    console.log(`     Payment inputs: ${paymentTotal} sats`)
    console.log(`     Seller payment (output[2]): ${sellerPaymentValue} sats`)
    console.log(`     Platform fee (output[3]): ${platformFeeValue} sats`)
    console.log(`     Transaction fee: ${actualFee} sats (${actualInputCount} inputs, ${actualOutputCount} outputs)`)
    console.log(`     Total payment inputs needed: ${sellerPaymentValue + platformFeeValue + actualFee} sats`)
    console.log(`     Change: ${change} sats`)

    // Output[4]: Buyer change from payment inputs (only if > 546 sats to avoid dust)
    if (change > 546) {
      psbt.addOutput({
        address: paymentAddr,
        value: change,
      })
      console.log(`   ✅ Output 4: ${change} sats → ${paymentAddr.substring(0, 20)}... (buyer change from payment inputs)`)
    } else if (change < 0) {
      // This shouldn't happen if we selected UTXOs correctly, but handle it
      const totalNeeded = sellerPaymentValue + platformFeeValue + actualFee
      console.error(`   ❌ ERROR: Negative change! Buyer doesn't have enough payment inputs to cover outputs + fee`)
      return NextResponse.json({
        error: `Insufficient balance. Need ${(totalNeeded / 100000000).toFixed(8)} BTC for outputs + fee, have ${(paymentTotal / 100000000).toFixed(8)} BTC in payment inputs`,
        details: {
          paddingInputs: paddingTotal,
          paymentInputs: paymentTotal,
          sellerPayment: sellerPaymentValue,
          platformFee: platformFeeValue,
          txFee: actualFee,
          totalNeeded: totalNeeded,
          shortfall: Math.abs(change)
        }
      }, { status: 400 })
    } else {
      console.log(`   No change output (dust: ${change} sats, will be added to fee)`)
      // If change is <= 546, it becomes part of the fee (overpayment)
    }

    // NOTE: Seller's signature was copied from their PSBT
    // The signature was created with SIGHASH_SINGLE | SIGHASH_ANYONECANPAY (or SIGHASH_NONE)
    // With padding inputs added before seller's input, the seller's input is now at index[paddingCount]
    // The signature commits to input[paddingCount] ↔ output[2] (seller payment)
    // Output[1] (ordinal to buyer) is NOT protected by signature, allowing buyer to set address
    console.log(`   ✅ Seller's signature copied to input[${sellerInputIndex}] (commits to output[2] = seller payment)`)

    // Verify PSBT structure before returning
    console.log(`\n🔍 Verifying PSBT structure...`)
    
    // Extract actual addresses from PSBT outputs for verification
    const actualOrdinalOutput = psbt.txOutputs[1] // Output[1] is ordinal to buyer
    const actualOrdinalOutputAddress = bitcoin.address.fromOutputScript(actualOrdinalOutput.script, network)
    const actualSellerPaymentAddress = bitcoin.address.fromOutputScript(sellerPaymentOutput.script, network)
    const actualPlatformFeeAddress = bitcoin.address.fromOutputScript(platformFeeOutput.script, network)
    
    console.log(`   Output[0]: Buyer padding/change`)
    console.log(`   Output[1] (ordinal): ${actualOrdinalOutputAddress.substring(0, 20)}... (buyer's address)`)
    console.log(`   Output[2] (seller payment): ${actualSellerPaymentAddress.substring(0, 20)}...`)
    console.log(`   Output[3] (platform fee): ${actualPlatformFeeAddress.substring(0, 20)}...`)
    
    // Get seller's ordinal input from PSBT (at index[paddingCount], not 0)
    const ordinalInputData = psbt.txInputs[sellerInputIndex]
    const ordinalTxid = Buffer.from(ordinalInputData.hash).reverse().toString('hex')
    
    const verification = verifyMarketplacePSBT(psbt, network, {
      ordinalInput: {
        txid: ordinalTxid, // Already reversed for comparison
        vout: ordinalInputData.index,
        value: ordinalOutputValue,
      },
      buyerInputs: selectedUtxos.map(utxo => ({
        txid: utxo.txid,
        vout: utxo.vout,
        value: utxo.value,
      })),
      ordinalOutput: {
        address: actualOrdinalOutputAddress, // Buyer's address (Output[1])
        value: ordinalOutputValue,
      },
      sellerPaymentOutput: {
        address: actualSellerPaymentAddress, // Use actual address from PSBT, not listing.seller_wallet
        value: priceSats,
      },
      platformFeeOutput: {
        address: actualPlatformFeeAddress, // Use actual address from PSBT
        value: platformFeeSats,
      },
      buyerChangeOutput: change > 546 ? {
        address: paymentAddr,
        value: change,
      } : undefined,
    })

    if (verification.errors.length > 0) {
      console.error(`   ❌ PSBT Verification Errors:`)
      verification.errors.forEach(err => console.error(`      - ${err}`))
    }
    if (verification.warnings.length > 0) {
      console.warn(`   ⚠️  PSBT Verification Warnings:`)
      verification.warnings.forEach(warn => console.warn(`      - ${warn}`))
    }
    if (verification.valid) {
      console.log(`   ✅ PSBT structure is valid`)
    }
    console.log(`   📊 Inputs: ${verification.details.inputCount}, Outputs: ${verification.details.outputCount}`)
    console.log(`   💰 Total Input: ${verification.details.totalInput} sats, Total Output: ${verification.details.totalOutput} sats`)
    console.log(`   ⛽ Fee: ${verification.details.fee} sats`)
    console.log(`   📝 Input 0 (ordinal): ${verification.details.inputs[0]?.hasSignature ? '✅ Signed' : '❌ Not signed'}`)
    console.log(`   📝 Buyer inputs: ${verification.details.inputs.slice(1).filter(i => i.hasSignature).length}/${verification.details.inputs.length - 1} signed (will be signed by wallet)`)
    console.log(`\n`)

    // Return PSBT for buyer to sign
    const psbtBase64 = psbt.toBase64()

    console.log(`✅ Created complete PSBT for buyer to sign`)

    return NextResponse.json({
      success: true,
      psbt_to_sign: psbtBase64,
      listing: {
        id: listing.id,
        inscription_id: listing.inscription_id,
        price_sats: priceSats,
        price_btc: (priceSats / 100000000).toFixed(8),
        seller_wallet: listing.seller_wallet,
        platform_fee_sats: platformFeeSats,
        platform_fee_wallet: platformFeeWallet,
      },
      costs: {
        price_sats: priceSats,
        platform_fee_sats: platformFeeSats,
        ordinal_output: ordinalOutputValue,
        tx_fee: actualFee,
        total_input: totalInput,
        change: change > 546 ? change : 0,
      },
      verification: {
        valid: verification.valid,
        errors: verification.errors,
        warnings: verification.warnings,
        details: {
          inputCount: verification.details.inputCount,
          outputCount: verification.details.outputCount,
          totalInput: verification.details.totalInput,
          totalOutput: verification.details.totalOutput,
          fee: verification.details.fee,
        },
      },
    })

  } catch (error: any) {
    console.error('Error processing purchase:', error)
    return NextResponse.json({
      error: 'Failed to process purchase',
      details: error.message
    }, { status: 500 })
  }
}
