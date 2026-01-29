'use client'

import { useState, useCallback } from 'react'
import { useWallet } from '@/lib/wallet/compatibility'
import * as bitcoin from 'bitcoinjs-lib'
import * as ecc from '@bitcoinerlab/secp256k1'
import { addInputSigningInfo, getAddressType } from '@/lib/bitcoin-utils'

// Initialize ECC library for bitcoinjs-lib (required for taproot addresses and PSBT operations)
if (typeof bitcoin.initEccLib === 'function') {
  bitcoin.initEccLib(ecc)
}
import { safeStringify } from '@/lib/json-utils'

// Platform fee constants (same as launchpad mints)
// Convert MINT_FEE from BTC to satoshis (MINT_FEE is in BTC format like "0.00002500")
function getMintFeeSats(): number {
  const mintFeeBtc = parseFloat(process.env.MINT_FEE || '0.00002500')
  return Math.round(mintFeeBtc * 100000000) // Convert BTC to satoshis
}

const MINT_FEE_SATS = getMintFeeSats()
const FEE_WALLET = process.env.FEE_WALLET || 'bc1p693zz6n9cvmsewemg4j0pmvfvs4th3ft9c74afrc90l6sah300uqt99vee'// Same as launchpad mints

interface MarketplaceBtcPurchaseProps {
  listingId: string
  btcAmount: string
  btcAmountSats: number
  paymentAddress: string // Seller's BTC address
  listingTitle: string
  onSuccess: (collectionId: string) => void
  onCancel: () => void
}

export function MarketplaceBtcPurchase({
  listingId,
  btcAmount,
  btcAmountSats,
  paymentAddress,
  listingTitle,
  onSuccess,
  onCancel,
}: MarketplaceBtcPurchaseProps) {
  const { isConnected, currentAddress, paymentAddress: userPaymentAddress, paymentPublicKey, publicKey, client } = useWallet()
  
  const [purchasing, setPurchasing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'fetching_utxos' | 'building_tx' | 'signing' | 'broadcasting' | 'verifying' | 'complete'>('idle')
  const [txid, setTxid] = useState<string | null>(null)

  const handlePurchase = useCallback(async () => {
    if (!isConnected || !currentAddress || !userPaymentAddress || !client) {
      setError('Please connect your wallet first')
      return
    }

    setPurchasing(true)
    setError(null)
    setStatus('fetching_utxos')

    try {
      // Step 1: Get UTXOs from user's payment address
      let utxos: any[] = []
      try {
        const utxosResponse = await fetch(
          `/api/utxos?address=${encodeURIComponent(userPaymentAddress)}&filter=true`
        )
        if (utxosResponse.ok) {
          const utxosData = await utxosResponse.json()
          if (utxosData.utxos && Array.isArray(utxosData.utxos)) {
            utxos = utxosData.utxos
          } else {
            throw new Error('Invalid UTXO response format')
          }
        } else {
          const errorData = await utxosResponse.json().catch(() => ({}))
          throw new Error(errorData.error || `Failed to fetch UTXOs: ${utxosResponse.statusText}`)
        }
      } catch (err: any) {
        setError(err.message || 'Failed to fetch wallet UTXOs')
        setPurchasing(false)
        setStatus('idle')
        return
      }

      // Filter dust
      utxos = utxos.filter(utxo => utxo.value > 600)

      if (utxos.length === 0) {
        setError('No usable UTXOs found in your wallet. Please ensure you have Bitcoin UTXOs with more than 600 sats.')
        setPurchasing(false)
        setStatus('idle')
        return
      }

      // Step 2: Get current fee rate
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

      setStatus('building_tx')

      // Step 3: Calculate amount needed and select UTXOs
      const amountSats = btcAmountSats
      // Include platform fee in total needed
      const platformFeeSats = MINT_FEE_SATS
      // Estimate fee: base transaction size + outputs (payment + fee + change)
      // Rough estimate: ~250 vB base + ~34 vB per output
      const estimatedOutputCount = 3 // payment + fee + change
      const estimatedFee = Math.ceil((250 + (estimatedOutputCount * 34)) * feeRate)
      const totalNeeded = amountSats + platformFeeSats + estimatedFee

      let totalInput = 0
      const selectedUtxos: any[] = []
      
      for (const utxo of utxos) {
        selectedUtxos.push(utxo)
        totalInput += utxo.value
        if (totalInput >= totalNeeded) {
          break
        }
      }

      if (totalInput < totalNeeded) {
        setError(`Insufficient balance. Need ${(totalNeeded / 100000000).toFixed(8)} BTC, have ${(totalInput / 100000000).toFixed(8)} BTC`)
        setPurchasing(false)
        setStatus('idle')
        return
      }

      // Step 4: Fetch transaction details for UTXOs missing scriptpubkey
      const txFetchPromises = selectedUtxos.map(async (utxo) => {
        if (utxo.scriptpubkey) return
        
        try {
          const txResponse = await fetch(`https://mempool.space/api/tx/${utxo.txid}`)
          if (txResponse.ok) {
            const txData = await txResponse.json()
            if (txData.vout && txData.vout[utxo.vout]) {
              utxo.scriptpubkey = txData.vout[utxo.vout].scriptpubkey
              utxo.scriptpubkey_type = txData.vout[utxo.vout].scriptpubkey_type
              utxo.scriptpubkey_address = txData.vout[utxo.vout].scriptpubkey_address
            }
          }
        } catch (txErr) {
          console.error(`Error fetching transaction ${utxo.txid}:`, txErr)
        }
      })

      await Promise.all(txFetchPromises)

      const validUtxos = selectedUtxos.filter(utxo => utxo.scriptpubkey && utxo.scriptpubkey.trim() !== '')
      
      if (validUtxos.length === 0) {
        setError('Could not fetch required transaction data. Please try again later.')
        setPurchasing(false)
        setStatus('idle')
        return
      }

      // Step 5: Create PSBT
      const network = bitcoin.networks.bitcoin
      const psbt = new bitcoin.Psbt({ network })

      const finalTotalInput = validUtxos.reduce((sum, utxo) => sum + utxo.value, 0)
      if (finalTotalInput < totalNeeded) {
        setError(`Insufficient balance after validation.`)
        setPurchasing(false)
        setStatus('idle')
        return
      }

      // Add inputs
      for (let i = 0; i < validUtxos.length; i++) {
        const utxo = validUtxos[i]
        if (!utxo.txid || utxo.vout === undefined || !utxo.scriptpubkey || !utxo.value) {
          setError(`Invalid UTXO data. Please try again.`)
          setPurchasing(false)
          setStatus('idle')
          return
        }

        const scriptpubkey = utxo.scriptpubkey.trim()
        if (!scriptpubkey || !/^[0-9a-fA-F]+$/.test(scriptpubkey)) {
          setError(`Invalid UTXO script data. Please try again.`)
          setPurchasing(false)
          setStatus('idle')
          return
        }

        const scriptBytes = Buffer.from(scriptpubkey, 'hex')
        const valueNumber = typeof utxo.value === 'bigint' 
          ? Number(utxo.value) 
          : typeof utxo.value === 'string' 
            ? Number(utxo.value) 
            : utxo.value
        const utxoAddress = utxo.scriptpubkey_address || userPaymentAddress || currentAddress
        const addressType = getAddressType(utxoAddress)

        const input: any = {
          hash: utxo.txid,
          index: utxo.vout,
        }

        // Handle P2SH transactions
        if (utxo.scriptpubkey_type === 'p2sh' || 
            utxo.scriptpubkey_type === 'p2sh-p2wpkh' || 
            utxo.scriptpubkey_type === 'p2sh-p2wsh') {
          try {
            const txHexResponse = await fetch(`https://mempool.space/api/tx/${utxo.txid}/hex`)
            if (txHexResponse.ok) {
              const txHex = await txHexResponse.text()
              input.nonWitnessUtxo = Buffer.from(txHex, 'hex')
            }
          } catch (err) {
            console.warn(`Could not fetch transaction hex for ${utxo.txid}`)
          }
        }

        // Add witnessUtxo for SegWit
        if (utxo.scriptpubkey_type === 'v0_p2wpkh' || 
            utxo.scriptpubkey_type === 'v1_p2tr' || 
            utxo.scriptpubkey_type === 'v0_p2wsh' ||
            utxo.scriptpubkey_type === 'p2sh-p2wpkh' ||
            utxo.scriptpubkey_type === 'p2sh-p2wsh' ||
            utxo.scriptpubkey_type === 'p2sh') {
          input.witnessUtxo = {
            script: scriptBytes,
            value: valueNumber,
          }
        } else {
          input.witnessUtxo = {
            script: scriptBytes,
            value: valueNumber,
          }
        }

        psbt.addInput(input)
        const inputIndex = psbt.data.inputs.length - 1

        let taprootKey: string | undefined = undefined
        let paymentKey: string | undefined = undefined

        if (addressType === 'p2tr') {
          taprootKey = publicKey || undefined
        } else {
          paymentKey = paymentPublicKey || undefined
        }

        addInputSigningInfo(
          psbt,
          inputIndex,
          utxoAddress,
          paymentKey,
          taprootKey,
          utxo.value
        )
      }

      // Add output to seller's address (the payment)
      psbt.addOutput({
        address: paymentAddress,
        value: amountSats as any,
      })

      // Add platform fee output (same as launchpad mints)
      psbt.addOutput({
        address: FEE_WALLET,
        value: MINT_FEE_SATS,
      })

      // Recalculate fee with actual output count (payment + fee + maybe change)
      const willHaveChange = finalTotalInput - amountSats - MINT_FEE_SATS - estimatedFee > 546
      const actualOutputCount = 2 + (willHaveChange ? 1 : 0) // payment + fee + (maybe change)
      const actualFee = Math.ceil((250 + (actualOutputCount * 34)) * feeRate)

      // Add change output
      const change = finalTotalInput - amountSats - MINT_FEE_SATS - actualFee
      if (change > 546) {
        psbt.addOutput({
          address: userPaymentAddress,
          value: change as any,
        })
      }

      setStatus('signing')

      // Step 6: Sign the PSBT
      const psbtBase64 = psbt.toBase64()
      
      try {
        console.log('🔐 Signing marketplace PSBT with wallet...')
        let signedResult = await client.signPsbt(psbtBase64, true, false)
        
        let signedPsbtBase64: string
        if (signedResult.psbt) {
          signedPsbtBase64 = signedResult.psbt
        } else if (signedResult.psbtHex) {
          signedPsbtBase64 = Buffer.from(signedResult.psbtHex, 'hex').toString('base64')
        } else if (signedResult.signedPsbtBase64) {
          signedPsbtBase64 = signedResult.signedPsbtBase64
        } else {
          signedPsbtBase64 = psbtBase64
        }
        
        let finalPsbt = bitcoin.Psbt.fromBase64(signedPsbtBase64)
        const requiresFinalization = finalPsbt.data.inputs.some(
          (input) => !input.finalScriptSig && !input.finalScriptWitness
        )

        let txHex: string
        let finalTxId: string | null = null

        if (requiresFinalization) {
          console.log('⚠️ PSBT requires finalization...')
          const finalizeResponse = await fetch('/api/finalize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ txBase64: signedPsbtBase64 }),
          })

          if (!finalizeResponse.ok) {
            throw new Error('Failed to finalize transaction')
          }

          const finalizeData = await finalizeResponse.json()
          txHex = finalizeData.hex
          
          const tx = bitcoin.Transaction.fromHex(txHex)
          finalTxId = tx.getId()
        } else {
          const tx = finalPsbt.extractTransaction()
          txHex = tx.toHex()
          finalTxId = tx.getId()
        }

        if (signedResult.txId || signedResult.txid) {
          finalTxId = signedResult.txId || signedResult.txid
        }

        if (!finalTxId) {
          throw new Error('Transaction signed but no transaction ID could be extracted')
        }

        setStatus('broadcasting')

        // Step 7: Broadcast the transaction
        console.log('📡 Broadcasting transaction...')
        const broadcastResponse = await fetch('https://mempool.space/api/tx', {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: txHex,
        })

        if (!broadcastResponse.ok) {
          const errorText = await broadcastResponse.text()
          throw new Error(`Failed to broadcast transaction: ${errorText}`)
        }

        console.log('✅ Transaction broadcast successfully, txid:', finalTxId)
        setTxid(finalTxId)

        // Track used UTXOs
        const usedOutpoints = validUtxos.map(u => `${u.txid}:${u.vout}`)
        try {
          await fetch('/api/utxos/exclude', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              address: userPaymentAddress || currentAddress,
              excludedUtxos: usedOutpoints,
            }),
          })
        } catch (excludeErr) {
          console.warn('Failed to track excluded UTXOs:', excludeErr)
        }

        setStatus('verifying')

        // Step 8: Verify payment and complete purchase
        await new Promise(resolve => setTimeout(resolve, 2000))

        const verifyResponse = await fetch('/api/marketplace/verify-btc-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            listing_id: listingId,
            buyer_wallet: currentAddress,
            txid: finalTxId,
          }),
        })

        const verifyData = await verifyResponse.json()
        console.log('Payment verification:', verifyData)

        setStatus('complete')

        // For now, show success - the cron job will complete the transfer when confirmed
        // In a production app, you might poll for confirmation
        
      } catch (signError: any) {
        console.error('Error signing/broadcasting PSBT:', signError)
        if (signError.message?.includes('cancel') || signError.message?.includes('reject')) {
          setError('Transaction cancelled by user')
        } else {
          setError(`Failed to sign transaction: ${signError.message || 'Unknown error'}`)
        }
        setPurchasing(false)
        setStatus('idle')
        return
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create purchase')
      console.error('Purchase error:', err)
      setPurchasing(false)
      setStatus('idle')
    }
  }, [isConnected, currentAddress, userPaymentAddress, client, btcAmountSats, paymentAddress, publicKey, paymentPublicKey, listingId])

  if (status === 'complete' && txid) {
    return (
      <div className="bg-green-50 border-2 border-green-300 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <svg className="w-6 h-6 text-green-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <h3 className="font-bold text-green-900 text-lg">Payment Sent!</h3>
        </div>
        
        <p className="text-green-800 text-sm mb-4">
          Your payment of <strong>{btcAmount} BTC</strong> has been broadcast to the network.
          The collection will be transferred to you once the transaction confirms (usually 10-30 minutes).
        </p>

        <div className="bg-black rounded-lg p-3 mb-4">
          <p className="text-xs text-gray-400 mb-1">Transaction ID:</p>
          <p className="text-green-400 font-mono text-sm break-all">{txid}</p>
        </div>

        <a
          href={`https://mempool.space/tx/${txid}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-green-700 hover:text-green-800 text-sm underline"
        >
          View on Mempool.space →
        </a>

        <button
          onClick={onCancel}
          className="mt-4 w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition-colors"
        >
          Done
        </button>
      </div>
    )
  }

  return (
    <div className="bg-orange-50 border-2 border-orange-300 rounded-xl p-6">
      <h3 className="font-bold text-orange-900 mb-4 flex items-center gap-2">
        <span className="text-2xl">₿</span> Bitcoin Purchase
      </h3>

      <div className="bg-white rounded-lg p-4 mb-4">
        <p className="text-sm text-gray-600 mb-1">Purchasing:</p>
        <p className="font-bold text-gray-900">{listingTitle}</p>
      </div>

      <div className="bg-orange-100 rounded-lg p-4 mb-4">
        <p className="text-sm text-orange-700 mb-1">Amount:</p>
        <p className="text-2xl font-black text-orange-600">{btcAmount} BTC</p>
        <p className="text-xs text-orange-600 mt-1">{btcAmountSats.toLocaleString()} sats</p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-800 rounded-lg text-sm">
          {error}
        </div>
      )}

      {status !== 'idle' && status !== 'complete' && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center gap-2">
            <div className="animate-spin w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
            <span className="text-blue-700 text-sm font-medium">
              {status === 'fetching_utxos' && 'Fetching wallet UTXOs...'}
              {status === 'building_tx' && 'Building transaction...'}
              {status === 'signing' && 'Please sign the transaction in your wallet...'}
              {status === 'broadcasting' && 'Broadcasting to network...'}
              {status === 'verifying' && 'Verifying payment...'}
            </span>
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={onCancel}
          disabled={purchasing && status !== 'idle'}
          className="flex-1 px-4 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-semibold transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={handlePurchase}
          disabled={purchasing || !isConnected}
          className="flex-1 px-4 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {purchasing ? 'Processing...' : `Pay ${btcAmount} BTC`}
        </button>
      </div>

      <p className="text-xs text-orange-600 mt-3 text-center">
        Your wallet will prompt you to sign the transaction
      </p>
    </div>
  )
}

