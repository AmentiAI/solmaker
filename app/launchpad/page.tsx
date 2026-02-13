'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useWallet } from '@/lib/wallet/compatibility'
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
    <div className="min-h-screen bg-[#0a0a0a]">
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

      {/* Hero Section */}
      <div className="relative overflow-hidden border-b border-[#404040]/40">
        <div className="relative max-w-7xl mx-auto px-6 py-16 sm:py-24">
          <div className="text-center max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#1a1a1a] border border-[#D4AF37]/40 mb-6">
              <Flame className="w-4 h-4 text-[#D4AF37]" />
              <span className="text-xs font-bold text-[#D4AF37] uppercase tracking-wider">LIVE MINTS</span>
            </div>
            <h1 className="text-5xl sm:text-7xl font-black text-white mb-6 leading-tight uppercase">
              NFT <span className="text-[#D4AF37]">Launchpad</span>
            </h1>
            <p className="text-xl text-[#808080] mb-8">
              Discover and mint the latest Solana NFT collections
            </p>

            {/* Stats */}
            <div className="flex items-center justify-center gap-8 mb-8">
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 text-3xl font-black text-white mb-1">
                  <TrendingUp className="w-6 h-6 text-[#D4AF37]" />
                  {filteredCollections.length}
                </div>
                <p className="text-xs text-[#808080] uppercase tracking-wide">Live Collections</p>
              </div>
              <div className="w-px h-12 bg-[#404040]" />
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 text-3xl font-black text-white mb-1">
                  <Users className="w-6 h-6 text-[#D4AF37]" />
                  {filteredCollections.reduce((acc, c) => acc + c.minted_count, 0)}
                </div>
                <p className="text-xs text-[#808080] uppercase tracking-wide">Total Mints</p>
              </div>
            </div>

            {isConnected && (
              <button
                onClick={handleOpenLaunchModal}
                className="px-8 py-4 bg-[#1a1a1a] border border-[#D4AF37] hover:bg-[#D4AF37] hover:text-black text-white font-bold text-lg transition-all flex items-center gap-2 mx-auto uppercase tracking-wide"
              >
                <Rocket className="w-5 h-5" />
                Launch Your Collection
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Banner Slideshow */}
      {activeCollections.length > 0 && (
        <div className="relative mb-16">
          <div className="max-w-[1600px] mx-auto px-6 py-8">
            {/* Main Slideshow */}
            <div className="relative h-[600px] overflow-hidden border border-[#D4AF37]/40 shadow-2xl">
              {activeCollections.map((collection, index) => {
                const progress = (collection.minted_count / collection.total_supply) * 100
                const isActive = index === currentSlide

                return (
                  <div
                    key={collection.id}
                    className={`absolute inset-0 transition-all duration-1000 ${
                      isActive ? 'opacity-100 scale-100' : 'opacity-0 scale-105'
                    }`}
                  >
                    {/* Background Image */}
                    <div className="absolute inset-0">
                      <img
                        src={collection.image_url}
                        alt={collection.name}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/70 to-transparent" />
                    </div>

                    {/* Content */}
                    <div className="relative h-full flex items-center">
                      <div className="max-w-3xl px-12 sm:px-16">
                        {/* Live Badge */}
                        {collection.is_live && (
                          <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#D4AF37] text-black font-bold text-sm mb-6 uppercase tracking-wider">
                            <div className="w-1 h-1 bg-black animate-pulse" />
                            LIVE NOW
                          </div>
                        )}

                        {/* Title */}
                        <h2 className="text-5xl sm:text-7xl font-black text-white mb-4 leading-tight">
                          {collection.name}
                        </h2>

                        {/* Description */}
                        <p className="text-xl text-[#808080] mb-8 line-clamp-2 max-w-2xl">
                          {collection.description}
                        </p>

                        {/* Stats */}
                        <div className="flex flex-wrap items-center gap-6 mb-8">
                          <div>
                            <p className="text-xs text-[#808080] mb-1 uppercase tracking-wide">Mint Price</p>
                            <p className="text-3xl font-black text-[#D4AF37]">{collection.mint_price} SOL</p>
                          </div>
                          <div className="w-px h-16 bg-[#404040]" />
                          <div>
                            <p className="text-xs text-[#808080] mb-1 uppercase tracking-wide">Total Supply</p>
                            <p className="text-3xl font-black text-white">{collection.total_supply}</p>
                          </div>
                          <div className="w-px h-16 bg-[#404040]" />
                          <div>
                            <p className="text-xs text-[#808080] mb-1 uppercase tracking-wide">Remaining</p>
                            <p className="text-3xl font-black text-white">{collection.total_supply - collection.minted_count}</p>
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="mb-8 max-w-xl">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs text-[#808080] uppercase tracking-wide">Minting Progress</p>
                            <p className="text-xs font-bold text-white">{progress.toFixed(0)}%</p>
                          </div>
                          <div className="h-2 bg-black/50 backdrop-blur-sm overflow-hidden border border-[#404040]">
                            <div
                              className="h-full bg-[#D4AF37] transition-all duration-500"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          <p className="text-xs text-[#808080] mt-2">{collection.minted_count} / {collection.total_supply} minted</p>
                        </div>

                        {/* CTA Button */}
                        <button
                          onClick={() => router.push(`/launchpad/${collection.id}`)}
                          className="px-10 py-5 bg-[#1a1a1a] border-2 border-[#D4AF37] hover:bg-[#D4AF37] hover:text-black text-white font-black text-xl transition-all flex items-center gap-3 uppercase tracking-wide"
                        >
                          Mint Now
                          <ChevronRight className="w-6 h-6" />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* Navigation Dots */}
              {activeCollections.length > 1 && (
                <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-3 z-10">
                  {activeCollections.map((_, index) => (
                    <button
                      key={index}
                      onClick={() => setCurrentSlide(index)}
                      className={`transition-all duration-300 ${
                        index === currentSlide
                          ? 'w-12 h-2 bg-[#D4AF37]'
                          : 'w-2 h-2 bg-white/30 hover:bg-white/50'
                      }`}
                    />
                  ))}
                </div>
              )}

              {/* Navigation Arrows */}
              {activeCollections.length > 1 && (
                <>
                  <button
                    onClick={() => setCurrentSlide((prev) => (prev - 1 + activeCollections.length) % activeCollections.length)}
                    className="absolute left-6 top-1/2 -translate-y-1/2 w-14 h-14 bg-black/50 hover:bg-black/70 backdrop-blur-sm border border-[#D4AF37]/40 flex items-center justify-center transition-all z-10"
                  >
                    <ChevronRight className="w-6 h-6 text-[#D4AF37] rotate-180" />
                  </button>
                  <button
                    onClick={() => setCurrentSlide((prev) => (prev + 1) % activeCollections.length)}
                    className="absolute right-6 top-1/2 -translate-y-1/2 w-14 h-14 bg-black/50 hover:bg-black/70 backdrop-blur-sm border border-[#D4AF37]/40 flex items-center justify-center transition-all z-10"
                  >
                    <ChevronRight className="w-6 h-6 text-[#D4AF37]" />
                  </button>
                </>
              )}
            </div>

            {/* Slideshow Counter */}
            {activeCollections.length > 1 && (
              <div className="text-center mt-6">
                <p className="text-xs text-[#808080] uppercase tracking-wide">
                  Showing {currentSlide + 1} of {activeCollections.length} active collections
                </p>
              </div>
            )}
          </div>
        </div>
      )}

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
            {completedCollections.length > 0 && (
              <div className="pt-16">
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-1 h-10 bg-[#D4AF37]" />
                  <div>
                    <h2 className="text-4xl font-black text-white uppercase">Completed Mints</h2>
                    <p className="text-[#808080] mt-1 text-sm">{completedCollections.length} successful {completedCollections.length === 1 ? 'launch' : 'launches'} on our platform</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {completedCollections.map((collection) => {
                    const isSoldOut = collection.minted_count >= collection.total_supply
                    return (
                      <div
                        key={collection.id}
                        className="group bg-[#1a1a1a] overflow-hidden border border-[#404040] hover:border-[#D4AF37] transition-all duration-300 cursor-pointer opacity-75 hover:opacity-100"
                        onClick={() => router.push(`/launchpad/${collection.id}`)}
                      >
                        {/* Image */}
                        <div className="relative aspect-square bg-[#0a0a0a]">
                          <img
                            src={collection.image_url}
                            alt={collection.name}
                            className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500"
                          />
                          {/* Completed Badge */}
                          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                            <div className="px-4 py-2 bg-[#D4AF37] backdrop-blur-sm font-black text-xs text-black uppercase tracking-wider">
                              {isSoldOut ? '✓ SOLD OUT' : '✓ COMPLETED'}
                            </div>
                          </div>
                        </div>

                        {/* Info */}
                        <div className="p-4">
                          <h3 className="text-sm font-bold text-white mb-1 truncate uppercase">{collection.name}</h3>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-[#808080]">{collection.mint_price} SOL</span>
                            <span className="text-white font-bold">{collection.minted_count}/{collection.total_supply}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
