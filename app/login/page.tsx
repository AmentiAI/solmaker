'use client'

import { useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useWallet } from '@/lib/wallet/compatibility'
import { isAuthorized } from '@/lib/auth/access-control'
import { WalletConnect } from '@/components/wallet-connect'

export default function LoginPage() {
  const router = useRouter()
  const { isConnected, currentAddress } = useWallet()

  // Determine active wallet (Bitcoin only)
  const { activeWalletAddress, activeWalletConnected } = useMemo(() => {
    if (currentAddress && isConnected) {
      return { activeWalletAddress: currentAddress, activeWalletConnected: true }
    }
    return { activeWalletAddress: null, activeWalletConnected: false }
  }, [currentAddress, isConnected])

  // Check if user is authorized (any connected wallet is now authorized)
  const authorized = isAuthorized(activeWalletAddress)

  // Redirect to home if wallet is connected
  useEffect(() => {
    if (activeWalletConnected && authorized) {
      router.push('/')
    }
  }, [activeWalletConnected, authorized, router])

  // Show wallet connect prompt if not connected
  if (!activeWalletConnected) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-[#FDFCFA]">
        <div className="max-w-md w-full text-center">
          <div className="bg-[#FDFCFA] border-2 border-gray-200 rounded-2xl p-8 shadow-xl">
            <div className="mb-6">
              <h1 className="text-3xl font-bold text-gray-900 mb-3">Welcome</h1>
              <p className="text-gray-600 mb-6">
                Please connect your wallet to access the platform.
              </p>
            </div>
            <div className="flex justify-center">
              <WalletConnect />
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Redirecting...
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#FDFCFA]">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#e27d0f] border-t-transparent mx-auto mb-4"></div>
        <p className="text-gray-600">Redirecting...</p>
      </div>
    </div>
  )
}

