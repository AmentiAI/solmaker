'use client'

import { useState, useEffect } from 'react'
import { useWallet } from '@/lib/wallet/compatibility'
import { useProfile } from '@/lib/profile/useProfile'

interface Payout {
  id: string
  wallet_address: string
  tx_id: string
  amount_sats: number
  ordmaker_count: number
  share_percentage: number
  created_at: string
  total_revenue_sats: number | null
  total_payout_amount_sats: number | null
}

interface PayoutsData {
  payouts: Payout[]
  total_received_sats: number
  total_payouts: number
}

interface OwedData {
  ordmaker_count: number
  total_supply: number
  share_percentage: number
  unpaid_payout_amount_sats: number
  sats_owed: number
  last_payout_at: string | null
}

interface PreviewData {
  success: boolean
  opted_in: boolean
  in_preview?: boolean
  wallet_address: string
  watching_wallet: string | null
  preview_data?: {
    total_revenue_sats: number
    payout_amount_sats: number
    total_holders: number
    total_ordmakers: number
    last_payout_at: string
  }
  user_data?: {
    ordmaker_count: number
    amount_sats: number
    share_percentage: number
  }
  message?: string
}

export default function PayoutsPage() {
  const { isConnected, currentAddress } = useWallet()
  const { profile, updateProfile, refreshProfile } = useProfile()
  const [payoutsData, setPayoutsData] = useState<PayoutsData | null>(null)
  const [owedData, setOwedData] = useState<OwedData | null>(null)
  const [previewData, setPreviewData] = useState<PreviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingOwed, setLoadingOwed] = useState(true)
  const [loadingPreview, setLoadingPreview] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [optingIn, setOptingIn] = useState(false)

  useEffect(() => {
    if (isConnected && currentAddress) {
      loadPayouts()
      loadOwed()
      loadPreview()
    } else {
      setLoading(false)
      setLoadingOwed(false)
      setLoadingPreview(false)
    }
  }, [isConnected, currentAddress])

  // Debug: Log profile changes
  useEffect(() => {
    console.log('[Payouts Page] Profile updated:', profile)
    console.log('[Payouts Page] Profile optIn value:', profile?.optIn)
    console.log('[Payouts Page] Profile optIn type:', typeof profile?.optIn)
  }, [profile])

  const loadPayouts = async () => {
    if (!currentAddress) return

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/payouts?wallet_address=${encodeURIComponent(currentAddress)}`)
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to load payouts')
      }

      const data = await response.json()
      setPayoutsData(data)
    } catch (err: any) {
      console.error('Error loading payouts:', err)
      setError(err.message || 'Failed to load payouts')
    } finally {
      setLoading(false)
    }
  }

  const loadOwed = async () => {
    if (!currentAddress) return

    setLoadingOwed(true)

    try {
      const response = await fetch(`/api/payouts/owed?wallet_address=${encodeURIComponent(currentAddress)}`)
      
      if (!response.ok) {
        const errorData = await response.json()
        console.warn('Failed to load owed amount:', errorData.error)
        return
      }

      const data = await response.json()
      setOwedData(data)
    } catch (err: any) {
      console.error('Error loading owed amount:', err)
      // Don't show error for owed amount, just log it
    } finally {
      setLoadingOwed(false)
    }
  }

  const loadPreview = async () => {
    if (!currentAddress) return

    setLoadingPreview(true)

    try {
      const response = await fetch(`/api/payouts/preview?wallet_address=${encodeURIComponent(currentAddress)}`)
      
      if (!response.ok) {
        const errorData = await response.json()
        console.warn('Failed to load preview:', errorData.error)
        return
      }

      const data = await response.json()
      setPreviewData(data)
    } catch (err: any) {
      console.error('Error loading preview:', err)
    } finally {
      setLoadingPreview(false)
    }
  }

  const formatSats = (sats: number) => {
    if (sats >= 100000000) {
      return `${(sats / 100000000).toFixed(8)} BTC`
    }
    return `${sats.toLocaleString()} sats`
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  const handleOptIn = async () => {
    if (!currentAddress || !profile) return

    // Check if user is a holder before allowing opt-in
    if (!owedData || owedData.ordmaker_count === 0) {
      setError('You must be a holder to opt-in to payouts. You currently hold 0 OrdMakers.')
      return
    }

    setOptingIn(true)
    setError(null)

    try {
      console.log('[Opt-In] Current profile before update:', profile)
      const success = await updateProfile({ optIn: true })
      console.log('[Opt-In] Update result:', success)
      
      if (success) {
        // Wait a moment for database to commit
        await new Promise(resolve => setTimeout(resolve, 300))
        
        // Force refresh profile with cache-busting
        await refreshProfile()
        console.log('[Opt-In] Profile after refresh:', profile)
        
        // Reload owed data
        await loadOwed()
      } else {
        setError('Failed to opt in. Please try again.')
      }
    } catch (err: any) {
      console.error('Error opting in:', err)
      setError(err.message || 'Failed to opt in')
    } finally {
      setOptingIn(false)
    }
  }

  if (!isConnected) {
    return (
      <div className="max-w-7xl mx-auto p-8">
        <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md rounded-lg shadow p-6 text-center border border-[#9945FF]/30">
          <p className="text-white/70">Please connect your wallet to view payouts</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      {/* Hero Header */}
      <div className="bg-gradient-to-r from-[#0a0e27]/90 via-[#1a1f3a]/90 to-[#0f172a]/90 text-white border-b border-[#9945FF]/30">
        <div className="container mx-auto px-6 py-8">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <h1 className="text-4xl md:text-5xl font-black tracking-tight text-white">Payouts</h1>
              <p className="text-[#a5b4fc] mt-2 text-lg">
                View your community revenue payout history
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-8">

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-4 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-red-500/50 rounded-lg">
            <p className="text-[#EF4444]">{error}</p>
          </div>
        )}

        {/* Opt-In Card */}
        {profile && (profile.optIn !== true) && (
          <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border-2 border-yellow-500/50 rounded-lg shadow-lg p-6 mb-6">
            <h2 className="text-xl font-bold text-white mb-2">🔔 Opt-In Required</h2>
            {loadingOwed ? (
              <div className="flex items-center gap-3 mb-4">
                <div className="w-5 h-5 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-white/70">Checking holder status...</p>
              </div>
            ) : owedData && owedData.ordmaker_count > 0 ? (
              <>
                <p className="text-white/70 mb-4">
                  To receive community revenue payouts, you need to opt-in. This allows us to send payouts to your payment address.
                </p>
                <button
                  onClick={handleOptIn}
                  disabled={optingIn}
                  className="px-6 py-3 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white rounded-lg font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {optingIn ? 'Opting In...' : '✅ Opt-In to Payouts'}
                </button>
              </>
            ) : (
              <>
                <p className="text-white/70 mb-2">
                  You must be a holder to opt-in to payouts.
                </p>
                <p className="text-[#EF4444] font-semibold mb-4">
                  ❌ Not a holder - You currently hold 0 OrdMakers
                </p>
                <button
                  disabled
                  className="px-6 py-3 bg-gray-600 text-[#a8a8b8] rounded-lg font-semibold cursor-not-allowed"
                >
                  Not a Holder
                </button>
              </>
            )}
          </div>
        )}

        {/* Live Preview Card - Shows what you'd get in the NEXT payout */}
        {profile?.optIn && (
          loadingPreview ? (
            <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md rounded-lg shadow p-6 mb-6 border border-green-500/30">
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-white/70">Loading live preview...</p>
              </div>
            </div>
          ) : previewData && previewData.in_preview && previewData.preview_data && previewData.user_data ? (
            <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border-2 border-green-500/50 rounded-lg shadow-lg p-6 mb-6">
              <h2 className="text-xl font-bold text-white mb-2">🔮 Next Payout Preview</h2>
              <p className="text-sm text-[#a8a8b8]/80 mb-4">Live estimate based on current holders and accumulated revenue since last payout</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <div className="text-sm text-white/70">Your Ordmakers</div>
                  <div className="text-2xl font-semibold text-white">
                    {previewData.user_data.ordmaker_count} / {previewData.preview_data.total_ordmakers}
                  </div>
                  <div className="text-xs text-[#a8a8b8]/80 mt-1">
                    {previewData.user_data.share_percentage.toFixed(2)}% of opted-in holders
                  </div>
                </div>
                <div>
                  <div className="text-sm text-white/70">Revenue Since Last Payout</div>
                  <div className="text-lg font-semibold text-green-400">
                    {formatSats(previewData.preview_data.total_revenue_sats)}
                  </div>
                  <div className="text-xs text-[#a8a8b8]/80 mt-1">
                    30% payout pool: {formatSats(previewData.preview_data.payout_amount_sats)}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-white/70">Your Estimated Payout</div>
                  <div className="text-3xl font-bold text-green-400">
                    {formatSats(previewData.user_data.amount_sats)}
                  </div>
                  <div className="text-xs text-[#a8a8b8]/80 mt-1">
                    If snapshot taken now
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-green-500/30">
                <div>
                  <div className="text-sm text-white/70">Opted-In Holders</div>
                  <div className="text-lg font-semibold text-white">
                    {previewData.preview_data.total_holders} holders
                  </div>
                </div>
                <div>
                  <div className="text-sm text-white/70">Last Payout</div>
                  <div className="text-sm text-[#a8a8b8]/80">
                    {previewData.preview_data.last_payout_at ? new Date(previewData.preview_data.last_payout_at).toLocaleString() : 'Never'}
                  </div>
                </div>
              </div>
              {previewData.watching_wallet && (
                <div className="text-xs text-[#a8a8b8]/80 pt-3 border-t border-green-500/30">
                  Watching wallet: {previewData.watching_wallet.substring(0, 10)}...{previewData.watching_wallet.substring(previewData.watching_wallet.length - 8)}
                </div>
              )}
            </div>
          ) : previewData && !previewData.in_preview ? (
            <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border-2 border-yellow-500/50 rounded-lg shadow-lg p-6 mb-6">
              <h2 className="text-xl font-bold text-white mb-2">🔮 Next Payout Preview</h2>
              <p className="text-white/70 mb-4">{previewData.message || 'Unable to calculate preview'}</p>
              {previewData.preview_data && (
                <div className="mt-4 space-y-2 text-sm">
                  <div className="text-[#a8a8b8]/80">
                    <span className="font-semibold text-white">Revenue since last payout:</span> {formatSats(previewData.preview_data.total_revenue_sats)}
                  </div>
                  <div className="text-[#a8a8b8]/80">
                    <span className="font-semibold text-white">Payout pool:</span> {formatSats(previewData.preview_data.payout_amount_sats)}
                  </div>
                  <div className="text-[#a8a8b8]/80">
                    <span className="font-semibold text-white">Opted-in holders:</span> {previewData.preview_data.total_holders}
                  </div>
                </div>
              )}
            </div>
          ) : null
        )}


        {/* Loading State */}
        {loading ? (
          <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md rounded-lg shadow p-12 text-center border border-[#9945FF]/30">
            <div className="w-16 h-16 border-4 border-[#9945FF] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-white/70">Loading payouts...</p>
          </div>
        ) : payoutsData ? (
          <>
            {/* Summary Card */}
            <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md rounded-lg shadow p-6 mb-6 border border-[#9945FF]/30">
              <h2 className="text-xl font-bold text-white mb-4">Payout History</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-white/70">Total Received</div>
                  <div className="text-2xl font-semibold text-[#9945FF]">
                    {formatSats(payoutsData.total_received_sats)}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-white/70">Total Payouts</div>
                  <div className="text-2xl font-semibold text-white">
                    {payoutsData.total_payouts}
                  </div>
                </div>
              </div>
            </div>

            {/* Payouts List */}
            {payoutsData.payouts.length === 0 ? (
              <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md rounded-lg shadow p-12 text-center border border-[#9945FF]/30">
                <p className="text-white text-lg">No payouts yet</p>
                <p className="text-[#a8a8b8]/80 text-sm mt-2">
                  Payouts will appear here once you receive community revenue distributions.
                </p>
              </div>
            ) : (
              <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md rounded-lg shadow overflow-hidden border border-[#9945FF]/30">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-[#9945FF]/20">
                    <thead className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-white/70 uppercase tracking-wider">
                          Date
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-white/70 uppercase tracking-wider">
                          Amount
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-white/70 uppercase tracking-wider">
                          Ordmakers
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-white/70 uppercase tracking-wider">
                          Share
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-white/70 uppercase tracking-wider">
                          Transaction
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#9945FF]/20">
                      {payoutsData.payouts.map((payout) => (
                        <tr key={payout.id} className="hover:bg-[#1a1f3a]">
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                            {formatDate(payout.created_at)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-[#9945FF]">
                            {formatSats(payout.amount_sats)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                            {payout.ordmaker_count}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-white/70">
                            {payout.share_percentage.toFixed(2)}%
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <a
                              href={`https://mempool.space/tx/${payout.tx_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[#9945FF] hover:text-[#14F195] font-mono text-xs"
                            >
                              {payout.tx_id.substring(0, 16)}...
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  )
}

