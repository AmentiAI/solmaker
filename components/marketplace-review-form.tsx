'use client'

import { useState } from 'react'
import { useWallet } from '@/lib/wallet/compatibility'
import { useSolanaWallet } from '@/lib/wallet/solana-wallet-context'
import { useMemo } from 'react'

interface MarketplaceReviewFormProps {
  transactionId: string
  listingId: string
  collectionId: string
  sellerWallet: string
  onReviewSubmitted?: () => void
  onCancel?: () => void
}

export function MarketplaceReviewForm({
  transactionId,
  listingId,
  collectionId,
  sellerWallet,
  onReviewSubmitted,
  onCancel,
}: MarketplaceReviewFormProps) {
  const { isConnected, currentAddress } = useWallet()
  const activeWalletAddress = useMemo(() => {
    if (currentAddress && isConnected) return currentAddress
    return null
  }, [currentAddress, isConnected])

  const [rating, setRating] = useState<number>(0)
  const [hoveredRating, setHoveredRating] = useState<number>(0)
  const [reviewText, setReviewText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!activeWalletAddress) {
      setError('Please connect your wallet')
      return
    }

    if (rating === 0) {
      setError('Please select a rating')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const response = await fetch('/api/marketplace/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transaction_id: transactionId,
          rating,
          review_text: reviewText.trim() || null,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit review')
      }

      if (onReviewSubmitted) {
        onReviewSubmitted()
      }
    } catch (err: any) {
      console.error('Error submitting review:', err)
      setError(err.message || 'Failed to submit review')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-white border-2 border-gray-300 rounded-xl p-6 shadow-lg">
      <h3 className="text-xl font-bold text-gray-900 mb-4">Leave a Review</h3>
      <p className="text-sm text-gray-600 mb-6">
        Share your experience with this purchase. Your review will be visible on the seller's profile.
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Star Rating */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Rating <span className="text-red-500">*</span>
          </label>
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setRating(star)}
                onMouseEnter={() => setHoveredRating(star)}
                onMouseLeave={() => setHoveredRating(0)}
                className="text-3xl transition-transform hover:scale-110 focus:outline-none"
                aria-label={`Rate ${star} star${star !== 1 ? 's' : ''}`}
              >
                {star <= (hoveredRating || rating) ? (
                  <span className="text-[#FBBF24]">★</span>
                ) : (
                  <span className="text-white">☆</span>
                )}
              </button>
            ))}
            {rating > 0 && (
              <span className="ml-2 text-sm text-gray-600">
                {rating === 1 ? 'Poor' : rating === 2 ? 'Fair' : rating === 3 ? 'Good' : rating === 4 ? 'Very Good' : 'Excellent'}
              </span>
            )}
          </div>
        </div>

        {/* Review Text */}
        <div>
          <label htmlFor="review-text" className="block text-sm font-medium text-gray-700 mb-2">
            Review (Optional)
          </label>
          <textarea
            id="review-text"
            value={reviewText}
            onChange={(e) => setReviewText(e.target.value)}
            rows={4}
            maxLength={1000}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 resize-none"
            placeholder="Share your experience with this purchase..."
          />
          <div className="text-xs text-[#a8a8b8]/80 mt-1 text-right">
            {reviewText.length}/1000 characters
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={submitting || rating === 0}
            className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Submitting...' : 'Submit Review'}
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={submitting}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-semibold transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  )
}

