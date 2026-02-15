'use client'

import { useState, useEffect } from 'react'
import { useWallet } from '@/lib/wallet/compatibility'
import { useAdminCheck } from '@/lib/auth/use-admin-check'
import Link from 'next/link'

interface CollectionStat {
  id: string
  name: string
  total_supply: number
  total_mints: number
  completed_mints: number
  failed_mints: number
  pending_reveals: number
  commit_confirmed: number
  reveal_broadcast: number
  unique_minters: number
  first_mint_at: string | null
  last_mint_at: string | null
  last_completed_at: string | null
}

export default function AdminLaunchpadCollectionsPage() {
  const { isConnected, currentAddress } = useWallet()
  const { isAdmin: isAdminUser } = useAdminCheck(currentAddress || null)

  const [collections, setCollections] = useState<CollectionStat[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isConnected && isAdminUser && currentAddress) {
      loadStats()
    }
  }, [isConnected, isAdminUser, currentAddress])

  const loadStats = async () => {
    if (!currentAddress) return

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/admin/launchpad/stats?wallet_address=${encodeURIComponent(currentAddress)}`)

      if (!response.ok) {
        if (response.status === 403) {
          setError('Unauthorized. Admin access only.')
        } else {
          const errorData = await response.json()
          setError(errorData.error || 'Failed to load stats')
        }
        setLoading(false)
        return
      }

      const data = await response.json()
      
      // Stats are already included in the API response
      setCollections(data.collection_stats || [])
    } catch (err: any) {
      console.error('Error loading stats:', err)
      setError(err.message || 'Failed to load stats')
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '—'
    return new Date(dateString).toLocaleString()
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
            <h1 className="text-3xl font-bold bg-gradient-to-r from-[#00E5FF] via-[#FFD60A] to-[#00E5FF] bg-clip-text text-transparent">🚀 Launchpad Collection Stats</h1>
            <p className="text-[#b4b4c8] mt-1">View mint statistics for all launched collections</p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-4 bg-gradient-to-br from-red-900/20 to-red-800/10 border border-[#EF4444]/20/50 rounded-lg">
              <p className="text-[#EF4444]">{error}</p>
            </div>
          )}

          {/* Loading State */}
          {loading ? (
            <div className="bg-gradient-to-br from-[#0f0f1e]/90 to-[#15152a]/90 border border-[#00E5FF]/20 rounded-lg shadow p-12 text-center">
              <div className="w-16 h-16 border-4 border-[#00E5FF] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-[#b4b4c8]">Loading collection stats...</p>
            </div>
          ) : collections.length === 0 ? (
            <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#9945FF]/30 rounded-lg shadow p-12 text-center">
              <p className="text-[#a8a8b8]/80 text-lg">No launched collections found</p>
            </div>
          ) : (
            <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#9945FF]/30 rounded-lg shadow overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-[#9945FF]/20 text-sm">
                  <thead className="bg-[#0a0e27]/80">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-white/70 uppercase">Collection</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-white/70 uppercase">Total Supply</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-white/70 uppercase">Minted</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-white/70 uppercase">Pending</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-white/70 uppercase">Commit Confirmed</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-white/70 uppercase">Reveal Broadcast</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-white/70 uppercase">Failed</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-white/70 uppercase">Unique Minters</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-white/70 uppercase">Last Mint</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-white/70 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#9945FF]/20">
                    {collections.map((collection) => (
                      <tr key={collection.id} className="hover:bg-[#9945FF]/5">
                        <td className="px-4 py-3">
                          <div className="font-medium text-white">{collection.name}</div>
                          <div className="text-xs font-mono text-[#a8a8b8]/80">{collection.id.slice(0, 8)}...</div>
                        </td>
                        <td className="px-4 py-3 text-white">
                          {collection.total_supply.toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-white font-semibold">{collection.completed_mints.toLocaleString()}</div>
                          <div className="text-xs text-[#a8a8b8]/80">of {collection.total_mints.toLocaleString()} total</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-[#FBBF24] font-semibold">{collection.pending_reveals.toLocaleString()}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-blue-400 font-semibold">{collection.commit_confirmed.toLocaleString()}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-purple-400 font-semibold">{collection.reveal_broadcast.toLocaleString()}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-[#EF4444] font-semibold">{collection.failed_mints.toLocaleString()}</div>
                        </td>
                        <td className="px-4 py-3 text-[#a8a8b8]">
                          {collection.unique_minters.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-xs text-[#a8a8b8]/80">
                          {formatDate(collection.last_mint_at)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/admin/launchpad/transactions?collection_id=${collection.id}`}
                              className="px-3 py-1.5 text-xs font-medium btn-cosmic text-white rounded transition-colors"
                            >
                              View Transactions
                            </Link>
                            <Link
                              href={`/${collection.id}`}
                              target="_blank"
                              className="px-3 py-1.5 text-xs font-medium bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#9945FF]/30 hover:border-[#9945FF]/50 text-white rounded transition-colors"
                            >
                              View Launchpad
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
    </div>
  )
}

