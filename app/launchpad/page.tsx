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
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0f] via-[#050508] to-[#0a0a0f]">
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

      {/* Hero Section */}
      <div className="relative overflow-hidden">
        {/* Animated Background */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#9945FF]/10 rounded-full blur-[120px] animate-pulse" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-[#14F195]/10 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '1s' }} />
        </div>

        <div className="relative max-w-7xl mx-auto px-6 py-16 sm:py-24">
          <div className="text-center max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#9945FF]/10 border border-[#9945FF]/30 rounded-full mb-6">
              <Flame className="w-4 h-4 text-[#14F195]" />
              <span className="text-sm font-bold text-[#14F195]">LIVE MINTS</span>
            </div>
            <h1 className="text-5xl sm:text-7xl font-black text-white mb-6 leading-tight">
              NFT <span className="bg-gradient-to-r from-[#9945FF] to-[#14F195] bg-clip-text text-transparent">Launchpad</span>
            </h1>
            <p className="text-xl text-[#B4B4C8] mb-8">
              Discover and mint the latest Solana NFT collections
            </p>

            {/* Stats */}
            <div className="flex items-center justify-center gap-8 mb-8">
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 text-3xl font-black text-white mb-1">
                  <TrendingUp className="w-6 h-6 text-[#14F195]" />
                  {filteredCollections.length}
                </div>
                <p className="text-sm text-[#B4B4C8]">Live Collections</p>
              </div>
              <div className="w-px h-12 bg-[#9945FF]/30" />
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 text-3xl font-black text-white mb-1">
                  <Users className="w-6 h-6 text-[#9945FF]" />
                  {filteredCollections.reduce((acc, c) => acc + c.minted_count, 0)}
                </div>
                <p className="text-sm text-[#B4B4C8]">Total Mints</p>
              </div>
            </div>

            {isConnected && (
              <button
                onClick={handleOpenLaunchModal}
                className="px-8 py-4 bg-gradient-to-r from-[#9945FF] to-[#14F195] hover:opacity-90 text-white rounded-xl font-bold text-lg transition-all flex items-center gap-2 mx-auto shadow-2xl shadow-[#9945FF]/30"
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
          <div className="max-w-[1600px] mx-auto px-6">
            {/* Main Slideshow */}
            <div className="relative h-[600px] rounded-3xl overflow-hidden border-2 border-[#9945FF]/30 shadow-2xl shadow-[#9945FF]/20">
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
                          <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#14F195] text-black rounded-full font-bold text-sm mb-6 shadow-lg">
                            <div className="w-2 h-2 bg-black rounded-full animate-pulse" />
                            LIVE NOW
                          </div>
                        )}

                        {/* Title */}
                        <h2 className="text-5xl sm:text-7xl font-black text-white mb-4 leading-tight">
                          {collection.name}
                        </h2>

                        {/* Description */}
                        <p className="text-xl text-[#B4B4C8] mb-8 line-clamp-2 max-w-2xl">
                          {collection.description}
                        </p>

                        {/* Stats */}
                        <div className="flex flex-wrap items-center gap-6 mb-8">
                          <div>
                            <p className="text-sm text-[#B4B4C8] mb-1">Mint Price</p>
                            <p className="text-3xl font-black text-[#14F195]">{collection.mint_price} SOL</p>
                          </div>
                          <div className="w-px h-16 bg-white/20" />
                          <div>
                            <p className="text-sm text-[#B4B4C8] mb-1">Total Supply</p>
                            <p className="text-3xl font-black text-white">{collection.total_supply}</p>
                          </div>
                          <div className="w-px h-16 bg-white/20" />
                          <div>
                            <p className="text-sm text-[#B4B4C8] mb-1">Remaining</p>
                            <p className="text-3xl font-black text-white">{collection.total_supply - collection.minted_count}</p>
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="mb-8 max-w-xl">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-sm text-[#B4B4C8]">Minting Progress</p>
                            <p className="text-sm font-bold text-white">{progress.toFixed(0)}%</p>
                          </div>
                          <div className="h-3 bg-black/50 backdrop-blur-sm rounded-full overflow-hidden border border-white/20">
                            <div
                              className="h-full bg-gradient-to-r from-[#9945FF] to-[#14F195] transition-all duration-500 shadow-lg"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          <p className="text-sm text-[#B4B4C8] mt-2">{collection.minted_count} / {collection.total_supply} minted</p>
                        </div>

                        {/* CTA Button */}
                        <button
                          onClick={() => router.push(`/launchpad/${collection.id}`)}
                          className="px-10 py-5 bg-gradient-to-r from-[#9945FF] to-[#14F195] hover:opacity-90 text-white rounded-xl font-black text-xl transition-all flex items-center gap-3 shadow-2xl shadow-[#9945FF]/50 hover:scale-105 duration-300"
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
                      className={`transition-all duration-300 rounded-full ${
                        index === currentSlide
                          ? 'w-12 h-3 bg-gradient-to-r from-[#9945FF] to-[#14F195]'
                          : 'w-3 h-3 bg-white/30 hover:bg-white/50'
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
                    className="absolute left-6 top-1/2 -translate-y-1/2 w-14 h-14 bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/20 rounded-full flex items-center justify-center transition-all z-10"
                  >
                    <ChevronRight className="w-6 h-6 text-white rotate-180" />
                  </button>
                  <button
                    onClick={() => setCurrentSlide((prev) => (prev + 1) % activeCollections.length)}
                    className="absolute right-6 top-1/2 -translate-y-1/2 w-14 h-14 bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/20 rounded-full flex items-center justify-center transition-all z-10"
                  >
                    <ChevronRight className="w-6 h-6 text-white" />
                  </button>
                </>
              )}
            </div>

            {/* Slideshow Counter */}
            {activeCollections.length > 1 && (
              <div className="text-center mt-6">
                <p className="text-sm text-[#B4B4C8]">
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
            <h2 className="text-2xl font-bold text-white mb-4">No Collections Available</h2>
            <p className="text-[#B4B4C8]">Check back soon for new launches!</p>
          </div>
        ) : (
          <>
            {/* Completed Collections Section */}
            {completedCollections.length > 0 && (
              <div>
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-1 h-10 bg-gradient-to-b from-[#666] to-[#999] rounded-full" />
                  <div>
                    <h2 className="text-4xl font-black text-white">Completed Mints</h2>
                    <p className="text-[#B4B4C8] mt-1">{completedCollections.length} successful {completedCollections.length === 1 ? 'launch' : 'launches'} on our platform</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {completedCollections.map((collection) => {
                    const isSoldOut = collection.minted_count >= collection.total_supply
                    return (
                      <div
                        key={collection.id}
                        className="group bg-[#0f0f1e] rounded-xl overflow-hidden border border-[#333] hover:border-[#666] transition-all duration-300 cursor-pointer opacity-75 hover:opacity-100"
                        onClick={() => router.push(`/launchpad/${collection.id}`)}
                      >
                        {/* Image */}
                        <div className="relative aspect-square bg-gradient-to-br from-[#333]/20 to-[#666]/20">
                          <img
                            src={collection.image_url}
                            alt={collection.name}
                            className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500"
                          />
                          {/* Completed Badge */}
                          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                            <div className="px-4 py-2 bg-white/90 backdrop-blur-sm rounded-full font-black text-xs text-black shadow-xl">
                              {isSoldOut ? '✓ SOLD OUT' : '✓ COMPLETED'}
                            </div>
                          </div>
                        </div>

                        {/* Info */}
                        <div className="p-4">
                          <h3 className="text-sm font-bold text-white mb-1 truncate">{collection.name}</h3>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-[#B4B4C8]">{collection.mint_price} SOL</span>
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
