'use client'

import { useState, useEffect } from 'react'
import { useWallet } from '@/lib/wallet/compatibility'
import { useAdminCheck } from '@/lib/auth/use-admin-check'
import Link from 'next/link'

interface CollectionStats {
  id: string
  name: string
  total_supply: number
  total_mints: number
  confirmed_mints: number
  failed_mints: number
  pending_mints: number
  unique_minters: number
  revenue_lamports: number
  platform_fees_lamports: number
  first_mint_at: string | null
  last_mint_at: string | null
  last_confirmed_at: string | null
  phase_mints: Array<{ phase_name: string; mint_count: number; confirmed_count: number; revenue_lamports: number }>
}

interface OverallStats {
  total_mints: number
  confirmed_mints: number
  failed_mints: number
  pending_mints: number
  cancelled_mints: number
  collections_with_mints: number
  unique_minters: number
  total_revenue_lamports: number
  total_platform_fees_lamports: number
}

interface RecentMint {
  id: string
  mint_status: string
  mint_tx_signature: string | null
  nft_mint_address: string | null
  mint_price_lamports: number
  platform_fee_lamports: number
  minter_wallet: string
  created_at: string
  confirmed_at: string | null
  collection_name: string
}

export default function AdminLaunchpadHubPage() {
  const { isConnected, currentAddress } = useWallet()
  const { isAdmin: isAdminUser } = useAdminCheck(currentAddress || null)

  const [loading, setLoading] = useState(true)
  const [overallStats, setOverallStats] = useState<OverallStats | null>(null)
  const [collections, setCollections] = useState<CollectionStats[]>([])
  const [recentMints, setRecentMints] = useState<RecentMint[]>([])
  const [selectedCollection, setSelectedCollection] = useState<string>('')
  const [activeTab, setActiveTab] = useState<'overview' | 'collections' | 'transactions' | 'recent' | 'completed'>('overview')
  const [error, setError] = useState<string | null>(null)
  const [resettingCollectionId, setResettingCollectionId] = useState<string | null>(null)
  const [completedCollections, setCompletedCollections] = useState<any[]>([])
  const [loadingCompleted, setLoadingCompleted] = useState(false)

  useEffect(() => {
    if (isConnected && isAdminUser && currentAddress) {
      loadStats()
      if (activeTab === 'completed') {
        loadCompletedCollections()
      }
    }
  }, [isConnected, isAdminUser, currentAddress, selectedCollection, activeTab])

  const loadStats = async () => {
    if (!currentAddress) return

    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ wallet_address: currentAddress })
      if (selectedCollection) params.append('collection_id', selectedCollection)

      const response = await fetch(`/api/admin/launchpad/stats?${params}`)
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to load stats' }))
        throw new Error(errorData.error || errorData.details || 'Failed to load stats')
      }

      const data = await response.json()

      if (data.error) {
        setError(data.error)
        return
      }

      setOverallStats(data.overall_stats || {
        total_mints: 0,
        confirmed_mints: 0,
        failed_mints: 0,
        pending_mints: 0,
        cancelled_mints: 0,
        collections_with_mints: 0,
        unique_minters: 0,
        total_revenue_lamports: 0,
        total_platform_fees_lamports: 0,
      })
      setCollections(data.collection_stats || [])
      setRecentMints(data.recent_mints || [])
    } catch (error: any) {
      console.error('Error loading stats:', error)
      setError(error.message || 'Failed to load stats')
    } finally {
      setLoading(false)
    }
  }

  const formatSol = (lamports: number) => {
    const sol = lamports / 1_000_000_000
    if (sol === 0) return '0 SOL'
    if (sol < 0.001) return `${lamports.toLocaleString()} lamports`
    return `${sol.toFixed(4)} SOL`
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '\u2014'
    return new Date(dateString).toLocaleString()
  }

  const loadCompletedCollections = async () => {
    if (!currentAddress) return

    setLoadingCompleted(true)
    setError(null)
    try {
      const response = await fetch(`/api/admin/launchpad/completed-collections?wallet_address=${encodeURIComponent(currentAddress)}`)
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to load completed collections' }))
        throw new Error(errorData.error || 'Failed to load completed collections')
      }

      const data = await response.json()
      if (data.error) {
        setError(data.error)
        return
      }

      setCompletedCollections(data.collections || [])
    } catch (error: any) {
      console.error('Error loading completed collections:', error)
      setError(error.message || 'Failed to load completed collections')
    } finally {
      setLoadingCompleted(false)
    }
  }

  const handleResetCollection = async (collectionId: string, collectionName: string) => {
    if (!confirm(`Reset mint status for "${collectionName}"?\n\nThis will:\n- Mark all phases as not completed\n- Clear the mint_ended_at timestamp\n- Remove it from "Recently Minted"`)) {
      return
    }

    setResettingCollectionId(collectionId)
    setError(null)

    try {
      const response = await fetch(`/api/admin/launchpad/reset-collection?wallet_address=${encodeURIComponent(currentAddress || '')}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collection_id: collectionId,
          reset_phase_times: false,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to reset collection')
      }

      alert(`${data.message}\n\nPhases reset: ${data.phases_reset}`)

      await loadStats()
      if (activeTab === 'completed') {
        await loadCompletedCollections()
      }
    } catch (error: any) {
      console.error('Error resetting collection:', error)
      setError(error.message || 'Failed to reset collection')
    } finally {
      setResettingCollectionId(null)
    }
  }

  // Solana explorer URL helper
  const explorerUrl = (signature: string) =>
    `https://explorer.solana.com/tx/${signature}?cluster=devnet`

  if (!isConnected || !isAdminUser) {
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

  return (
    <div className="p-8">
        <div className="max-w-[1800px] mx-auto">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-[#00E5FF] via-[#FFD60A] to-[#00E5FF] bg-clip-text text-transparent">Launchpad Hub</h1>
            <p className="text-[#b4b4c8] mt-1">Solana launchpad management - mints, collections, and transactions</p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-4 bg-gradient-to-br from-red-900/20 to-red-800/10 border border-[#EF4444]/50 rounded-lg">
              <p className="text-red-300">Error: {error}</p>
            </div>
          )}

          {/* Loading State */}
          {loading ? (
            <div className="bg-gradient-to-br from-[#0f0f1e]/90 to-[#15152a]/90 border border-[#00E5FF]/20 rounded-lg shadow p-12 text-center mb-6">
              <div className="w-16 h-16 border-4 border-[#00E5FF] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-[#b4b4c8]">Loading launchpad stats...</p>
            </div>
          ) : (
            <>
          {/* Quick Stats Cards */}
          {overallStats && (
            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="bg-gradient-to-br from-[#0f0f1e]/90 to-[#15152a]/90 border border-[#00E5FF]/20 rounded-lg shadow p-4">
                <div className="text-sm text-[#b4b4c8]">Confirmed Mints</div>
                <div className="text-2xl font-bold text-white">{(overallStats.confirmed_mints || 0).toLocaleString()}</div>
                <div className="text-xs text-[#b4b4c8] mt-1">
                  {overallStats.pending_mints || 0} pending, {overallStats.failed_mints || 0} failed
                </div>
              </div>
              <div className="bg-gradient-to-br from-[#0f0f1e]/90 to-[#15152a]/90 border border-[#00E5FF]/20 rounded-lg shadow p-4">
                <div className="text-sm text-[#b4b4c8]">Creator Revenue</div>
                <div className="text-2xl font-bold text-green-400">{formatSol(overallStats.total_revenue_lamports || 0)}</div>
                <div className="text-xs text-[#b4b4c8] mt-1">
                  from confirmed mints
                </div>
              </div>
              <div className="bg-gradient-to-br from-[#0f0f1e]/90 to-[#15152a]/90 border border-[#00E5FF]/20 rounded-lg shadow p-4">
                <div className="text-sm text-[#b4b4c8]">Platform Fees</div>
                <div className="text-2xl font-bold text-[#D4AF37]">{formatSol(overallStats.total_platform_fees_lamports || 0)}</div>
                <div className="text-xs text-[#b4b4c8] mt-1">
                  {overallStats.unique_minters || 0} unique minters
                </div>
              </div>
              <div className="bg-gradient-to-br from-[#0f0f1e]/90 to-[#15152a]/90 border border-[#00E5FF]/20 rounded-lg shadow p-4">
                <div className="text-sm text-[#b4b4c8]">Collections</div>
                <div className="text-2xl font-bold text-[#9945FF]">{overallStats.collections_with_mints || 0}</div>
                <div className="text-xs text-[#b4b4c8] mt-1">
                  with mints
                </div>
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="bg-gradient-to-br from-[#0f0f1e]/90 to-[#15152a]/90 border border-[#00E5FF]/20 rounded-lg shadow mb-6">
            <div className="flex border-b border-[#00E5FF]/20">
              {[
                { id: 'overview', label: 'Overview' },
                { id: 'collections', label: 'Collections' },
                { id: 'completed', label: 'All Minted' },
                { id: 'transactions', label: 'Transactions' },
                { id: 'recent', label: 'Recent Activity' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`px-6 py-3 font-medium text-sm border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-[#9945FF] text-[#9945FF]'
                      : 'border-transparent text-[#b4b4c8] hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="p-6">
              {/* Overview Tab */}
              {activeTab === 'overview' && overallStats && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <h3 className="font-bold text-white mb-4">Mint Status Breakdown</h3>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                          <span className="text-sm font-medium text-[#b4b4c8]">Confirmed</span>
                          <span className="text-lg font-bold text-green-400">{overallStats.confirmed_mints || 0}</span>
                        </div>
                        <div className="flex justify-between items-center p-3 bg-[#9945FF]/10 border border-[#9945FF]/20 rounded-lg">
                          <span className="text-sm font-medium text-[#b4b4c8]">Total Mints (all statuses)</span>
                          <span className="text-lg font-bold text-[#9945FF]">{overallStats.total_mints || 0}</span>
                        </div>
                        <div className="flex justify-between items-center p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                          <span className="text-sm font-medium text-[#b4b4c8]">Pending / In-Progress</span>
                          <span className="text-lg font-bold text-yellow-400">{overallStats.pending_mints || 0}</span>
                        </div>
                        <div className="flex justify-between items-center p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                          <span className="text-sm font-medium text-[#b4b4c8]">Failed</span>
                          <span className="text-lg font-bold text-red-400">{overallStats.failed_mints || 0}</span>
                        </div>
                        <div className="flex justify-between items-center p-3 bg-gray-500/10 border border-gray-500/20 rounded-lg">
                          <span className="text-sm font-medium text-[#b4b4c8]">Cancelled</span>
                          <span className="text-lg font-bold text-gray-400">{overallStats.cancelled_mints || 0}</span>
                        </div>
                      </div>
                    </div>
                    <div>
                      <h3 className="font-bold text-white mb-4">Financial Summary</h3>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                          <span className="text-sm font-medium text-[#b4b4c8]">Creator Revenue</span>
                          <span className="text-lg font-bold text-green-400">{formatSol(overallStats.total_revenue_lamports || 0)}</span>
                        </div>
                        <div className="flex justify-between items-center p-3 bg-[#D4AF37]/10 border border-[#D4AF37]/20 rounded-lg">
                          <span className="text-sm font-medium text-[#b4b4c8]">Platform Fees Collected</span>
                          <span className="text-lg font-bold text-[#D4AF37]">{formatSol(overallStats.total_platform_fees_lamports || 0)}</span>
                        </div>
                        <div className="flex justify-between items-center p-3 bg-[#9945FF]/10 border border-[#9945FF]/20 rounded-lg">
                          <span className="text-sm font-medium text-[#b4b4c8]">Unique Minters</span>
                          <span className="text-lg font-bold text-[#9945FF]">{overallStats.unique_minters || 0}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Collections Tab */}
              {activeTab === 'collections' && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-white">Launchpad Collections</h3>
                    <div className="flex gap-2">
                      <Link
                        href="/admin/collections"
                        className="px-4 py-2 bg-[#9945FF] hover:bg-[#7C3AED] text-white rounded-lg text-sm font-medium"
                      >
                        Admin Collections Manager
                      </Link>
                    </div>
                  </div>
                  {collections.length === 0 ? (
                    <div className="text-center py-8 text-[#b4b4c8]">No collections with mints found</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full">
                        <thead className="border-b border-[#00E5FF]/20">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-[#b4b4c8] uppercase">Collection</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-[#b4b4c8] uppercase">Total Mints</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-[#b4b4c8] uppercase">Confirmed</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-[#b4b4c8] uppercase">Pending</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-[#b4b4c8] uppercase">Revenue</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-[#b4b4c8] uppercase">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {collections.map((collection) => (
                            <tr key={collection.id} className="border-b border-[#00E5FF]/10 hover:bg-[#00E5FF]/5">
                              <td className="px-4 py-3">
                                <div className="font-medium text-white">{collection.name}</div>
                                <div className="text-xs text-[#b4b4c8]">Supply: {collection.total_supply}</div>
                                {collection.phase_mints && collection.phase_mints.length > 0 && (
                                  <div className="text-xs text-[#b4b4c8] mt-1">
                                    {collection.phase_mints.map((phase, idx) => (
                                      <div key={idx} className="mt-0.5">
                                        <span className="font-medium text-white/70">{phase.phase_name}:</span> {phase.mint_count} mints
                                        {phase.revenue_lamports > 0 && (
                                          <span className="text-green-400 ml-1">
                                            ({formatSol(phase.revenue_lamports)})
                                          </span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3 text-sm text-white font-bold">{collection.total_mints}</td>
                              <td className="px-4 py-3 text-sm">
                                <div className="text-green-400 font-medium">{collection.confirmed_mints || 0}</div>
                                <div className="text-xs text-[#b4b4c8]">{collection.unique_minters || 0} minters</div>
                              </td>
                              <td className="px-4 py-3 text-sm text-yellow-400 font-medium">{collection.pending_mints || 0}</td>
                              <td className="px-4 py-3 text-sm text-green-400">{formatSol(collection.revenue_lamports || 0)}</td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                  <Link
                                    href={`/admin/launchpad/transactions?collection_id=${collection.id}`}
                                    className="text-[#9945FF] hover:text-[#7C3AED] text-sm font-medium"
                                  >
                                    View Mints
                                  </Link>
                                  <button
                                    onClick={() => handleResetCollection(collection.id, collection.name)}
                                    disabled={resettingCollectionId === collection.id}
                                    className="text-xs px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    title="Reset mint status"
                                  >
                                    {resettingCollectionId === collection.id ? 'Resetting...' : 'Reset Status'}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Transactions Tab */}
              {activeTab === 'transactions' && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-white">All Transactions</h3>
                    <Link
                      href="/admin/launchpad/transactions"
                      className="px-4 py-2 bg-[#9945FF] hover:bg-[#7C3AED] text-white rounded-lg text-sm font-medium"
                    >
                      Full Transaction Manager
                    </Link>
                  </div>
                  <p className="text-[#b4b4c8] text-sm">
                    Use the full transaction manager to view, filter, check, and edit all launchpad transactions.
                  </p>
                </div>
              )}

              {/* Completed Collections Tab */}
              {activeTab === 'completed' && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="font-bold text-white">All Minted Collections</h3>
                      <p className="text-sm text-[#b4b4c8] mt-1">
                        Collections with Solana mint activity
                      </p>
                    </div>
                    <button
                      onClick={loadCompletedCollections}
                      disabled={loadingCompleted}
                      className="px-4 py-2 bg-[#9945FF] hover:bg-[#7C3AED] text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-all"
                    >
                      {loadingCompleted ? 'Loading...' : 'Refresh'}
                    </button>
                  </div>
                  {loadingCompleted ? (
                    <div className="text-center py-8 text-[#b4b4c8]">Loading...</div>
                  ) : completedCollections.length === 0 ? (
                    <div className="text-center py-8 text-[#b4b4c8]">No collections with mints found</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full">
                        <thead className="border-b border-[#00E5FF]/20">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-[#b4b4c8] uppercase">Collection</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-[#b4b4c8] uppercase">Total Supply</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-[#b4b4c8] uppercase">Minted</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-[#b4b4c8] uppercase">Pending</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-[#b4b4c8] uppercase">Phases</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-[#b4b4c8] uppercase">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {completedCollections.map((collection: any) => (
                            <tr key={collection.id} className="border-b border-[#00E5FF]/10 hover:bg-[#00E5FF]/5">
                              <td className="px-4 py-3">
                                <div className="font-medium text-white">{collection.name}</div>
                                <div className="text-xs text-[#b4b4c8] font-mono">{collection.id}</div>
                              </td>
                              <td className="px-4 py-3 text-sm text-white">{collection.total_supply || 0}</td>
                              <td className="px-4 py-3 text-sm text-green-400 font-medium">{collection.minted_count || 0}</td>
                              <td className="px-4 py-3 text-sm text-yellow-400">{collection.pending_count || 0}</td>
                              <td className="px-4 py-3 text-sm text-[#b4b4c8]">
                                {Array.isArray(collection.phases) ? collection.phases.length : 0} phase(s)
                              </td>
                              <td className="px-4 py-3">
                                <button
                                  onClick={() => handleResetCollection(collection.id, collection.name)}
                                  disabled={resettingCollectionId === collection.id}
                                  className="text-xs px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  title="Reset mint status"
                                >
                                  {resettingCollectionId === collection.id ? 'Resetting...' : 'Reset Status'}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Recent Activity Tab */}
              {activeTab === 'recent' && (
                <div>
                  <h3 className="font-bold text-white mb-4">Recent Mint Activity</h3>
                  {recentMints.length === 0 ? (
                    <div className="text-center py-8 text-[#b4b4c8]">No recent mints</div>
                  ) : (
                    <div className="space-y-2">
                      {recentMints.map((mint) => (
                        <div key={mint.id} className="flex items-center justify-between p-4 bg-[#0a0a14] border border-[#00E5FF]/10 rounded-lg hover:border-[#00E5FF]/30 transition-colors">
                          <div className="flex-1">
                            <div className="flex items-center gap-3">
                              <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                mint.mint_status === 'confirmed' ? 'bg-green-500/20 text-green-400' :
                                mint.mint_status === 'failed' ? 'bg-red-500/20 text-red-400' :
                                mint.mint_status === 'cancelled' ? 'bg-gray-500/20 text-gray-400' :
                                'bg-yellow-500/20 text-yellow-400'
                              }`}>
                                {mint.mint_status}
                              </span>
                              <span className="font-medium text-white">{mint.collection_name}</span>
                              <span className="text-sm text-[#b4b4c8] font-mono">
                                {mint.minter_wallet.slice(0, 6)}...{mint.minter_wallet.slice(-4)}
                              </span>
                              {mint.mint_price_lamports > 0 && (
                                <span className="text-xs text-green-400">
                                  {formatSol(mint.mint_price_lamports)}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-[#b4b4c8] mt-1">
                              {formatDate(mint.created_at)}
                              {mint.confirmed_at && ` \u2022 Confirmed: ${formatDate(mint.confirmed_at)}`}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {mint.mint_tx_signature && (
                              <a
                                href={explorerUrl(mint.mint_tx_signature)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-[#9945FF] hover:text-[#7C3AED]"
                              >
                                View Tx
                              </a>
                            )}
                            {mint.nft_mint_address && (
                              <span className="text-xs text-[#b4b4c8] font-mono">
                                NFT: {mint.nft_mint_address.slice(0, 6)}...
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
            </>
          )}
        </div>
    </div>
  )
}
