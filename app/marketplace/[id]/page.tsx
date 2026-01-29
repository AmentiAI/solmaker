'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useWallet } from '@/lib/wallet/compatibility'
import { MarketplaceBtcPurchase } from '@/components/marketplace-btc-purchase'
import { MarketplaceReviewsDisplay } from '@/components/marketplace-reviews-display'
import { MarketplaceReviewForm } from '@/components/marketplace-review-form'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'

interface MarketplaceListing {
  id: string
  collection_id: string
  seller_wallet: string
  price_credits: number
  price_btc?: string | null
  seller_btc_address?: string | null
  payment_type: 'credits' | 'btc' | 'both'
  title: string
  description?: string
  included_promo_urls: string[]
  status: string
  created_at: string
  collection_name: string
  collection_description?: string
  ordinal_count: number
  sample_images: string[]
}

export default function MarketplaceListingDetailPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isConnected, currentAddress } = useWallet()
  const listingId = params.id as string

  // Check URL for payment method preference
  const urlPaymentMethod = searchParams.get('payment')

  const [listing, setListing] = useState<MarketplaceListing | null>(null)
  const [loading, setLoading] = useState(true)
  const [purchasing, setPurchasing] = useState(false)
  const [userCredits, setUserCredits] = useState(0)
  const [loadingCredits, setLoadingCredits] = useState(false)
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'credits' | 'btc'>(
    urlPaymentMethod === 'btc' ? 'btc' : 'credits'
  )
  const [showBtcPurchase, setShowBtcPurchase] = useState(false)
  const [showReviewForm, setShowReviewForm] = useState(false)
  const [purchaseTransactionId, setPurchaseTransactionId] = useState<string | null>(null)
  const [showPurchaseConfirm, setShowPurchaseConfirm] = useState(false)
  const [pendingPayment, setPendingPayment] = useState<{
    has_pending: boolean
    buyer_wallet: string
    expires_at: string
    has_txid: boolean
    confirmations: number
  } | null>(null)
  const [isSold, setIsSold] = useState(false)
  const [soldTo, setSoldTo] = useState<string | null>(null)
  const [selectedImage, setSelectedImage] = useState<string | null>(null)

  // Determine active wallet (Bitcoin only)
  const activeWalletAddress = useMemo(() => {
    if (currentAddress && isConnected) return currentAddress
    return null
  }, [currentAddress, isConnected])

  // Fetch credits directly from the correct API endpoint
  const fetchCredits = useCallback(async (walletAddress: string) => {
    setLoadingCredits(true)
    try {
      const response = await fetch(`/api/credits?wallet_address=${encodeURIComponent(walletAddress)}`)
      if (response.ok) {
        const data = await response.json()
        console.log('[Marketplace Detail] Credits fetched:', data)
        // Ensure credits is a number
        const creditsValue = typeof data.credits === 'number' ? data.credits : parseFloat(data.credits) || 0
        setUserCredits(creditsValue)
      } else {
        console.error('[Marketplace Detail] Failed to fetch credits:', response.status)
        setUserCredits(0)
      }
    } catch (error) {
      console.error('[Marketplace Detail] Error fetching credits:', error)
      setUserCredits(0)
    } finally {
      setLoadingCredits(false)
    }
  }, [])

  useEffect(() => {
    if (listingId) {
      loadListing()
    }
  }, [listingId])

  useEffect(() => {
    if (activeWalletAddress) {
      fetchCredits(activeWalletAddress)
    } else {
      setUserCredits(0)
    }
  }, [activeWalletAddress, fetchCredits])

  // Auto-select appropriate payment method based on listing type and URL
  useEffect(() => {
    if (listing) {
      if (listing.payment_type === 'btc') {
        setSelectedPaymentMethod('btc')
      } else if (listing.payment_type === 'credits') {
        setSelectedPaymentMethod('credits')
      } else if (urlPaymentMethod === 'btc' && listing.price_btc) {
        setSelectedPaymentMethod('btc')
      }
    }
  }, [listing, urlPaymentMethod])

  const loadListing = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/marketplace/listings/${listingId}`)
      const data = await response.json()
      if (response.ok) {
        setListing(data.listing)
        setPendingPayment(data.pending_payment || null)
        setIsSold(data.is_sold || false)
        setSoldTo(data.sold_to || null)
      } else {
        toast.error('Error', { description: `Error: ${data.error}` })
        router.push('/marketplace')
      }
    } catch (error) {
      console.error('Error loading listing:', error)
      router.push('/marketplace')
    } finally {
      setLoading(false)
    }
  }

  const handleCreditPurchase = async () => {
    if (!activeWalletAddress) {
      toast.error('Wallet Required', { description: 'Please connect your wallet first' })
      return
    }

    if (!listing) return

    if (userCredits < listing.price_credits) {
      toast.error('Insufficient Credits', { description: `You need ${listing.price_credits} credits but only have ${userCredits}.` })
      return
    }

    setShowPurchaseConfirm(true)
  }

  const executeCreditPurchase = async () => {
    if (!listing || !activeWalletAddress) return
    
    setShowPurchaseConfirm(false)
    setPurchasing(true)
    try {
      const response = await fetch('/api/marketplace/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listing_id: listing.id,
          buyer_wallet: activeWalletAddress,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        // Store transaction ID for review
        if (data.transaction_id) {
          setPurchaseTransactionId(data.transaction_id)
          setShowReviewForm(true)
        } else {
          toast.success('🎉 Collection purchased successfully! Redirecting to your new collection...')
          router.push(`/collections/${data.collection_id}`)
        }
      } else {
        toast.error('Purchase Failed', { description: `Error: ${data.error}` })
      }
    } catch (error) {
      console.error('Error purchasing collection:', error)
      toast.error('Purchase Failed', { description: 'Failed to purchase collection' })
    } finally {
      setPurchasing(false)
    }
  }

  const handleBtcPurchase = () => {
    if (!activeWalletAddress) {
      toast.error('Wallet Required', { description: 'Please connect your wallet first' })
      return
    }

    if (!listing) return

    // Show the BTC purchase component
    setShowBtcPurchase(true)
  }

  const handlePurchase = () => {
    if (selectedPaymentMethod === 'credits') {
      handleCreditPurchase()
    } else {
      handleBtcPurchase()
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-[#00d4ff] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!listing) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-white/80 mb-4">Listing not found</p>
          <Link href="/marketplace" className="text-[#00d4ff] hover:text-[#00b8e6] hover:underline transition-colors">
            Back to Marketplace
          </Link>
        </div>
      </div>
    )
  }

  const isOwner = activeWalletAddress && listing.seller_wallet === activeWalletAddress

  return (
    <div className="min-h-screen py-12 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Back Button */}
        <Link
          href="/marketplace"
          className="inline-flex items-center text-white/80 hover:text-white mb-6 transition-colors"
        >
          ← Back to Marketplace
        </Link>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Left Column - Images */}
          <div>
            {/* Sample Images Gallery */}
            {listing.sample_images && listing.sample_images.length > 0 && (
              <div className="cosmic-card border border-[#00d4ff]/30 rounded-xl p-6 mb-6">
                <h3 className="font-bold text-white mb-4">Sample Images from Collection</h3>
                <div className="grid grid-cols-3 gap-3">
                  {listing.sample_images.map((url, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedImage(url)}
                      className="w-full aspect-square rounded-lg border border-[#00d4ff]/30 overflow-hidden hover:border-[#00d4ff] hover:shadow-md transition-all cursor-pointer"
                    >
                      <img
                        src={url}
                        alt={`Sample ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Promotional Materials */}
            {listing.included_promo_urls && listing.included_promo_urls.length > 0 && (
              <div className="cosmic-card border border-[#00d4ff]/30 rounded-xl p-6">
                <h3 className="font-bold text-white mb-4">
                  ✨ Included Promotional Materials ({listing.included_promo_urls.length})
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {listing.included_promo_urls.map((url, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedImage(url)}
                      className="w-full aspect-[2/3] rounded-lg border border-[#00d4ff]/30 overflow-hidden hover:border-[#00d4ff] hover:shadow-md transition-all cursor-pointer"
                    >
                      <img
                        src={url}
                        alt={`Promo ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Details */}
          <div>
            <div className="cosmic-card border border-[#00d4ff]/30 rounded-xl p-8 sticky top-6">
              <h1 className="text-3xl font-bold text-white mb-4">
                {listing.title}
              </h1>

              <div className="flex items-center gap-3 mb-6">
                <span className="px-3 py-1 bg-[#00d4ff]/20 text-[#00d4ff] border border-[#00d4ff]/30 rounded-full text-sm font-medium">
                  {listing.ordinal_count} images
                </span>
              </div>

              {/* Price */}
              <div className="mb-6 p-6 cosmic-card border-2 border-[#00d4ff]/50 rounded-xl">
                <div className="text-sm text-white/70 mb-2">Price</div>
                
                {/* Payment method selector - only show if both options available */}
                {(listing.payment_type === 'both') && (
                  <div className="flex gap-2 mb-4">
                    <button
                      onClick={() => setSelectedPaymentMethod('credits')}
                      className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
                        selectedPaymentMethod === 'credits'
                          ? 'bg-[#00d4ff] text-white shadow-lg shadow-[#00d4ff]/20'
                          : 'cosmic-card border border-[#00d4ff]/30 text-white/70 hover:border-[#00d4ff]/50 hover:text-white'
                      }`}
                    >
                      💳 Credits
                    </button>
                    <button
                      onClick={() => setSelectedPaymentMethod('btc')}
                      className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
                        selectedPaymentMethod === 'btc'
                          ? 'bg-[#ff6b35] text-white shadow-lg shadow-[#ff6b35]/20'
                          : 'cosmic-card border border-[#00d4ff]/30 text-white/70 hover:border-[#00d4ff]/50 hover:text-white'
                      }`}
                    >
                      ₿ Bitcoin
                    </button>
                  </div>
                )}

                {/* Show appropriate price based on payment type */}
                {(selectedPaymentMethod === 'credits' && (listing.payment_type === 'credits' || listing.payment_type === 'both')) && (
                  <>
                    <div className="text-4xl font-bold text-[#00d4ff]">
                      {listing.price_credits} <span className="text-2xl">Credits</span>
                    </div>
                    {activeWalletAddress && (
                      <div className="mt-2 text-sm text-white/70">
                        Your balance: {loadingCredits ? (
                          <span className="font-semibold text-white/50">Loading...</span>
                        ) : (
                          <span className="font-semibold">{userCredits.toFixed(2)}</span>
                        )} credits
                        {!loadingCredits && userCredits < listing.price_credits && (
                          <span className="ml-2 text-[#ff4757] font-semibold">
                            (Need {(listing.price_credits - userCredits).toFixed(2)} more)
                          </span>
                        )}
                      </div>
                    )}
                  </>
                )}

                {(selectedPaymentMethod === 'btc' || listing.payment_type === 'btc') && listing.price_btc && (
                  <div className="text-4xl font-bold text-[#ff6b35]">
                    {parseFloat(listing.price_btc).toFixed(8)} <span className="text-2xl">BTC</span>
                  </div>
                )}
              </div>

              {/* BTC Purchase Modal */}
              {showBtcPurchase && listing.price_btc && listing.seller_btc_address && (
                <div className="mb-6">
                  <MarketplaceBtcPurchase
                    listingId={listing.id}
                    btcAmount={parseFloat(listing.price_btc).toFixed(8)}
                    btcAmountSats={Math.round(parseFloat(listing.price_btc) * 100000000)}
                    paymentAddress={listing.seller_btc_address}
                    listingTitle={listing.title}
                    onSuccess={(collectionId) => {
                      router.push(`/collections/${collectionId}`)
                    }}
                    onCancel={() => setShowBtcPurchase(false)}
                  />
                </div>
              )}

              {/* Description */}
              {listing.description && (
                <div className="mb-6">
                  <h3 className="font-bold text-white mb-2">Description</h3>
                  <p className="text-white/80 whitespace-pre-wrap">{listing.description}</p>
                </div>
              )}

              {listing.collection_description && (
                <div className="mb-6">
                  <h3 className="font-bold text-white mb-2">Collection Details</h3>
                  <p className="text-white/70 text-sm">{listing.collection_description}</p>
                </div>
              )}

              {/* What You Get */}
              <div className="mb-6 p-4 cosmic-card border border-[#00d4ff]/30 rounded-lg">
                <h3 className="font-bold text-[#00d4ff] mb-2">What You Get:</h3>
                <ul className="text-sm text-white/80 space-y-1">
                  <li>✓ Full ownership of {listing.ordinal_count} generated images</li>
                  <li>✓ Ability to generate more images in the collection</li>
                  <li>✓ Rights to self-inscribe or launch on launchpad</li>
                  {listing.included_promo_urls && listing.included_promo_urls.length > 0 && (
                    <li>✓ {listing.included_promo_urls.length} promotional {listing.included_promo_urls.length === 1 ? 'image' : 'images'}</li>
                  )}
                  <li>✓ Complete collection control and management</li>
                </ul>
              </div>

              {/* Sold Status */}
              {isSold && (
                <div className="p-4 cosmic-card border border-[#00d4ff]/50 rounded-lg text-center mb-4">
                  <p className="text-lg font-bold text-white">🎉 This collection has been sold</p>
                  {soldTo && (
                    <p className="text-sm text-white/70 mt-1">
                      Purchased by {soldTo.slice(0, 8)}...{soldTo.slice(-4)}
                    </p>
                  )}
                </div>
              )}

              {/* Pending Payment Warning */}
              {!isSold && pendingPayment && pendingPayment.has_pending && pendingPayment.buyer_wallet !== activeWalletAddress && (
                <div className="p-4 cosmic-card border border-[#ff6b35]/50 rounded-lg mb-4">
                  <p className="text-sm font-medium text-[#ff6b35]">
                    ⏳ Another buyer has a pending BTC payment
                  </p>
                  <p className="text-xs text-white/70 mt-1">
                    {pendingPayment.has_txid 
                      ? `Payment submitted (${pendingPayment.confirmations} confirmations)`
                      : `Expires: ${new Date(pendingPayment.expires_at).toLocaleString()}`
                    }
                  </p>
                </div>
              )}

              {/* Your Pending Payment */}
              {!isSold && pendingPayment && pendingPayment.has_pending && pendingPayment.buyer_wallet === activeWalletAddress && (
                <div className="p-4 cosmic-card border border-[#00d4ff]/50 rounded-lg mb-4">
                  <p className="text-sm font-medium text-[#00d4ff]">
                    📝 You have a pending payment on this listing
                  </p>
                  <p className="text-xs text-white/70 mt-1">
                    {pendingPayment.has_txid 
                      ? `Your payment has ${pendingPayment.confirmations} confirmation(s). Will complete soon!`
                      : `Complete your payment before ${new Date(pendingPayment.expires_at).toLocaleString()}`
                    }
                  </p>
                </div>
              )}

              {/* Purchase Button */}
              {!showBtcPurchase && !isSold && (
                <div className="space-y-3">
                  {isOwner ? (
                    <div className="px-4 py-3 cosmic-card border border-[#00d4ff]/30 rounded-lg text-center">
                      <p className="text-sm text-white/70">This is your listing</p>
                      <Link
                        href={`/collections/${listing.collection_id}/list-marketplace`}
                        className="text-sm text-[#00d4ff] hover:text-[#00b8e6] hover:underline transition-colors"
                      >
                        Manage Listing
                      </Link>
                    </div>
                  ) : pendingPayment && pendingPayment.has_pending && pendingPayment.buyer_wallet !== activeWalletAddress ? (
                    <button
                      disabled
                      className="w-full px-6 py-4 cosmic-card border border-[#00d4ff]/30 text-white/50 rounded-lg text-lg font-bold cursor-not-allowed"
                    >
                      Pending Payment from Another Buyer
                    </button>
                  ) : selectedPaymentMethod === 'credits' ? (
                    <button
                      onClick={handlePurchase}
                      disabled={!activeWalletAddress || purchasing || loadingCredits || userCredits < listing.price_credits}
                      className="w-full px-6 py-4 bg-[#00d4ff] hover:bg-[#00b8e6] text-white rounded-lg text-lg font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#00d4ff]/20"
                    >
                      {!activeWalletAddress ? (
                        'Connect Wallet to Purchase'
                      ) : purchasing ? (
                        <span className="flex items-center justify-center gap-2">
                          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Processing...
                        </span>
                      ) : loadingCredits ? (
                        'Loading Credits...'
                      ) : userCredits < listing.price_credits ? (
                        'Insufficient Credits'
                      ) : (
                        `Purchase for ${listing.price_credits} Credits`
                      )}
                    </button>
                  ) : (
                    <button
                      onClick={handleBtcPurchase}
                      disabled={!activeWalletAddress || purchasing}
                      className="w-full px-6 py-4 bg-[#ff6b35] hover:bg-[#ff5722] text-white rounded-lg text-lg font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#ff6b35]/20"
                    >
                      {!activeWalletAddress ? (
                        'Connect Wallet to Purchase'
                      ) : purchasing ? (
                        <span className="flex items-center justify-center gap-2">
                          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Processing...
                        </span>
                      ) : (
                        `Purchase for ${listing.price_btc} BTC`
                      )}
                    </button>
                  )}

                  {!activeWalletAddress && (
                    <p className="text-xs text-white/60 text-center">
                      Connect your wallet to purchase
                    </p>
                  )}
                </div>
              )}

              {/* Listing Info */}
              <div className="mt-6 pt-6 border-t border-[#00d4ff]/30 text-xs text-white/60">
                <p>Listed on {new Date(listing.created_at).toLocaleDateString()}</p>
                <p className="mt-1">Listing ID: {listing.id.substring(0, 8)}...</p>
              </div>
            </div>
          </div>
        </div>

        {/* Reviews Section */}
        <div className="mt-8 cosmic-card border border-[#00d4ff]/30 rounded-xl p-6">
          <h2 className="text-2xl font-bold text-white mb-6">Reviews & Ratings</h2>
          
          {/* Review Form (for buyers who just purchased) */}
          {showReviewForm && purchaseTransactionId && (
            <div className="mb-8">
              <MarketplaceReviewForm
                transactionId={purchaseTransactionId}
                listingId={listing.id}
                collectionId={listing.collection_id}
                sellerWallet={listing.seller_wallet}
                onReviewSubmitted={() => {
                  setShowReviewForm(false)
                  setPurchaseTransactionId(null)
                  // Reload page to show the new review
                  window.location.reload()
                }}
                onCancel={() => {
                  setShowReviewForm(false)
                  setPurchaseTransactionId(null)
                  router.push(`/collections/${listing.collection_id}`)
                }}
              />
            </div>
          )}

          {/* Reviews Display */}
          <MarketplaceReviewsDisplay
            sellerWallet={listing.seller_wallet}
            listingId={listing.id}
            collectionId={listing.collection_id}
            showStats={true}
          />
        </div>
      </div>

      {/* Image Modal */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setSelectedImage(null)}
        >
          <button
            onClick={() => setSelectedImage(null)}
            className="absolute top-4 right-4 text-white hover:text-gray-300 text-4xl font-bold leading-none z-10"
            aria-label="Close"
          >
            ×
          </button>
          <div className="max-w-7xl max-h-[90vh] w-full h-full flex items-center justify-center">
            <img
              src={selectedImage}
              alt="Full size preview"
              className="max-w-full max-h-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}

      {/* Purchase Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showPurchaseConfirm}
        onClose={() => setShowPurchaseConfirm(false)}
        onConfirm={executeCreditPurchase}
        title="Confirm Purchase"
        message={listing ? `Purchase "${listing.title}" for ${listing.price_credits} credits?\n\nThis will transfer full ownership of the collection to you. All sales are final.` : ''}
        confirmText="Purchase"
        cancelText="Cancel"
        confirmButtonClass="bg-green-600 hover:bg-green-700"
        loading={purchasing}
      />
    </div>
  )
}
