'use client'

import { useState, useEffect } from 'react'
import { useWallet } from '@/lib/wallet/compatibility'
import { isAdmin } from '@/lib/auth/access-control'
import { AdminSidebar } from '@/components/admin-sidebar'
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
  const isAdminUser = isAdmin(currentAddress)

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
      <div className="min-h-screen bg-[#0a0e27] p-8">
        <div className="max-w-7xl mx-auto">
          <div className="cosmic-card border border-[#00d4ff]/30 rounded-lg shadow p-6 text-center">
            <p className="text-white/70">Please connect your wallet</p>
          </div>
        </div>
      </div>
    )
  }

  if (!isAdminUser) {
    return (
      <div className="min-h-screen bg-[#0a0e27] p-8">
        <div className="max-w-7xl mx-auto">
          <div className="cosmic-card border border-[#00d4ff]/30 rounded-lg shadow p-6 text-center">
            <p className="text-red-400 font-semibold">Unauthorized. Admin access only.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-[#0a0e27]">
      <AdminSidebar />
      
      <div className="flex-1 ml-64 p-8">
        <div className="max-w-[1800px] mx-auto">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-white">🚀 Launchpad Collection Stats</h1>
            <p className="text-white/70 mt-1">View mint statistics for all launched collections</p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-4 cosmic-card border border-red-500/50 rounded-lg">
              <p className="text-red-400">{error}</p>
            </div>
          )}

          {/* Loading State */}
          {loading ? (
            <div className="cosmic-card border border-[#00d4ff]/30 rounded-lg shadow p-12 text-center">
              <div className="w-16 h-16 border-4 border-[#00d4ff] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-white/70">Loading collection stats...</p>
            </div>
          ) : collections.length === 0 ? (
            <div className="cosmic-card border border-[#00d4ff]/30 rounded-lg shadow p-12 text-center">
              <p className="text-white/60 text-lg">No launched collections found</p>
            </div>
          ) : (
            <div className="cosmic-card border border-[#00d4ff]/30 rounded-lg shadow overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-[#00d4ff]/20 text-sm">
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
                  <tbody className="divide-y divide-[#00d4ff]/20">
                    {collections.map((collection) => (
                      <tr key={collection.id} className="hover:bg-[#00d4ff]/5">
                        <td className="px-4 py-3">
                          <div className="font-medium text-white">{collection.name}</div>
                          <div className="text-xs font-mono text-white/60">{collection.id.slice(0, 8)}...</div>
                        </td>
                        <td className="px-4 py-3 text-white">
                          {collection.total_supply.toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-white font-semibold">{collection.completed_mints.toLocaleString()}</div>
                          <div className="text-xs text-white/60">of {collection.total_mints.toLocaleString()} total</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-yellow-400 font-semibold">{collection.pending_reveals.toLocaleString()}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-blue-400 font-semibold">{collection.commit_confirmed.toLocaleString()}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-purple-400 font-semibold">{collection.reveal_broadcast.toLocaleString()}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-red-400 font-semibold">{collection.failed_mints.toLocaleString()}</div>
                        </td>
                        <td className="px-4 py-3 text-white/80">
                          {collection.unique_minters.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-xs text-white/60">
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
                              href={`/launchpad/${collection.id}`}
                              target="_blank"
                              className="px-3 py-1.5 text-xs font-medium cosmic-card border border-[#00d4ff]/30 hover:border-[#00d4ff]/50 text-white rounded transition-colors"
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
    </div>
  )
}

