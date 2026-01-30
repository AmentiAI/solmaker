'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { CREDIT_TIERS } from '@/lib/credits/constants'
import { useWallet } from '@/lib/wallet/compatibility'
import { useRouter } from 'next/navigation'
import * as bitcoin from 'bitcoinjs-lib'
import * as ecc from '@bitcoinerlab/secp256k1'
import { addInputSigningInfo } from '@/lib/bitcoin-utils'

// Initialize ECC library for bitcoinjs-lib (required for taproot addresses and PSBT operations)
if (typeof bitcoin.initEccLib === 'function') {
  bitcoin.initEccLib(ecc)
}
import { PaymentMethod } from '@/components/payment-method-selector'
import { safeStringify } from '@/lib/json-utils'

interface CreditPurchaseModalProps {
  isOpen: boolean
  onClose: () => void
  tierIndex: number
}

export function CreditPurchaseModal({ isOpen, onClose, tierIndex }: CreditPurchaseModalProps) {
  const { isConnected, currentAddress, paymentAddress, paymentPublicKey, client } = useWallet()
  const router = useRouter()
  const [feeRate, setFeeRate] = useState<string>('')
  const [recommendedFeeRate, setRecommendedFeeRate] = useState<number>(10)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const tier = CREDIT_TIERS[tierIndex]

  // Helper to cancel a pending payment if user cancels or errors occur
  const cancelPendingPayment = useCallback(async (paymentId: string, walletAddress: string) => {
    try {
      await fetch('/api/credits/cancel-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_id: paymentId, wallet_address: walletAddress }),
      })
    } catch (e) {
      // Silently fail - the payment will expire anyway
      console.warn('Failed to cancel payment:', e)
    }
  }, [])

  // Determine active wallet - Bitcoin only
  const { activeWalletAddress, activeWalletType } = useMemo(() => {
    if (currentAddress && isConnected) {
      return { activeWalletAddress: currentAddress, activeWalletType: 'btc' as const }
    }
    return { activeWalletAddress: null, activeWalletType: null }
  }, [currentAddress, isConnected])

  // Payment method - Bitcoin only
  const getPaymentMethod = (): PaymentMethod => {
    return 'btc'
  }

  // Fetch recommended fee rate on open
  useEffect(() => {
    if (isOpen) {
      fetch('https://mempool.space/api/v1/fees/recommended', {
        signal: AbortSignal.timeout(5000),
      })
        .then(res => res.json())
        .then(data => {
          setRecommendedFeeRate(data.economyFee || 10)
          if (!feeRate) {
            setFeeRate(String(data.economyFee || 10))
          }
        })
        .catch(err => {
          console.warn('Failed to fetch fee rate:', err)
        })
    }
  }, [isOpen, feeRate])

  if (!isOpen) return null

  // Get payment method (call here to avoid type narrowing issues)
  const paymentMethod = getPaymentMethod()

  // Prevent clicks on backdrop from closing if there's an error or loading state
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !loading && !creating && !error) {
      onClose()
    }
  }

  const handleConfirm = async () => {
    if (!isConnected || !currentAddress || !paymentAddress || !client) {
      setError('Please connect your wallet first')
      return
    }

    const feeRateNum = parseFloat(feeRate)
    if (isNaN(feeRateNum) || feeRateNum <= 0) {
      setError('Please enter a valid fee rate (sat/vB)')
      return
    }

    setCreating(true)
    setError(null)
    let paymentId: string | null = null

    try {
      // Step 1: Create payment
      const response = await fetch('/api/credits/create-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address: currentAddress,
          tier_index: tierIndex,
          fee_rate: feeRateNum,
          payment_type: 'btc',
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        setError(errorData.error || 'Failed to create payment')
        setCreating(false)
        return
      }

      const paymentData = await response.json()
      paymentId = paymentData.paymentId
      const amountSats = paymentData.bitcoinAmountSats
      const estimatedFee = 250 * feeRateNum
      const totalNeeded = amountSats + estimatedFee

      // Helper to cancel payment and set error
      const cancelAndError = async (errorMsg: string) => {
        if (paymentId && currentAddress) {
          await cancelPendingPayment(paymentId, currentAddress)
        }
        setError(errorMsg)
        setCreating(false)
      }

      // Step 2: Fetch UTXOs
      const utxosResponse = await fetch(
        `/api/utxos?address=${encodeURIComponent(paymentAddress)}&targetAmount=${totalNeeded}&filter=true`
      )

      if (!utxosResponse.ok) {
        const errorData = await utxosResponse.json().catch(() => ({}))
        await cancelAndError(errorData.error || 'Failed to fetch UTXOs')
        return
      }

      const utxosData = await utxosResponse.json()
      const utxos = utxosData.utxos

      if (utxos.length === 0) {
        await cancelAndError('No usable UTXOs found. Please ensure you have Bitcoin UTXOs.')
        return
      }

      // Step 3: Fetch transaction details for selected UTXOs
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
        await cancelAndError(`Insufficient balance. Need ${(totalNeeded / 100000000).toFixed(8)} BTC`)
        return
      }

      // Fetch transaction details in parallel
      const txFetchPromises = selectedUtxos.map(async (utxo) => {
        const needsFullTx = !utxo.scriptpubkey ||
          utxo.scriptpubkey_type === 'p2sh' ||
          utxo.scriptpubkey_type === 'p2sh-p2wpkh' ||
          utxo.scriptpubkey_type === 'p2sh-p2wsh'

        if (!needsFullTx) return

        try {
          const [txResponse, txHexResponse] = await Promise.all([
            fetch(`https://mempool.space/api/tx/${utxo.txid}`),
            (utxo.scriptpubkey_type === 'p2sh' ||
              utxo.scriptpubkey_type === 'p2sh-p2wpkh' ||
              utxo.scriptpubkey_type === 'p2sh-p2wsh')
              ? fetch(`https://mempool.space/api/tx/${utxo.txid}/hex`)
              : Promise.resolve(null)
          ])

          if (txResponse.ok) {
            const txData = await txResponse.json()
            if (txData.vout && txData.vout[utxo.vout]) {
              utxo.scriptpubkey = txData.vout[utxo.vout].scriptpubkey
              utxo.scriptpubkey_type = txData.vout[utxo.vout].scriptpubkey_type
              utxo.scriptpubkey_address = txData.vout[utxo.vout].scriptpubkey_address

              if (utxo.scriptpubkey_type === 'p2sh' ||
                utxo.scriptpubkey_type === 'p2sh-p2wpkh' ||
                utxo.scriptpubkey_type === 'p2sh-p2wsh') {
                utxo.fullTransaction = txData
                if (txHexResponse && txHexResponse.ok) {
                  utxo.fullTransaction.hex = await txHexResponse.text()
                }
              }
            }
          }
        } catch (err) {
          console.error(`Error fetching transaction ${utxo.txid}:`, err)
        }
      })

      await Promise.all(txFetchPromises)

      const validUtxos = selectedUtxos.filter(utxo => utxo.scriptpubkey && utxo.scriptpubkey.trim() !== '')
      if (validUtxos.length === 0) {
        await cancelAndError('Could not fetch required transaction data')
        return
      }

      // Step 4: Create PSBT
      const network = bitcoin.networks.bitcoin
      const psbt = new bitcoin.Psbt({ network })

      for (const utxo of validUtxos) {
        const input: any = {
          hash: utxo.txid,
          index: utxo.vout,
        }

        const scriptpubkey = utxo.scriptpubkey.trim()
        const scriptBytes = new Uint8Array(Buffer.from(scriptpubkey, 'hex'))
        // Convert value to number (bitcoinjs-lib expects number, not BigInt)
        // Safely convert: handle string, number, or BigInt
        const valueNumber = typeof utxo.value === 'bigint' 
          ? Number(utxo.value) 
          : typeof utxo.value === 'string' 
            ? Number(utxo.value) 
            : utxo.value

        if (utxo.scriptpubkey_type === 'v0_p2wpkh' || utxo.scriptpubkey_type === 'v1_p2tr' || utxo.scriptpubkey_type === 'v0_p2wsh') {
          input.witnessUtxo = {
            script: scriptBytes,
            value: valueNumber,
          }
        } else if (utxo.scriptpubkey_type === 'p2sh-p2wpkh' || utxo.scriptpubkey_type === 'p2sh-p2wsh' || utxo.scriptpubkey_type === 'p2sh') {
          let txHex: string | null = null

          if (utxo.fullTransaction?.hex) {
            txHex = utxo.fullTransaction.hex
          } else {
            try {
              const txResponse = await fetch(`https://mempool.space/api/tx/${utxo.txid}/hex`)
              if (txResponse.ok) {
                txHex = await txResponse.text()
                if (utxo.fullTransaction) {
                  utxo.fullTransaction.hex = txHex
                }
              }
            } catch (err) {
              console.error(`Error fetching transaction hex:`, err)
            }
          }

          if (txHex) {
            input.nonWitnessUtxo = Buffer.from(txHex, 'hex')
            input.witnessUtxo = {
              script: scriptBytes,
              value: valueNumber,
            }
          }
        } else {
          input.witnessUtxo = {
            script: scriptBytes,
            value: valueNumber,
          }
        }

        psbt.addInput(input)
        const inputIndex = psbt.data.inputs.length - 1
        const address = utxo.scriptpubkey_address || paymentAddress

        if (address) {
          addInputSigningInfo(
            psbt,
            inputIndex,
            address,
            paymentPublicKey || undefined,
            undefined,
            utxo.value
          )
        }
      }

      // Add outputs
      psbt.addOutput({
        address: paymentData.paymentAddress,
        value: amountSats as any, // bitcoinjs-lib accepts number at runtime (TypeScript types may be incorrect)
      })

      const change = totalInput - amountSats - estimatedFee
      if (change > 546) {
        psbt.addOutput({
          address: paymentAddress,
          value: change as any, // bitcoinjs-lib accepts number at runtime (TypeScript types may be incorrect)
        })
      }

      // Step 5: Sign WITHOUT broadcasting (so we can get txid first)
      const psbtBase64 = psbt.toBase64()
      console.log('🔐 Signing PSBT with wallet (autoFinalize=true, broadcast=false)...')
      
      // Try with autoFinalize=true first - wallet should finalize it
      // If that doesn't work, we'll handle it manually
      let signedResult
      try {
        signedResult = await client.signPsbt(psbtBase64, true, false) // autoFinalize=true, broadcast=false
        console.log('✅ Wallet signed PSBT:', Object.keys(signedResult))
      } catch (signError: any) {
        console.error('Error signing with autoFinalize=true:', signError)
        // Try without autoFinalize
        console.log('🔄 Retrying without autoFinalize...')
        signedResult = await client.signPsbt(psbtBase64, false, false) // autoFinalize=false, broadcast=false
        console.log('✅ Wallet signed PSBT (no autoFinalize):', Object.keys(signedResult))
      }

      // Extract transaction and txid from signed result
      let txId: string | null = null
      let txHex: string | null = null

      if (signedResult.txId || signedResult.txid) {
        // Wallet already provided txid (shouldn't happen with broadcast=false, but handle it)
        txId = signedResult.txId || signedResult.txid
        console.log('✅ Got txid from wallet:', txId)
        // If we have txid but no txHex, we can't broadcast - this shouldn't happen
        if (!signedResult.txHex) {
          throw new Error('Wallet returned txid but no transaction hex for broadcasting')
        }
        txHex = signedResult.txHex
      } else if (signedResult.signedPsbtHex) {
        // Extract transaction from signed PSBT hex
        console.log('📝 Processing signed PSBT (hex)...')
        const signedPsbt = bitcoin.Psbt.fromHex(signedResult.signedPsbtHex, { network })
        
        // Check which inputs need finalization
        console.log(`PSBT has ${signedPsbt.inputCount} inputs`)
        for (let i = 0; i < signedPsbt.inputCount; i++) {
          const input = signedPsbt.data.inputs[i]
          const isFinalized = !!(input.finalScriptSig || input.finalScriptWitness)
          console.log(`Input ${i}: finalized=${isFinalized}, hasPartialSig=${!!input.partialSig?.length}`)
        }
        
        // Try to finalize all inputs safely
        try {
          // Finalize inputs one by one, checking if they're already finalized
          for (let i = 0; i < signedPsbt.inputCount; i++) {
            const input = signedPsbt.data.inputs[i]
            const isFinalized = !!(input.finalScriptSig || input.finalScriptWitness)
            
            if (isFinalized) {
              console.log(`Input ${i} already finalized, skipping`)
              continue
            }
            
            try {
              signedPsbt.finalizeInput(i)
              console.log(`✅ Finalized input ${i}`)
            } catch (e: any) {
              // Check again if it got finalized
              const inputAfter = signedPsbt.data.inputs[i]
              const isFinalizedAfter = !!(inputAfter.finalScriptSig || inputAfter.finalScriptWitness)
              
              if (isFinalizedAfter) {
                console.log(`Input ${i} was finalized despite error`)
              } else {
                console.error(`Failed to finalize input ${i}:`, e.message)
                throw new Error(`Failed to finalize input ${i}: ${e.message}. Input may not be properly signed.`)
              }
            }
          }
          
          const tx = signedPsbt.extractTransaction()
          txId = tx.getId()
          txHex = tx.toHex()
          console.log('✅ Extracted txid from signed PSBT:', txId)
        } catch (finalizeError: any) {
          console.error('Error finalizing PSBT:', finalizeError)
          // Log PSBT state for debugging
          console.error('PSBT inputs state:', signedPsbt.data.inputs.map((input, i) => ({
            index: i,
            hasFinalScriptSig: !!input.finalScriptSig,
            hasFinalScriptWitness: !!input.finalScriptWitness,
            hasPartialSig: !!input.partialSig?.length,
            hasRedeemScript: !!input.redeemScript,
            hasWitnessUtxo: !!input.witnessUtxo,
          })))
          throw new Error(`Failed to finalize PSBT: ${finalizeError.message}`)
        }
      } else if (signedResult.signedPsbtBase64) {
        // Extract transaction from signed PSBT base64
        console.log('📝 Processing signed PSBT (base64)...')
        const signedPsbt = bitcoin.Psbt.fromBase64(signedResult.signedPsbtBase64, { network })
        
        // Check which inputs need finalization
        console.log(`PSBT has ${signedPsbt.inputCount} inputs`)
        for (let i = 0; i < signedPsbt.inputCount; i++) {
          const input = signedPsbt.data.inputs[i]
          const isFinalized = !!(input.finalScriptSig || input.finalScriptWitness)
          console.log(`Input ${i}: finalized=${isFinalized}, hasPartialSig=${!!input.partialSig?.length}`)
        }
        
        // Finalize inputs one by one
        try {
          for (let i = 0; i < signedPsbt.inputCount; i++) {
            const input = signedPsbt.data.inputs[i]
            const isFinalized = !!(input.finalScriptSig || input.finalScriptWitness)
            
            if (isFinalized) {
              console.log(`Input ${i} already finalized, skipping`)
              continue
            }
            
            try {
              signedPsbt.finalizeInput(i)
              console.log(`✅ Finalized input ${i}`)
            } catch (e: any) {
              // Check again if it got finalized
              const inputAfter = signedPsbt.data.inputs[i]
              const isFinalizedAfter = !!(inputAfter.finalScriptSig || inputAfter.finalScriptWitness)
              
              if (isFinalizedAfter) {
                console.log(`Input ${i} was finalized despite error`)
              } else {
                console.error(`Failed to finalize input ${i}:`, e.message)
                throw new Error(`Failed to finalize input ${i}: ${e.message}. Input may not be properly signed.`)
              }
            }
          }
          
          const tx = signedPsbt.extractTransaction()
          txId = tx.getId()
          txHex = tx.toHex()
          console.log('✅ Extracted txid from signed PSBT (base64):', txId)
        } catch (finalizeError: any) {
          console.error('Error finalizing PSBT:', finalizeError)
          // Log PSBT state for debugging
          console.error('PSBT inputs state:', signedPsbt.data.inputs.map((input, i) => ({
            index: i,
            hasFinalScriptSig: !!input.finalScriptSig,
            hasFinalScriptWitness: !!input.finalScriptWitness,
            hasPartialSig: !!input.partialSig?.length,
            hasRedeemScript: !!input.redeemScript,
            hasWitnessUtxo: !!input.witnessUtxo,
          })))
          throw new Error(`Failed to finalize PSBT: ${finalizeError.message}`)
        }
      } else if (signedResult.txHex) {
        // Wallet provided transaction hex directly (already finalized)
        const tx = bitcoin.Transaction.fromHex(signedResult.txHex)
        txId = tx.getId()
        txHex = signedResult.txHex
        console.log('✅ Extracted txid from transaction hex:', txId)
      } else {
        console.error('Wallet response:', signedResult)
        throw new Error('Wallet did not return a valid signed transaction or PSBT. Response: ' + safeStringify(signedResult))
      }

      if (!txId) {
        await cancelAndError('Failed to extract transaction ID from signed transaction')
        return
      }

      // Step 6: Save txid to database BEFORE broadcasting
      console.log('💾 Saving txid to database before broadcast:', txId)
      const verifyResponse = await fetch('/api/credits/verify-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_id: paymentData.paymentId,
          wallet_address: currentAddress,
          txid: txId,
        }),
      })

      if (!verifyResponse.ok) {
        const errorText = await verifyResponse.text()
        console.error('Failed to save txid to database:', errorText)
        // Try once more
        await new Promise(resolve => setTimeout(resolve, 500))
        const retryResponse = await fetch('/api/credits/verify-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            payment_id: paymentData.paymentId,
            wallet_address: currentAddress,
            txid: txId,
          }),
        })
        if (!retryResponse.ok) {
          setError('Failed to save transaction ID. Transaction may not be tracked properly.')
          return
        }
      }

      // Wait a moment for database to commit
      await new Promise(resolve => setTimeout(resolve, 500))

      // Step 7: Broadcast the transaction
      if (txHex) {
        console.log('📡 Broadcasting transaction:', txId)
        try {
          const broadcastResponse = await fetch('https://mempool.space/api/tx', {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: txHex,
          })

          if (!broadcastResponse.ok) {
            const errorText = await broadcastResponse.text()
            console.error('Failed to broadcast transaction:', errorText)
            setError(`Transaction saved but broadcast failed: ${errorText}`)
            return
          }

          const broadcastTxId = await broadcastResponse.text()
          console.log('✅ Transaction broadcast successfully:', broadcastTxId)
          
          // Verify the broadcast txid matches our calculated txid
          if (broadcastTxId !== txId) {
            console.warn('⚠️ Broadcast txid mismatch:', { calculated: txId, broadcast: broadcastTxId })
          }
        } catch (broadcastErr: any) {
          console.error('Error broadcasting transaction:', broadcastErr)
          setError(`Transaction saved but broadcast failed: ${broadcastErr.message}`)
          return
        }
      } else {
        // If we don't have txHex, try to get it from the signed result
        console.warn('⚠️ No txHex available for broadcast, transaction may need manual broadcast')
      }

      // Step 8: Close modal and redirect to transactions page
      onClose()
      router.push(`/transactions?payment_id=${paymentData.paymentId}&txid=${txId}`)
    } catch (err: any) {
      console.error('Purchase error:', err)
      // Cancel the pending payment if user cancelled or error occurred before broadcast
      if (paymentId && currentAddress) {
        await cancelPendingPayment(paymentId, currentAddress)
      }
      if (err.message?.includes('cancel') || err.message?.includes('reject')) {
        setError('Transaction cancelled by user')
      } else {
        setError(err.message || 'Failed to create purchase')
      }
    } finally {
      setCreating(false)
    }
  }

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={handleBackdropClick}
      style={{ pointerEvents: 'auto' }}
    >
      <div className="bg-[#14141e] border border-gray-800 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-white">Purchase {tier.credits} Credits</h2>
          <button
            onClick={onClose}
            className="text-[#a8a8b8] hover:text-white transition-colors"
            disabled={creating}
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4 mb-6">
          {/* Auto-detected payment method indicator */}
          <div className="p-3 bg-gradient-to-r from-[#4561ad]/20 to-[#e27d0f]/20 border border-[#4561ad]/30 rounded-lg">
            <p className="text-sm text-white">
              <span className="font-semibold">Payment Method:</span>{' '}
              <span className="text-[#e27d0f]">₿ Bitcoin</span>
              <span className="text-[#a8a8b8]/80 ml-2">(Auto-detected from your wallet)</span>
            </p>
          </div>

          <div className="bg-[#1a1a24]/50 rounded-lg p-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[#a8a8b8]">Credits:</span>
              <span className="text-white font-bold">{tier.credits}</span>
            </div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-[#a8a8b8]">Price:</span>
              <span className="text-white font-bold">${tier.totalPrice}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[#a8a8b8]">Per Credit:</span>
              <span className="text-white">${tier.pricePerCredit.toFixed(2)}</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Fee Rate (sat/vB)
            </label>
            <input
              type="number"
              value={feeRate}
              onChange={(e) => setFeeRate(e.target.value)}
              placeholder={String(recommendedFeeRate)}
              min="1"
              step="1"
              className="w-full px-4 py-2 bg-[#1a1a24] border border-[#9945FF]/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              disabled={creating}
            />
            <p className="text-xs text-[#a8a8b8]/80 mt-1">
              Recommended: {recommendedFeeRate} sat/vB (economy)
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-900/50 border border-[#EF4444]/20 text-red-200 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-lg font-semibold shadow-lg shadow-blue-500/20 transition-all duration-200"
            disabled={creating}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={creating || !feeRate}
            className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {creating ? (
              <>
                <span className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></span>
                Processing...
              </>
            ) : (
              'Confirm Purchase'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

