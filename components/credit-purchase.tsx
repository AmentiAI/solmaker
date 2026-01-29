'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { CREDIT_TIERS } from '@/lib/credits/constants'
import { useWallet } from '@/lib/wallet/compatibility'
import * as bitcoin from 'bitcoinjs-lib'
import * as ecc from '@bitcoinerlab/secp256k1'
import { addInputSigningInfo, getAddressType } from '@/lib/bitcoin-utils'

// Initialize ECC library for bitcoinjs-lib (required for taproot addresses and PSBT operations)
if (typeof bitcoin.initEccLib === 'function') {
  bitcoin.initEccLib(ecc)
}
import { useCreditCosts, formatCreditCost } from '@/lib/credits/use-credit-costs'
import { PaymentMethod } from '@/components/payment-method-selector'
import { CreditPurchaseModal } from '@/components/credit-purchase-modal'
import { safeStringify } from '@/lib/json-utils'

interface CreditPurchaseProps {
  onPurchaseComplete?: () => void
}

interface HolderStatus {
  isHolder: boolean
  holdingCount: number
  collection: string
  discountPercent: number
}

export function CreditPurchase({ onPurchaseComplete }: CreditPurchaseProps) {
  const { isConnected, currentAddress, paymentAddress, paymentPublicKey, publicKey, client } = useWallet()
  const { costs: creditCosts } = useCreditCosts()
  const [selectedTier, setSelectedTier] = useState<number | null>(null)
  const [showModal, setShowModal] = useState(false)
  
  // Holder discount state
  const [holderStatus, setHolderStatus] = useState<HolderStatus | null>(null)
  const [checkingHolder, setCheckingHolder] = useState(false)
  
  // Determine active wallet - Bitcoin only
  const { activeWalletAddress, activeWalletType } = useMemo(() => {
    if (currentAddress && isConnected) {
      return { activeWalletAddress: currentAddress, activeWalletType: 'btc' as const }
    }
    return { activeWalletAddress: null, activeWalletType: null }
  }, [currentAddress, isConnected])
  
  // Payment method - Bitcoin only
  const paymentMethod: PaymentMethod = 'btc'
  
  // Check holder status for discount
  useEffect(() => {
    const checkHolderStatus = async () => {
      if (!activeWalletAddress) {
        setHolderStatus(null)
        return
      }
      
      setCheckingHolder(true)
      try {
        const response = await fetch(`/api/holder-check?wallet_address=${encodeURIComponent(activeWalletAddress)}`)
        if (response.ok) {
          const data = await response.json()
          setHolderStatus(data)
        }
      } catch (error) {
        console.error('Error checking holder status:', error)
        setHolderStatus(null)
      } finally {
        setCheckingHolder(false)
      }
    }
    
    checkHolderStatus()
  }, [activeWalletAddress])
  
  // Calculate discounted tiers
  const discountedTiers = useMemo(() => {
    const discountMultiplier = holderStatus?.isHolder ? 0.5 : 1 // 50% off if holder
    return CREDIT_TIERS.map(tier => ({
      ...tier,
      discountedPrice: tier.totalPrice * discountMultiplier,
      discountedPricePerCredit: tier.pricePerCredit * discountMultiplier,
    }))
  }, [holderStatus?.isHolder])
  
  const [purchasing, setPurchasing] = useState(false)
  const [paymentInfo, setPaymentInfo] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [checkingPayment, setCheckingPayment] = useState(false)
  const [paymentStatus, setPaymentStatus] = useState<any>(null)
  const [currentPaymentId, setCurrentPaymentId] = useState<string | null>(null)

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

  const handlePurchase = useCallback(async (tierIndex: number) => {
    const tier = discountedTiers[tierIndex]
    const finalPrice = holderStatus?.isHolder ? tier.discountedPrice : tier.totalPrice
    
    // BTC payment flow
    if (!isConnected || !currentAddress || !paymentAddress || !client) {
      setError('Please connect your wallet first')
      return
    }

    setPurchasing(true)
    setError(null)

    try {
      // Step 1: Get payment details from API
      const response = await fetch('/api/credits/create-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address: currentAddress,
          tier_index: tierIndex,
          payment_type: 'btc',
          holder_discount: holderStatus?.isHolder ? 50 : 0, // Pass discount percentage
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        setError(errorData.error || 'Failed to create payment')
        setPurchasing(false)
        return
      }

      const paymentData = await response.json()
      const paymentId = paymentData.paymentId
      setCurrentPaymentId(paymentId)
      setSelectedTier(tierIndex)

      // Helper to cancel payment and set error
      const cancelAndError = async (errorMsg: string) => {
        if (paymentId && currentAddress) {
          await cancelPendingPayment(paymentId, currentAddress)
        }
        setCurrentPaymentId(null)
        setError(errorMsg)
        setPurchasing(false)
      }

      // Step 2: Get UTXOs from payment address using Sandshrew API
      let utxos: any[] = []
      try {
        const utxosResponse = await fetch(
          `/api/utxos?address=${encodeURIComponent(paymentAddress)}&filter=true`
        )
        if (utxosResponse.ok) {
          const utxosData = await utxosResponse.json()
          if (utxosData.utxos && Array.isArray(utxosData.utxos)) {
            utxos = utxosData.utxos
          } else {
            console.error('Invalid UTXO response format:', utxosData)
            await cancelAndError('Invalid response from wallet. Please try again.')
            return
          }
        } else {
          const errorData = await utxosResponse.json().catch(() => ({}))
          await cancelAndError(errorData.error || `Failed to fetch UTXOs: ${utxosResponse.statusText}`)
          return
        }
      } catch (err) {
        console.error('Error fetching UTXOs:', err)
        await cancelAndError('Failed to fetch wallet UTXOs. Please try again.')
        return
      }

      // Filter out UTXOs with value <= 600 sats (dust limit) - already filtered by API but keep as safety
      utxos = utxos.filter(utxo => utxo.value > 600)

      if (utxos.length === 0) {
        await cancelAndError('No usable UTXOs found in your wallet. Please ensure you have Bitcoin UTXOs with more than 600 sats.')
        return
      }

      // Step 3: Calculate amount needed and select UTXOs first
      const amountSats = paymentData.bitcoinAmountSats
      const feeRate = paymentData.feeRate || 10
      const estimatedFee = 250 * feeRate
      const totalNeeded = amountSats + estimatedFee

      // Select UTXOs needed for the transaction (before fetching transaction details)
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
        await cancelAndError(`Insufficient balance. Need ${(totalNeeded / 100000000).toFixed(8)} BTC, have ${(totalInput / 100000000).toFixed(8)} BTC`)
        return
      }

      // Step 4: Fetch transaction details ONLY for selected UTXOs missing scriptpubkey (in parallel)
      const txFetchPromises = selectedUtxos.map(async (utxo) => {
        if (utxo.scriptpubkey) return // Already has scriptpubkey
        
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

      // Filter to only valid UTXOs with scriptpubkey
      const validUtxos = selectedUtxos.filter(utxo => utxo.scriptpubkey && utxo.scriptpubkey.trim() !== '')
      
      if (validUtxos.length === 0) {
        await cancelAndError('Could not fetch required transaction data. Please try again later.')
        return
      }

      // Step 5: Create PSBT using bitcoinjs-lib
      const network = bitcoin.networks.bitcoin
      const psbt = new bitcoin.Psbt({ network })

      // Recalculate total input from valid UTXOs
      const finalTotalInput = validUtxos.reduce((sum, utxo) => sum + utxo.value, 0)
      if (finalTotalInput < totalNeeded) {
        await cancelAndError(`Insufficient balance. Need ${(totalNeeded / 100000000).toFixed(8)} BTC, have ${(finalTotalInput / 100000000).toFixed(8)} BTC`)
        return
      }

      // Add inputs with proper wallet-specific signing info
      for (let i = 0; i < validUtxos.length; i++) {
        const utxo = validUtxos[i]
        if (!utxo.txid || utxo.vout === undefined || !utxo.scriptpubkey || !utxo.value) {
          console.error('Invalid UTXO:', safeStringify(utxo))
          await cancelAndError(`Invalid UTXO data: missing required fields. Please try again.`)
          return
        }

        const scriptpubkey = utxo.scriptpubkey.trim()
        if (!scriptpubkey || !/^[0-9a-fA-F]+$/.test(scriptpubkey)) {
          console.error('Invalid scriptpubkey:', scriptpubkey)
          await cancelAndError(`Invalid UTXO script data. Please try again.`)
          return
        }

        const scriptBytes = Buffer.from(scriptpubkey, 'hex')
        // Convert value to number (bitcoinjs-lib expects number, not BigInt)
        // Safely convert: handle string, number, or BigInt
        const valueNumber = typeof utxo.value === 'bigint' 
          ? Number(utxo.value) 
          : typeof utxo.value === 'string' 
            ? Number(utxo.value) 
            : utxo.value
        const utxoAddress = utxo.scriptpubkey_address || paymentAddress || currentAddress
        const addressType = getAddressType(utxoAddress)

        const input: any = {
          hash: utxo.txid,
          index: utxo.vout,
        }

        // Handle P2SH transactions - need full transaction for nonWitnessUtxo
        if (utxo.scriptpubkey_type === 'p2sh' || 
            utxo.scriptpubkey_type === 'p2sh-p2wpkh' || 
            utxo.scriptpubkey_type === 'p2sh-p2wsh') {
          // Fetch full transaction hex for P2SH
          try {
            const txHexResponse = await fetch(`https://mempool.space/api/tx/${utxo.txid}/hex`)
            if (txHexResponse.ok) {
              const txHex = await txHexResponse.text()
              input.nonWitnessUtxo = Buffer.from(txHex, 'hex')
            }
          } catch (err) {
            console.warn(`Could not fetch transaction hex for ${utxo.txid}, continuing with witnessUtxo only`)
          }
        }

        // Always add witnessUtxo for SegWit transactions
        if (utxo.scriptpubkey_type === 'v0_p2wpkh' || 
            utxo.scriptpubkey_type === 'v1_p2tr' || 
            utxo.scriptpubkey_type === 'v0_p2wsh' ||
            utxo.scriptpubkey_type === 'p2sh-p2wpkh' ||
            utxo.scriptpubkey_type === 'p2sh-p2wsh') {
          input.witnessUtxo = {
            script: scriptBytes,
            value: valueNumber,
          }
        } else if (utxo.scriptpubkey_type === 'p2sh') {
          // P2SH also needs witnessUtxo
          input.witnessUtxo = {
            script: scriptBytes,
            value: valueNumber,
          }
        } else {
          // Legacy P2PKH - use nonWitnessUtxo if available, otherwise witnessUtxo
          input.witnessUtxo = {
            script: scriptBytes,
            value: valueNumber,
          }
        }

        psbt.addInput(input)
        const inputIndex = psbt.data.inputs.length - 1

        // Determine which keys to use based on address type
        let taprootKey: string | undefined = undefined
        let paymentKey: string | undefined = undefined

        if (addressType === 'p2tr') {
          // For Taproot, use publicKey as taproot key
          taprootKey = publicKey || undefined
        } else {
          // For other types, use paymentPublicKey
          paymentKey = paymentPublicKey || undefined
        }

        // Add wallet-specific signing info
        addInputSigningInfo(
          psbt,
          inputIndex,
          utxoAddress,
          paymentKey,
          taprootKey,
          utxo.value
        )
      }

      // Add output to payment address
      psbt.addOutput({
        address: paymentData.paymentAddress,
        value: amountSats as any, // bitcoinjs-lib accepts number at runtime (TypeScript types may be incorrect)
      })

      // Add change output (if any)
      const change = finalTotalInput - amountSats - estimatedFee
      if (change > 546) {
        psbt.addOutput({
          address: paymentAddress,
          value: change as any, // bitcoinjs-lib accepts number at runtime (TypeScript types may be incorrect)
        })
      }

      // Step 4: Convert PSBT to base64 and sign with LaserEyes
      const psbtBase64 = psbt.toBase64()
      
      setPaymentInfo({
        ...paymentData,
        psbtBase64,
      })

      // Step 5: Sign the PSBT (without broadcasting first to get txid)
      try {
        console.log('🔐 Signing PSBT with wallet...')
        // Sign with autoFinalize=true, but don't broadcast yet
        let signedResult = await client.signPsbt(psbtBase64, true, false)
        
        // Handle different wallet response formats
        let signedPsbtBase64: string
        if (signedResult.psbt) {
          signedPsbtBase64 = signedResult.psbt
        } else if (signedResult.psbtHex) {
          // Convert hex to base64
          signedPsbtBase64 = Buffer.from(signedResult.psbtHex, 'hex').toString('base64')
        } else if (signedResult.signedPsbtBase64) {
          signedPsbtBase64 = signedResult.signedPsbtBase64
        } else {
          signedPsbtBase64 = psbtBase64
        }
        
        // Check if finalization is needed (some wallets like Magic Eden don't finalize)
        let finalPsbt = bitcoin.Psbt.fromBase64(signedPsbtBase64)
        const requiresFinalization = finalPsbt.data.inputs.some(
          (input) => !input.finalScriptSig && !input.finalScriptWitness
        )

        let txHex: string
        let txId: string | null = null

        if (requiresFinalization) {
          console.log('⚠️ PSBT requires finalization, calling Sandshrew finalize API...')
          // Call finalize API
          const finalizeResponse = await fetch('/api/finalize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              txBase64: signedPsbtBase64
            }),
          })

          if (!finalizeResponse.ok) {
            throw new Error('Failed to finalize transaction')
          }

          const finalizeData = await finalizeResponse.json()
          txHex = finalizeData.hex
          
          // Extract txid from finalized transaction
          const tx = bitcoin.Transaction.fromHex(txHex)
          txId = tx.getId()
          console.log('✅ Transaction finalized, txid:', txId)
        } else {
          // Already finalized, extract transaction
          const tx = finalPsbt.extractTransaction()
          txHex = tx.toHex()
          txId = tx.getId()
          console.log('✅ Transaction already finalized, txid:', txId)
        }

        // If wallet provided txid directly, use that
        if (signedResult.txId || signedResult.txid) {
          txId = signedResult.txId || signedResult.txid
        }

        if (!txId) {
          await cancelAndError('Transaction signed but no transaction ID could be extracted')
          return
        }

        // Step 6: Broadcast the transaction FIRST (before saving txid)
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

        console.log('✅ Transaction broadcast successfully, txid:', txId)

        // Step 7: Track used UTXOs to prevent reuse (add to exclusion list)
        const usedOutpoints = validUtxos.map(u => `${u.txid}:${u.vout}`)
        try {
          await fetch('/api/utxos/exclude', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              address: paymentAddress || currentAddress,
              excludedUtxos: usedOutpoints,
            }),
          })
          console.log(`📝 Tracked ${usedOutpoints.length} UTXOs to prevent reuse`)
        } catch (excludeErr) {
          console.warn('Failed to track excluded UTXOs (non-critical):', excludeErr)
        }

        // Step 8: Wait a moment for transaction to propagate to mempool.space
        await new Promise(resolve => setTimeout(resolve, 2000))

        // Step 9: Save txid and verify payment (transaction should now be in mempool)
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
          const errorData = await verifyResponse.json().catch(() => ({}))
          console.warn('⚠️ Payment verification returned error (non-critical, will retry):', errorData.error || verifyResponse.statusText)
          // Don't throw - the polling will retry
        } else {
          const verifyData = await verifyResponse.json()
          console.log('✅ Payment verified, status:', verifyData.status)
          // Update payment status immediately
          setPaymentStatus(verifyData)
        }

        setPaymentInfo({
          ...paymentData,
          txid: txId,
        })
        
        // Set initial status showing transaction is in mempool
        setPaymentStatus({
          status: 'pending',
          confirmations: 0,
          txid: txId,
          message: 'Transaction broadcast successfully. Waiting for confirmation...',
        })
      } catch (signError: any) {
        console.error('Error signing/broadcasting PSBT:', signError)
        // Cancel the pending payment since user cancelled or signing failed
        if (paymentId && currentAddress) {
          await cancelPendingPayment(paymentId, currentAddress)
        }
        setCurrentPaymentId(null)
        if (signError.message?.includes('cancel') || signError.message?.includes('reject')) {
          setError('Transaction cancelled by user')
        } else {
          setError(`Failed to sign transaction: ${signError.message || 'Unknown error'}`)
        }
        setPaymentInfo(null)
        setSelectedTier(null)
        setPurchasing(false)
      }
    } catch (err: any) {
      // Cancel any pending payment if there's a general error
      if (currentPaymentId && currentAddress) {
        await cancelPendingPayment(currentPaymentId, currentAddress)
      }
      setCurrentPaymentId(null)
      setError(err.message || 'Failed to create purchase')
      console.error('Purchase error:', err)
      setPurchasing(false)
    }
  }, [isConnected, currentAddress, paymentAddress, client, discountedTiers, holderStatus?.isHolder, paymentMethod])

  // Check payment status periodically - only after transaction is signed (has txid)
  useEffect(() => {
    // Only start polling if we have paymentInfo AND a txid (transaction has been signed)
    if (!paymentInfo || !currentAddress || !paymentInfo.txid) return

    let interval: NodeJS.Timeout | null = null
    let isChecking = false

    const checkPayment = async () => {
      // Don't check if already checking
      if (isChecking) return
      
      isChecking = true
      setCheckingPayment(true)
      try {
        const response = await fetch(
          `/api/credits/verify-payment?payment_id=${paymentInfo.paymentId}&wallet_address=${encodeURIComponent(currentAddress)}`,
          { cache: 'no-store' } // Prevent caching
        )
        if (response.ok) {
          const data = await response.json()
          setPaymentStatus(data)
          
          if (data.status === 'completed') {
            // Payment confirmed, refresh credits and stop polling
            onPurchaseComplete?.()
            if (interval) clearInterval(interval)
            return
          }
        }
      } catch (err) {
        console.error('Error checking payment:', err)
      } finally {
        isChecking = false
        setCheckingPayment(false)
      }
    }

    // Wait 5 seconds after transaction is signed before first check (give it time to propagate)
    const initialTimeout = setTimeout(() => {
      checkPayment()
      
      // Then check every 30 seconds (instead of 1 minute to be more responsive)
      interval = setInterval(checkPayment, 30000)
    }, 5000)

    return () => {
      clearTimeout(initialTimeout)
      if (interval) clearInterval(interval)
    }
  }, [paymentInfo?.txid, paymentInfo?.paymentId, currentAddress, onPurchaseComplete])

  if (paymentInfo && paymentMethod === 'btc') {
    const isCompleted = paymentStatus?.status === 'completed'
    const txid = paymentInfo.txid || paymentStatus?.txid
    const hasTxid = !!txid
    const hasConfirmations = paymentStatus?.confirmations && paymentStatus.confirmations > 0

    return (
      <div className="cosmic-card border border-[#00d4ff]/30 rounded-lg p-6 space-y-4">
        <h3 className="text-xl font-bold text-white">Payment Status</h3>
        
        {isCompleted ? (
          <div className="cosmic-card border border-[#00d4ff]/50 rounded-lg p-6 space-y-4 bg-[#00d4ff]/10">
            <div className="flex items-center gap-2">
              <svg className="w-6 h-6 text-[#00d4ff]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <p className="text-[#00d4ff] font-bold text-xl">Payment Confirmed!</p>
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-[#00d4ff]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <p className="text-white text-lg font-medium">
                {paymentStatus.creditsAwarded || paymentInfo.creditsAmount} credits have been added to your account.
              </p>
            </div>
            {txid && (
              <div className="bg-black/60 border border-[#00d4ff]/30 rounded-lg p-4 space-y-3">
                <p className="text-sm text-white mb-1">Transaction ID:</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-white/80 font-mono text-sm break-all flex-1 min-w-0">{txid}</p>
                  <button
                    onClick={() => navigator.clipboard.writeText(txid)}
                    className="text-xs text-[#00d4ff] hover:text-[#00b8e6] px-3 py-1.5 border border-[#00d4ff]/50 rounded transition-colors whitespace-nowrap hover:bg-[#00d4ff]/10"
                  >
                    Copy
                  </button>
                </div>
                <a
                  href={`https://mempool.space/tx/${txid}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[#00d4ff] hover:text-[#00b8e6] text-sm underline transition-colors"
                >
                  View on Mempool.space →
                </a>
              </div>
            )}
            <button
              onClick={() => {
                setPaymentInfo(null)
                setSelectedTier(null)
                setPaymentStatus(null)
                onPurchaseComplete?.()
              }}
              className="w-full px-4 py-3 bg-[#00d4ff] hover:bg-[#00b8e6] text-white rounded-lg font-semibold text-lg transition-colors shadow-lg shadow-[#00d4ff]/20"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            {/* Transaction Status */}
            {hasTxid ? (
              <div className="cosmic-card border border-[#00d4ff]/30 rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="animate-pulse w-3 h-3 bg-[#00d4ff] rounded-full"></div>
                  <p className="text-white font-bold">
                    {hasConfirmations 
                      ? `⏳ Waiting for confirmation... (${paymentStatus.confirmations} confirmation${paymentStatus.confirmations !== 1 ? 's' : ''})`
                      : '🔍 Transaction detected in mempool! Waiting for confirmation...'}
                  </p>
                </div>
                <div className="bg-black/60 border border-[#00d4ff]/30 rounded p-3 space-y-3">
                  <div>
                    <p className="text-sm text-white mb-1">Transaction ID:</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-white/80 font-mono text-sm break-all">{txid}</p>
                      <button
                        onClick={() => navigator.clipboard.writeText(txid)}
                        className="text-xs text-[#00d4ff] hover:text-[#00b8e6] px-2 py-1 border border-[#00d4ff]/50 rounded hover:bg-[#00d4ff]/10"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                  <a
                    href={`https://mempool.space/tx/${txid}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[#00d4ff] hover:text-[#00b8e6] text-sm underline"
                  >
                    View on Mempool.space →
                  </a>
                </div>
              </div>
            ) : (
              <div className="bg-black/60 border border-[#00d4ff]/30 rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[#00d4ff]"></div>
                  <p className="text-white font-semibold">Broadcasting transaction...</p>
                </div>
                <p className="text-white/70 text-sm">
                  Your transaction is being broadcast to the Bitcoin network. This usually takes a few seconds.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  return (
    <div className="cosmic-card border border-[#00d4ff]/30 rounded-xl p-8 shadow-xl backdrop-blur-sm">
      <h3 className="text-3xl font-bold text-cosmic-gradient mb-2">Purchase Credits</h3>
      
      {/* Holder Discount Banner */}
      {holderStatus?.isHolder && (
        <div className="mb-4 p-4 cosmic-card border border-[#00d4ff]/50 rounded-xl bg-[#00d4ff]/10">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🎉</span>
            <div>
              <p className="text-[#00d4ff] font-bold text-lg">50% Holder Discount Active!</p>
              <p className="text-white/80 text-sm">
                You hold {holderStatus.holdingCount} OrdMaker ordinal{holderStatus.holdingCount !== 1 ? 's' : ''} - enjoy half-price credits!
              </p>
            </div>
          </div>
        </div>
      )}
      
      {checkingHolder && (
        <div className="mb-4 p-3 cosmic-card border border-[#00d4ff]/30 rounded-lg flex items-center gap-2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[#00d4ff]"></div>
          <p className="text-white/80 text-sm">Checking holder status for discounts...</p>
        </div>
      )}
      
      {/* Auto-detected payment method indicator */}
      <div className="mb-6 p-3 cosmic-card border border-[#00d4ff]/30 rounded-lg">
        <p className="text-sm text-white/80">
          <span className="font-semibold text-white">Payment Method:</span>{' '}
          {paymentMethod === 'btc' && <span className="text-[#ff6b35]">₿ Bitcoin</span>}
          <span className="text-white/60 ml-2">(Auto-detected from your wallet)</span>
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 cosmic-card border border-[#ff4757]/50 text-[#ff4757] rounded-lg">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {discountedTiers.map((tier, index) => {
          const isSelected = selectedTier === index
          const imagesCanGenerate = tier.credits
          const traitsCanGenerate = tier.credits * 20
          const hasDiscount = holderStatus?.isHolder
          return (
            <div
              key={index}
              className={`cosmic-card border rounded-xl p-6 transition-all duration-200 shadow-lg relative ${
                isSelected
                  ? 'border-[#00d4ff]/50 bg-[#00d4ff]/10 shadow-[#00d4ff]/20'
                  : hasDiscount
                    ? 'border-[#00d4ff]/40 bg-[#00d4ff]/5 hover:border-[#00d4ff]/60 hover:shadow-xl'
                    : 'border-[#00d4ff]/30 hover:border-[#00d4ff]/50 hover:shadow-xl'
              }`}
            >
              {hasDiscount && (
                <div className="absolute -top-2 -right-2 bg-[#00d4ff] text-[#0a0e27] text-xs font-bold px-2 py-1 rounded-full shadow-lg shadow-[#00d4ff]/30">
                  50% OFF
                </div>
              )}
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h4 className="text-lg font-bold text-white">{tier.credits} Credits</h4>
                  <p className="text-sm text-white/70">
                    {hasDiscount ? (
                      <>
                        <span className="line-through text-white/40">${tier.pricePerCredit.toFixed(2)}</span>
                        <span className="text-[#00d4ff] ml-1">${tier.discountedPricePerCredit.toFixed(2)}</span>
                      </>
                    ) : (
                      `$${tier.pricePerCredit.toFixed(2)}`
                    )} per credit
                  </p>
                </div>
                <div className="text-right">
                  {hasDiscount ? (
                    <>
                      <p className="text-sm text-white/40 line-through">${tier.totalPrice.toFixed(2)}</p>
                      <p className="text-xl font-bold text-[#00d4ff]">
                        ${tier.discountedPrice.toFixed(2)}
                      </p>
                    </>
                  ) : (
                    <p className="text-xl font-bold text-[#00d4ff]">
                      ${tier.totalPrice.toFixed(2)}
                    </p>
                  )}
                  <p className="text-xs text-white/60">Total</p>
                </div>
              </div>
              
              {/* What you can do with these credits */}
              <div className="cosmic-card border border-[#00d4ff]/20 rounded-lg p-3 mb-4">
               
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="px-2 py-1 bg-[#00d4ff]/20 text-[#00d4ff] rounded font-medium border border-[#00d4ff]/30">
                    {imagesCanGenerate} images
                  </span>
                  <span className="px-2 py-1 bg-[#ff6b35]/20 text-[#ff6b35] rounded font-medium border border-[#ff6b35]/30">
                    {traitsCanGenerate} traits
                  </span>
                </div>
              </div>

            
              <button
                onClick={() => !purchasing && handlePurchase(index)}
                disabled={purchasing}
                className={`w-full py-2.5 px-4 rounded-lg font-semibold text-sm transition-all duration-200 ${
                  purchasing
                    ? 'cosmic-card border border-[#00d4ff]/20 text-white/50 cursor-not-allowed'
                    : 'bg-[#00d4ff] hover:bg-[#00b8e6] text-white shadow-md hover:shadow-lg shadow-[#00d4ff]/20'
                }`}
              >
                {purchasing && selectedTier === index ? 'Processing...' : 'Buy Now'}
              </button>
            </div>
          )
        })}
      </div>

      {purchasing && (
        <div className="mt-4 text-center">
          <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-[#00d4ff]"></div>
          <p className="text-white/80 text-sm mt-2">Creating payment...</p>
        </div>
      )}

      {/* Payment Modals */}
      {showModal && selectedTier !== null && (
        <CreditPurchaseModal
          isOpen={showModal}
          onClose={() => {
            setShowModal(false)
            setSelectedTier(null)
            onPurchaseComplete?.()
          }}
          tierIndex={selectedTier}
        />
      )}
    </div>
  )
}

