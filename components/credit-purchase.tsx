'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { CREDIT_TIERS } from '@/lib/credits/constants'
import { useWallet } from '@/lib/wallet/compatibility'
import { useWallet as useSolanaWalletAdapter } from '@solana/wallet-adapter-react'
import { useCreditCosts, formatCreditCost } from '@/lib/credits/use-credit-costs'
import { PaymentMethod } from '@/components/payment-method-selector'
import { CreditPurchaseModal } from '@/components/credit-purchase-modal'
import { getSolscanUrl } from '@/lib/solscan'

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
  const { signTransaction: walletSignTransaction } = useSolanaWalletAdapter()
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

    // Solana payment flow
    if (!isConnected || !currentAddress) {
      setError('Please connect your wallet first')
      return
    }

    if (!walletSignTransaction) {
      setError('Wallet does not support signTransaction')
      return
    }

    setPurchasing(true)
    setError(null)
    setSelectedTier(tierIndex)

    let paymentId: string | null = null

    try {
      // Step 1: Get payment details from API
      const response = await fetch('/api/credits/create-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address: currentAddress,
          tier_index: tierIndex,
          payment_type: 'sol',
          holder_discount: holderStatus?.isHolder ? 50 : 0,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to create payment')
      }

      const paymentData = await response.json()
      paymentId = paymentData.paymentId

      const solAmount = paymentData.solAmount
      if (!solAmount || solAmount <= 0) {
        throw new Error('Invalid payment amount received from server')
      }

      console.log(`[Credit Purchase] ${solAmount} SOL to ${paymentData.paymentAddress}`)

      // Step 2: Build the transaction (NO setState calls from here until after wallet signs)
      const { PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL, Connection } = await import('@solana/web3.js')

      const fromPubkey = new PublicKey(currentAddress)
      const toPubkey = new PublicKey(paymentData.paymentAddress)
      const lamports = Math.floor(solAmount * LAMPORTS_PER_SOL)

      if (lamports <= 0) {
        throw new Error('Invalid transaction amount')
      }

      const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'
      const connection = new Connection(rpcUrl, 'confirmed')
      const { blockhash } = await connection.getLatestBlockhash('finalized')

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

      // CRITICAL: Zero setState calls before wallet popup.
      // React re-renders kill the Phantom popup / service worker.
      const signed = await walletSignTransaction(transaction)

      // After wallet signs, NOW we can update state
      setCurrentPaymentId(paymentId)
      setPaymentInfo({ ...paymentData, solAmount })

      // Step 3: Send raw transaction via our own RPC (not wallet's internal RPC)
      const rawTx = signed.serialize()
      const signature = await connection.sendRawTransaction(rawTx, {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      })

      console.log('[Credit Purchase] Transaction sent:', signature)

      // Step 4: Wait for confirmation
      const confirmation = await connection.confirmTransaction(signature, 'confirmed')

      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`)
      }

      console.log('[Credit Purchase] Transaction confirmed')

      // Step 5: Verify payment with backend
      const verifyResponse = await fetch('/api/credits/verify-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_id: paymentData.paymentId,
          wallet_address: currentAddress,
          txid: signature,
        }),
      })

      if (verifyResponse.ok) {
        const verifyData = await verifyResponse.json()
        console.log('[Credit Purchase] Payment verified:', verifyData.status)
        setPaymentStatus(verifyData)
      } else {
        console.warn('[Credit Purchase] Verification returned error (will retry via polling)')
      }

      setPaymentInfo({ ...paymentData, txid: signature })
      setPaymentStatus({
        status: 'pending',
        confirmations: 1,
        txid: signature,
        message: 'Transaction confirmed! Processing credit purchase...',
      })

    } catch (err: any) {
      console.error('[Credit Purchase] Error:', err)
      // Cancel the pending payment
      if (paymentId && currentAddress) {
        await cancelPendingPayment(paymentId, currentAddress)
      }
      setCurrentPaymentId(null)
      setPaymentInfo(null)
      setSelectedTier(null)

      if (err.message?.includes('cancel') || err.message?.includes('reject') || err.code === 4001) {
        setError('Transaction cancelled by user')
      } else {
        setError(err.message || 'Failed to create purchase')
      }
      setPurchasing(false)
    }
  }, [isConnected, currentAddress, walletSignTransaction, discountedTiers, holderStatus?.isHolder, cancelPendingPayment])

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
      <div className="bg-[#1a1a1a] border border-[#D4AF37]/20 rounded-lg p-6 space-y-4">
        <h3 className="text-xl font-bold text-white">Payment Status</h3>
        
        {isCompleted ? (
          <div className="bg-[#1a1a1a] border border-[#D4AF37] rounded-lg p-6 space-y-4">
            <div className="flex items-center gap-2">
              <svg className="w-6 h-6 text-[#D4AF37]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <p className="text-[#D4AF37] font-bold text-xl">Payment Confirmed!</p>
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-[#D4AF37]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <p className="text-white text-lg font-medium">
                {paymentStatus.creditsAwarded || paymentInfo.creditsAmount} credits have been added to your account.
              </p>
            </div>
            {txid && (
              <div className="bg-[#0a0a0a] border border-[#D4AF37]/40 rounded-lg p-4 space-y-3">
                <p className="text-sm text-white mb-1">Transaction Signature:</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-[#808080] font-mono text-sm break-all flex-1 min-w-0">{txid}</p>
                  <button
                    onClick={() => navigator.clipboard.writeText(txid)}
                    className="text-xs text-[#D4AF37] hover:text-white px-3 py-1.5 border border-[#D4AF37]/50 rounded transition-colors whitespace-nowrap hover:bg-[#D4AF37]/10"
                  >
                    Copy
                  </button>
                </div>
                <a
                  href={getSolscanUrl(txid, 'tx')}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[#D4AF37] hover:text-white text-sm underline transition-colors"
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
              className="w-full px-4 py-3 bg-[#D4AF37] hover:bg-[#D4AF37]/80 text-[#0a0a0a] rounded-lg font-semibold text-lg transition-colors"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            {/* Transaction Status */}
            {hasTxid ? (
              <div className="bg-[#1a1a1a] border border-[#D4AF37]/40 rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="animate-pulse w-3 h-3 bg-[#D4AF37] rounded-full"></div>
                  <p className="text-white font-bold">
                    {hasConfirmations
                      ? `✅ Transaction confirmed! Processing credits...`
                      : '⏳ Transaction sent! Waiting for confirmation...'}
                  </p>
                </div>
                <div className="bg-[#0a0a0a] border border-[#D4AF37]/30 rounded p-3 space-y-3">
                  <div>
                    <p className="text-sm text-white mb-1">Transaction Signature:</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[#808080] font-mono text-sm break-all">{txid}</p>
                      <button
                        onClick={() => navigator.clipboard.writeText(txid)}
                        className="text-xs text-[#D4AF37] hover:text-white px-2 py-1 border border-[#D4AF37]/50 rounded hover:bg-[#D4AF37]/10"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                  <a
                    href={getSolscanUrl(txid, 'tx')}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[#D4AF37] hover:text-white text-sm underline"
                  >
                    View on Solscan →
                  </a>
                </div>
              </div>
            ) : (
              <div className="bg-[#0a0a0a] border border-[#D4AF37]/40 rounded-lg p-4 space-y-3">
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
    <div className="bg-[#1a1a1a] border border-[#D4AF37]/20 rounded-xl p-8">
      <h3 className="text-3xl font-bold text-[#D4AF37] mb-2 uppercase tracking-wide">Purchase Credits</h3>
      
      {/* Holder Discount Banner */}
      {holderStatus?.isHolder && (
        <div className="mb-4 p-4 bg-[#0a0a0a] border border-[#D4AF37] rounded-xl">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🎉</span>
            <div>
              <p className="text-[#D4AF37] font-bold text-lg">50% Holder Discount Active!</p>
              <p className="text-[#808080] text-sm">
                You hold {holderStatus.holdingCount} OrdMaker NFT{holderStatus.holdingCount !== 1 ? 's' : ''} - enjoy half-price credits!
              </p>
            </div>
          </div>
        </div>
      )}
      
      {checkingHolder && (
        <div className="mb-4 p-3 bg-[#0a0a0a] border border-[#D4AF37]/30 rounded-lg flex items-center gap-2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[#D4AF37]"></div>
          <p className="text-[#808080] text-sm">Checking holder status for discounts...</p>
        </div>
      )}
      
      {/* Auto-detected payment method indicator */}
      <div className="mb-6 p-3 bg-[#0a0a0a] border border-[#D4AF37]/30 rounded-lg">
        <p className="text-sm text-[#808080]">
          <span className="font-semibold text-white">Payment Method:</span>{' '}
          {paymentMethod === 'sol' && <span className="text-[#D4AF37]">◎ Solana</span>}
          <span className="text-[#808080]/80 ml-2">(Auto-detected from your wallet)</span>
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-[#0a0a0a] border border-[#EF4444]/50 text-[#EF4444] rounded-lg">
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
              className={`bg-[#0a0a0a] border rounded-xl p-6 transition-all duration-200 relative ${
                isSelected
                  ? 'border-[#D4AF37] bg-[#1a1a1a]'
                  : hasDiscount
                    ? 'border-[#D4AF37]/60 hover:border-[#D4AF37] hover:bg-[#1a1a1a]'
                    : 'border-[#D4AF37]/30 hover:border-[#D4AF37]/50 hover:bg-[#1a1a1a]'
              }`}
            >
              {hasDiscount && (
                <div className="absolute -top-2 -right-2 bg-[#D4AF37] text-[#0a0a0a] text-xs font-bold px-2 py-1 rounded-full">
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
                        <span className="text-[#D4AF37] ml-1">${tier.discountedPricePerCredit.toFixed(2)}</span>
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
                      <p className="text-xl font-bold text-[#D4AF37]">
                        ${tier.discountedPrice.toFixed(2)}
                      </p>
                    </>
                  ) : (
                    <p className="text-xl font-bold text-[#D4AF37]">
                      ${tier.totalPrice.toFixed(2)}
                    </p>
                  )}
                  <p className="text-xs text-[#808080]/80">Total</p>
                </div>
              </div>
              
              {/* What you can do with these credits */}
              <div className="bg-[#1a1a1a] border border-[#D4AF37]/20 rounded-lg p-3 mb-4">

                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="px-2 py-1 bg-[#D4AF37]/20 text-[#D4AF37] rounded font-medium border border-[#D4AF37]/30">
                    {imagesCanGenerate} images
                  </span>
                  <span className="px-2 py-1 bg-[#D4AF37]/20 text-[#D4AF37] rounded font-medium border border-[#D4AF37]/30">
                    {traitsCanGenerate} traits
                  </span>
                </div>
              </div>

            
              <button
                onClick={() => !purchasing && handlePurchase(index)}
                disabled={purchasing}
                className={`w-full py-2.5 px-4 rounded-lg font-semibold text-sm transition-all duration-200 ${
                  purchasing
                    ? 'bg-[#1a1a1a] border border-[#D4AF37]/20 text-white/50 cursor-not-allowed'
                    : 'bg-[#D4AF37] hover:bg-[#D4AF37]/80 text-[#0a0a0a]'
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
          <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-[#D4AF37]"></div>
          <p className="text-[#808080] text-sm mt-2">Creating payment...</p>
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

