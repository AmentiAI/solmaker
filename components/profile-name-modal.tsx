'use client'

import { useState, useEffect } from 'react'
import { useWallet } from '@/lib/wallet/compatibility'
import { useProfile } from '@/lib/profile/useProfile'

interface ProfileNameModalProps {
  isOpen: boolean
  onClose: () => void
}

export function ProfileNameModal({ isOpen, onClose }: ProfileNameModalProps) {
  const { currentAddress, paymentAddress } = useWallet()
  const { updateProfile, refreshProfile } = useProfile()
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Determine active wallet address (Bitcoin only)
  const activeWalletAddress = currentAddress

  // Reset form when modal closes or address changes
  useEffect(() => {
    if (!isOpen) {
      setUsername('')
      setDisplayName('')
      setError(null)
    }
  }, [isOpen, activeWalletAddress])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!username.trim()) {
      setError('Profile name is required')
      return
    }

    // Validate username format (alphanumeric, underscore, hyphen, 3-50 chars)
    const usernameRegex = /^[a-zA-Z0-9_-]{3,50}$/
    if (!usernameRegex.test(username.trim())) {
      setError('Profile name must be 3-50 characters and contain only letters, numbers, underscores, and hyphens')
      return
    }

    setIsSubmitting(true)

    try {
      if (!activeWalletAddress) {
        setError('Wallet not connected')
        setIsSubmitting(false)
        return
      }

      const response = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address: activeWalletAddress,
          payment_address: paymentAddress || null,
          username: username.trim(),
          display_name: displayName.trim() || null,
        }),
      })

      if (response.ok) {
        await refreshProfile()
        // Dispatch event to notify other components
        window.dispatchEvent(new CustomEvent('profileCreated'))
        setUsername('')
        setDisplayName('')
        onClose()
      } else {
        const errorData = await response.json()
        setError(errorData.error || 'Failed to create profile. Please try again.')
      }
    } catch (err) {
      console.error('Error creating profile:', err)
      setError('An error occurred. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    if (!isSubmitting) {
      setUsername('')
      setDisplayName('')
      setError(null)
      onClose()
    }
  }

  return (
    <div 
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) {
          handleClose()
        }
      }}
    >
      <div className="bg-slate-900 border border-gray-700 rounded-lg shadow-2xl w-full max-w-md mx-4">
        <div className="p-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-2xl font-bold text-white">Profile Name</h2>
            <button
              onClick={handleClose}
              disabled={isSubmitting}
              className="text-gray-400 hover:text-white transition-colors disabled:opacity-50"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="text-gray-400 text-sm mb-6">
            Welcome! Please choose a profile name to get started.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="username" className="block text-sm font-semibold text-gray-300 mb-2">
                Profile Name <span className="text-red-400">*</span>
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value)
                  setError(null)
                }}
                placeholder="Enter your profile name"
                className="w-full px-4 py-2 bg-slate-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                disabled={isSubmitting}
                autoFocus
                maxLength={50}
              />
              <p className="text-xs text-gray-500 mt-1">
                3-50 characters, letters, numbers, underscores, and hyphens only
              </p>
            </div>

            <div>
              <label htmlFor="displayName" className="block text-sm font-semibold text-gray-300 mb-2">
                Display Name (Optional)
              </label>
              <input
                id="displayName"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Enter your display name"
                className="w-full px-4 py-2 bg-slate-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                disabled={isSubmitting}
                maxLength={100}
              />
            </div>

            {error && (
              <div className="bg-red-900/30 border border-red-700/50 rounded-lg p-3 text-red-300 text-sm">
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={isSubmitting || !username.trim()}
                className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-lg font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Creating...' : 'Create Profile'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

