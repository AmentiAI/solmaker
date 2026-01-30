'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useWallet } from '@/lib/wallet/compatibility'

export function ProfileDropdown() {
  const { isConnected, currentAddress } = useWallet()
  
  // Determine active wallet (Bitcoin only)
  const { activeWalletAddress, activeWalletConnected } = useMemo(() => {
    if (currentAddress && isConnected) {
      return { activeWalletAddress: currentAddress, activeWalletConnected: true }
    }
    return { activeWalletAddress: null, activeWalletConnected: false }
  }, [currentAddress, isConnected])
  
  // Removed excessive debug logging
  
  const [isOpen, setIsOpen] = useState(false)
  const [pendingInvitations, setPendingInvitations] = useState(0)
  const [loadingInvitations, setLoadingInvitations] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null)

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

  // Clear timeout on unmount
  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current)
      }
    }
  }, [])

  // Load pending invitations
  const loadPendingInvitations = async () => {
    if (!activeWalletAddress) {
      setPendingInvitations(0)
      return
    }

    setLoadingInvitations(true)
    try {
      const response = await fetch(`/api/collaborations/invitations?wallet_address=${encodeURIComponent(activeWalletAddress)}`)
      if (response.ok) {
        const data = await response.json()
        setPendingInvitations(data.invitations?.length || 0)
      }
    } catch (error) {
      console.error('Error loading pending invitations:', error)
    } finally {
      setLoadingInvitations(false)
    }
  }

  // Load invitations when wallet is connected - one-time fetch only
  useEffect(() => {
    if (activeWalletConnected && activeWalletAddress) {
      loadPendingInvitations()
    } else {
      setPendingInvitations(0)
    }
  }, [activeWalletConnected, activeWalletAddress])

  // Listen for invitation updates
  useEffect(() => {
    const handleInvitationUpdate = () => {
      loadPendingInvitations()
    }

    window.addEventListener('invitationUpdated', handleInvitationUpdate)
    return () => {
      window.removeEventListener('invitationUpdated', handleInvitationUpdate)
    }
  }, [activeWalletAddress])

  const handleMouseEnter = () => {
    // Clear any pending close timeout
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current)
      closeTimeoutRef.current = null
    }
    setIsOpen(true)
  }

  const handleMouseLeave = () => {
    // Add a small delay before closing to allow moving to dropdown menu
    closeTimeoutRef.current = setTimeout(() => {
      setIsOpen(false)
    }, 150)
  }

  if (!activeWalletConnected) {
    return null
  }

  return (
    <div 
      className="relative" 
      ref={dropdownRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <Link
        href="/profile"
        className="px-3 xl:px-4 py-2 text-xs xl:text-sm font-medium text-[#00d4ff] hover:text-[#14F195] hover:bg-[#00d4ff]/10 rounded-lg transition-all duration-200 whitespace-nowrap flex items-center gap-1 relative bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#00d4ff]/30"
      >
        Profile
        {pendingInvitations > 0 && (
          <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full border-2 border-[#0a0e27] shadow-lg animate-pulse">
            {pendingInvitations > 9 ? '9+' : pendingInvitations}
          </span>
        )}
        <svg 
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} 
          fill="none" 
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </Link>

      {isOpen && (
        <div 
          className="absolute right-0 mt-1 w-48 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#00d4ff]/30 rounded-lg shadow-2xl z-[9999] overflow-hidden"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <div className="py-1">
            <Link
              href="/profile"
              className="block px-4 py-2 text-sm text-white/70 hover:text-white hover:bg-[#1a1f3a] transition-colors"
              onClick={() => setIsOpen(false)}
            >
              Profile
            </Link>
            <Link
              href="/collections"
              className="block px-4 py-2 text-sm text-white/70 hover:text-white hover:bg-[#1a1f3a] transition-colors"
              onClick={() => setIsOpen(false)}
            >
              Collections
            </Link>
            <Link
              href="/my-mints"
              className="block px-4 py-2 text-sm text-white/70 hover:text-white hover:bg-[#1a1f3a] transition-colors"
              onClick={() => setIsOpen(false)}
            >
              Transactions
            </Link>
            <Link
              href="/transactions"
              className="block px-4 py-2 text-sm text-white/70 hover:text-white hover:bg-[#1a1f3a] transition-colors"
              onClick={() => setIsOpen(false)}
            >
              Credit Usage
            </Link>
            <Link
              href="/payouts"
              className="block px-4 py-2 text-sm text-white/70 hover:text-white hover:bg-[#1a1f3a] transition-colors"
              onClick={() => setIsOpen(false)}
            >
              Payouts
            </Link>
            <Link
              href="/rewards"
              className="block px-4 py-2 text-sm text-white/70 hover:text-white hover:bg-[#1a1f3a] transition-colors"
              onClick={() => setIsOpen(false)}
            >
              Rewards
            </Link>
            <Link
              href="/guide"
              className="block px-4 py-2 text-sm text-white/70 hover:text-white hover:bg-[#1a1f3a] transition-colors"
              onClick={() => setIsOpen(false)}
            >
              Guide
            </Link>
            <Link
              href="/support"
              className="block px-4 py-2 text-sm text-white/70 hover:text-white hover:bg-[#1a1f3a] transition-colors"
              onClick={() => setIsOpen(false)}
            >
              Support
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

