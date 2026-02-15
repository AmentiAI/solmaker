'use client'

import { useState, useEffect } from 'react'
import { useWallet } from '@/lib/wallet/compatibility'
import { isAdmin } from '@/lib/auth/access-control'
import Link from 'next/link'

interface Holder {
  wallet_address: string
  payment_address?: string | null
  opt_in?: boolean
  count: number
  share?: number
  amount_sats?: number
}

interface RevenueData {
  last_payout_at: string | null
  completed_mints: number
  mint_revenue_sats: number
  credit_purchase_revenue_sats: number
  credit_purchase_revenue_share_sats: number
  total_revenue_sats: number
  mint_payout_sats: number
  credit_purchase_payout_sats: number
  payout_amount_sats: number
  total_supply: number
}

export default function AdminCommunityPayoutsPage() {
  const { isConnected, currentAddress } = useWallet()
  const isAdminUser = isAdmin(currentAddress)

  const [revenueData, setRevenueData] = useState<RevenueData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [holders, setHolders] = useState<Holder[]>([])
  const [snapshotLoading, setSnapshotLoading] = useState(false)
  const [psbtData, setPsbtData] = useState<any>(null)
  const [buildingPsbt, setBuildingPsbt] = useState(false)
  const [walletBalance, setWalletBalance] = useState<{ balance_sats: number; utxo_count: number; address: string } | null>(null)
  const [loadingBalance, setLoadingBalance] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [shouldBroadcast, setShouldBroadcast] = useState(false)
  const [updatingTimestamp, setUpdatingTimestamp] = useState(false)
  const [optInFilter, setOptInFilter] = useState<'all' | 'opted-in' | 'not-opted-in'>('all')

  useEffect(() => {
    if (isConnected && isAdminUser && currentAddress) {
      loadRevenue()
      loadBalance()
    }
  }, [isConnected, isAdminUser, currentAddress])

  const loadRevenue = async () => {
    if (!currentAddress) return

    setLoading(true)
    setError(null)

    try {
      // Add cache-busting timestamp to ensure fresh data
      const cacheBuster = Date.now()
      const response = await fetch(`/api/admin/community-payouts/revenue?wallet_address=${encodeURIComponent(currentAddress)}&_t=${cacheBuster}`)
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to load revenue')
      }

      const data = await response.json()
      setRevenueData(data)
      console.log('[Revenue] Loaded revenue data:', data)
    } catch (err: any) {
      console.error('Error loading revenue:', err)
      setError(err.message || 'Failed to load revenue')
    } finally {
      setLoading(false)
    }
  }

  const loadBalance = async () => {
    if (!currentAddress) return

    setLoadingBalance(true)
    try {
      const response = await fetch(`/api/admin/community-payouts/balance?wallet_address=${encodeURIComponent(currentAddress)}`)
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to load balance')
      }

      const data = await response.json()
      setWalletBalance(data)
    } catch (err: any) {
      console.error('Error loading balance:', err)
      // Don't show error for balance, just log it
    } finally {
      setLoadingBalance(false)
    }
  }

  const handleTakeSnapshot = async () => {
    if (!currentAddress) return

    setSnapshotLoading(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const response = await fetch('/api/admin/community-payouts/holders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address: currentAddress,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to fetch holders')
      }

      const data = await response.json()
      
      if (!data.holders || data.holders.length === 0) {
        setError('No holders found in ordmaker collection')
        return
      }

      // Fetch paymentAddress and opt_in from profiles for all holders
      console.log(`🔍 Fetching profiles for ${data.holders.length} holders...`)
      const holderAddresses = data.holders.map((h: Holder) => h.wallet_address)
      
      let paymentAddressMap = new Map<string, string | null>()
      let optInMap = new Map<string, boolean>()
      let profilesWithPaymentAddress = 0
      let profilesOptedIn = 0
      let totalProfilesFound = 0
      
      try {
        const profilesResponse = await fetch('/api/admin/community-payouts/holders/profiles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            wallet_address: currentAddress,
            holder_addresses: holderAddresses,
          }),
        })
        
        if (profilesResponse.ok) {
          const profilesData = await profilesResponse.json()
          if (profilesData.profiles) {
            totalProfilesFound = profilesData.profiles.length
            profilesData.profiles.forEach((profile: any) => {
              paymentAddressMap.set(profile.wallet_address, profile.payment_address || null)
              optInMap.set(profile.wallet_address, profile.opt_in === true)
              
              if (profile.payment_address && profile.payment_address.trim() !== '') {
                profilesWithPaymentAddress++
              }
              if (profile.opt_in === true) {
                profilesOptedIn++
              }
            })
            console.log(`   ✅ Found ${totalProfilesFound} profiles: ${profilesWithPaymentAddress} with paymentAddress, ${profilesOptedIn} opted in`)
          }
        } else {
          console.warn('   ⚠️ Failed to fetch profiles, continuing without profile data')
        }
      } catch (profileError) {
        console.error('Error fetching profiles:', profileError)
        // Continue without profile data if fetch fails
      }
      
      // Merge paymentAddress and opt_in into holders
      const holdersWithPaymentAddress = data.holders.map((holder: Holder) => ({
        ...holder,
        payment_address: paymentAddressMap.get(holder.wallet_address) || null,
        opt_in: optInMap.get(holder.wallet_address) || false,
      }))
      
      // FILTER: Only include opted-in holders
      const optedInHolders = holdersWithPaymentAddress.filter((h: Holder) => h.opt_in === true)
      
      if (optedInHolders.length === 0) {
        setError('No opted-in holders found. Holders must opt-in to receive payouts.')
        setHolders([])
        return
      }
      
      // Calculate share and amount for each opted-in holder
      const TOTAL_SUPPLY = 168
      const payoutAmount = revenueData?.payout_amount_sats || 0
      
      // First pass: calculate all payouts with floor
      const holdersWithShares = optedInHolders.map((holder: Holder) => {
        const share = holder.count / TOTAL_SUPPLY
        const amountSats = Math.floor(payoutAmount * share)
        return {
          ...holder,
          share,
          amount_sats: amountSats,
        }
      })

      // Keep ALL opted-in holders (don't filter by 546 sats threshold)
      // We'll show them all, with those below threshold in red
      let validHolders = [...holdersWithShares]
      
      // Count holders below threshold
      const belowThresholdCount = validHolders.filter((h: Holder) => (h.amount_sats || 0) < 546).length
      
      // Calculate total and remainder
      let totalDistributed = validHolders.reduce((sum: number, h: Holder) => sum + (h.amount_sats || 0), 0)
      const remainder = payoutAmount - totalDistributed
      
      // Distribute remainder to largest holders to ensure total matches exactly
      if (remainder > 0 && validHolders.length > 0) {
        // Sort by amount descending, then by count descending
        validHolders.sort((a: Holder, b: Holder) => {
          const aAmount = a.amount_sats || 0
          const bAmount = b.amount_sats || 0
          if (bAmount !== aAmount) {
            return bAmount - aAmount
          }
          return b.count - a.count
        })
        
        // Distribute remainder (1 sat at a time, round-robin)
        let remainingToDistribute = remainder
        let index = 0
        
        while (remainingToDistribute > 0 && index < validHolders.length) {
          validHolders[index].amount_sats = (validHolders[index].amount_sats || 0) + 1
          remainingToDistribute -= 1
          index = (index + 1) % validHolders.length
        }
      }

      // Set all opted-in holders (they're already filtered to only opted-in)
      setHolders(validHolders)
      
      // Build detailed success message with stats
      let successMsg = `✅ Snapshot complete! Found ${data.holders.length} unique holders with ${data.total_ordmakers} total ordmakers.`
      if (totalProfilesFound > 0) {
        successMsg += `\n📊 Profile Stats: ${totalProfilesFound} with profiles, ${profilesWithPaymentAddress} with payment address, ${profilesOptedIn} opted in.`
      }
      if (validHolders.length > 0) {
        const eligibleCount = validHolders.length - belowThresholdCount
        successMsg += `\n💰 ${validHolders.length} opted-in holders found: ${eligibleCount} eligible for payout (≥546 sats), ${belowThresholdCount} below threshold (<546 sats).`
      } else {
        successMsg += `\n⚠️ No opted-in holders found.`
      }
      successMsg += `\n📦 Pieces fetched: ${data.pieces_fetched || 'N/A'}`
      
      setSuccessMessage(successMsg)
      
      // Auto-hide success message after 8 seconds (longer since it has more info)
      setTimeout(() => setSuccessMessage(null), 8000)
    } catch (err: any) {
      console.error('Error taking snapshot:', err)
      setError(err.message || 'Failed to take snapshot')
    } finally {
      setSnapshotLoading(false)
    }
  }

  const handleBuildPsbt = async () => {
    if (!currentAddress || !revenueData || holders.length === 0) return

    setBuildingPsbt(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const response = await fetch('/api/admin/community-payouts/build-psbt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address: currentAddress,
          holders: holders.map(h => ({
            wallet_address: h.wallet_address,
            count: h.count,
          })),
          total_revenue_sats: revenueData.total_revenue_sats,
          payout_amount_sats: revenueData.payout_amount_sats,
          should_broadcast: shouldBroadcast,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to build PSBT')
      }

      const data = await response.json()
      setPsbtData(data)
      
      if (shouldBroadcast && data.broadcasted) {
        setSuccessMessage(`✅ PSBT created and broadcasted successfully! Transaction ID: ${data.tx_id}. View on mempool.space below.`)
        // If broadcasted, wait a moment for database to commit, then reload
        await new Promise(resolve => setTimeout(resolve, 500))
      } else if (shouldBroadcast && !data.broadcasted) {
        setSuccessMessage(`⚠️ PSBT created but broadcast failed. Transaction ID: ${data.tx_id}. Review details below.`)
      } else {
        setSuccessMessage(`✅ PSBT created successfully! Transaction ID: ${data.tx_id}. Review the details below. ${shouldBroadcast ? '' : '(Not broadcasted - checkbox was unchecked)'}`)
      }
      
      // Auto-hide success message after 8 seconds
      setTimeout(() => setSuccessMessage(null), 8000)
      
      // Reload revenue and balance to show updated state
      await loadRevenue()
      await loadBalance()
    } catch (err: any) {
      console.error('Error building PSBT:', err)
      setError(err.message || 'Failed to build PSBT')
    } finally {
      setBuildingPsbt(false)
    }
  }

  const formatSats = (sats: number) => {
    if (sats >= 100000000) {
      return `${(sats / 100000000).toFixed(8)} BTC`
    }
    return `${sats.toLocaleString()} sats`
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never'
    return new Date(dateString).toLocaleString()
  }

  const handleUpdateLastPayout = async () => {
    if (!currentAddress) return

    setUpdatingTimestamp(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const response = await fetch(`/api/admin/community-payouts/update-last-payout?wallet_address=${encodeURIComponent(currentAddress)}`, {
        method: 'POST',
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update last payout timestamp')
      }

      const data = await response.json()
      setSuccessMessage(`✅ Last payout timestamp updated to: ${new Date(data.snapshot_taken_at).toLocaleString()}`)
      
      // Auto-hide success message after 5 seconds
      setTimeout(() => setSuccessMessage(null), 5000)
      
      // Wait a moment for database to commit, then reload revenue with cache-busting
      await new Promise(resolve => setTimeout(resolve, 500))
      await loadRevenue()
    } catch (err: any) {
      console.error('Error updating last payout timestamp:', err)
      setError(err.message || 'Failed to update last payout timestamp')
    } finally {
      setUpdatingTimestamp(false)
    }
  }

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#050510] via-[#0f0f1e] to-[#15152a] p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-gradient-to-br from-[#0f0f1e]/90 to-[#15152a]/90 border border-[#00E5FF]/20 rounded-lg shadow p-6 text-center">
            <p className="text-[#b4b4c8]">Please connect your wallet</p>
          </div>
        </div>
      </div>
    )
  }

  if (!isAdminUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#050510] via-[#0f0f1e] to-[#15152a] p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-gradient-to-br from-[#0f0f1e]/90 to-[#15152a]/90 border border-[#00E5FF]/20 rounded-lg shadow p-6 text-center">
            <p className="text-[#EF4444] font-semibold">Unauthorized. Admin access only.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
        <div className="max-w-[1800px] mx-auto">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-[#00E5FF] via-[#FFD60A] to-[#00E5FF] bg-clip-text text-transparent">Community Payouts</h1>
                <p className="text-[#b4b4c8] mt-1">Track revenue and distribute 30% to ordmaker collection holders</p>
              </div>
        
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-4 bg-gradient-to-br from-red-900/20 to-red-800/10 border border-[#EF4444]/20/50 rounded-lg flex items-center justify-between">
              <p className="text-red-300">{error}</p>
              <button
                onClick={() => setError(null)}
                className="text-red-700 hover:text-red-900 ml-4"
              >
                ×
              </button>
            </div>
          )}

          {/* Success Message */}
          {successMessage && (
            <div className="mb-4 p-4 bg-gradient-to-br from-green-900/20 to-green-800/10 border border-green-700/50 rounded-lg">
              <div className="flex items-start justify-between">
                <div className="text-green-700 whitespace-pre-line flex-1">{successMessage}</div>
                <button
                  onClick={() => setSuccessMessage(null)}
                  className="text-green-700 hover:text-green-900 ml-4 flex-shrink-0"
                >
                  ×
                </button>
              </div>
            </div>
          )}

          {/* Top Section: Wallet Balance, Total Summary, and Build PSBT Button */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              {/* Wallet Balance */}
              <div className="border-r border-gray-200 pr-6">
                <div className="text-sm text-gray-600 mb-1">Wallet Balance</div>
                {loadingBalance ? (
                  <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                ) : walletBalance ? (
                  <>
                    <div className="text-2xl font-bold text-gray-900">{formatSats(walletBalance.balance_sats)}</div>
                    <div className="text-xs text-[#a8a8b8]/80 mt-1">
                      {walletBalance.utxo_count} UTXO{walletBalance.utxo_count !== 1 ? 's' : ''} • {walletBalance.address.substring(0, 20)}...
                    </div>
                  </>
                ) : (
                  <div className="text-lg text-[#a8a8b8]">N/A</div>
                )}
              </div>

              {/* Total Summary (from holders table) */}
              {holders.length > 0 && (
                <div className="border-r border-gray-200 pr-6">
                  <div className="text-sm text-gray-600 mb-1">Total Payout</div>
                  <div className="text-2xl font-bold text-[#9945FF]">
                    {formatSats(holders.reduce((sum, h) => sum + (h.amount_sats || 0), 0))}
                  </div>
                  <div className="text-xs text-[#a8a8b8]/80 mt-1">
                    {holders.length} holders • {holders.reduce((sum, h) => sum + h.count, 0)} ordmakers • 100%
                  </div>
                </div>
              )}

              {/* Affordability Check */}
              {walletBalance && holders.length > 0 && (
                <div>
                  <div className="text-sm text-gray-600 mb-1">Can Afford?</div>
                  {(() => {
                    const totalPayout = holders.reduce((sum, h) => sum + (h.amount_sats || 0), 0)
                    const estimatedFee = Math.ceil((250 + (holders.length * 34)) * 10) // Rough estimate
                    const totalNeeded = totalPayout + estimatedFee
                    const canAfford = walletBalance.balance_sats >= totalNeeded
                    return (
                      <>
                        <div className={`text-2xl font-bold ${canAfford ? 'text-green-600' : 'text-red-600'}`}>
                          {canAfford ? '✅ Yes' : '❌ No'}
                        </div>
                        <div className="text-xs text-[#a8a8b8]/80 mt-1">
                          Need: {formatSats(totalNeeded)} • Have: {formatSats(walletBalance.balance_sats)}
                        </div>
                      </>
                    )
                  })()}
                </div>
              )}
            </div>

            {/* Build PSBT Button */}
            {holders.length > 0 && revenueData && (
              <div className="pt-6 border-t border-gray-200">
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={shouldBroadcast}
                      onChange={(e) => setShouldBroadcast(e.target.checked)}
                      className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
                    />
                    <span className="text-sm font-medium text-gray-700">
                      Real broadcast
                    </span>
                  </label>
                  <button
                    onClick={handleBuildPsbt}
                    disabled={buildingPsbt || !revenueData || !walletBalance || 
                      walletBalance.balance_sats < (holders.reduce((sum, h) => sum + (h.amount_sats || 0), 0) + 10000)}
                    className="flex-1 px-6 py-3 bg-gradient-to-r from-[#FFD60A] to-[#00E5FF] hover:from-[#11c97a] hover:to-[#7a35cc] text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#FFD60A]/20"
                  >
                    {buildingPsbt ? (shouldBroadcast ? 'Building & Broadcasting PSBT...' : 'Building PSBT...') : '💰 Build PSBT & Distribute Payouts'}
                  </button>
                </div>
                {!shouldBroadcast && (
                  <p className="mt-2 text-xs text-[#a8a8b8]/80">
                    ⓘ Unchecked: Will create PSBT report only (no broadcast). Check to actually broadcast the transaction.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Revenue Summary */}
          {loading ? (
            <div className="bg-white rounded-lg shadow p-12 text-center mb-6">
              <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-gray-600">Loading revenue data...</p>
            </div>
          ) : revenueData ? (
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">Revenue Summary</h2>
                <button
                  onClick={handleUpdateLastPayout}
                  disabled={updatingTimestamp}
                  className="px-4 py-2 bg-gradient-to-r from-[#00E5FF] to-[#FFD60A] hover:from-[#7a35cc] hover:to-[#11c97a] text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#00E5FF]/20"
                  title="Update the last payout timestamp to now (useful if it didn't update correctly)"
                >
                  {updatingTimestamp ? 'Updating...' : '🔄 Update Last Payout Time'}
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div>
                  <div className="text-sm text-gray-600">Last Payout</div>
                  <div className="text-lg font-semibold text-gray-900">{formatDate(revenueData.last_payout_at)}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Completed Mints</div>
                  <div className="text-lg font-semibold text-gray-900">{revenueData.completed_mints.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Total Revenue</div>
                  <div className="text-lg font-semibold text-green-600">{formatSats(revenueData.total_revenue_sats)}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Total Payout Amount</div>
                  <div className="text-lg font-semibold text-[#9945FF]">{formatSats(revenueData.payout_amount_sats)}</div>
                </div>
              </div>
              
              {/* Revenue Breakdown */}
              <div className="border-t border-gray-200 pt-4 mt-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Revenue Breakdown</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <div className="text-xs text-[#a8a8b8]/80">Mint Revenue</div>
                    <div className="text-sm font-semibold text-gray-900">{formatSats(revenueData.mint_revenue_sats || 0)}</div>
                    <div className="text-xs text-[#a8a8b8]/80 mt-1">30% Payout: {formatSats(revenueData.mint_payout_sats || 0)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-[#a8a8b8]/80">Credit Purchases</div>
                    <div className="text-sm font-semibold text-gray-900">{formatSats(revenueData.credit_purchase_revenue_sats || 0)}</div>
                    <div className="text-xs text-[#a8a8b8]/80 mt-1">50% Share: {formatSats(revenueData.credit_purchase_revenue_share_sats || 0)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-[#a8a8b8]/80">Credit Purchase Payout</div>
                    <div className="text-sm font-semibold text-[#9945FF]">{formatSats(revenueData.credit_purchase_payout_sats || 0)}</div>
                    <div className="text-xs text-[#a8a8b8]/80 mt-1">30% of 50% (15% total)</div>
                  </div>
                  <div>
                    <div className="text-xs text-[#a8a8b8]/80">Combined Payout</div>
                    <div className="text-sm font-semibold text-green-600">{formatSats(revenueData.payout_amount_sats)}</div>
                    <div className="text-xs text-[#a8a8b8]/80 mt-1">Mint (30%) + Credit (15%)</div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {/* Take Snapshot Section */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Take Snapshot</h2>
            <p className="text-sm text-gray-600 mb-4">
              Automatically fetch all holders from the ordmaker collection via Magic Eden API.
              This will paginate through all pieces (100 at a time) and build a unique wallet list.
            </p>
            {snapshotLoading && (
              <div className="mb-4 p-4 bg-gradient-to-br from-[#0f0f1e]/90 to-[#15152a]/90 border border-[#00E5FF]/20 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  <p className="text-[#14F195]">Fetching all holders from Magic Eden API... This may take a few minutes.</p>
                </div>
              </div>
            )}
            <button
              onClick={handleTakeSnapshot}
              disabled={snapshotLoading}
              className="px-6 py-3 bg-gradient-to-r from-[#00E5FF] to-[#FFD60A] hover:from-[#7a35cc] hover:to-[#11c97a] text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#00E5FF]/20"
            >
              {snapshotLoading ? '📸 Fetching Holders...' : '📸 Take Snapshot'}
            </button>
          </div>

          {/* Holders Table */}
          {holders.length > 0 ? (
            <div className="bg-white rounded-lg shadow overflow-hidden mb-6">
              <div className="p-6 border-b border-gray-200">
                  <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">Holders Snapshot (Opted-In Only)</h2>
                    <p className="text-sm text-gray-600 mt-1">
                        {(() => {
                          const filtered = optInFilter === 'all' 
                            ? holders 
                            : optInFilter === 'opted-in'
                            ? holders.filter(h => h.opt_in === true)
                            : holders.filter(h => h.opt_in !== true)
                          const belowThreshold = filtered.filter(h => (h.amount_sats || 0) < 546).length
                          const eligible = filtered.length - belowThreshold
                          return `${filtered.length} opted-in holders • ${filtered.reduce((sum, h) => sum + h.count, 0)} total ordmakers • ${eligible} eligible (≥546 sats) • ${belowThreshold} below threshold (<546 sats)`
                        })()}
                    </p>
                  </div>
                  
                  {/* Note: All holders shown are already opted-in, but keeping filter for consistency */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-[#a8a8b8]/80 italic">(All shown holders are opted-in)</span>
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-[#050510] border-b border-[#00E5FF]/20">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-[#a8a8b8]/80 uppercase">Wallet Address</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-[#a8a8b8]/80 uppercase">Payment Address</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-[#a8a8b8]/80 uppercase">Opt-In</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-[#a8a8b8]/80 uppercase">Ordmakers</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-[#a8a8b8]/80 uppercase">Share</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-[#a8a8b8]/80 uppercase">BTC Owed</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {(() => {
                      // All holders are already opted-in, but keep filter for consistency
                      const filteredHolders = optInFilter === 'all' 
                        ? holders 
                        : optInFilter === 'opted-in'
                        ? holders.filter(h => h.opt_in === true)
                        : holders.filter(h => h.opt_in !== true)
                      
                      return filteredHolders.map((holder, index) => {
                        const isBelowThreshold = (holder.amount_sats || 0) < 546
                        return (
                          <tr 
                            key={index} 
                            className={`hover:bg-[#0f0f1e]/50 ${isBelowThreshold ? 'bg-gradient-to-br from-red-900/20 to-red-800/10' : ''}`}
                          >
                            <td className={`px-4 py-3 text-sm font-mono ${isBelowThreshold ? 'text-red-900' : 'text-gray-900'}`}>
                              {holder.wallet_address}
                            </td>
                            <td className={`px-4 py-3 text-sm font-mono ${isBelowThreshold ? 'text-red-700' : 'text-gray-600'}`}>
                              {holder.payment_address ? (
                                <span className={isBelowThreshold ? 'text-red-600' : 'text-[#9945FF]'}>{holder.payment_address}</span>
                              ) : (
                                <span className="text-[#a8a8b8] italic">Not set</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              {holder.opt_in === true ? (
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-300">
                                  ✅ Opted In
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-300">
                                  ❌ Not Opted In
                                </span>
                              )}
                            </td>
                            <td className={`px-4 py-3 text-sm font-semibold ${isBelowThreshold ? 'text-red-900' : 'text-gray-900'}`}>
                              {holder.count}
                            </td>
                            <td className={`px-4 py-3 text-sm ${isBelowThreshold ? 'text-red-700' : 'text-gray-600'}`}>
                              {((holder.share || 0) * 100).toFixed(2)}%
                            </td>
                            <td className={`px-4 py-3 text-sm font-semibold ${isBelowThreshold ? 'text-red-600' : 'text-green-600'}`}>
                              {formatSats(holder.amount_sats || 0)}
                              {isBelowThreshold && (
                                <span className="ml-2 text-xs text-red-500">(Below threshold)</span>
                              )}
                            </td>
                          </tr>
                        )
                      })
                    })()}
                  </tbody>
                  <tfoot className="bg-[#050510] border-t border-[#00E5FF]/20">
                    <tr>
                      <td className="px-4 py-3 text-sm font-semibold text-gray-900">Total</td>
                      <td className="px-4 py-3 text-sm font-semibold text-[#a8a8b8] italic">-</td>
                      <td className="px-4 py-3 text-sm font-semibold text-[#a8a8b8] italic">-</td>
                      <td className="px-4 py-3 text-sm font-semibold text-gray-900">
                        {(() => {
                          const filtered = optInFilter === 'all' 
                            ? holders 
                            : optInFilter === 'opted-in'
                            ? holders.filter(h => h.opt_in === true)
                            : holders.filter(h => h.opt_in !== true)
                          return filtered.reduce((sum, h) => sum + h.count, 0)
                        })()}
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-gray-900">100%</td>
                      <td className="px-4 py-3 text-sm font-semibold text-green-600">
                        {formatSats((() => {
                          const filtered = optInFilter === 'all' 
                            ? holders 
                            : optInFilter === 'opted-in'
                            ? holders.filter(h => h.opt_in === true)
                            : holders.filter(h => h.opt_in !== true)
                          return filtered.reduce((sum, h) => sum + (h.amount_sats || 0), 0)
                        })())}
                      </td>
                    </tr>
                    <tr className="bg-gradient-to-br from-red-900/20 to-red-800/10">
                      <td colSpan={5} className="px-4 py-2 text-sm font-semibold text-red-900">
                        Below Threshold (&lt;546 sats):
                      </td>
                      <td className="px-4 py-2 text-sm font-semibold text-red-600">
                        {(() => {
                          const filtered = optInFilter === 'all' 
                            ? holders 
                            : optInFilter === 'opted-in'
                            ? holders.filter(h => h.opt_in === true)
                            : holders.filter(h => h.opt_in !== true)
                          const belowThreshold = filtered.filter(h => (h.amount_sats || 0) < 546)
                          return `${belowThreshold.length} holders • ${formatSats(belowThreshold.reduce((sum, h) => sum + (h.amount_sats || 0), 0))}`
                        })()}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h2 className="text-xl font-bold text-gray-900 mb-2">Holders Snapshot</h2>
              <p className="text-gray-600">
                No opted-in holders found. This could mean:
              </p>
              <ul className="list-disc list-inside text-gray-600 mt-2 space-y-1">
                <li>No holders have opted in to receive payouts</li>
                <li>No snapshot has been taken yet</li>
                <li>Holders need to opt-in on the /payouts page</li>
              </ul>
              <p className="text-sm text-[#a8a8b8]/80 mt-4">
                Take a snapshot to see all opted-in holders. Only opted-in holders will be shown.
              </p>
            </div>
          )}

          {/* PSBT Results */}
          {psbtData && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                {psbtData.broadcasted ? 'PSBT Created & Broadcasted' : 'PSBT Created'}
              </h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Transaction ID:</span>
                  <a
                    href={`https://mempool.space/tx/${psbtData.tx_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#9945FF] hover:text-blue-800 font-mono"
                  >
                    {psbtData.tx_id}
                  </a>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Payout:</span>
                  <span className="font-semibold text-green-600">{formatSats(psbtData.total_payout || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Fee:</span>
                  <span className="font-semibold text-gray-900">{formatSats(psbtData.fee || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Recipients:</span>
                  <span className="font-semibold text-gray-900">{psbtData.payout_count ?? 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Change:</span>
                  <span className="font-semibold text-gray-900">{formatSats(psbtData.change || 0)}</span>
                </div>
                {psbtData.broadcasted !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Broadcast Status:</span>
                    <span className={`font-semibold ${psbtData.broadcasted ? 'text-green-600' : 'text-red-600'}`}>
                      {psbtData.broadcasted ? '✅ Broadcasted' : '❌ Not Broadcasted'}
                    </span>
                  </div>
                )}
                {psbtData.broadcast_error && (
                  <div className="mt-2 p-3 bg-gradient-to-br from-red-900/20 to-red-800/10 border border-[#EF4444]/20/50 rounded-lg">
                    <p className="text-xs text-red-700 font-semibold">Broadcast Error:</p>
                    <p className="text-xs text-red-600">{psbtData.broadcast_error}</p>
                  </div>
                )}
                
                {/* Recipients List */}
                {psbtData.payouts && psbtData.payouts.length > 0 && (
                  <div className="mt-4 border-t border-gray-200 pt-4">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">
                      Recipients ({psbtData.payouts.length})
                    </h3>
                    <div className="max-h-64 overflow-y-auto space-y-2">
                      {psbtData.payouts.map((payout: any, index: number) => (
                        <div key={index} className="flex items-center justify-between p-2 bg-gradient-to-br from-[#0f0f1e]/90 to-[#15152a]/90 border border-[#00E5FF]/20 rounded text-xs">
                          <div className="flex-1 min-w-0">
                            <div className="font-mono text-gray-700 truncate" title={payout.payment_address}>
                              {payout.payment_address}
                            </div>
                            <div className="text-[#a8a8b8]/80">
                              {payout.count} ordmaker{payout.count !== 1 ? 's' : ''} ({((payout.share || 0) * 100).toFixed(2)}%)
                            </div>
                          </div>
                          <div className="ml-4 text-right">
                            <div className="font-semibold text-green-600">{formatSats(payout.amount_sats || 0)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-4 p-4 bg-gradient-to-br from-[#0f0f1e]/90 to-[#15152a]/90 border border-[#00E5FF]/20 rounded-lg">
                  {psbtData.broadcasted ? (
                    <>
                      <p className="text-xs text-green-700 mb-2">✅ Transaction has been broadcasted to the network.</p>
                      <p className="text-xs text-gray-600">View the transaction on mempool.space using the link above.</p>
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-yellow-700 mb-2">⚠️ Transaction is signed and ready to broadcast.</p>
                      <p className="text-xs text-gray-600">Review the transaction on mempool.space. Check "Real broadcast" and rebuild to actually broadcast.</p>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
    </div>
  )
}

