'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { useWallet } from '@/lib/wallet/compatibility'
import {
  Rocket,
  Zap,
  Clock,
  Users,
  TrendingUp,
  Search,
  Filter,
  Grid3x3,
  List,
  Sparkles,
  ArrowRight,
  Plus,
  X,
  Image as ImageIcon,
  ChevronRight,
} from 'lucide-react'

interface LaunchpadCollection {
  id: string
  name: string
  description: string
  image_url: string
  total_supply: number
  minted_count: number
  mint_price: number
  is_live: boolean
  start_time?: string
  end_time?: string
  created_at: string
}

interface UserCollection {
  id: string
  name: string
  description?: string
  collection_status?: string
  is_locked?: boolean
  total_ordinals?: number
  banner_image_url?: string
  mobile_image_url?: string
}

export default function LaunchpadPage() {
  const [collections, setCollections] = useState<LaunchpadCollection[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'live' | 'upcoming' | 'ended'>('all')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  // Launch modal state
  const [showLaunchModal, setShowLaunchModal] = useState(false)
  const [userCollections, setUserCollections] = useState<UserCollection[]>([])
  const [loadingUserCollections, setLoadingUserCollections] = useState(false)
  const { isConnected, currentAddress } = useWallet()
  const router = useRouter()

  useEffect(() => {
    loadCollections()
  }, [])

  // Fetch user's collections when modal opens
  const loadUserCollections = useCallback(async () => {
    if (!currentAddress) return
    setLoadingUserCollections(true)
    try {
      const res = await fetch(`/api/collections?wallet_address=${encodeURIComponent(currentAddress)}`)
      if (res.ok) {
        const data = await res.json()
        // Show owned + collaborator collections, exclude already-live launchpad ones
        const all = [...(data.owned_collections || []), ...(data.collaborator_collections || [])]
        setUserCollections(all)
      }
    } catch (err) {
      console.error('Error loading user collections:', err)
    } finally {
      setLoadingUserCollections(false)
    }
  }, [currentAddress])

  const handleOpenLaunchModal = () => {
    if (!isConnected) return
    setShowLaunchModal(true)
    loadUserCollections()
  }

  const loadCollections = async () => {
    try {
      const response = await fetch('/api/launchpad')
      if (response.ok) {
        const data = await response.json()
        // Combine all collections from different sections
        const allCollections = [
          ...(data.active || []),
          ...(data.upcoming || []),
          ...(data.completed || [])
        ].map((col: any) => ({
          id: col.id,
          name: col.name,
          description: col.description,
          image_url: col.banner_image_url || col.mobile_image_url || '/placeholder.png',
          total_supply: col.total_supply || 0,
          minted_count: col.minted_count || 0,
          mint_price: (col.phases?.[0]?.mint_price_lamports ?? col.phases?.[0]?.mint_price_sats) ? ((col.phases[0].mint_price_lamports ?? col.phases[0].mint_price_sats) / 1_000_000_000).toFixed(4) : '0',
          is_live: col.launch_status === 'active',
          start_time: col.phases?.[0]?.start_time,
          end_time: col.phases?.[col.phases.length - 1]?.end_time,
          created_at: col.created_at
        }))
        setCollections(allCollections)
      }
    } catch (error) {
      console.error('Error loading collections:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredCollections = collections.filter((collection) => {
    const matchesSearch = 
      collection.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (collection.description && collection.description.toLowerCase().includes(searchTerm.toLowerCase()))

    if (!matchesSearch) return false

    if (filterStatus === 'all') return true

    const now = new Date()
    const startTime = collection.start_time ? new Date(collection.start_time) : null
    const endTime = collection.end_time ? new Date(collection.end_time) : null

    if (filterStatus === 'live') {
      return collection.is_live || (startTime && startTime <= now && (!endTime || endTime > now))
    }
    
    if (filterStatus === 'upcoming') {
      return startTime && startTime > now
    }
    
    if (filterStatus === 'ended') {
      return endTime && endTime < now
    }

    return true
  })

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-20 h-20 mx-auto mb-6">
            <div className="absolute inset-0 border-4 border-[var(--solana-purple)]/20 rounded-full" />
            <div className="absolute inset-0 border-4 border-[var(--solana-purple)] border-t-transparent rounded-full animate-spin" />
          </div>
          <p className="text-white text-lg font-bold">Loading Launchpad...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#050508] text-white">
      {/* Launch Collection Modal */}
      {showLaunchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowLaunchModal(false)}
          />

          {/* Modal */}
          <div className="relative w-full max-w-lg bg-gradient-to-br from-[#14141e] to-[#1a1a24] border border-[var(--solana-purple)]/30 rounded-2xl shadow-2xl shadow-[var(--solana-purple)]/10 max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-[var(--solana-purple)]/20">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-[var(--solana-purple)]/20 to-[var(--solana-green)]/20 border border-[var(--solana-purple)]/40 rounded-xl">
                  <Rocket className="h-5 w-5 text-[var(--solana-purple)]" />
                </div>
                <h2 className="text-xl font-bold text-white">Launch Collection</h2>
              </div>
              <button
                onClick={() => setShowLaunchModal(false)}
                className="p-2 rounded-lg hover:bg-white/5 transition-colors text-[var(--text-secondary)] hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto flex-1">
              <p className="text-[var(--text-secondary)] text-sm mb-4">
                Select a collection to set up its launchpad. You&apos;ll configure mint phases, pricing, and whitelists.
              </p>

              {loadingUserCollections ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-10 h-10 border-3 border-[var(--solana-purple)] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : userCollections.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-4xl mb-4 opacity-50">📦</div>
                  <p className="text-white font-semibold mb-2">No collections found</p>
                  <p className="text-[var(--text-secondary)] text-sm mb-6">
                    Create a collection first, then come back to launch it.
                  </p>
                  <Link href="/collections/create">
                    <Button variant="outline">
                      <Plus className="h-4 w-4 mr-2" />
                      Create Collection
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {userCollections.map((col) => {
                    const isAlreadyLive = col.collection_status === 'launchpad_live'
                    const isLaunchpadReady = col.collection_status === 'launchpad'
                    const statusLabel = isAlreadyLive
                      ? 'Live'
                      : isLaunchpadReady
                      ? 'Ready'
                      : col.collection_status === 'marketplace'
                      ? 'Marketplace'
                      : 'Draft'
                    const statusColor = isAlreadyLive
                      ? 'text-[var(--solana-green)]'
                      : isLaunchpadReady
                      ? 'text-[var(--solana-purple)]'
                      : 'text-[var(--text-secondary)]'

                    return (
                      <button
                        key={col.id}
                        onClick={() => {
                          setShowLaunchModal(false)
                          router.push(`/collections/${col.id}/launch`)
                        }}
                        className="w-full flex items-center gap-4 p-4 rounded-xl border border-[var(--solana-purple)]/20 hover:border-[var(--solana-purple)]/50 bg-[#0f0f1e]/50 hover:bg-[var(--solana-purple)]/5 transition-all text-left group"
                      >
                        {/* Thumbnail */}
                        <div className="w-14 h-14 rounded-lg overflow-hidden border border-[var(--solana-purple)]/20 bg-[#0a0a0f] flex-shrink-0">
                          {col.banner_image_url || col.mobile_image_url ? (
                            <img
                              src={col.banner_image_url || col.mobile_image_url}
                              alt={col.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <ImageIcon className="h-6 w-6 text-[var(--text-secondary)]/50" />
                            </div>
                          )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-semibold truncate">{col.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`text-xs font-medium ${statusColor}`}>
                              {statusLabel}
                            </span>
                            {col.is_locked && (
                              <span className="text-xs text-[var(--text-secondary)]">
                                Locked
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Arrow */}
                        <ChevronRight className="h-5 w-5 text-[var(--text-secondary)] group-hover:text-[var(--solana-purple)] transition-colors flex-shrink-0" />
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 sm:px-8 py-12">
        {/* Featured Collection Hero */}
        {filteredCollections.length > 0 && (
          <div className="relative rounded-2xl overflow-hidden mb-12 cursor-pointer" onClick={() => router.push(`/launchpad/${filteredCollections[0].id}`)}>
            <div className="relative aspect-[16/7]">
              <img
                src={filteredCollections[0].image_url}
                alt={filteredCollections[0].name}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

              <div className="absolute bottom-0 left-0 right-0 p-8 sm:p-10">
                <div className="flex items-center gap-3 mb-4">
                  <Badge className="bg-[#22c55e] text-white border-none text-sm px-4 py-1">Featured</Badge>
                  {filteredCollections[0].is_live && (
                    <Badge className="bg-[var(--solana-purple)]/20 border-[var(--solana-purple)]/40 text-[var(--solana-purple)] animate-pulse text-sm px-4 py-1">LIVE</Badge>
                  )}
                </div>

                <h1 className="text-4xl sm:text-5xl font-black text-white mb-3">{filteredCollections[0].name}</h1>
                <p className="text-[#B4B4C8] text-base sm:text-lg mb-6 line-clamp-2 max-w-3xl">{filteredCollections[0].description}</p>

                <div className="flex flex-wrap items-center gap-8 mb-6">
                  <div>
                    <p className="text-[#999] text-sm mb-1">Price</p>
                    <p className="text-[#f7931a] text-2xl font-black">{filteredCollections[0].mint_price} SOL</p>
                  </div>
                  <div>
                    <p className="text-[#999] text-sm mb-1">Minted</p>
                    <p className="text-white text-xl font-bold">{filteredCollections[0].minted_count}</p>
                  </div>
                  <div>
                    <p className="text-[#999] text-sm mb-1">Progress</p>
                    <p className="text-white text-xl font-bold">{((filteredCollections[0].minted_count / filteredCollections[0].total_supply) * 100).toFixed(0)}%</p>
                  </div>
                </div>

                <button className="px-8 py-3 bg-[#f7931a] hover:bg-[#e67010] text-white rounded-xl font-bold text-base transition-all">
                  Mint Now
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Collections Table */}
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-white">All Collections</h2>
            {isConnected && (
              <button
                onClick={handleOpenLaunchModal}
                className="px-5 py-2.5 bg-[#22c55e] hover:bg-[#16a34a] text-white rounded-lg text-sm font-semibold transition-all flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                Launch Collection
              </button>
            )}
          </div>

          {/* Table Header */}
          <div className="hidden md:grid md:grid-cols-12 gap-4 px-5 py-3 bg-[#1a1a1a] rounded-xl">
            <div className="col-span-4 text-[#999] text-xs font-semibold uppercase tracking-wider">Collection</div>
            <div className="col-span-2 text-[#999] text-xs font-semibold uppercase tracking-wider">Phase</div>
            <div className="col-span-2 text-[#999] text-xs font-semibold uppercase tracking-wider">Price</div>
            <div className="col-span-2 text-[#999] text-xs font-semibold uppercase tracking-wider">Progress</div>
            <div className="col-span-2 text-[#999] text-xs font-semibold uppercase tracking-wider text-right">Action</div>
          </div>

          {/* Table Rows */}
          {filteredCollections.slice(1).map((collection) => {
            const progress = (collection.minted_count / collection.total_supply) * 100
            return (
              <div key={collection.id} className="grid grid-cols-1 md:grid-cols-12 gap-4 p-5 bg-[#0a0a0f] rounded-xl border border-[#333] hover:border-[#f7931a]/50 transition-all">
                {/* Collection */}
                <div className="col-span-12 md:col-span-4 flex items-center gap-4">
                  <div className="w-16 h-16 rounded-lg overflow-hidden bg-black flex-shrink-0">
                    <img src={collection.image_url} alt={collection.name} className="w-full h-full object-cover" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-white font-bold text-base truncate">{collection.name}</h3>
                    <p className="text-[#999] text-sm truncate">{collection.description}</p>
                  </div>
                </div>

                {/* Phase */}
                <div className="col-span-6 md:col-span-2 flex items-center">
                  <span className="text-[var(--solana-purple)] text-sm font-semibold">Public</span>
                </div>

                {/* Price */}
                <div className="col-span-6 md:col-span-2 flex items-center">
                  <p className="text-[#f7931a] font-bold text-base">{collection.mint_price} SOL</p>
                </div>

                {/* Progress */}
                <div className="col-span-12 md:col-span-2 flex items-center">
                  <div className="w-full">
                    <div className="h-2 bg-[#1a1a1a] rounded-full overflow-hidden mb-1.5">
                      <div
                        className="h-full bg-gradient-to-r from-[var(--solana-purple)] to-[var(--solana-green)] transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <p className="text-[#999] text-xs font-medium">{progress.toFixed(0)}%</p>
                  </div>
                </div>

                {/* Action */}
                <div className="col-span-12 md:col-span-2 flex items-center md:justify-end">
                  <button
                    onClick={() => router.push(`/launchpad/${collection.id}`)}
                    className="px-5 py-2.5 bg-[#f7931a] hover:bg-[#e67010] text-white rounded-lg text-sm font-semibold transition-all w-full md:w-auto"
                  >
                    Mint Now
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// Collection Card Component
function CollectionCard({ 
  collection, 
  viewMode 
}: { 
  collection: LaunchpadCollection
  viewMode: 'grid' | 'list'
}) {
  const progress = (collection.minted_count / collection.total_supply) * 100
  const isLive = collection.is_live
  const isSoldOut = collection.minted_count >= collection.total_supply

  if (viewMode === 'list') {
    return (
      <Link href={`/launchpad/${collection.id}`}>
        <Card className="hover:scale-[1.01] transition-all duration-300 cursor-pointer">
          <CardContent className="p-6">
            <div className="flex gap-6">
              <div className="relative w-32 h-32 flex-shrink-0 rounded-xl overflow-hidden border border-[var(--solana-purple)]/30">
                <img 
                  src={collection.image_url} 
                  alt={collection.name}
                  className="w-full h-full object-cover"
                />
                {isLive && !isSoldOut && (
                  <div className="absolute top-2 right-2">
                    <Badge className="bg-[var(--solana-green)]/20 border-[var(--solana-green)]/40 text-[var(--solana-green)] animate-pulse">
                      LIVE
                    </Badge>
                  </div>
                )}
              </div>

              <div className="flex-1">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-2xl font-bold text-white mb-1">{collection.name}</h3>
                    <p className="text-[var(--text-secondary)] text-sm line-clamp-2">{collection.description}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-black text-[var(--solana-green)]">{collection.mint_price} SOL</p>
                    <p className="text-xs text-[var(--text-secondary)]">per NFT</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-[var(--text-secondary)]">{collection.minted_count} / {collection.total_supply} minted</span>
                    <div className="flex-1">
                      <div className="h-2 bg-[#0f0f1e] border border-[var(--solana-purple)]/30 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-[var(--solana-purple)] to-[var(--solana-green)] transition-all duration-500"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-[var(--solana-purple)] font-bold">{progress.toFixed(1)}%</span>
                  </div>

                  <Button className="w-full">
                    <Sparkles className="h-4 w-4 mr-2" />
                    {isSoldOut ? 'View Collection' : 'Mint Now'}
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </Link>
    )
  }

  return (
    <Link href={`/launchpad/${collection.id}`}>
      <Card className="group hover:scale-[1.02] transition-all duration-300 cursor-pointer">
        <CardContent className="p-0">
          <div className="relative aspect-video rounded-t-2xl overflow-hidden border-b border-[var(--solana-purple)]/30">
            <img
              src={collection.image_url}
              alt={collection.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
            {isLive && !isSoldOut && (
              <div className="absolute top-4 right-4">
                <Badge className="bg-[var(--solana-green)]/20 border-[var(--solana-green)]/40 text-[var(--solana-green)] animate-pulse">
                  LIVE
                </Badge>
              </div>
            )}
            {isSoldOut && (
              <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                <Badge className="bg-[var(--solana-cyan)]/20 border-[var(--solana-cyan)]/40 text-[var(--solana-cyan)] text-lg px-6 py-2">
                  SOLD OUT
                </Badge>
              </div>
            )}
          </div>

          <div className="p-4 space-y-3">
            <div>
              <h3 className="text-lg font-bold text-white mb-1 line-clamp-1">{collection.name}</h3>
              <p className="text-[var(--text-secondary)] text-xs line-clamp-2">{collection.description}</p>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-[var(--text-secondary)]">Price</p>
                <p className="text-xl font-black text-[var(--solana-green)]">{collection.mint_price} SOL</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-[var(--text-secondary)]">Minted</p>
                <p className="text-sm font-bold text-white">{collection.minted_count} / {collection.total_supply}</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="h-1.5 bg-[#0f0f1e] border border-[var(--solana-purple)]/30 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[var(--solana-purple)] to-[var(--solana-green)] transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-[var(--text-secondary)] text-right">{progress.toFixed(1)}%</p>
            </div>

            <Button className="w-full h-9 text-sm">
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              {isSoldOut ? 'View Collection' : 'Mint Now'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
