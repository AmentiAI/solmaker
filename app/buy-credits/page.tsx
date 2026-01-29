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
      <div className="min-h-screen">
        <div className="container mx-auto px-4 py-16">
          <div className="max-w-2xl mx-auto text-center">
            <h1 className="text-4xl font-bold text-white mb-4">Buy Credits</h1>
            <p className="text-lg text-white/80 mb-8">
              Please connect your wallet to purchase credits.
            </p>
            <Link
              href="/"
              className="inline-block px-6 py-3 bg-[#00d4ff] text-white rounded-lg font-semibold hover:bg-[#00b8e6] transition-colors shadow-lg shadow-[#00d4ff]/20"
            >
              Go to Homepage
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (!showCreditPurchase) {
    return (
      <div className="min-h-screen">
        <div className="container mx-auto px-4 py-16">
          <div className="max-w-2xl mx-auto text-center">
            <h1 className="text-4xl font-bold text-white mb-4">Buy Credits</h1>
            <p className="text-lg text-white/80 mb-8">
              Credit purchase is currently unavailable.
            </p>
            <Link
              href="/"
              className="inline-block px-6 py-3 bg-[#00d4ff] text-white rounded-lg font-semibold hover:bg-[#00b8e6] transition-colors shadow-lg shadow-[#00d4ff]/20"
            >
              Go to Homepage
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      {/* Hero Header */}
      <div className="relative bg-gradient-to-r from-[#0a0e27]/90 via-[#1a1f3a]/90 to-[#0f172a]/90 text-white border-b border-[#00d4ff]/30">
        <div className="container mx-auto px-6 py-8">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <h1 className="text-4xl md:text-5xl font-black tracking-tight text-white">Buy Credits</h1>
              <p className="text-[#a5b4fc] mt-2 text-lg">
                Purchase credits to generate collections, traits, and more
              </p>
            </div>
            {!loadingCredits && credits !== null && (
              <div className="flex items-center gap-3">
                <div className="hidden sm:flex items-center gap-2 text-xs text-white/80 cosmic-card border border-[#00d4ff]/30 rounded-full px-3 py-1.5">
                  <span className="text-[#ff6b35] text-lg">💰</span>
                  <span className="font-semibold text-[#ff6b35]">
                    Balance: {typeof credits === 'number' 
                      ? credits.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
                      : parseFloat(String(credits)).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">

          {/* Credit Purchase Component */}
      
            <CreditPurchase onPurchaseComplete={handlePurchaseComplete} />
   

          {/* Info Section */}
          <div className="mt-8 cosmic-card border border-[#00d4ff]/30 rounded-2xl p-6">
            <h2 className="text-2xl font-bold text-white mb-4">What are Credits?</h2>
            <p className="text-white/80 mb-4">
              Credits are used to power various features on OrdMaker.fun:
            </p>
            <ul className="text-white/80 space-y-2 list-disc list-inside">
              <li>Generate ordinal collections and images</li>
              <li>Create and analyze traits</li>
              <li>Generate promotional materials</li>
              <li>Use advanced tools and features</li>
            </ul>
            <p className="text-white/60 mt-4 text-sm">
              Credits never expire and can be used at any time. Purchase credits securely using Bitcoin.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

