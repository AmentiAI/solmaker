'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useWallet } from '@/lib/wallet/compatibility'
import { isAdmin } from '@/lib/auth/access-control'
import { AdminSidebar } from '@/components/admin-sidebar'
import Link from 'next/link'

interface Collection {
  id: string
  name: string
  description: string | null
  wallet_address: string
  is_locked: boolean
  locked_at: string | null
  locked_by: string | null
  collection_status: string | null
  launch_status: string | null
  launched_at: string | null
  mint_ended_at: string | null
  banner_image_url: string | null
  mobile_image_url: string | null
  banner_video_url: string | null
  audio_url: string | null
  video_url: string | null
  extend_last_phase: boolean | null
  creator_royalty_wallet: string | null
  creator_royalty_percent: number | null
  hidden_from_homepage: boolean | null
  force_show_on_homepage_ticker: boolean | null
  twitter_url: string | null
  discord_url: string | null
  telegram_url: string | null
  website_url: string | null
  created_at: string
  updated_at: string
  total_ordinals: number
  minted_ordinals: number
  minted_count: number
  phase_count: number
  layer_count: number
}

export default function AdminCollectionsPage() {
  const router = useRouter()
  const { isConnected, currentAddress } = useWallet()
  const isAdminUser = isAdmin(currentAddress)

  const [collections, setCollections] = useState<Collection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [limit] = useState(50)
  const [totalPages, setTotalPages] = useState(0)

  // Filters
  const [search, setSearch] = useState('')
  const [isLockedFilter, setIsLockedFilter] = useState<string>('')
  const [collectionStatusFilter, setCollectionStatusFilter] = useState<string>('')
  const [launchStatusFilter, setLaunchStatusFilter] = useState<string>('')
  const [walletFilter, setWalletFilter] = useState<string>('')
  const [sortBy, setSortBy] = useState<string>('created_at')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')


  useEffect(() => {
    if (isConnected && isAdminUser && currentAddress) {
      loadCollections()
    }
  }, [isConnected, isAdminUser, currentAddress, page, search, isLockedFilter, collectionStatusFilter, launchStatusFilter, walletFilter, sortBy, sortOrder])

  const loadCollections = async () => {
    if (!currentAddress) return

    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        sort_by: sortBy,
        sort_order: sortOrder,
      })

      if (search) params.append('search', search)
      if (isLockedFilter) params.append('is_locked', isLockedFilter)
      if (collectionStatusFilter) params.append('collection_status', collectionStatusFilter)
      if (launchStatusFilter) params.append('launch_status', launchStatusFilter)
      // Add wallet_address to query params for server-side auth check
      params.append('wallet_address', currentAddress)
      
      // Note: Wallet filtering would need a separate 'filter_wallet' param in the API
      // For now, we'll skip it to avoid confusion with auth

      const response = await fetch(`/api/admin/collections/manage?${params}`)

      if (!response.ok) {
        if (response.status === 403) {
          setError('Unauthorized. Admin access only.')
        } else {
          const errorData = await response.json()
          setError(errorData.error || 'Failed to load collections')
        }
        setLoading(false)
        return
      }

      const data = await response.json()
      setCollections(data.collections || [])
      setTotal(data.pagination?.total || 0)
      setTotalPages(data.pagination?.totalPages || 0)
    } catch (err: any) {
      console.error('Error loading collections:', err)
      setError(err.message || 'Failed to load collections')
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = (collection: Collection) => {
    router.push(`/admin/collections/${collection.id}`)
  }

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(column)
      setSortOrder('desc')
    }
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '—'
    return new Date(dateString).toLocaleString()
  }

  if (!isConnected || !isAdminUser) {
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

  return (
    <div className="flex min-h-screen bg-[#0a0e27]">
      <AdminSidebar />
      
      <div className="flex-1 ml-64 p-8">
        <div className="max-w-[1800px] mx-auto">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-white">📁 Collections Manager</h1>
            <p className="text-white/70 mt-1">PHPMyAdmin-style collection management with filtering and editing</p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-4 cosmic-card border border-red-500/50 rounded-lg">
              <p className="text-red-400">Error: {error}</p>
            </div>
          )}

          {/* Filters */}
          <div className="cosmic-card border border-[#00d4ff]/30 rounded-lg shadow mb-6 p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-white/70 mb-1">Search</label>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Name, description, or ID"
                  className="w-full px-3 py-2 cosmic-card border border-[#00d4ff]/30 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00d4ff] focus:border-[#00d4ff]/50 placeholder:text-white/40"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-white/70 mb-1">Locked</label>
                <select
                  value={isLockedFilter}
                  onChange={(e) => setIsLockedFilter(e.target.value)}
                  className="w-full px-3 py-2 cosmic-card border border-[#00d4ff]/30 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00d4ff] focus:border-[#00d4ff]/50"
                >
                  <option value="">All</option>
                  <option value="true">Locked</option>
                  <option value="false">Unlocked</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-white/70 mb-1">Collection Status</label>
                <select
                  value={collectionStatusFilter}
                  onChange={(e) => setCollectionStatusFilter(e.target.value)}
                  className="w-full px-3 py-2 cosmic-card border border-[#00d4ff]/30 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00d4ff] focus:border-[#00d4ff]/50"
                >
                  <option value="">All</option>
                  <option value="draft">Draft</option>
                  <option value="launchpad">Launchpad</option>
                  <option value="self_inscribe">Self Inscribe</option>
                  <option value="marketplace">Marketplace</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-white/70 mb-1">Launch Status</label>
                <select
                  value={launchStatusFilter}
                  onChange={(e) => setLaunchStatusFilter(e.target.value)}
                  className="w-full px-3 py-2 cosmic-card border border-[#00d4ff]/30 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00d4ff] focus:border-[#00d4ff]/50"
                >
                  <option value="">All</option>
                  <option value="draft">Draft</option>
                  <option value="upcoming">Upcoming</option>
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-white/70 mb-1">Wallet Address</label>
                <input
                  type="text"
                  value={walletFilter}
                  onChange={(e) => setWalletFilter(e.target.value)}
                  placeholder="Filter by wallet"
                  className="w-full px-3 py-2 cosmic-card border border-[#00d4ff]/30 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00d4ff] focus:border-[#00d4ff]/50 placeholder:text-white/40"
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={() => {
                    setSearch('')
                    setIsLockedFilter('')
                  
                    setLaunchStatusFilter('')
                    setWalletFilter('')
                    setPage(1)
                  }}
                  className="px-4 py-2 cosmic-card border border-[#00d4ff]/30 hover:border-[#00d4ff]/50 text-white rounded-lg text-sm font-medium"
                >
                  Clear Filters
                </button>
              </div>
            </div>
          </div>

          {/* Collections Table */}
          <div className="cosmic-card border border-[#00d4ff]/30 rounded-lg shadow overflow-hidden">
            {loading ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 border-4 border-[#00d4ff] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-white/70">Loading collections...</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-[#00d4ff]/20">
                    <thead className="bg-[#0a0e27]/80">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-white/70 uppercase tracking-wider cursor-pointer hover:bg-[#00d4ff]/10" onClick={() => handleSort('name')}>
                          Name {sortBy === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-white/70 uppercase tracking-wider">ID</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-white/70 uppercase tracking-wider cursor-pointer hover:bg-[#00d4ff]/10" onClick={() => handleSort('wallet_address')}>
                          Owner {sortBy === 'wallet_address' && (sortOrder === 'asc' ? '↑' : '↓')}
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-white/70 uppercase tracking-wider">Stats</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-white/70 uppercase tracking-wider cursor-pointer hover:bg-[#00d4ff]/10" onClick={() => handleSort('is_locked')}>
                          Status {sortBy === 'is_locked' && (sortOrder === 'asc' ? '↑' : '↓')}
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-white/70 uppercase tracking-wider cursor-pointer hover:bg-[#00d4ff]/10" onClick={() => handleSort('created_at')}>
                          Created {sortBy === 'created_at' && (sortOrder === 'asc' ? '↑' : '↓')}
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-white/70 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#00d4ff]/20">
                      {collections.map((collection) => (
                        <tr key={collection.id} className="hover:bg-[#00d4ff]/5">
                          <td className="px-4 py-3">
                            <div className="font-medium text-white">{collection.name}</div>
                            {collection.description && (
                              <div className="text-xs text-white/60 mt-1 truncate max-w-xs">{collection.description}</div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-xs font-mono text-white/70">{collection.id.slice(0, 8)}...</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-xs font-mono text-white/70">{collection.wallet_address.slice(0, 8)}...</div>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <div className="space-y-1 text-white/80">
                              <div>Ordinals: {collection.total_ordinals}</div>
                              <div>Minted: {collection.minted_count}</div>
                              <div>Phases: {collection.phase_count}</div>
                              <div>Layers: {collection.layer_count}</div>
                              {(collection.twitter_url || collection.discord_url || collection.telegram_url || collection.website_url) && (
                                <div className="flex gap-1 mt-2 pt-2 border-t border-[#00d4ff]/20">
                                  {collection.twitter_url && (
                                    <a
                                      href={collection.twitter_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-blue-400 hover:text-blue-300"
                                      title="Twitter"
                                    >
                                      🐦
                                    </a>
                                  )}
                                  {collection.discord_url && (
                                    <a
                                      href={collection.discord_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-indigo-400 hover:text-indigo-300"
                                      title="Discord"
                                    >
                                      💬
                                    </a>
                                  )}
                                  {collection.telegram_url && (
                                    <a
                                      href={collection.telegram_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-cyan-400 hover:text-cyan-300"
                                      title="Telegram"
                                    >
                                      ✈️
                                    </a>
                                  )}
                                  {collection.website_url && (
                                    <a
                                      href={collection.website_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-green-400 hover:text-green-300"
                                      title="Website"
                                    >
                                      🌐
                                    </a>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="space-y-1">
                              {collection.is_locked && (
                                <span className="inline-block px-2 py-1 text-xs font-medium bg-red-500/20 text-red-400 border border-red-500/30 rounded">Locked</span>
                              )}
                              {collection.collection_status && (
                                <span className={`inline-block px-2 py-1 text-xs font-medium rounded ${
                                  collection.collection_status === 'launchpad' ? 'bg-[#e27d0f]/20 text-[#e27d0f] border border-[#e27d0f]/30' :
                                  collection.collection_status === 'launchpad_live' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                                  collection.collection_status === 'self_inscribe' ? 'bg-[#4561ad]/20 text-[#4561ad] border border-[#4561ad]/30' :
                                  collection.collection_status === 'marketplace' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                                  'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                                }`}>
                                  {collection.collection_status === 'draft' && '📝 Draft'}
                                  {collection.collection_status === 'launchpad' && '🚀 Launch'}
                                  {collection.collection_status === 'launchpad_live' && '🔴 Launch Live'}
                                  {collection.collection_status === 'self_inscribe' && '⚡ Inscribe'}
                                  {collection.collection_status === 'marketplace' && '💰 Market'}
                                </span>
                              )}
                              {collection.launch_status && (
                                <span className="inline-block px-2 py-1 text-xs font-medium bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded">
                                  {collection.launch_status}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-white/60">
                            {formatDate(collection.created_at)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleEdit(collection)}
                                className="px-3 py-1.5 text-xs font-medium btn-cosmic text-white rounded transition-colors"
                              >
                                Edit
                              </button>
                              <Link
                                href={`/collections/${collection.id}`}
                                target="_blank"
                                className="px-3 py-1.5 text-xs font-medium cosmic-card border border-[#00d4ff]/30 hover:border-[#00d4ff]/50 text-white rounded transition-colors"
                              >
                                View
                              </Link>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                <div className="bg-[#0a0e27]/80 px-4 py-3 flex items-center justify-between border-t border-[#00d4ff]/20">
                  <div className="text-sm text-white/70">
                    Showing <span className="font-medium text-white">{(page - 1) * limit + 1}</span> to{' '}
                    <span className="font-medium text-white">{Math.min(page * limit, total)}</span> of{' '}
                    <span className="font-medium text-white">{total}</span> collections
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPage(Math.max(1, page - 1))}
                      disabled={page === 1}
                      className="px-3 py-2 text-sm font-medium text-white cosmic-card border border-[#00d4ff]/30 hover:border-[#00d4ff]/50 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setPage(Math.min(totalPages, page + 1))}
                      disabled={page >= totalPages}
                      className="px-3 py-2 text-sm font-medium text-white cosmic-card border border-[#00d4ff]/30 hover:border-[#00d4ff]/50 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

    </div>
  )
}

