'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { WalletConnect } from '@/components/wallet-connect'
import { useWallet } from '@/lib/wallet/compatibility'
import { isAuthorized } from '@/lib/auth/access-control'
import { useCredits } from '@/lib/credits-context'

interface MarketData {
  price_usd: number
  change_24h: number
  updated_at: string | null
}

function PendingInvitationsBadge({ walletAddress }: { walletAddress: string | null }) {
  const [pendingInvitations, setPendingInvitations] = useState(0)

  useEffect(() => {
    if (!walletAddress) {
      setPendingInvitations(0)
      return
    }

    const loadPendingInvitations = async () => {
      try {
        const response = await fetch(`/api/collaborations/invitations?wallet_address=${encodeURIComponent(walletAddress)}`)
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
  }, [walletAddress])

  if (pendingInvitations === 0) return null

  return (
    <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full border-2 border-white shadow-lg animate-pulse">
      {pendingInvitations > 9 ? '9+' : pendingInvitations}
    </span>
  )
}

export function AppHeader() {
  const pathname = usePathname()
  const { isConnected, currentAddress } = useWallet()
  const { credits, loading: loadingCredits, loadCredits, clearCredits } = useCredits()
  const [showCreditPurchase, setShowCreditPurchase] = useState(true)
  const [marketData, setMarketData] = useState<MarketData | null>(null)

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(false)
  const [walletUpdateTrigger, setWalletUpdateTrigger] = useState(0)

  const { activeWalletAddress, activeWalletConnected } = useMemo(() => {
    if (currentAddress && isConnected) {
      return { activeWalletAddress: currentAddress, activeWalletConnected: true }
    }
    return { activeWalletAddress: null, activeWalletConnected: false }
  }, [currentAddress, isConnected, walletUpdateTrigger])

  const authorized = isAuthorized(activeWalletAddress)

  useEffect(() => {
    if (activeWalletConnected && activeWalletAddress) {
      loadCredits(activeWalletAddress)
    } else {
      clearCredits()
    }
  }, [activeWalletConnected, activeWalletAddress, loadCredits, clearCredits])

  // Fetch SOL market data
  useEffect(() => {
    const fetchMarketData = async () => {
      try {
        const response = await fetch('/api/market-data')
        if (response.ok) {
          const result = await response.json()
          if (result.success && result.data) {
            setMarketData(result.data)
          }
        }
      } catch (error) {
        console.error('Error fetching market data:', error)
      }
    }

    fetchMarketData()
    const interval = setInterval(fetchMarketData, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const checkSetting = async () => {
      try {
        const response = await fetch('/api/admin/site-settings?key=show_credit_purchase')
        if (response.ok) {
          const data = await response.json()
          setShowCreditPurchase(data.value !== false)
        }
      } catch (error) {
        console.error('Error checking site settings:', error)
        setShowCreditPurchase(true)
      }
    }
    checkSetting()
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleWalletConnected = () => {
      setWalletUpdateTrigger(prev => prev + 1)
    }

    window.addEventListener('solanaWalletConnected', handleWalletConnected)

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key?.startsWith('sol_wallet_verified_')) {
        handleWalletConnected()
      }
    }
    window.addEventListener('storage', handleStorageChange)

    return () => {
      window.removeEventListener('solanaWalletConnected', handleWalletConnected)
      window.removeEventListener('storage', handleStorageChange)
    }
  }, [])

  return (
    <header className="bg-[#0a0a0a]/95 backdrop-blur-md border-b border-[#222] sticky top-0 z-50" style={{ pointerEvents: 'auto', isolation: 'isolate' }}>
      <div className="container mx-auto px-3 sm:px-4">
        <div className="flex items-center justify-between h-[60px]">
          {/* Logo */}
          <div className="flex items-center">
            <Link
              href="/"
              className="flex items-center hover:opacity-80 transition-opacity flex-shrink-0 pl-1"
            >
              <span className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-[#9945FF] to-[#14F195] bg-clip-text text-transparent">
                SolMaker
              </span>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center">
            <div className="flex items-center gap-1 px-2 py-1 rounded-full border border-[#333] bg-[#1a1a1a]">
              <Link
                href="/marketplace"
                className={`px-3 py-1 text-sm font-medium rounded-full transition-all duration-200 whitespace-nowrap ${
                  pathname?.startsWith('/marketplace')
                    ? 'text-white bg-white/10'
                    : 'text-[#999] hover:text-white'
                }`}
              >
                Marketplace
              </Link>
              <div className="relative flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setToolsOpen((v) => !v)}
                  onBlur={() => setTimeout(() => setToolsOpen(false), 120)}
                  className={`px-3 py-1 text-sm font-medium rounded-full transition-all duration-200 whitespace-nowrap inline-flex items-center gap-1 ${
                    pathname === '/promotion' || pathname === '/sticker-maker'
                      ? 'text-white bg-white/10'
                      : 'text-[#999] hover:text-white'
                  }`}
                >
                  Promote
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {toolsOpen && (
                  <div className="absolute right-0 mt-1 w-44 bg-[#151515] border border-[#333] rounded-lg shadow-xl overflow-hidden z-50">
                    <Link
                      href="/sticker-maker"
                      className="block px-4 py-2.5 text-sm text-[#999] hover:text-white hover:bg-white/5"
                    >
                      Sticker Maker
                    </Link>
                    <Link
                      href="/promotion"
                      className="block px-4 py-2.5 text-sm text-[#999] hover:text-white hover:bg-white/5"
                    >
                      Ad/Marketing Maker
                    </Link>
                  </div>
                )}
              </div>
              <Link
                href="/collections"
                className={`px-3 py-1 text-sm font-medium rounded-full transition-all duration-200 whitespace-nowrap ${
                  pathname?.startsWith('/collections')
                    ? 'text-white bg-white/10'
                    : 'text-[#999] hover:text-white'
                }`}
              >
                Collections
              </Link>
              {showCreditPurchase && (
                <Link
                  href="/buy-credits"
                  className={`px-3 py-1 text-sm font-medium rounded-full transition-all duration-200 whitespace-nowrap ${
                    pathname === '/buy-credits'
                      ? 'text-white bg-white/10'
                      : 'text-[#999] hover:text-white'
                  }`}
                >
                  Buy Credits
                </Link>
              )}
            </div>
          </nav>

          {/* Right Side - Market Data + Wallet */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* SOL Price */}
            {marketData && marketData.price_usd > 0 && (
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#1a1a1a] border border-[#333]">
                <div className="w-4 h-4 rounded-full bg-gradient-to-br from-[#9945FF] to-[#14F195] flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-[8px] font-bold">S</span>
                </div>
                <span className="text-white text-sm font-medium">${marketData.price_usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                <span className={`text-xs font-medium ${marketData.change_24h >= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
                  {marketData.change_24h >= 0 ? '+' : ''}{marketData.change_24h.toFixed(1)}%
                </span>
              </div>
            )}

            {/* Wallet Connect */}
            <WalletConnect />

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-1.5 text-[#999] hover:text-white hover:bg-white/5 rounded-lg transition-all"
              aria-label="Toggle menu"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {mobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Navigation Menu */}
        {mobileMenuOpen && (
          <nav className="lg:hidden py-3 border-t border-[#222]">
            <div className="flex flex-col gap-1">
              <Link
                href="/marketplace"
                onClick={() => setMobileMenuOpen(false)}
                className="px-3 py-2 text-sm font-medium text-[#999] hover:text-white hover:bg-white/5 rounded-lg transition-all"
              >
                Marketplace
              </Link>
              <details className="group">
                <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-[#999] hover:text-white hover:bg-white/5 rounded-lg transition-all list-none flex items-center justify-between">
                  Promote
                  <svg className="w-3 h-3 group-open:rotate-180 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </summary>
                <div className="pl-4 flex flex-col gap-1 mt-1">
                  <Link
                    href="/sticker-maker"
                    onClick={() => setMobileMenuOpen(false)}
                    className="px-3 py-2 text-sm text-[#999] hover:text-white hover:bg-white/5 rounded-lg transition-all"
                  >
                    Sticker Maker
                  </Link>
                  <Link
                    href="/promotion"
                    onClick={() => setMobileMenuOpen(false)}
                    className="px-3 py-2 text-sm text-[#999] hover:text-white hover:bg-white/5 rounded-lg transition-all"
                  >
                    Ad/Marketing Maker
                  </Link>
                </div>
              </details>
              <Link
                href="/collections"
                onClick={() => setMobileMenuOpen(false)}
                className="px-3 py-2 text-sm font-medium text-[#999] hover:text-white hover:bg-white/5 rounded-lg transition-all"
              >
                Collections
              </Link>
              {showCreditPurchase && (
                <Link
                  href="/buy-credits"
                  onClick={() => setMobileMenuOpen(false)}
                  className="px-3 py-2 text-sm font-medium text-[#999] hover:text-white hover:bg-white/5 rounded-lg transition-all"
                >
                  Buy Credits
                </Link>
              )}

              {/* Market data in mobile menu */}
              {marketData && marketData.price_usd > 0 && (
                <div className="flex items-center gap-3 px-3 py-2 mt-2 border-t border-[#222]">
                  <div className="flex items-center gap-1.5">
                    <div className="w-4 h-4 rounded-full bg-gradient-to-br from-[#9945FF] to-[#14F195] flex items-center justify-center">
                      <span className="text-white text-[8px] font-bold">S</span>
                    </div>
                    <span className="text-white text-sm font-medium">${marketData.price_usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                    <span className={`text-xs font-medium ${marketData.change_24h >= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
                      {marketData.change_24h >= 0 ? '+' : ''}{marketData.change_24h.toFixed(1)}%
                    </span>
                  </div>
                </div>
              )}
            </div>
          </nav>
        )}
      </div>
    </header>
  )
}
