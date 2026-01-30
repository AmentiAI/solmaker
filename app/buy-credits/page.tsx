'use client'

import { useState, useEffect } from 'react'
import { useWallet } from '@/lib/wallet/compatibility'
import { CreditPurchase } from '@/components/credit-purchase'
import { useCredits } from '@/lib/credits-context'
import Link from 'next/link'

export default function BuyCreditsPage() {
  const { isConnected, currentAddress } = useWallet()
  const { credits, loading: loadingCredits, loadCredits } = useCredits()
  const [showCreditPurchase, setShowCreditPurchase] = useState(true)

  // Determine active wallet (Bitcoin only)
  const activeWalletAddress = currentAddress && isConnected ? currentAddress : null
  const activeWalletConnected = isConnected

  useEffect(() => {
    // Check if credit purchase should be shown
    const checkSetting = async () => {
      try {
        const response = await fetch('/api/admin/site-settings?key=show_credit_purchase')
        if (response.ok) {
          const data = await response.json()
          setShowCreditPurchase(data.value !== false)
        }
      } catch (error) {
        console.error('Error checking site settings:', error)
        // Default to showing if we can't check
        setShowCreditPurchase(true)
      }
    }
    checkSetting()
  }, [])

  useEffect(() => {
    if (activeWalletConnected && activeWalletAddress) {
      loadCredits(activeWalletAddress)
    }
  }, [activeWalletConnected, activeWalletAddress, loadCredits])

  const handlePurchaseComplete = () => {
    // Reload credits after purchase
    if (activeWalletAddress) {
      loadCredits(activeWalletAddress)
    }
  }

  if (!activeWalletConnected) {
    return (
      <div className="min-h-screen bg-[#0D0D11] flex items-center justify-center">
        <div className="max-w-2xl mx-auto text-center px-6">
          <div className="w-32 h-32 mx-auto mb-8 bg-gradient-to-br from-[#9945FF] to-[#14F195] rounded-3xl flex items-center justify-center shadow-2xl shadow-[#9945FF]/50">
            <span className="text-6xl">🔌</span>
          </div>
          <h1 className="text-5xl md:text-6xl font-extrabold mb-6 bg-gradient-to-r from-[#9945FF] to-[#14F195] bg-clip-text text-transparent">
            Buy Credits
          </h1>
          <p className="text-xl text-[#A1A1AA] mb-10 font-medium leading-relaxed">
            Please connect your wallet to purchase credits and start creating amazing NFTs.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-[#9945FF] to-[#DC1FFF] hover:from-[#DC1FFF] hover:to-[#9945FF] text-white text-lg font-semibold rounded-xl transition-all duration-300 shadow-lg shadow-[#9945FF]/30 hover:shadow-xl hover:shadow-[#9945FF]/40 hover:scale-105 active:scale-95"
          >
            <span>Go to Homepage</span>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
        </div>
      </div>
    )
  }

  if (!showCreditPurchase) {
    return (
      <div className="min-h-screen bg-[#0D0D11] flex items-center justify-center">
        <div className="max-w-2xl mx-auto text-center px-6">
          <div className="w-32 h-32 mx-auto mb-8 bg-[#121218] border-2 border-[#EF4444]/30 rounded-3xl flex items-center justify-center shadow-2xl shadow-[#EF4444]/20">
            <span className="text-6xl">⚠️</span>
          </div>
          <h1 className="text-5xl md:text-6xl font-extrabold mb-6 bg-gradient-to-r from-[#9945FF] to-[#14F195] bg-clip-text text-transparent">
            Buy Credits
          </h1>
          <p className="text-xl text-[#A1A1AA] mb-10 font-medium leading-relaxed">
            Credit purchase is currently unavailable. Please check back later.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-[#9945FF] to-[#DC1FFF] hover:from-[#DC1FFF] hover:to-[#9945FF] text-white text-lg font-semibold rounded-xl transition-all duration-300 shadow-lg shadow-[#9945FF]/30 hover:shadow-xl hover:shadow-[#9945FF]/40 hover:scale-105 active:scale-95"
          >
            <span>Go to Homepage</span>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      {/* Hero Header */}
      <div className="relative bg-gradient-to-r from-[#121218] to-[#1A1A22] text-white border-b border-[#9945FF]/20 overflow-hidden -mx-6 lg:-mx-12 px-6 lg:px-12">
        {/* Animated background elements */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-10 left-10 w-72 h-72 bg-[#9945FF]/30 rounded-full blur-3xl" />
          <div className="absolute bottom-10 right-10 w-96 h-96 bg-[#14F195]/20 rounded-full blur-3xl" />
        </div>
        
        <div className="w-full py-12 relative z-10">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            <div>
              <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight bg-gradient-to-r from-[#9945FF] to-[#14F195] bg-clip-text text-transparent mb-3">
                Buy Credits
              </h1>
              <p className="text-[#A1A1AA] text-lg font-medium">
                Purchase credits to generate collections, traits, and more
              </p>
            </div>
            {!loadingCredits && credits !== null && (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-3 bg-[#121218] border-2 border-[#14F195]/30 rounded-xl px-5 py-3 shadow-lg shadow-[#14F195]/10">
                  <span className="text-2xl">💰</span>
                  <div>
                    <div className="text-xs text-[#A1A1AA] font-medium uppercase tracking-wide">Balance</div>
                    <div className="text-xl font-bold text-[#14F195]">
                      {typeof credits === 'number' 
                        ? credits.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
                        : parseFloat(String(credits)).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      
      <div className="w-full py-12">
        <div className="max-w-5xl mx-auto space-y-8">

          {/* Credit Purchase Component */}
          <CreditPurchase onPurchaseComplete={handlePurchaseComplete} />

          {/* Info Section */}
          <div className="bg-[#121218] border border-[#9945FF]/20 rounded-2xl p-8 shadow-xl shadow-[#9945FF]/5">
            <h2 className="text-3xl font-bold text-white mb-6">What are Credits?</h2>
            <p className="text-[#A1A1AA] mb-6 text-lg leading-relaxed">
              Credits are used to power various features on OrdMaker.fun:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="flex items-start gap-3 p-4 bg-[#1A1A22] rounded-xl border border-[#9945FF]/10">
                <span className="text-2xl">🎨</span>
                <div>
                  <div className="font-semibold text-white mb-1">Generate Collections</div>
                  <div className="text-sm text-[#A1A1AA]">Create ordinal collections and images</div>
                </div>
              </div>
              <div className="flex items-start gap-3 p-4 bg-[#1A1A22] rounded-xl border border-[#9945FF]/10">
                <span className="text-2xl">✨</span>
                <div>
                  <div className="font-semibold text-white mb-1">Create Traits</div>
                  <div className="text-sm text-[#A1A1AA]">Design and analyze trait combinations</div>
                </div>
              </div>
              <div className="flex items-start gap-3 p-4 bg-[#1A1A22] rounded-xl border border-[#9945FF]/10">
                <span className="text-2xl">📢</span>
                <div>
                  <div className="font-semibold text-white mb-1">Promotional Materials</div>
                  <div className="text-sm text-[#A1A1AA]">Generate marketing content</div>
                </div>
              </div>
              <div className="flex items-start gap-3 p-4 bg-[#1A1A22] rounded-xl border border-[#9945FF]/10">
                <span className="text-2xl">🛠️</span>
                <div>
                  <div className="font-semibold text-white mb-1">Advanced Tools</div>
                  <div className="text-sm text-[#A1A1AA]">Access premium features</div>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-[#9945FF]/10 to-[#14F195]/10 border border-[#9945FF]/20 rounded-xl">
              <span className="text-2xl">💎</span>
              <p className="text-[#A1A1AA] text-sm">
                Credits never expire and can be used at any time. Purchase credits securely using Solana.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

