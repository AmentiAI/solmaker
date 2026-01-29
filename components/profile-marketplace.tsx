'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useWallet } from '@/lib/wallet/compatibility'
import { useSolanaWallet } from '@/lib/wallet/solana-wallet-context'
import { MarketplaceReviewsDisplay } from '@/components/marketplace-reviews-display'

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
  sample_image?: string
  has_pending_payment?: boolean
  pending_buyer_wallet?: string
}

export function ProfileMarketplace() {
  const router = useRouter()
  const { isConnected, currentAddress } = useWallet()
  const activeWalletAddress = useMemo(() => {
    if (currentAddress && isConnected) return currentAddress
    return null
  }, [currentAddress, isConnected])

  const [listings, setListings] = useState<MarketplaceListing[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (activeWalletAddress) {
      loadListings()
    } else {
      setLoading(false)
    }
  }, [activeWalletAddress])

  const loadListings = async () => {
    if (!activeWalletAddress) return

    setLoading(true)
    setError(null)

    try {
      // Get all listings (active and sold) for this wallet
      const [activeResponse, soldResponse] = await Promise.all([
        fetch(`/api/marketplace/listings?status=active&seller_wallet=${encodeURIComponent(activeWalletAddress)}`),
        fetch(`/api/marketplace/listings?status=sold&seller_wallet=${encodeURIComponent(activeWalletAddress)}`)
      ])

      const activeData = activeResponse.ok ? await activeResponse.json() : { listings: [] }
      const soldData = soldResponse.ok ? await soldResponse.json() : { listings: [] }

      setListings([...activeData.listings, ...soldData.listings])
    } catch (err) {
      console.error('Error loading marketplace listings:', err)
      setError('Failed to load marketplace listings')
    } finally {
      setLoading(false)
    }
  }

  const handleCancelListing = async (listingId: string) => {
    if (!confirm('Are you sure you want to cancel this listing? This will remove it from the marketplace.')) {
      return
    }

    try {
      const response = await fetch(`/api/marketplace/listings/${listingId}/cancel`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' })
      })

      if (response.ok) {
        await loadListings()
        toast.success('Listing cancelled successfully')
      } else {
        const errorData = await response.json()
        toast.error('Error', { description: errorData.error || 'Failed to cancel listing' })
      }
    } catch (error) {
      console.error('Error cancelling listing:', error)
      toast.error('Failed to cancel listing')
    }
  }

  if (!activeWalletAddress) {
    return (
      <div>
        <h3 className="text-xl font-bold text-white mb-4">My Marketplace</h3>
        <p className="text-white/70">Please connect your wallet to view your marketplace listings.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div>
        <h3 className="text-xl font-bold text-white mb-4">My Marketplace</h3>
        <p className="text-white/70">Loading listings...</p>
      </div>
    )
  }

  const activeListings = listings.filter(l => l.status === 'active')
  const soldListings = listings.filter(l => l.status === 'sold')

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold text-white">My Marketplace</h3>
        <Link
          href="/marketplace"
          className="px-4 py-2 bg-[#00d4ff] hover:bg-[#00b8e6] text-white rounded-lg font-semibold transition-colors text-sm shadow-lg shadow-[#00d4ff]/20"
        >
          Browse Marketplace
        </Link>
      </div>

      {error && (
        <div className="mb-4 p-3 cosmic-card border border-[#ff4757]/50 text-[#ff4757] rounded-lg">
          {error}
        </div>
      )}

      {listings.length === 0 ? (
        <div className="text-center py-8 text-white/70">
          <p className="text-lg mb-2">No marketplace listings yet.</p>
          <p className="text-sm text-white/60 mb-4">List your collections to start selling!</p>
          <Link
            href="/marketplace"
            className="inline-block px-6 py-2 bg-[#00d4ff] hover:bg-[#00b8e6] text-white rounded-lg font-semibold transition-colors shadow-lg shadow-[#00d4ff]/20"
          >
            List a Collection →
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Active Listings */}
          {activeListings.length > 0 && (
            <div>
              <h4 className="text-lg font-semibold text-[#00d4ff] mb-3 flex items-center gap-2">
                <span>✓</span>
                Active Listings ({activeListings.length})
              </h4>
              <div className="grid md:grid-cols-2 gap-4">
                {activeListings.map((listing) => (
                  <div
                    key={listing.id}
                    className="cosmic-card border-2 border-[#00d4ff]/50 rounded-xl overflow-hidden hover:shadow-lg transition-all"
                  >
                    {/* Sample Image */}
                    {listing.sample_image && (
                      <div className="h-40 bg-white/5 overflow-hidden">
                        <img
                          src={listing.sample_image}
                          alt={listing.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}

                    <div className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="font-bold text-lg text-white flex-1">{listing.title}</h4>
                        <span className="px-2 py-1 bg-[#00d4ff]/20 text-[#00d4ff] text-xs font-bold rounded-full border border-[#00d4ff]/30">
                          Active
                        </span>
                      </div>

                      <div className="space-y-2 mb-3">
                        <div className="text-sm text-white/70">
                          <span className="font-medium">{listing.ordinal_count}</span> ordinals
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {(listing.payment_type === 'credits' || listing.payment_type === 'both') && (
                            <span className="px-2 py-1 bg-[#00d4ff]/20 text-[#00d4ff] rounded text-xs font-semibold border border-[#00d4ff]/30">
                              {listing.price_credits} Credits
                            </span>
                          )}
                          {(listing.payment_type === 'btc' || listing.payment_type === 'both') && listing.price_btc && (
                            <span className="px-2 py-1 bg-[#ff6b35]/20 text-[#ff6b35] rounded text-xs font-semibold border border-[#ff6b35]/30">
                              {parseFloat(listing.price_btc).toFixed(6)} BTC
                            </span>
                          )}
                        </div>

                        {listing.has_pending_payment && (
                          <div className="px-3 py-2 cosmic-card border border-[#ff6b35]/50 rounded-lg">
                            <p className="text-xs text-[#ff6b35] font-medium">
                              ⏳ Pending BTC Payment
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <Link
                          href={`/marketplace/${listing.id}`}
                          className="flex-1 px-3 py-2 cosmic-card border border-[#00d4ff]/30 hover:border-[#00d4ff]/50 text-white/70 hover:text-white rounded-lg text-sm font-semibold text-center transition-colors"
                        >
                          View
                        </Link>
                        <button
                          onClick={() => handleCancelListing(listing.id)}
                          className="px-3 py-2 bg-[#ff4757] hover:bg-[#ff3838] text-white rounded-lg text-sm font-semibold transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sold Listings */}
          {soldListings.length > 0 && (
            <div>
              <h4 className="text-lg font-semibold text-white/70 mb-3 flex items-center gap-2">
                <span>✓</span>
                Sold ({soldListings.length})
              </h4>
              <div className="grid md:grid-cols-2 gap-4">
                {soldListings.map((listing) => (
                  <div
                    key={listing.id}
                    className="cosmic-card border-2 border-white/20 rounded-xl overflow-hidden opacity-75"
                  >
                    {/* Sample Image */}
                    {listing.sample_image && (
                      <div className="h-40 bg-white/5 overflow-hidden">
                        <img
                          src={listing.sample_image}
                          alt={listing.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}

                    <div className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="font-bold text-lg text-white/70 flex-1">{listing.title}</h4>
                        <span className="px-2 py-1 bg-white/20 text-white/70 text-xs font-bold rounded-full">
                          Sold
                        </span>
                      </div>

                      <div className="space-y-2 mb-3">
                        <div className="text-sm text-white/60">
                          <span className="font-medium">{listing.ordinal_count}</span> ordinals
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {(listing.payment_type === 'credits' || listing.payment_type === 'both') && (
                            <span className="px-2 py-1 bg-white/10 text-white/60 rounded text-xs font-semibold">
                              {listing.price_credits} Credits
                            </span>
                          )}
                          {(listing.payment_type === 'btc' || listing.payment_type === 'both') && listing.price_btc && (
                            <span className="px-2 py-1 bg-white/10 text-white/60 rounded text-xs font-semibold">
                              {parseFloat(listing.price_btc).toFixed(6)} BTC
                            </span>
                          )}
                        </div>
                      </div>

                      <Link
                        href={`/marketplace/${listing.id}`}
                        className="block w-full px-3 py-2 cosmic-card border border-white/20 hover:border-white/30 text-white/70 hover:text-white rounded-lg text-sm font-semibold text-center transition-colors"
                      >
                        View Details
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Seller Reviews Section */}
      {activeWalletAddress && (
        <div className="mt-8 cosmic-card border border-[#00d4ff]/30 rounded-xl p-6">
          <h3 className="text-xl font-bold text-white mb-4">My Seller Reviews</h3>
          <MarketplaceReviewsDisplay
            sellerWallet={activeWalletAddress}
            showStats={true}
          />
        </div>
      )}
    </div>
  )
}

