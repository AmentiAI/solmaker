'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useWallet } from '@/lib/wallet/compatibility'
import { LaunchpadTicker } from './components/LaunchpadTicker'
import { LaunchpadSearchBar } from './components/LaunchpadSearchBar'
import { FeaturedCarousel } from './components/FeaturedCarousel'
import { CompletedMintsGrid } from './components/CompletedMintsGrid'
import {
  Rocket,
  Plus,
  X,
  Image as ImageIcon,
  ChevronRight,
  TrendingUp,
  Users,
  Flame,
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
  const [currentSlide, setCurrentSlide] = useState(0)

  // Launch modal state
  const [showLaunchModal, setShowLaunchModal] = useState(false)
  const [userCollections, setUserCollections] = useState<UserCollection[]>([])
  const [loadingUserCollections, setLoadingUserCollections] = useState(false)
  const { isConnected, currentAddress } = useWallet()
  const router = useRouter()

  // Compute filtered and separated collections
  const filteredCollections = useMemo(() => {
    return collections.filter((collection) => {
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
  }, [collections, searchTerm, filterStatus])

  const activeCollections = useMemo(() => {
    return filteredCollections.filter(c => {
      const isSoldOut = c.minted_count >= c.total_supply
      const now = new Date()
      const endTime = c.end_time ? new Date(c.end_time) : null
      const hasEnded = endTime && endTime < now
      return !isSoldOut && !hasEnded
    })
  }, [filteredCollections])

  const completedCollections = useMemo(() => {
    return filteredCollections.filter(c => {
      const isSoldOut = c.minted_count >= c.total_supply
      const now = new Date()
      const endTime = c.end_time ? new Date(c.end_time) : null
      const hasEnded = endTime && endTime < now
      return isSoldOut || hasEnded
    })
  }, [filteredCollections])

  useEffect(() => {
    loadCollections()
  }, [])

  // Auto-rotate slideshow every 5 seconds
  useEffect(() => {
    if (activeCollections.length <= 1) return

    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % activeCollections.length)
    }, 5000)

    return () => clearInterval(interval)
  }, [activeCollections.length])

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

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-20 h-20 mx-auto mb-6">
            <div className="absolute inset-0 border-4 border-[#D4AF37]/20" />
            <div className="absolute inset-0 border-4 border-[#D4AF37] border-t-transparent animate-spin" />
          </div>
          <p className="text-white text-lg font-bold uppercase tracking-wide">Loading Launchpad...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      {/* Hero Header */}
      <div className="relative bg-[#0a0a0a] text-white border-b border-[#404040] overflow-hidden -mx-6 lg:-mx-12 px-6 lg:px-12 mb-8">
        <div className="w-full py-12 relative z-10">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            <div>
              <h1 className="text-5xl md:text-6xl font-extrabold tracking-wide text-[#D4AF37] mb-3 uppercase">
                Launchpad
              </h1>
              <p className="text-[#808080] text-lg font-medium">
                Discover and mint from the latest NFT collections on Solana
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Top Ticker Bar */}
      <LaunchpadTicker
        activeCollectionsCount={activeCollections.length}
        totalMintsCount={filteredCollections.reduce((acc, c) => acc + c.minted_count, 0)}
        completedCollectionsCount={completedCollections.length}
        isConnected={isConnected}
        onLaunchClick={handleOpenLaunchModal}
      />

      {/* Search and Filter Bar */}
      <LaunchpadSearchBar
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        filterStatus={filterStatus}
        onFilterChange={setFilterStatus}
      />

      {/* Launch Collection Modal */}
      {showLaunchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowLaunchModal(false)}
          />

          {/* Modal */}
          <div className="relative w-full max-w-lg bg-[#1a1a1a] border border-[#D4AF37]/40 shadow-2xl max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-[#404040]">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-[#0a0a0a] border border-[#D4AF37]/40">
                  <Rocket className="h-5 w-5 text-[#D4AF37]" />
                </div>
                <h2 className="text-xl font-bold text-white uppercase tracking-wide">Launch Collection</h2>
              </div>
              <button
                onClick={() => setShowLaunchModal(false)}
                className="p-2 hover:bg-[#404040] transition-colors text-[#808080] hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto flex-1">
              <p className="text-[#808080] text-sm mb-4">
                Select a collection to set up its launchpad. You&apos;ll configure mint phases, pricing, and whitelists.
              </p>

              {loadingUserCollections ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-10 h-10 border-3 border-[#D4AF37] border-t-transparent animate-spin" />
                </div>
              ) : userCollections.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-4xl mb-4 opacity-50">📦</div>
                  <p className="text-white font-semibold mb-2">No collections found</p>
                  <p className="text-[#808080] text-sm mb-6">
                    Create a collection first, then come back to launch it.
                  </p>
                  <Link href="/collections/create" className="inline-flex items-center gap-2 px-6 py-3 bg-[#1a1a1a] border border-[#D4AF37] hover:bg-[#D4AF37] hover:text-black text-white font-bold transition-all uppercase tracking-wide">
                    <Plus className="h-4 w-4" />
                    Create Collection
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
                      ? 'text-[#D4AF37]'
                      : isLaunchpadReady
                      ? 'text-[#D4AF37]'
                      : 'text-[#808080]'

                    return (
                      <button
                        key={col.id}
                        onClick={() => {
                          setShowLaunchModal(false)
                          router.push(`/collections/${col.id}/launch`)
                        }}
                        className="w-full flex items-center gap-4 p-4 border border-[#404040] hover:border-[#D4AF37] bg-[#0a0a0a] hover:bg-[#1a1a1a] transition-all text-left group"
                      >
                        {/* Thumbnail */}
                        <div className="w-14 h-14 overflow-hidden border border-[#404040] bg-[#0a0a0a] flex-shrink-0">
                          {col.banner_image_url || col.mobile_image_url ? (
                            <img
                              src={col.banner_image_url || col.mobile_image_url}
                              alt={col.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <ImageIcon className="h-6 w-6 text-[#808080]/50" />
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
                              <span className="text-xs text-[#808080]">
                                Locked
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Arrow */}
                        <ChevronRight className="h-5 w-5 text-[#808080] group-hover:text-[#D4AF37] transition-colors flex-shrink-0" />
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Featured Carousel Section */}
      <FeaturedCarousel
        collections={activeCollections}
        currentSlide={currentSlide}
        onSlideChange={setCurrentSlide}
      />

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 pb-24">
        {filteredCollections.length === 0 ? (
          <div className="text-center py-24">
            <div className="text-6xl mb-6">🚀</div>
            <h2 className="text-2xl font-bold text-white mb-4 uppercase">No Collections Available</h2>
            <p className="text-[#808080]">Check back soon for new launches!</p>
          </div>
        ) : (
          <>
            {/* Completed Collections Section */}
            <CompletedMintsGrid collections={completedCollections} />
          </>
        )}
      </div>
    </div>
  )
}
