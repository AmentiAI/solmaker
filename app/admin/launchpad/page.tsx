'use client'

import { useState, useEffect } from 'react'
import { useWallet } from '@/lib/wallet/compatibility'
import { isAdmin } from '@/lib/auth/access-control'
import { AdminSidebar } from '@/components/admin-sidebar'
import Link from 'next/link'

// This is the Launchpad Hub - comprehensive overview
// For collection/phase management, see the old page at /admin/launchpad/manage

interface CollectionStats {
  id: string
  name: string
  total_supply: number
  total_mints: number
  completed_mints: number
  failed_mints: number
  pending_reveals: number
  unique_minters: number
  revenue_sats: number
  first_mint_at: string | null
  last_mint_at: string | null
  last_completed_at: string | null
  phase_mints: Array<{ phase_name: string; mint_count: number; revenue_sats: number }>
}

interface OverallStats {
  total_mints: number
  completed_mints: number
  failed_mints: number
  pending_reveals: number
  unconfirmed_commits: number
  unconfirmed_reveals: number
  collections_with_mints: number
  unique_minters: number
  total_revenue_sats: number
}

interface RecentMint {
  id: string
  mint_status: string
  commit_tx_id: string | null
  reveal_tx_id: string | null
  inscription_id: string | null
  minter_wallet: string
  created_at: string
  completed_at: string | null
  collection_name: string
}

export default function AdminLaunchpadHubPage() {
  const { isConnected, currentAddress } = useWallet()
  const isAdminUser = isAdmin(currentAddress)

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
      console.log('Stats data:', data)
      
      if (data.error) {
        setError(data.error)
        return
      }

      setOverallStats(data.overall_stats || {
        total_mints: 0,
        completed_mints: 0,
        failed_mints: 0,
        pending_reveals: 0,
        unconfirmed_commits: 0,
        unconfirmed_reveals: 0,
        collections_with_mints: 0,
        unique_minters: 0,
        total_revenue_sats: 0,
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

  const formatSats = (sats: number) => {
    if (sats >= 100000000) {
      return `${(sats / 100000000).toFixed(4)} BTC`
    }
    return `${sats.toLocaleString()} sats`
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '—'
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
    if (!confirm(`Reset mint status for "${collectionName}"?\n\nThis will:\n- Mark all phases as not completed\n- Clear the mint_ended_at timestamp\n- Remove it from "Recently Minted"\n\nDo you also want to delete test mints?`)) {
      return
    }

    const deleteTestMints = confirm('Delete test mint inscriptions for this collection?')

    setResettingCollectionId(collectionId)
    setError(null)

    try {
      const response = await fetch(`/api/admin/launchpad/reset-collection?wallet_address=${encodeURIComponent(currentAddress)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collection_id: collectionId,
          delete_test_mints: deleteTestMints,
          reset_phase_times: false, // Don't reset phase times by default
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to reset collection')
      }

      alert(`✅ ${data.message}\n\nPhases reset: ${data.phases_reset}\nTest mints deleted: ${deleteTestMints ? 'Yes' : 'No'}`)
      
      // Reload stats to reflect changes
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
    <div className="flex min-h-screen bg-gradient-to-br from-[#050510] via-[#0f0f1e] to-[#15152a]">
      <AdminSidebar />
      
      <div className="flex-1 ml-64 p-8">
        <div className="max-w-[1800px] mx-auto">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-[#00E5FF] via-[#FFD60A] to-[#00E5FF] bg-clip-text text-transparent">🚀 Launchpad Hub</h1>
            <p className="text-[#b4b4c8] mt-1">Comprehensive launchpad management - all mints, collections, and transactions</p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-4 bg-gradient-to-br from-red-900/20 to-red-800/10 border border-[#EF4444]/20/50 rounded-lg">
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
                <div className="text-sm text-[#b4b4c8]">Total Mints</div>
                <div className="text-2xl font-bold text-white">{(overallStats.completed_mints || 0).toLocaleString()}</div>
                <div className="text-xs text-[#b4b4c8] mt-1">
                  {overallStats.failed_mints || 0} failed
                </div>
              </div>
              <div className="bg-white rounded-lg shadow p-4 border-l-4 border-yellow-500">
                <div className="text-sm text-gray-600">Pending Reveals</div>
                <div className="text-2xl font-bold text-yellow-600">{overallStats.pending_reveals || 0}</div>
                <div className="text-xs text-[#a8a8b8]/80 mt-1">
                  {overallStats.unconfirmed_commits || 0} unconfirmed commits
                </div>
              </div>
              <div className="bg-white rounded-lg shadow p-4 border-l-4 border-green-500">
                <div className="text-sm text-gray-600">Total Revenue</div>
                <div className="text-2xl font-bold text-green-600">{formatSats(overallStats.total_revenue_sats || 0)}</div>
                <div className="text-xs text-[#a8a8b8]/80 mt-1">
                  {overallStats.unique_minters || 0} unique minters
                </div>
              </div>
              <div className="bg-white rounded-lg shadow p-4 border-l-4 border-purple-500">
                <div className="text-sm text-gray-600">Collections</div>
                <div className="text-2xl font-bold text-purple-600">{overallStats.collections_with_mints || 0}</div>
                <div className="text-xs text-[#a8a8b8]/80 mt-1">
                  launchpad collections
                </div>
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="bg-white rounded-lg shadow mb-6">
            <div className="flex border-b border-gray-200">
              {[
                { id: 'overview', label: '📊 Overview', icon: '📊' },
                { id: 'collections', label: '📁 Collections', icon: '📁' },
                { id: 'completed', label: '✅ Recently Minted', icon: '✅' },
                { id: 'transactions', label: '📝 All Transactions', icon: '📝' },
                { id: 'recent', label: '🕐 Recent Activity', icon: '🕐' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`px-6 py-3 font-medium text-sm border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-blue-600 text-[#9945FF]'
                      : 'border-transparent text-[#a8a8b8]/80 hover:text-gray-700'
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
                      <h3 className="font-bold text-gray-900 mb-4">Mint Status Breakdown</h3>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
                          <span className="text-sm font-medium text-gray-700">Completed (Total)</span>
                          <span className="text-lg font-bold text-green-600">{overallStats.completed_mints || 0}</span>
                        </div>
                        <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
                          <span className="text-sm font-medium text-gray-700">Total Mints</span>
                          <span className="text-lg font-bold text-[#9945FF]">{overallStats.total_mints || 0}</span>
                        </div>
                        <div className="flex justify-between items-center p-3 bg-purple-50 rounded-lg">
                          <span className="text-sm font-medium text-gray-700">Failed</span>
                          <span className="text-lg font-bold text-red-600">{overallStats.failed_mints || 0}</span>
                        </div>
                        <div className="flex justify-between items-center p-3 bg-yellow-50 rounded-lg">
                          <span className="text-sm font-medium text-gray-700">Pending Reveals</span>
                          <span className="text-lg font-bold text-yellow-600">{overallStats.pending_reveals || 0}</span>
                        </div>
                        <div className="flex justify-between items-center p-3 bg-red-50 rounded-lg">
                          <span className="text-sm font-medium text-gray-700">Failed</span>
                          <span className="text-lg font-bold text-red-600">{overallStats.failed_mints || 0}</span>
                        </div>
                        <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
                          <span className="text-sm font-medium text-gray-700">Unconfirmed Commits</span>
                          <span className="text-lg font-bold text-[#9945FF]">{overallStats.unconfirmed_commits || 0}</span>
                        </div>
                        <div className="flex justify-between items-center p-3 bg-purple-50 rounded-lg">
                          <span className="text-sm font-medium text-gray-700">Unconfirmed Reveals</span>
                          <span className="text-lg font-bold text-purple-600">{overallStats.unconfirmed_reveals || 0}</span>
                        </div>
                      </div>
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 mb-4">Financial Summary</h3>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
                          <span className="text-sm font-medium text-gray-700">Total Revenue</span>
                          <span className="text-lg font-bold text-green-600">{formatSats(overallStats.total_revenue_sats || 0)}</span>
                        </div>
                        <div className="flex justify-between items-center p-3 bg-purple-50 rounded-lg">
                          <span className="text-sm font-medium text-gray-700">Unique Minters</span>
                          <span className="text-lg font-bold text-purple-600">{overallStats.unique_minters || 0}</span>
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
                    <h3 className="font-bold text-gray-900">Launchpad Collections</h3>
                    <div className="flex gap-2">
                      <Link
                        href="/admin/collections"
                        className="px-4 py-2 bg-[#9945FF] hover:bg-[#7C3AED] text-white rounded-lg text-sm font-medium"
                      >
                        Admin Collections Manager →
                      </Link>
                    </div>
                  </div>
                  {loading ? (
                    <div className="text-center py-8">Loading...</div>
                  ) : collections.length === 0 ? (
                    <div className="text-center py-8 text-[#a8a8b8]/80">No collections with mints found</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-[#050510] border-b border-[#00E5FF]/20">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-[#a8a8b8]/80 uppercase">Collection</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-[#a8a8b8]/80 uppercase">Total Mints</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-[#a8a8b8]/80 uppercase">Completed</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-[#a8a8b8]/80 uppercase">Pending Reveals</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-[#a8a8b8]/80 uppercase">Revenue</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-[#a8a8b8]/80 uppercase">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {collections.map((collection) => (
                            <tr key={collection.id} className="hover:bg-[#0f0f1e]/50 border-b border-[#00E5FF]/20">
                              <td className="px-4 py-3">
                                <div className="font-medium text-gray-900">{collection.name}</div>
                                <div className="text-xs text-[#a8a8b8]/80">Supply: {collection.total_supply}</div>
                                {collection.phase_mints && collection.phase_mints.length > 0 && (
                                  <div className="text-xs text-gray-600 mt-1">
                                    {collection.phase_mints.map((phase, idx) => (
                                      <div key={idx} className="mt-0.5">
                                        <span className="font-medium">{phase.phase_name}:</span> {phase.mint_count} mints
                                        {phase.revenue_sats > 0 && (
                                          <span className="text-green-600 ml-1">
                                            ({formatSats(phase.revenue_sats)})
                                          </span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-900 font-bold">{collection.total_mints}</td>
                              <td className="px-4 py-3 text-sm">
                                <div className="text-[#9945FF] font-medium">{collection.completed_mints || 0}</div>
                                <div className="text-xs text-[#a8a8b8]/80">{collection.unique_minters || 0} minters</div>
                              </td>
                              <td className="px-4 py-3 text-sm text-yellow-600 font-medium">{collection.pending_reveals || 0}</td>
                              <td className="px-4 py-3 text-sm text-gray-900">{formatSats(collection.revenue_sats || 0)}</td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                  <Link
                                    href={`/admin/launchpad/transactions?collection_id=${collection.id}`}
                                    className="text-[#9945FF] hover:text-blue-800 text-sm font-medium"
                                  >
                                    View Mints →
                                  </Link>
                                  <button
                                    onClick={() => handleResetCollection(collection.id, collection.name)}
                                    disabled={resettingCollectionId === collection.id}
                                    className="text-xs px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    title="Reset mint status to remove from 'Recently Minted'"
                                  >
                                    {resettingCollectionId === collection.id ? 'Resetting...' : '🔄 Reset Status'}
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
                    <h3 className="font-bold text-gray-900">All Transactions</h3>
                    <Link
                      href="/admin/launchpad/transactions"
                      className="px-4 py-2 bg-[#9945FF] hover:bg-[#7C3AED] text-white rounded-lg text-sm font-medium"
                    >
                      Full Transaction Manager →
                    </Link>
                  </div>
                  <p className="text-gray-600 text-sm">
                    Use the full transaction manager to view, filter, check, and edit all launchpad transactions.
                  </p>
                </div>
              )}

              {/* Completed Collections Tab */}
              {activeTab === 'completed' && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="font-bold text-gray-900">Recently Minted Collections</h3>
                      <p className="text-sm text-gray-600 mt-1">
                        Collections that appear in "Recently Minted" on the public launchpad (includes collections with no mints)
                      </p>
                    </div>
                    <button
                      onClick={loadCompletedCollections}
                      disabled={loadingCompleted}
                      className="px-4 py-2 bg-gradient-to-r from-[#00E5FF] to-[#FFD60A] hover:from-[#7a35cc] hover:to-[#11c97a] text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-all shadow-lg shadow-[#00E5FF]/20"
                    >
                      {loadingCompleted ? 'Loading...' : '🔄 Refresh'}
                    </button>
                  </div>
                  {loadingCompleted ? (
                    <div className="text-center py-8">Loading...</div>
                  ) : completedCollections.length === 0 ? (
                    <div className="text-center py-8 text-[#a8a8b8]/80">No completed collections found</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-[#050510] border-b border-[#00E5FF]/20">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-[#a8a8b8]/80 uppercase">Collection</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-[#a8a8b8]/80 uppercase">Total Supply</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-[#a8a8b8]/80 uppercase">Minted</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-[#a8a8b8]/80 uppercase">Test Mints</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-[#a8a8b8]/80 uppercase">Phases</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-[#a8a8b8]/80 uppercase">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {completedCollections.map((collection) => (
                            <tr key={collection.id} className="hover:bg-[#0f0f1e]/50 border-b border-[#00E5FF]/20">
                              <td className="px-4 py-3">
                                <div className="font-medium text-gray-900">{collection.name}</div>
                                <div className="text-xs text-[#a8a8b8]/80">{collection.id}</div>
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-900">{collection.total_supply || 0}</td>
                              <td className="px-4 py-3 text-sm text-gray-900">{collection.minted_count || 0}</td>
                              <td className="px-4 py-3 text-sm text-orange-600">{collection.test_mint_count || 0}</td>
                              <td className="px-4 py-3 text-sm text-gray-600">
                                {Array.isArray(collection.phases) ? collection.phases.length : 0} phase(s)
                              </td>
                              <td className="px-4 py-3">
                                <button
                                  onClick={() => handleResetCollection(collection.id, collection.name)}
                                  disabled={resettingCollectionId === collection.id}
                                  className="text-xs px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  title="Reset mint status to remove from 'Recently Minted'"
                                >
                                  {resettingCollectionId === collection.id ? 'Resetting...' : '🔄 Reset Status'}
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
                  <h3 className="font-bold text-gray-900 mb-4">Recent Mint Activity</h3>
                  {loading ? (
                    <div className="text-center py-8">Loading...</div>
                  ) : recentMints.length === 0 ? (
                    <div className="text-center py-8 text-[#a8a8b8]/80">No recent mints</div>
                  ) : (
                    <div className="space-y-2">
                      {recentMints.map((mint) => (
                        <div key={mint.id} className="flex items-center justify-between p-4 bg-gradient-to-br from-[#0f0f1e]/90 to-[#15152a]/90 border border-[#00E5FF]/20 rounded-lg hover:from-[#15152a] hover:to-[#0f0f1e]">
                          <div className="flex-1">
                            <div className="flex items-center gap-3">
                              <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                mint.mint_status === 'completed' ? 'bg-green-100 text-green-800' :
                                mint.mint_status === 'failed' ? 'bg-red-100 text-red-800' :
                                'bg-yellow-100 text-yellow-800'
                              }`}>
                                {mint.mint_status}
                              </span>
                              <span className="font-medium text-gray-900">{mint.collection_name}</span>
                              <span className="text-sm text-[#a8a8b8]/80 font-mono">
                                {mint.minter_wallet.slice(0, 8)}...{mint.minter_wallet.slice(-6)}
                              </span>
                            </div>
                            <div className="text-xs text-[#a8a8b8]/80 mt-1">
                              {formatDate(mint.created_at)}
                              {mint.completed_at && ` • Completed: ${formatDate(mint.completed_at)}`}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {mint.commit_tx_id && (
                              <a
                                href={`https://mempool.space/tx/${mint.commit_tx_id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-[#9945FF] hover:text-blue-800"
                              >
                                Commit
                              </a>
                            )}
                            {mint.reveal_tx_id && (
                              <a
                                href={`https://mempool.space/tx/${mint.reveal_tx_id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-[#9945FF] hover:text-blue-800"
                              >
                                Reveal
                              </a>
                            )}
                            {mint.inscription_id && (
                              <a
                                href={`https://ordinals.com/inscription/${mint.inscription_id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-purple-600 hover:text-purple-800"
                              >
                                Inscription
                              </a>
                            )}
                            <Link
                              href={`/admin/launchpad/transactions?transaction_id=${mint.id}`}
                              className="text-xs text-gray-600 hover:text-gray-800"
                            >
                              Edit →
                            </Link>
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
    </div>
  )
}
