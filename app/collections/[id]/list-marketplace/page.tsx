'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useWallet } from '@/lib/wallet/compatibility'
import { toast } from 'sonner'
import { addAuthToBody } from '@/lib/wallet/api-auth'

interface Collection {
  id: string
  name: string
  description?: string
  wallet_address: string
  marketplace_listing_id?: string
  marketplace_payment_type?: 'credits' | 'btc' | 'both'
  marketplace_price_btc?: string
  marketplace_price_credits?: number
}

export default function ListMarketplacePage() {
  const params = useParams()
  const router = useRouter()
  const { currentAddress, signMessage } = useWallet()
  const collectionId = params.id as string

  const [collection, setCollection] = useState<Collection | null>(null)
  const [loading, setLoading] = useState(true)
  
  // Marketplace listing state
  const [marketplaceTitle, setMarketplaceTitle] = useState('')
  const [marketplaceDescription, setMarketplaceDescription] = useState('')
  const [marketplacePrice, setMarketplacePrice] = useState(0)
  const [marketplacePriceBtc, setMarketplacePriceBtc] = useState('')
  const [sellerBtcAddress, setSellerBtcAddress] = useState('')
  const [marketplacePaymentType, setMarketplacePaymentType] = useState<'credits' | 'btc' | 'both'>('btc')
  const [selectedPromoUrls, setSelectedPromoUrls] = useState<string[]>([])
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [creatingListing, setCreatingListing] = useState(false)
  const [cancellingListing, setCancellingListing] = useState(false)
  
  // Promotion history modal
  const [showPromoModal, setShowPromoModal] = useState(false)
  const [promoHistory, setPromoHistory] = useState<any[]>([])
  const [loadingPromo, setLoadingPromo] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const collRes = await fetch(`/api/launchpad/${collectionId}`)
      if (collRes.ok) {
        const collData = await collRes.json()
        setCollection(collData.collection)
        
        // Try to fetch listing details - first by marketplace_listing_id, then by collection_id as fallback
        let listing = null
        let listingId = collData.collection.marketplace_listing_id
        
        // If marketplace_listing_id exists, try fetching by that
        if (listingId) {
          try {
            const listingRes = await fetch(`/api/marketplace/listings/${listingId}`)
            if (listingRes.ok) {
              const listingData = await listingRes.json()
              listing = listingData.listing
            } else {
              console.warn(`Failed to fetch listing by ID ${listingId}, trying fallback by collection_id`)
            }
          } catch (error) {
            console.error('Error loading listing by ID:', error)
          }
        }
        
        // Fallback: If no listing found by ID, try fetching by collection_id
        if (!listing) {
          try {
            const listingsRes = await fetch(`/api/marketplace/listings?status=active`)
            if (listingsRes.ok) {
              const listingsData = await listingsRes.json()
              const foundListing = listingsData.listings?.find((l: any) => l.collection_id === collectionId)
              if (foundListing) {
                listing = foundListing
                listingId = foundListing.id
                console.log(`Found listing by collection_id: ${listingId}`)
              }
            }
          } catch (error) {
            console.error('Error loading listings by collection_id:', error)
          }
        }
        
        // Pre-fill form with listing data if found
        if (listing) {
          console.log('Pre-filling form with listing data:', listing)
          if (listing.title) setMarketplaceTitle(listing.title)
          if (listing.description) setMarketplaceDescription(listing.description || '')
          if (listing.payment_type) setMarketplacePaymentType(listing.payment_type)
          if (listing.price_btc) setMarketplacePriceBtc(listing.price_btc.toString())
          if (listing.price_credits) setMarketplacePrice(listing.price_credits)
          if (listing.seller_btc_address) setSellerBtcAddress(listing.seller_btc_address)
          if (listing.included_promo_urls && Array.isArray(listing.included_promo_urls)) {
            setSelectedPromoUrls(listing.included_promo_urls)
          }
          // Terms are already accepted if listing exists
          setTermsAccepted(true)
          
          // Update collection state with the found listing ID if it wasn't set
          if (listingId && !collData.collection.marketplace_listing_id) {
            setCollection({ ...collData.collection, marketplace_listing_id: listingId })
          }
        } else {
          // Pre-fill title with collection name only if no listing exists
          if (!marketplaceTitle) {
            setMarketplaceTitle(`${collData.collection.name} - Complete Collection`)
          }
        }
      }
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }, [collectionId, marketplaceTitle])

  useEffect(() => {
    if (collectionId) {
      loadData()
    }
  }, [collectionId, loadData])

  const loadPromoHistory = async () => {
    if (!currentAddress) return
    setLoadingPromo(true)
    try {
      const response = await fetch(`/api/promotion/history?wallet_address=${encodeURIComponent(currentAddress)}`)
      if (response.ok) {
        const data = await response.json()
        setPromoHistory(data.promotions || [])
      }
    } catch (error) {
      console.error('Error loading promo history:', error)
    } finally {
      setLoadingPromo(false)
    }
  }

  const handleChoosePromo = (imageUrl: string) => {
    setShowPromoModal(false)
    if (!selectedPromoUrls.includes(imageUrl)) {
      setSelectedPromoUrls([...selectedPromoUrls, imageUrl])
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-[#00d4ff] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!collection) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-white/70 mb-4">Collection not found</p>
          <Link
            href="/collections"
            className="px-4 py-2 bg-[#00d4ff] hover:bg-[#00b8e6] text-white rounded-lg font-semibold transition-colors"
          >
            Go to Collections
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-6 py-12">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6">
            <Link
              href="/collections"
              className="inline-flex items-center gap-2 text-[#00d4ff] hover:text-[#00b8e6] text-sm font-medium transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Collections
            </Link>
          </div>
          <div className="cosmic-card border border-[#00d4ff]/30 rounded-xl p-8">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-white mb-2">💰 List Collection on Marketplace</h2>
              <p className="text-white/70">
                Sell your entire collection (as generated images) for credits or BTC. The buyer will receive full ownership to generate more, inscribe, or launch as they wish.
              </p>
            </div>

            {/* Show active listing status */}
            {collection.marketplace_listing_id && (
              <div className="mb-6 p-4 cosmic-card border-2 border-[#00d4ff]/50 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-[#00d4ff] flex items-center gap-2">
                      ✅ Collection is Listed on Marketplace
                    </h3>
                    <p className="text-sm text-white/70 mt-1">
                      {collection.marketplace_payment_type === 'btc' && (
                        <>Listed for <strong className="text-white">{parseFloat(collection.marketplace_price_btc || '0').toFixed(8)} BTC</strong></>
                      )}
                      {collection.marketplace_payment_type === 'credits' && (
                        <>Listed for <strong className="text-white">{collection.marketplace_price_credits || 0} Credits</strong></>
                      )}
                      {collection.marketplace_payment_type === 'both' && (
                        <>Listed for <strong className="text-white">{parseFloat(collection.marketplace_price_btc || '0').toFixed(8)} BTC</strong> or <strong className="text-white">{collection.marketplace_price_credits || 0} Credits</strong></>
                      )}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <a
                      href={`/marketplace/${collection.marketplace_listing_id}`}
                      className="px-4 py-2 bg-[#00d4ff] hover:bg-[#00b8e6] text-white rounded-lg text-sm font-semibold transition-colors"
                    >
                      View Listing
                    </a>
                    <button
                      onClick={async () => {
                        setCancellingListing(true)
                        try {
                          const response = await fetch(`/api/marketplace/listings/${collection.marketplace_listing_id}/cancel`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ wallet_address: currentAddress }),
                          })
                          
                          const data = await response.json()
                          
                          if (response.ok) {
                            toast.success('Listing removed successfully!')
                            router.push('/collections')
                          } else {
                            toast.error(`Error: ${data.error}`, {
                              description: data.details || ''
                            })
                          }
                        } catch (error) {
                          console.error('Error cancelling listing:', error)
                          toast.error('Failed to remove listing')
                        } finally {
                          setCancellingListing(false)
                        }
                      }}
                      disabled={cancellingListing}
                      className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {cancellingListing ? (
                        <span className="flex items-center gap-2">
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Removing...
                        </span>
                      ) : (
                        '❌ Remove from Marketplace'
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Listing Form - Always show, but pre-filled if listing exists */}
            <>
              {/* Listing Form */}
                <div className="space-y-6">
                  {/* Title */}
                  <div>
                    <label className="block text-sm font-semibold text-white mb-2">
                      Listing Title *
                    </label>
                    <input
                      type="text"
                      value={marketplaceTitle}
                      onChange={(e) => setMarketplaceTitle(e.target.value)}
                      placeholder={`${collection.name} - Complete Collection`}
                      className="w-full px-4 py-2 border border-[#00d4ff]/30 cosmic-card text-white rounded-lg focus:ring-2 focus:ring-[#00d4ff] focus:border-[#00d4ff] placeholder:text-white/50"
                      maxLength={255}
                    />
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-sm font-semibold text-white mb-2">
                      Description
                    </label>
                    <textarea
                      value={marketplaceDescription}
                      onChange={(e) => setMarketplaceDescription(e.target.value)}
                      placeholder="Describe your collection, art style, potential use cases, etc."
                      className="w-full px-4 py-2 border border-[#00d4ff]/30 cosmic-card text-white rounded-lg focus:ring-2 focus:ring-[#00d4ff] focus:border-[#00d4ff] min-h-[120px] placeholder:text-white/50"
                      maxLength={2000}
                    />
                    <p className="text-xs text-white/60 mt-1">
                      {marketplaceDescription.length}/2000 characters
                    </p>
                  </div>

                  {/* Payment Type Selection */}
                  <div>
                    <label className="block text-sm font-semibold text-white mb-2">
                      Payment Type *
                    </label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setMarketplacePaymentType('btc')}
                        className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
                          marketplacePaymentType === 'btc'
                            ? 'bg-[#ff6b35] text-white'
                            : 'cosmic-card text-white/70 hover:text-white hover:bg-[#1a1f3a] border border-[#00d4ff]/30'
                        }`}
                      >
                        ₿ BTC Only
                      </button>
                      <button
                        onClick={() => setMarketplacePaymentType('credits')}
                        className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
                          marketplacePaymentType === 'credits'
                            ? 'bg-[#00d4ff] text-white'
                            : 'cosmic-card text-white/70 hover:text-white hover:bg-[#1a1f3a] border border-[#00d4ff]/30'
                        }`}
                      >
                        💳 Credits Only
                      </button>
                      <button
                        onClick={() => setMarketplacePaymentType('both')}
                        className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
                          marketplacePaymentType === 'both'
                            ? 'bg-[#00d4ff] text-white'
                            : 'cosmic-card text-white/70 hover:text-white hover:bg-[#1a1f3a] border border-[#00d4ff]/30'
                        }`}
                      >
                        Both
                      </button>
                    </div>
                  </div>

                  {/* BTC Price - shown for btc or both */}
                  {(marketplacePaymentType === 'btc' || marketplacePaymentType === 'both') && (
                    <>
                      <div>
                        <label className="block text-sm font-semibold text-white mb-2">
                          Price (BTC) *
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#ff6b35] font-bold">₿</span>
                          <input
                            type="text"
                            value={marketplacePriceBtc}
                            onChange={(e) => {
                              const value = e.target.value
                              if (value === '' || /^\d*\.?\d*$/.test(value)) {
                                setMarketplacePriceBtc(value)
                              }
                            }}
                            placeholder="0.001"
                            className="w-full pl-8 pr-4 py-2 border border-[#00d4ff]/30 cosmic-card text-white rounded-lg focus:ring-2 focus:ring-[#ff6b35] focus:border-[#ff6b35] placeholder:text-white/50"
                          />
                        </div>
                        <p className="text-xs text-white/60 mt-1">
                          Set your asking price in Bitcoin
                        </p>
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-white mb-2">
                          Your BTC Payment Address *
                        </label>
                        <input
                          type="text"
                          value={sellerBtcAddress}
                          onChange={(e) => setSellerBtcAddress(e.target.value)}
                          placeholder="bc1q... or 3... or 1..."
                          className="w-full px-4 py-2 border border-[#00d4ff]/30 cosmic-card text-white rounded-lg focus:ring-2 focus:ring-[#ff6b35] focus:border-[#ff6b35] font-mono text-sm placeholder:text-white/50"
                        />
                        <p className="text-xs text-white/60 mt-1">
                          This is where buyers will send BTC payment. Make sure it's correct!
                        </p>
                      </div>
                    </>
                  )}

                  {/* Credit Price - shown for credits or both */}
                  {(marketplacePaymentType === 'credits' || marketplacePaymentType === 'both') && (
                    <div>
                      <label className="block text-sm font-semibold text-white mb-2">
                        Price (Credits) *
                      </label>
                      <input
                        type="number"
                        value={marketplacePrice || ''}
                        onChange={(e) => setMarketplacePrice(parseFloat(e.target.value) || 0)}
                        placeholder="100"
                        min="1"
                        step="1"
                        className="w-full px-4 py-2 border border-[#00d4ff]/30 cosmic-card text-white rounded-lg focus:ring-2 focus:ring-[#00d4ff] focus:border-[#00d4ff] placeholder:text-white/50"
                      />
                      <p className="text-xs text-white/60 mt-1">
                        Set your asking price in credits
                      </p>
                    </div>
                  )}

                  {/* Include Promotional Materials */}
                  <div>
                    <label className="block text-sm font-semibold text-white mb-2">
                      Include Promotional Materials (Optional)
                    </label>
                    <button
                      onClick={() => {
                        loadPromoHistory()
                        setShowPromoModal(true)
                      }}
                      className="px-4 py-2 bg-[#00d4ff]/20 hover:bg-[#00d4ff]/30 text-[#00d4ff] rounded-lg text-sm font-medium transition-colors border border-[#00d4ff]/30"
                    >
                      📸 Select from Promotion History
                    </button>
                    {selectedPromoUrls.length > 0 && (
                      <div className="mt-4 grid grid-cols-4 gap-3">
                        {selectedPromoUrls.map((url, idx) => (
                          <div key={idx} className="relative group">
                            <img
                              src={url}
                              alt={`Promo ${idx + 1}`}
                              className="w-full h-24 object-cover rounded-lg border-2 border-[#00d4ff]/50"
                            />
                            <button
                              onClick={() => setSelectedPromoUrls(selectedPromoUrls.filter((_, i) => i !== idx))}
                              className="absolute top-1 right-1 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Terms and Conditions */}
                  <div className="p-4 cosmic-card border-2 border-[#00d4ff]/50 rounded-lg">
                    <h3 className="font-bold text-white mb-2">📋 Marketplace Terms</h3>
                    <div className="space-y-2 text-sm text-white/80">
                      <p>• Once listed, your collection cannot be modified until sold or cancelled</p>
                      <p>• You agree to sell this collection to ONE buyer only</p>
                      <p>• You will NOT attempt to sell this collection to anyone else (on or off platform)</p>
                      <p>• All sales are final - no refunds</p>
                      <p>• Upon sale, full ownership and all rights transfer to the buyer</p>
                      <p>• Violating these terms may result in account suspension and removal from platform</p>
                    </div>
                    <div className="mt-4 flex items-start gap-3">
                      <input
                        type="checkbox"
                        id="terms"
                        checked={termsAccepted}
                        onChange={(e) => setTermsAccepted(e.target.checked)}
                        className="mt-1"
                      />
                      <label htmlFor="terms" className="text-sm text-white font-medium cursor-pointer">
                        I understand and agree to these terms. I will not attempt to sell this collection to multiple buyers.
                      </label>
                    </div>
                  </div>

                  {/* Submit Button */}
                  <div className="flex items-center gap-4 pt-4">
                    <button
                      onClick={async () => {
                        if (!marketplaceTitle || !termsAccepted) {
                          toast.error('Please fill in all required fields and accept the terms')
                          return
                        }

                        if (marketplacePaymentType === 'credits' || marketplacePaymentType === 'both') {
                          if (!marketplacePrice || marketplacePrice <= 0) {
                            toast.error('Credit price must be greater than 0')
                            return
                          }
                        }

                        if (marketplacePaymentType === 'btc' || marketplacePaymentType === 'both') {
                          const btcPrice = parseFloat(marketplacePriceBtc)
                          if (!marketplacePriceBtc || isNaN(btcPrice) || btcPrice <= 0) {
                            toast.error('BTC price must be greater than 0')
                            return
                          }
                          if (!sellerBtcAddress || sellerBtcAddress.length < 20) {
                            toast.error('Please enter a valid BTC address to receive payments')
                            return
                          }
                        }

                        const isUpdating = !!collection.marketplace_listing_id

                        setCreatingListing(true)
                        try {
                          if (isUpdating) {
                            // Update existing listing
                            const response = await fetch(`/api/marketplace/listings/${collection.marketplace_listing_id}`, {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                seller_wallet: currentAddress,
                                payment_type: marketplacePaymentType,
                                price_credits: (marketplacePaymentType === 'credits' || marketplacePaymentType === 'both') ? marketplacePrice : null,
                                price_btc: (marketplacePaymentType === 'btc' || marketplacePaymentType === 'both') ? parseFloat(marketplacePriceBtc) : null,
                                seller_btc_address: (marketplacePaymentType === 'btc' || marketplacePaymentType === 'both') ? sellerBtcAddress : null,
                                title: marketplaceTitle,
                                description: marketplaceDescription || null,
                                included_promo_urls: selectedPromoUrls,
                              }),
                            })

                            const data = await response.json()

                            if (response.ok) {
                              toast.success('Listing updated successfully!')
                              loadData()
                            } else {
                              toast.error(`Error: ${data.error}`)
                            }
                          } else {
                            // Create new listing with signature
                            const body = await addAuthToBody({
                              collection_id: collectionId,
                              seller_wallet: currentAddress,
                              payment_type: marketplacePaymentType,
                              price_credits: (marketplacePaymentType === 'credits' || marketplacePaymentType === 'both') ? marketplacePrice : 0,
                              price_btc: (marketplacePaymentType === 'btc' || marketplacePaymentType === 'both') ? parseFloat(marketplacePriceBtc) : null,
                              seller_btc_address: (marketplacePaymentType === 'btc' || marketplacePaymentType === 'both') ? sellerBtcAddress : null,
                              title: marketplaceTitle,
                              description: marketplaceDescription || null,
                              included_promo_urls: selectedPromoUrls,
                              terms_accepted: termsAccepted,
                            }, currentAddress, signMessage)

                            const response = await fetch('/api/marketplace/listings', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify(body),
                            })

                            const data = await response.json()

                            if (response.ok) {
                              toast.success('Collection listed on marketplace successfully!')
                              router.push('/marketplace')
                            } else {
                              toast.error(`Error: ${data.error}`)
                            }
                          }
                        } catch (error) {
                          console.error('Error saving listing:', error)
                          toast.error(`Failed to ${collection.marketplace_listing_id ? 'update' : 'create'} listing`)
                        } finally {
                          setCreatingListing(false)
                        }
                      }}
                      disabled={
                        !termsAccepted || 
                        !marketplaceTitle || 
                        creatingListing ||
                        ((marketplacePaymentType === 'credits' || marketplacePaymentType === 'both') && (!marketplacePrice || marketplacePrice <= 0)) ||
                        ((marketplacePaymentType === 'btc' || marketplacePaymentType === 'both') && (!marketplacePriceBtc || !sellerBtcAddress))
                      }
                      className="px-6 py-3 bg-[#00d4ff] hover:bg-[#00b8e6] text-white rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {creatingListing ? (
                        <span className="flex items-center gap-2">
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          {collection.marketplace_listing_id ? 'Updating Listing...' : 'Creating Listing...'}
                        </span>
                      ) : (
                        collection.marketplace_listing_id ? '💾 Update Listing' : '💰 List on Marketplace'
                      )}
                    </button>
                    <div className="text-sm text-white/70">
                      {marketplacePaymentType === 'btc' && (
                        <span>Collection will be listed for <strong className="text-[#ff6b35]">{marketplacePriceBtc || '0'} BTC</strong></span>
                      )}
                      {marketplacePaymentType === 'credits' && (
                        <span>Collection will be listed for <strong className="text-[#00d4ff]">{marketplacePrice || 0} credits</strong></span>
                      )}
                      {marketplacePaymentType === 'both' && (
                        <span>
                          Collection will be listed for <strong className="text-[#ff6b35]">{marketplacePriceBtc || '0'} BTC</strong> or <strong className="text-[#00d4ff]">{marketplacePrice || 0} credits</strong>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
            </>
          </div>
        </div>
      </div>

      {/* Promotion History Modal */}
      {showPromoModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowPromoModal(false)}
        >
          <div
            className="cosmic-card rounded-xl border border-[#00d4ff]/30 shadow-xl p-0 max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-[#00d4ff]/30 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-white">Choose From Promotion History</h2>
                <p className="text-sm text-white/70 mt-1">Select a promotional image to use as your banner</p>
              </div>
              <button
                onClick={() => setShowPromoModal(false)}
                className="text-white/60 hover:text-white text-2xl font-bold leading-none"
              >
                ×
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              {loadingPromo ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-12 h-12 border-4 border-[#00d4ff] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : promoHistory.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-white/70 mb-4">No promotion history found</p>
                  <p className="text-sm text-white/60">
                    Generate promotional images on the{' '}
                    <a href="/promotion" className="text-[#00d4ff] hover:underline">
                      Promotion page
                    </a>
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {promoHistory.map((item: any) => (
                    <div
                      key={item.id}
                      onClick={() => handleChoosePromo(item.image_url)}
                      className="cosmic-card border border-[#00d4ff]/30 rounded-xl overflow-hidden cursor-pointer hover:shadow-lg hover:border-[#00d4ff] transition-all"
                    >
                      {item.image_url?.endsWith('.mp4') || item.image_url?.includes('.mp4') ? (
                        <video
                          src={item.image_url}
                          className="w-full h-48 object-cover"
                          controls
                          muted
                          playsInline
                          onMouseEnter={(e) => e.currentTarget.play()}
                          onMouseLeave={(e) => {
                            e.currentTarget.pause()
                            e.currentTarget.currentTime = 0
                          }}
                        />
                      ) : (
                        <img
                          src={item.image_url}
                          alt={`Promo for ${item.collection_name}`}
                          className="w-full h-48 object-cover"
                        />
                      )}
                      <div className="p-4">
                        <h3 className="font-semibold text-white">{item.collection_name}</h3>
                        <p className="text-xs text-white/60 mt-1">
                          {new Date(item.created_at).toLocaleDateString()} at{' '}
                          {new Date(item.created_at).toLocaleTimeString()}
                        </p>
                        <p className="text-xs text-white/60 mt-1">
                          {item.character_count} character{item.character_count !== 1 ? 's' : ''}
                          {item.no_text
                            ? ' • No text'
                            : item.flyer_text
                              ? ` • "${item.flyer_text.slice(0, 30)}${item.flyer_text.length > 30 ? '...' : ''}"`
                              : ''}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-6 border-t border-[#00d4ff]/30">
              <button
                onClick={() => setShowPromoModal(false)}
                className="px-6 py-2 cosmic-card hover:bg-[#1a1f3a] text-white rounded-lg font-semibold transition-colors border border-[#00d4ff]/30"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

