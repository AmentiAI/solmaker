'use client'

import { useState, useEffect, useMemo } from 'react'
import { useWallet } from '@/lib/wallet/compatibility'
import { useSolanaWallet } from '@/lib/wallet/solana-wallet-context'
import { MarketplaceReviewsDisplay } from '@/components/marketplace-reviews-display'

interface ReviewStats {
  total_reviews: number
  average_rating: number
  five_star: number
  four_star: number
  three_star: number
  two_star: number
  one_star: number
}

export function ProfileSellerRating() {
  const { isConnected, currentAddress } = useWallet()
  const activeWalletAddress = useMemo(() => {
    if (currentAddress && isConnected) return currentAddress
    return null
  }, [currentAddress, isConnected])

  const [stats, setStats] = useState<ReviewStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (activeWalletAddress) {
      loadStats()
    } else {
      setLoading(false)
    }
  }, [activeWalletAddress])

  const loadStats = async () => {
    if (!activeWalletAddress) return

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/marketplace/reviews?seller_wallet=${encodeURIComponent(activeWalletAddress)}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load rating stats')
      }

      setStats(data.stats || null)
    } catch (err: any) {
      console.error('Error loading rating stats:', err)
      setError(err.message || 'Failed to load rating stats')
    } finally {
      setLoading(false)
    }
  }

  const renderStars = (rating: number) => {
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <span
            key={star}
            className={`text-xl ${star <= rating ? 'text-[#FBBF24]' : 'text-white/30'}`}
          >
            ★
          </span>
        ))}
      </div>
    )
  }

  if (!activeWalletAddress) {
    return null
  }

  if (loading) {
    return (
      <div className="bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl border-2 border-[#00d4ff]/30 rounded-xl p-6 shadow-lg">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 border-2 border-[#00d4ff] border-t-transparent rounded-full animate-spin" />
          <span className="text-white/70">Loading seller rating...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl border-2 border-[#EF4444]/50 rounded-xl p-6 shadow-lg">
        <p className="text-[#EF4444]">Error loading rating: {error}</p>
      </div>
    )
  }

  if (!stats || stats.total_reviews === 0) {
    return (
      <div className="bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl border-2 border-[#00d4ff]/30 rounded-xl p-6 shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-white mb-1">Seller Rating</h3>
            <p className="text-sm text-white/70">No reviews yet</p>
          </div>
          <div className="text-[#FBBF24] text-2xl">⭐</div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl border-2 border-[#00d4ff]/30 rounded-xl p-6 shadow-lg">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-xl font-bold text-white mb-2">Seller Rating</h3>
          <div className="flex items-center gap-3">
            {renderStars(Math.round(stats.average_rating))}
            <div>
              <div className="text-2xl font-bold text-[#00d4ff]">
                {stats.average_rating.toFixed(1)}
              </div>
              <div className="text-sm text-white/70">
                {stats.total_reviews} {stats.total_reviews === 1 ? 'review' : 'reviews'}
              </div>
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm text-white/70 mb-1">Rating Breakdown</div>
          <div className="space-y-1 text-xs">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = star === 5 ? stats.five_star :
                           star === 4 ? stats.four_star :
                           star === 3 ? stats.three_star :
                           star === 2 ? stats.two_star : stats.one_star
              const percentage = stats.total_reviews > 0 ? (count / stats.total_reviews) * 100 : 0

              return (
                <div key={star} className="flex items-center gap-2 w-32">
                  <span className="text-white/70 w-8">{star}★</span>
                  <div className="flex-1 bg-white/10 rounded-full h-2">
                    <div
                      className="bg-yellow-400 h-2 rounded-full"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <span className="text-white/70 w-6 text-right">{count}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Show recent reviews preview */}
      <div className="mt-4 pt-4 border-t border-[#00d4ff]/30">
        <MarketplaceReviewsDisplay
          sellerWallet={activeWalletAddress}
          showStats={false}
          limit={3}
        />
      </div>
    </div>
  )
}

