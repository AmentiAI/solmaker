'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import { useSolanaWallet } from '@/lib/wallet/solana-wallet-context'
import { useProfile } from '@/lib/profile/useProfile'
import { useCredits } from '@/lib/credits-context'

export function WalletConnect() {
  const [mounted, setMounted] = useState(false)
  const {
    isConnected,
    address,
    isVerified,
    isVerifying,
    verifyWallet,
    connect,
    disconnect,
  } = useSolanaWallet()
  const { setVisible } = useWalletModal()
  const { profile, loading: profileLoading, refreshProfile } = useProfile()
  const [pendingInvitations, setPendingInvitations] = useState(0)

  const activeAddress = address
  const activeIsConnected = isConnected

  const { credits, loading: loadingCredits, loadCredits, clearCredits } = useCredits()

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (activeIsConnected && activeAddress) {
      loadCredits(activeAddress)
    } else {
      clearCredits()
    }
  }, [activeIsConnected, activeAddress, loadCredits, clearCredits])

  // Load pending invitations
  useEffect(() => {
    if (!activeAddress) {
      setPendingInvitations(0)
      return
    }

    const loadPendingInvitations = async () => {
      try {
        const response = await fetch(`/api/collaborations/invitations?wallet_address=${encodeURIComponent(activeAddress)}`)
        if (response.ok) {
          const data = await response.json()
          setPendingInvitations(data.invitations?.length || 0)
        }
      } catch (error) {
        console.error('Error loading pending invitations:', error)
      }
    }

    loadPendingInvitations()

    const handleInvitationUpdate = () => loadPendingInvitations()
    window.addEventListener('invitationUpdated', handleInvitationUpdate)
    return () => window.removeEventListener('invitationUpdated', handleInvitationUpdate)
  }, [activeAddress])

  const [isOpen, setIsOpen] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const hasCheckedProfileRef = useRef<string | null>(null)
  const isMountedRef = useRef(false)

  const createAccountForWallet = useCallback(async (walletAddress: string) => {
    if (!isMountedRef.current) return

    try {
      const profileResponse = await fetch(`/api/profile?wallet_address=${encodeURIComponent(walletAddress)}`)
      if (!profileResponse.ok) return

      const data = await profileResponse.json()

      if (!data.profile) {
        const createResponse = await fetch('/api/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            wallet_address: walletAddress,
            wallet_type: 'sol',
          }),
        })

        if (createResponse.ok) {
          setTimeout(() => {
            if (isMountedRef.current) {
              refreshProfile()
              window.dispatchEvent(new CustomEvent('profileCreated', { detail: { address: walletAddress, walletType: 'sol' } }))
            }
          }, 500)
        }
      } else {
        if (data.profile.walletType !== 'sol') {
          await fetch('/api/profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              wallet_address: walletAddress,
              wallet_type: 'sol',
            }),
          })
        }
        setTimeout(() => {
          if (isMountedRef.current) refreshProfile()
        }, 500)
      }
    } catch (error) {
      console.error('Error creating account:', error)
    }
  }, [refreshProfile])

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside, true)
    }, 100)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('mousedown', handleClickOutside, true)
    }
  }, [isOpen])

  useEffect(() => {
    isMountedRef.current = true
    return () => { isMountedRef.current = false }
  }, [])

  // Auto-create profile when wallet connects
  useEffect(() => {
    if (isConnected && activeAddress) {
      if (profileLoading) return
      if (hasCheckedProfileRef.current === activeAddress) return

      if (!profile) {
        hasCheckedProfileRef.current = activeAddress
        setTimeout(() => {
          if (isMountedRef.current && activeAddress === hasCheckedProfileRef.current) {
            createAccountForWallet(activeAddress).catch(err => {
              console.error('Error creating account:', err)
            })
          }
        }, 500)
      } else {
        hasCheckedProfileRef.current = activeAddress
      }
    } else if (!isConnected) {
      hasCheckedProfileRef.current = null
    }
  }, [isConnected, activeAddress, profile, profileLoading, createAccountForWallet])

  // Auto-verify after connection
  useEffect(() => {
    if (isConnected && activeAddress && !isVerified && !isVerifying) {
      const timeoutId = setTimeout(async () => {
        try {
          const verified = await verifyWallet()
          if (verified) {
            toast.success('Wallet connected and verified!')
          }
        } catch (error: any) {
          // Don't log user rejections as errors
          const errorMessage = error?.message || String(error)
          const isUserRejection =
            error?.code === 4001 ||
            errorMessage.toLowerCase().includes('user rejected') ||
            errorMessage.toLowerCase().includes('cancel') ||
            errorMessage.toLowerCase().includes('reject')

          if (!isUserRejection) {
            console.error('Auto-verification error:', error)
          }
        }
      }, 500)
      return () => clearTimeout(timeoutId)
    }
  }, [isConnected, activeAddress, isVerified, isVerifying, verifyWallet])

  const handleConnect = async () => {
    setIsConnecting(true)
    setIsOpen(false)
    try {
      setVisible(true)
    } catch (error) {
      console.error('Connection error:', error)
      toast.error('Failed to connect wallet')
    } finally {
      setIsConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    await disconnect()
    setIsOpen(false)
  }

  const handleVerify = async () => {
    await verifyWallet()
  }

  const formatAddress = (addr: string) => {
    return `${addr.substring(0, 4)}...${addr.substring(addr.length - 4)}`
  }

  // Prevent hydration mismatch by only rendering after mount
  if (!mounted) {
    return (
      <button
        disabled
        className="w-full px-5 py-4 bg-gradient-to-r from-[#9945FF] to-[#14F195] hover:opacity-90 text-white rounded-xl text-base font-bold transition-all duration-200 flex items-center justify-center gap-3"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        Connect Wallet
      </button>
    )
  }

  if (isConnecting) {
    return (
      <button
        disabled
        className="w-full px-5 py-4 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 text-white rounded-xl text-base font-bold opacity-50 cursor-not-allowed border border-[#9945FF]/30"
      >
        Connecting...
      </button>
    )
  }

  if (activeIsConnected && activeAddress) {
    const creditDisplay = loadingCredits
      ? '...'
      : credits !== null
        ? typeof credits === 'number'
          ? credits.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
          : parseFloat(String(credits)).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
        : '0'

    const buttonText = (profileLoading && !profile)
      ? `Loading... | ${creditDisplay}`
      : profile?.username
        ? `@${profile.username} | ${creditDisplay}`
        : `${formatAddress(activeAddress)} | ${creditDisplay}`

    return (
      <div className="relative flex flex-col w-full" ref={dropdownRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full px-5 py-4 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 hover:bg-[#252525] text-white rounded-xl text-base font-bold transition-all duration-200 flex items-center justify-between gap-3 border border-[#9945FF]/30"
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <span className="w-2 h-2 bg-[#22c55e] rounded-full flex-shrink-0"></span>
            <span className="truncate">{buttonText}</span>
          </div>
          <svg
            className={`w-4 h-4 transition-transform text-[#a8a8b8]/80 flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {isOpen && (
          <div className="absolute left-0 right-0 top-full mt-2 bg-[#151515] border border-[#9945FF]/30 rounded-xl shadow-xl z-[9999] overflow-hidden">
            <div className="p-5 border-b border-[#9945FF]/30">
              <div className="flex items-center gap-4">
                {profile?.avatarUrl ? (
                  <img
                    src={profile.avatarUrl}
                    alt={profile.displayName || profile.username || 'Avatar'}
                    className="w-12 h-12 rounded-full object-cover border-2 border-[#9945FF]/50"
                  />
                ) : (
                  <div className="w-12 h-12 bg-gradient-to-br from-[#9945FF] to-[#14F195] rounded-full flex items-center justify-center text-white font-bold text-lg">
                    {profile?.username?.charAt(0).toUpperCase() || activeAddress.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-white font-bold truncate text-base">
                    {profile?.displayName || profile?.username || 'Wallet'}
                  </p>
                  <p className="text-[#a8a8b8]/80 text-sm font-mono truncate" title={activeAddress}>
                    {formatAddress(activeAddress)}
                  </p>
                  <p className="text-[#14F195] text-sm mt-1 font-semibold">Solana</p>
                </div>
              </div>
            </div>

            <div className="p-3">
              {!isVerified && !isVerifying && (
                <button
                  onClick={handleVerify}
                  className="w-full px-5 py-3 bg-[#9945FF] hover:bg-[#8836E0] text-white rounded-xl text-base font-bold transition-colors mb-3"
                >
                  Verify Wallet
                </button>
              )}
              {isVerifying && (
                <div className="w-full px-5 py-3 bg-[#9945FF] text-white rounded-xl text-base font-bold text-center mb-3 opacity-50">
                  Verifying...
                </div>
              )}
              {isVerified && (
                <div className="w-full px-5 py-3 bg-green-600 text-white rounded-xl text-base font-bold text-center mb-3 flex items-center justify-center gap-2">
                  <span>&#10003;</span>
                  Verified
                </div>
              )}
              <div className="border-t border-[#9945FF]/30 pt-3 mt-3">
                <Link href="/profile" onClick={() => setIsOpen(false)} className="block px-5 py-3 text-base text-[#a8a8b8] hover:text-white hover:bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-xl transition-colors relative font-semibold">
                  Profile
                  {pendingInvitations > 0 && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center min-w-[20px] h-[20px] px-1.5 bg-red-500 text-white text-xs font-bold rounded-full border-2 border-[#151515] shadow-lg animate-pulse">
                      {pendingInvitations > 9 ? '9+' : pendingInvitations}
                    </span>
                  )}
                </Link>
                <Link href="/collections" onClick={() => setIsOpen(false)} className="block px-5 py-3 text-base text-[#a8a8b8] hover:text-white hover:bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-xl transition-colors font-semibold">
                  Collections
                </Link>
                <Link href="/my-mints" onClick={() => setIsOpen(false)} className="block px-5 py-3 text-base text-[#a8a8b8] hover:text-white hover:bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-xl transition-colors font-semibold">
                  Transactions
                </Link>
                <Link href="/transactions" onClick={() => setIsOpen(false)} className="block px-5 py-3 text-base text-[#a8a8b8] hover:text-white hover:bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-xl transition-colors font-semibold">
                  Credit Usage
                </Link>
                <Link href="/rewards" onClick={() => setIsOpen(false)} className="block px-5 py-3 text-base text-[#a8a8b8] hover:text-white hover:bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-xl transition-colors font-semibold">
                  Rewards
                </Link>
                <Link href="/guide" onClick={() => setIsOpen(false)} className="block px-5 py-3 text-base text-[#a8a8b8] hover:text-white hover:bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-xl transition-colors font-semibold">
                  Guide
                </Link>
                <Link href="/support" onClick={() => setIsOpen(false)} className="block px-5 py-3 text-base text-[#a8a8b8] hover:text-white hover:bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-xl transition-colors font-semibold">
                  Support
                </Link>
              </div>

              <div className="border-t border-[#9945FF]/30 pt-3 mt-3">
                <button
                  onClick={handleDisconnect}
                  className="w-full px-5 py-3 bg-[#ff5252]/10 hover:bg-[#ff5252]/20 text-[#ff5252] rounded-xl text-base font-bold transition-colors border border-[#ff5252]/20"
                >
                  Disconnect
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <button
        onClick={handleConnect}
        className="w-full px-5 py-4 bg-gradient-to-r from-[#9945FF] to-[#14F195] hover:opacity-90 text-white rounded-xl text-base font-bold transition-all duration-200 flex items-center justify-center gap-3"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        Connect Wallet
      </button>
    </div>
  )
}
