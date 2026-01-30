'use client'

import { useState, useEffect } from 'react'
import { useWallet } from '@/lib/wallet/compatibility'
import { useCredits } from '@/lib/credits-context'
import { generateApiAuth } from '@/lib/wallet/api-auth'
import { toast } from 'sonner'

export function CreditTransfer() {
  const { currentAddress, isConnected, signMessage } = useWallet()
  const { credits, loading: creditsLoading, loadCredits } = useCredits()
  const [recipientUsername, setRecipientUsername] = useState('')
  const [amount, setAmount] = useState('')
  const [transferring, setTransferring] = useState(false)
  const [recipientProfile, setRecipientProfile] = useState<{
    username: string
    displayName?: string
    walletAddress: string
  } | null>(null)
  const [lookingUp, setLookingUp] = useState(false)

  // Load credits when wallet connects
  useEffect(() => {
    if (isConnected && currentAddress) {
      loadCredits(currentAddress)
    }
  }, [isConnected, currentAddress, loadCredits])

  // Look up recipient profile when username changes
  useEffect(() => {
    const lookupRecipient = async () => {
      const username = recipientUsername.trim().replace('@', '')
      if (!username || username.length < 3) {
        setRecipientProfile(null)
        return
      }

      setLookingUp(true)
      try {
        const response = await fetch(`/api/profile/username/${encodeURIComponent(username)}`)
        if (response.ok) {
          const data = await response.json()
          if (data.profile) {
            setRecipientProfile({
              username: data.profile.username,
              displayName: data.profile.displayName,
              walletAddress: data.profile.walletAddress,
            })
          } else {
            setRecipientProfile(null)
          }
        } else {
          setRecipientProfile(null)
        }
      } catch (error) {
        console.error('Error looking up recipient:', error)
        setRecipientProfile(null)
      } finally {
        setLookingUp(false)
      }
    }

    // Debounce lookup
    const timeoutId = setTimeout(lookupRecipient, 500)
    return () => clearTimeout(timeoutId)
  }, [recipientUsername])

  const handleTransfer = async () => {
    if (!isConnected || !currentAddress) {
      toast.error('Please connect your wallet')
      return
    }

    const username = recipientUsername.trim().replace('@', '')
    if (!username) {
      toast.error('Please enter a recipient username')
      return
    }

    const transferAmount = parseInt(amount)
    if (!transferAmount || transferAmount <= 0) {
      toast.error('Please enter a valid amount')
      return
    }

    if (transferAmount > (credits || 0)) {
      toast.error(`Insufficient credits. You have ${credits} credits.`)
      return
    }

    if (!recipientProfile) {
      toast.error('Recipient not found. Please check the username.')
      return
    }

    setTransferring(true)
    try {
      // Generate wallet signature for authentication
      const auth = await generateApiAuth(currentAddress, signMessage)
      if (!auth) {
        toast.error('Failed to generate signature. Please try again.')
        setTransferring(false)
        return
      }

      const response = await fetch('/api/credits/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient_username: username,
          amount: transferAmount,
          ...auth, // Include signature, message, timestamp
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Transfer failed')
      }

      toast.success(`Successfully transferred ${transferAmount} credits to @${username}`)
      setRecipientUsername('')
      setAmount('')
      setRecipientProfile(null)

      // Refresh credits
      if (currentAddress) {
        await loadCredits(currentAddress)
        // Dispatch event to refresh credits in other components
        window.dispatchEvent(new CustomEvent('refreshCredits'))
      }
    } catch (error: any) {
      console.error('Error transferring credits:', error)
      toast.error(error.message || 'Failed to transfer credits')
    } finally {
      setTransferring(false)
    }
  }

  if (!isConnected) {
    return null
  }

  return (
    <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border-2 border-[#00d4ff]/30 rounded-xl shadow-lg p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white mb-2">💳 Credits</h2>
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-black text-[#00d4ff]">
            {creditsLoading ? '...' : credits ?? 0}
          </span>
          <span className="text-white/70 text-sm">credits</span>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-white">Send Credits</h3>
        
        <div>
          <label className="block text-sm font-medium text-white/70 mb-1">
            Recipient Username
          </label>
          <div className="relative">
            <input
              type="text"
              value={recipientUsername}
              onChange={(e) => setRecipientUsername(e.target.value)}
              placeholder="@username"
              className="w-full px-4 py-2 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#00d4ff]/30 rounded-lg focus:ring-2 focus:ring-[#00d4ff] focus:border-[#00d4ff] text-white placeholder:text-white/50"
            />
            {lookingUp && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className="w-4 h-4 border-2 border-[#00d4ff] border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
          {recipientProfile && (
            <div className="mt-2 p-2 bg-[#00d4ff]/10 border border-[#00d4ff]/30 rounded text-sm">
              <p className="text-white">
                <span className="font-semibold">@{recipientProfile.username}</span>
                {recipientProfile.displayName && (
                  <span className="text-white/70 ml-2">({recipientProfile.displayName})</span>
                )}
              </p>
            </div>
          )}
          {recipientUsername.trim() && !lookingUp && !recipientProfile && (
            <p className="mt-2 text-sm text-[#EF4444]">User not found</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-white/70 mb-1">
            Amount
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            min={1}
            max={credits || 0}
            className="w-full px-4 py-2 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#00d4ff]/30 rounded-lg focus:ring-2 focus:ring-[#00d4ff] focus:border-[#00d4ff] text-white placeholder:text-white/50"
          />
          {amount && parseInt(amount) > 0 && (
            <p className="mt-1 text-xs text-[#a8a8b8]/80">
              You'll have {((credits || 0) - parseInt(amount))} credits remaining
            </p>
          )}
        </div>

        <button
          onClick={handleTransfer}
          disabled={
            transferring ||
            !recipientProfile ||
            !amount ||
            parseInt(amount) <= 0 ||
            parseInt(amount) > (credits || 0) ||
            !isConnected
          }
          className="w-full px-4 py-3 bg-[#00d4ff] hover:bg-[#14F195] text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {transferring ? 'Transferring...' : 'Send Credits'}
        </button>

        <p className="text-xs text-[#a8a8b8]/80 text-center">
          You'll be asked to sign a message with your wallet to confirm the transfer
        </p>
      </div>
    </div>
  )
}
