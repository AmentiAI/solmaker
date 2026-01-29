'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { CREDIT_TIERS } from '@/lib/credits/constants'
import { useWallet } from '@/lib/wallet/compatibility'
import { useCreditCosts, formatCreditCost } from '@/lib/credits/use-credit-costs'
import { PaymentMethod } from '@/components/payment-method-selector'
import { CreditPurchaseModal } from '@/components/credit-purchase-modal'

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
  
  // Determine active wallet and payment type - Solana wallet
  const { activeWalletAddress, activeWalletType } = useMemo(() => {
    if (currentAddress && isConnected) {
      return { activeWalletAddress: currentAddress, activeWalletType: 'sol' as const }
    }
    return { activeWalletAddress: null, activeWalletType: null }
  }, [currentAddress, isConnected])
  
  // Payment method - Solana
  const paymentMethod: PaymentMethod = 'sol'
  
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
    
    // Solana payment flow
    if (!isConnected || !currentAddress) {
      setError('Please connect your wallet first')
      return
    }

    setPurchasing(true)
    setError(null)

    try {
      // Step 1: Get payment details from API for Solana
      const response = await fetch('/api/credits/create-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address: currentAddress,
          tier_index: tierIndex,
          payment_type: 'sol',
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

      // Step 2: Get Solana transaction details
      const solAmount = paymentData.solAmount
      if (!solAmount || solAmount <= 0) {
        await cancelAndError('Invalid payment amount received from server')
        return
      }

      console.log(`💰 Solana Payment: ${solAmount} SOL to ${paymentData.paymentAddress}`)

      setPaymentInfo({
        ...paymentData,
        solAmount,
      })

      // Step 3: Send Solana transaction
      try {
        console.log('🔐 Sending Solana transaction...')
        
        // Import Solana wallet hook to get sendTransaction
        const { useSolanaWallet } = await import('@/lib/wallet/solana-wallet-context')
        
        // We need to get the Solana wallet context
        // Since we're in a callback, we can't use the hook directly
        // Instead, we'll use the window.solana API
        if (typeof window === 'undefined' || !window.solana) {
          throw new Error('Solana wallet not available')
        }

        // Import Solana web3.js
        const { PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL, Connection } = await import('@solana/web3.js')
        
        // Get wallet from window
        const solanaWallet = window.solana
        
        // Check if wallet is connected
        if (!solanaWallet.isConnected) {
          throw new Error('Solana wallet not connected')
        }

        // Get public key
        const fromPubkey = new PublicKey(currentAddress)
        const toPubkey = new PublicKey(paymentData.paymentAddress)
        const lamports = Math.floor(solAmount * LAMPORTS_PER_SOL)

        if (lamports <= 0) {
          throw new Error('Invalid transaction amount')
        }

        // Create connection to Solana mainnet
        const connection = new Connection(
          process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
          'confirmed'
        )

        // Get recent blockhash
        const { blockhash } = await connection.getLatestBlockhash('finalized')
        
        // Create transaction
        const transaction = new Transaction()
        transaction.recentBlockhash = blockhash
        transaction.feePayer = fromPubkey
        transaction.add(
          SystemProgram.transfer({
            fromPubkey,
            toPubkey,
            lamports,
          })
        )

        // Sign and send transaction
        const { signature } = await solanaWallet.signAndSendTransaction(transaction)

        if (!signature || typeof signature !== 'string') {
          throw new Error('Invalid transaction signature')
        }

        console.log('✅ Transaction sent, signature:', signature)

        // Step 4: Wait for transaction confirmation
        console.log('⏳ Waiting for transaction confirmation...')
        const confirmation = await connection.confirmTransaction(signature, 'confirmed')
        
        if (confirmation.value.err) {
          throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`)
        }

        console.log('✅ Transaction confirmed!')

        // Step 5: Save signature and verify payment
        const verifyResponse = await fetch('/api/credits/verify-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            payment_id: paymentData.paymentId,
            wallet_address: currentAddress,
            txid: signature,
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
          txid: signature,
        })
        
        // Set initial status showing transaction is confirmed
        setPaymentStatus({
          status: 'pending',
          confirmations: 1,
          txid: signature,
          message: 'Transaction confirmed! Processing credit purchase...',
        })
      } catch (txError: any) {
        console.error('Error sending Solana transaction:', txError)
        // Cancel the pending payment since user cancelled or transaction failed
        if (paymentId && currentAddress) {
          await cancelPendingPayment(paymentId, currentAddress)
        }
        setCurrentPaymentId(null)
        if (txError.message?.includes('cancel') || txError.message?.includes('reject') || txError.code === 4001) {
          setError('Transaction cancelled by user')
        } else {
          setError(`Failed to send transaction: ${txError.message || 'Unknown error'}`)
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

  if (paymentInfo && paymentMethod === 'sol') {
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
                <p className="text-sm text-white mb-1">Transaction Signature:</p>
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
                  href={`https://solscan.io/tx/${txid}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[#00d4ff] hover:text-[#00b8e6] text-sm underline transition-colors"
                >
                  View on Solscan →
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
                      ? `✅ Transaction confirmed! Processing credits...`
                      : '⏳ Transaction sent! Waiting for confirmation...'}
                  </p>
                </div>
                <div className="bg-black/60 border border-[#00d4ff]/30 rounded p-3 space-y-3">
                  <div>
                    <p className="text-sm text-white mb-1">Transaction Signature:</p>
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
                    href={`https://solscan.io/tx/${txid}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[#00d4ff] hover:text-[#00b8e6] text-sm underline"
                  >
                    View on Solscan →
                  </a>
                </div>
              </div>
            ) : (
              <div className="bg-black/60 border border-[#00d4ff]/30 rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[#00d4ff]"></div>
                  <p className="text-white font-semibold">Sending transaction...</p>
                </div>
                <p className="text-white/70 text-sm">
                  Your transaction is being sent to the Solana network. Please confirm in your wallet.
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
          {paymentMethod === 'sol' && <span className="text-[#00d4ff]">◎ Solana</span>}
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

