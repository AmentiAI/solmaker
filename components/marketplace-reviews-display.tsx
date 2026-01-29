'use client'

import { useState, useEffect } from 'react'

interface Review {
  id: string
  transaction_id: string
  listing_id: string
  collection_id: string
  seller_wallet: string
  buyer_wallet: string
  rating: number
  review_text: string | null
  buyer_username: string | null
  is_visible: boolean
  is_edited: boolean
  created_at: string
  updated_at: string
  collection_name?: string
  listing_title?: string
}

interface ReviewStats {
  total_reviews: number
  average_rating: number
  five_star: number
  four_star: number
  three_star: number
  two_star: number
  one_star: number
}

interface MarketplaceReviewsDisplayProps {
  sellerWallet?: string
  listingId?: string
  collectionId?: string
  showStats?: boolean
  limit?: number
}

export function MarketplaceReviewsDisplay({
  sellerWallet,
  listingId,
  collectionId,
  showStats = true,
  limit,
}: MarketplaceReviewsDisplayProps) {
  const [reviews, setReviews] = useState<Review[]>([])
  const [stats, setStats] = useState<ReviewStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadReviews()
  }, [sellerWallet, listingId, collectionId])

  const loadReviews = async () => {
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      if (sellerWallet) params.append('seller_wallet', sellerWallet)
      if (listingId) params.append('listing_id', listingId)
      if (collectionId) params.append('collection_id', collectionId)

      const response = await fetch(`/api/marketplace/reviews?${params}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load reviews')
      }

      let reviewsData = data.reviews || []
      if (limit) {
        reviewsData = reviewsData.slice(0, limit)
      }

      setReviews(reviewsData)
      setStats(data.stats || null)
    } catch (err: any) {
      console.error('Error loading reviews:', err)
      setError(err.message || 'Failed to load reviews')
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  const renderStars = (rating: number) => {
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <span
            key={star}
            className={`text-lg ${star <= rating ? 'text-yellow-400' : 'text-gray-300'}`}
          >
            ★
          </span>
        ))}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="text-center py-4 text-gray-600">
        Loading reviews...
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
        {error}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Stats Summary */}
      {showStats && stats && stats.total_reviews > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h4 className="text-lg font-bold text-gray-900">Seller Rating</h4>
              <div className="flex items-center gap-2 mt-1">
                {renderStars(Math.round(stats.average_rating))}
                <span className="text-lg font-bold text-gray-900">
                  {stats.average_rating.toFixed(1)}
                </span>
                <span className="text-sm text-gray-600">
                  ({stats.total_reviews} {stats.total_reviews === 1 ? 'review' : 'reviews'})
                </span>
              </div>
            </div>
          </div>

          {/* Rating Breakdown */}
          <div className="grid grid-cols-5 gap-2 mt-4">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = star === 5 ? stats.five_star :
                           star === 4 ? stats.four_star :
                           star === 3 ? stats.three_star :
                           star === 2 ? stats.two_star : stats.one_star
              const percentage = stats.total_reviews > 0 ? (count / stats.total_reviews) * 100 : 0

              return (
                <div key={star} className="flex items-center gap-2 text-sm">
                  <span className="text-gray-600 w-8">{star}★</span>
                  <div className="flex-1 bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-yellow-400 h-2 rounded-full"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <span className="text-gray-600 w-8 text-right">{count}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Reviews List */}
      {reviews.length === 0 ? (
        <div className="text-center py-8 text-gray-600">
          <p>No reviews yet.</p>
          {sellerWallet && <p className="text-sm mt-1">Be the first to review this seller!</p>}
        </div>
      ) : (
        <div className="space-y-4">
          <h4 className="text-lg font-bold text-gray-900">
            Reviews {limit && reviews.length >= limit ? `(Showing ${limit} of ${stats?.total_reviews || reviews.length})` : `(${reviews.length})`}
          </h4>
          {reviews.map((review) => (
            <div
              key={review.id}
              className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-gray-900">
                      {review.buyer_username ? `@${review.buyer_username}` : 'Anonymous Buyer'}
                    </span>
                    {review.is_edited && (
                      <span className="text-xs text-gray-500">(edited)</span>
                    )}
                  </div>
                  {renderStars(review.rating)}
                </div>
                <span className="text-xs text-gray-500">
                  {formatDate(review.created_at)}
                </span>
              </div>

              {review.review_text && (
                <p className="text-gray-700 mt-2 whitespace-pre-wrap">{review.review_text}</p>
              )}

              {review.collection_name && (
                <div className="mt-2 text-xs text-gray-500">
                  Collection: {review.collection_name}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

