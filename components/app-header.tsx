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
    <header className="sticky top-0 z-50 bg-[var(--background)]/80 backdrop-blur-xl border-b border-[var(--border)]" style={{ pointerEvents: 'auto', isolation: 'isolate' }}>
      <div className="container mx-auto px-6">
        <div className="flex items-center justify-between h-20">
          {/* Logo */}
          <div className="flex items-center">
            <Link
              href="/"
              className="flex items-center group transition-all duration-300 flex-shrink-0"
            >
              <span className="text-2xl font-extrabold bg-gradient-to-r from-[var(--solana-purple)] to-[var(--solana-green)] bg-clip-text text-transparent group-hover:scale-105 transition-transform">
                SolMaker
              </span>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-2">
            <Link
              href="/marketplace"
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
                pathname?.startsWith('/marketplace')
                  ? 'text-white bg-gradient-to-r from-[var(--solana-purple)]/20 to-[var(--solana-green)]/20 border border-[var(--solana-purple)]/30'
                  : 'text-[var(--text-secondary)] hover:text-white hover:bg-[var(--surface)]'
              }`}
            >
              Marketplace
            </Link>
            <div className="relative flex-shrink-0">
              <button
                type="button"
                onClick={() => setToolsOpen((v) => !v)}
                onBlur={() => setTimeout(() => setToolsOpen(false), 120)}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 inline-flex items-center gap-1.5 ${
                  pathname === '/promotion' || pathname === '/sticker-maker'
                    ? 'text-white bg-gradient-to-r from-[var(--solana-purple)]/20 to-[var(--solana-green)]/20 border border-[var(--solana-purple)]/30'
                    : 'text-[var(--text-secondary)] hover:text-white hover:bg-[var(--surface)]'
                }`}
              >
                Promote
                <svg className="w-3.5 h-3.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {toolsOpen && (
                <div className="absolute right-0 mt-2 w-52 bg-[var(--surface-elevated)] backdrop-blur-xl border border-[var(--border)] rounded-xl shadow-2xl shadow-[var(--solana-purple)]/10 overflow-hidden z-50 animate-[fadeIn_0.2s_ease-out]">
                  <Link
                    href="/sticker-maker"
                    className="block px-5 py-3 text-sm font-medium text-[var(--text-secondary)] hover:text-white hover:bg-[var(--solana-purple)]/10 transition-all duration-200 border-b border-[var(--border)]"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🎨</span>
                      <span>Sticker Maker</span>
                    </div>
                  </Link>
                  <Link
                    href="/promotion"
                    className="block px-5 py-3 text-sm font-medium text-[var(--text-secondary)] hover:text-white hover:bg-[var(--solana-purple)]/10 transition-all duration-200"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg">📢</span>
                      <span>Ad/Marketing Maker</span>
                    </div>
                  </Link>
                </div>
              )}
            </div>
            <Link
              href="/collections"
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
                pathname?.startsWith('/collections')
                  ? 'text-white bg-gradient-to-r from-[var(--solana-purple)]/20 to-[var(--solana-green)]/20 border border-[var(--solana-purple)]/30'
                  : 'text-[var(--text-secondary)] hover:text-white hover:bg-[var(--surface)]'
              }`}
            >
              Collections
            </Link>
            <Link
              href="/solana-launchpad"
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
                pathname === '/solana-launchpad'
                  ? 'text-white bg-gradient-to-r from-[var(--solana-purple)]/20 to-[var(--solana-green)]/20 border border-[var(--solana-purple)]/30'
                  : 'text-[var(--text-secondary)] hover:text-white hover:bg-[var(--surface)]'
              }`}
            >
              Launchpad
            </Link>
            {showCreditPurchase && (
              <Link
                href="/buy-credits"
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
                  pathname === '/buy-credits'
                    ? 'text-white bg-gradient-to-r from-[var(--solana-purple)]/20 to-[var(--solana-green)]/20 border border-[var(--solana-purple)]/30'
                    : 'text-[var(--text-secondary)] hover:text-white hover:bg-[var(--surface)]'
                }`}
              >
                Buy Credits
              </Link>
            )}
            {authorized && (
              <Link
                href="/admin"
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 border ${
                  pathname?.startsWith('/admin')
                    ? 'text-white bg-gradient-to-r from-purple-600 to-pink-600 border-purple-500/50 shadow-lg shadow-purple-500/30'
                    : 'text-purple-400 border-purple-500/30 hover:text-white hover:bg-purple-600/20 hover:border-purple-500/50'
                }`}
              >
                ⚙️ Admin
              </Link>
            )}
          </nav>

          {/* Right Side - Market Data + Wallet */}
          <div className="flex items-center gap-4">
            {/* SOL Price */}
            {marketData && marketData.price_usd > 0 && (
              <div className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--solana-purple)]/40 transition-all duration-300">
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[var(--solana-purple)] to-[var(--solana-green)] flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-[10px] font-bold">S</span>
                </div>
                <span className="text-white text-sm font-semibold">${marketData.price_usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${marketData.change_24h >= 0 ? 'text-[var(--solana-green)] bg-[var(--solana-green)]/10' : 'text-[var(--error)] bg-[var(--error)]/10'}`}>
                  {marketData.change_24h >= 0 ? '↗' : '↘'} {Math.abs(marketData.change_24h).toFixed(1)}%
                </span>
              </div>
            )}

            {/* Wallet Connect */}
            <WalletConnect />

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 text-[var(--text-secondary)] hover:text-white hover:bg-[var(--surface)] rounded-lg transition-all duration-300 border border-[var(--border)]"
              aria-label="Toggle menu"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                {mobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Navigation Menu */}
        {mobileMenuOpen && (
          <nav className="lg:hidden py-4 border-t border-[var(--border)] animate-[fadeIn_0.3s_ease-out]">
            <div className="flex flex-col gap-2">
              <Link
                href="/marketplace"
                onClick={() => setMobileMenuOpen(false)}
                className="px-4 py-3 text-sm font-medium text-[var(--text-secondary)] hover:text-white hover:bg-[var(--surface)] rounded-lg transition-all duration-300"
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">🛍️</span>
                  <span>Marketplace</span>
                </div>
              </Link>
              <details className="group">
                <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-[var(--text-secondary)] hover:text-white hover:bg-[var(--surface)] rounded-lg transition-all duration-300 list-none flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">🚀</span>
                    <span>Promote</span>
                  </div>
                  <svg className="w-4 h-4 group-open:rotate-180 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </summary>
                <div className="pl-6 flex flex-col gap-2 mt-2">
                  <Link
                    href="/sticker-maker"
                    onClick={() => setMobileMenuOpen(false)}
                    className="px-4 py-2.5 text-sm font-medium text-[var(--text-secondary)] hover:text-white hover:bg-[var(--surface)] rounded-lg transition-all duration-300"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-base">🎨</span>
                      <span>Sticker Maker</span>
                    </div>
                  </Link>
                  <Link
                    href="/promotion"
                    onClick={() => setMobileMenuOpen(false)}
                    className="px-4 py-2.5 text-sm font-medium text-[var(--text-secondary)] hover:text-white hover:bg-[var(--surface)] rounded-lg transition-all duration-300"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-base">📢</span>
                      <span>Ad/Marketing Maker</span>
                    </div>
                  </Link>
                </div>
              </details>
              <Link
                href="/collections"
                onClick={() => setMobileMenuOpen(false)}
                className="px-4 py-3 text-sm font-medium text-[var(--text-secondary)] hover:text-white hover:bg-[var(--surface)] rounded-lg transition-all duration-300"
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">📚</span>
                  <span>Collections</span>
                </div>
              </Link>
              {showCreditPurchase && (
                <Link
                  href="/buy-credits"
                  onClick={() => setMobileMenuOpen(false)}
                  className="px-4 py-3 text-sm font-medium text-[var(--text-secondary)] hover:text-white hover:bg-[var(--surface)] rounded-lg transition-all duration-300"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg">💎</span>
                    <span>Buy Credits</span>
                  </div>
                </Link>
              )}
              {authorized && (
                <Link
                  href="/admin"
                  onClick={() => setMobileMenuOpen(false)}
                  className="px-4 py-3 text-sm font-medium rounded-lg transition-all duration-300 border border-purple-500/30 bg-gradient-to-r from-purple-600/20 to-pink-600/20 text-purple-400 hover:text-white hover:border-purple-500/50"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg">⚙️</span>
                    <span>Admin Panel</span>
                  </div>
                </Link>
              )}

              {/* Market data in mobile menu */}
              {marketData && marketData.price_usd > 0 && (
                <div className="flex items-center gap-3 px-4 py-3 mt-2 border-t border-[var(--border)] rounded-lg bg-[var(--surface)]">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[var(--solana-purple)] to-[var(--solana-green)] flex items-center justify-center">
                      <span className="text-white text-[10px] font-bold">S</span>
                    </div>
                    <span className="text-white text-sm font-semibold">${marketData.price_usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${marketData.change_24h >= 0 ? 'text-[var(--solana-green)] bg-[var(--solana-green)]/10' : 'text-[var(--error)] bg-[var(--error)]/10'}`}>
                      {marketData.change_24h >= 0 ? '↗' : '↘'} {Math.abs(marketData.change_24h).toFixed(1)}%
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
