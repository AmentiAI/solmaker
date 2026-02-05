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
    <div className="min-h-screen text-white">
      {/* Revolutionary Hero Header - 2026 Ultra-Modern */}
      <div className="relative bg-gradient-to-br from-[#050508] via-[#0a0a0f] to-[#050508] border-b-2 border-[#9945FF]/40 overflow-hidden -mx-6 lg:-mx-12 px-6 lg:px-12">
        {/* Ultra-Premium Animated background */}
        <div className="absolute inset-0">
          <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-[#9945FF]/25 rounded-full blur-[120px] animate-[particleFloat_20s_ease-in-out_infinite]" />
          <div className="absolute bottom-0 right-1/4 w-[700px] h-[700px] bg-[#14F195]/20 rounded-full blur-[120px] animate-[particleFloat_25s_ease-in-out_infinite]" style={{ animationDelay: '2s' }} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[#DC1FFF]/15 rounded-full blur-[100px] animate-[particleFloat_22s_ease-in-out_infinite]" style={{ animationDelay: '1s' }} />
          
          {/* Cyber grid */}
          <div className="absolute inset-0 opacity-10" style={{
            backgroundImage: `
              repeating-linear-gradient(0deg, transparent, transparent 60px, rgba(153, 69, 255, 0.15) 60px, rgba(153, 69, 255, 0.15) 61px),
              repeating-linear-gradient(90deg, transparent, transparent 60px, rgba(20, 241, 149, 0.1) 60px, rgba(20, 241, 149, 0.1) 61px)
            `
          }} />
        </div>

        <div className="w-full py-20 relative z-10">
          <div className="max-w-6xl mx-auto text-center space-y-8">
            {/* Premium Badge */}
            <div className="flex items-center justify-center gap-4 mb-6">
              <div className="p-4 bg-gradient-to-br from-[#9945FF] via-[#DC1FFF] to-[#9945FF] border-2 border-[#9945FF]/50 rounded-2xl cyber-glow">
                <Rocket className="h-10 w-10 text-white" />
              </div>
              <div className="glass-card border-2 border-[#9945FF]/50 rounded-full px-6 py-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-[#14F195] rounded-full animate-pulse ultra-glow-green" />
                  <span className="text-sm font-black text-[#14F195] uppercase tracking-wider">NFT LAUNCHPAD</span>
                </div>
              </div>
            </div>
            
            <h1 className="text-7xl md:text-8xl font-black tracking-tight leading-none">
              <span className="gradient-text-neon">NFT Launchpad</span>
            </h1>
            
            <p className="text-2xl md:text-3xl text-[#B4B4C8] font-bold max-w-3xl mx-auto leading-relaxed">
              Mint <span className="text-[#9945FF] font-black">exclusive collections</span> on Solana. 
              <span className="text-[#14F195] font-black"> Lightning-fast</span> launches with fair distribution.
            </p>

            {/* Premium Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12 max-w-4xl mx-auto">
              <div className="glass-card border-2 border-[#9945FF]/40 rounded-2xl p-6 hover:border-[#9945FF] transition-all duration-300 group">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-gradient-to-br from-[#9945FF] to-[#DC1FFF] rounded-xl cyber-glow group-hover:scale-110 transition-transform duration-300">
                    <Zap className="h-6 w-6 text-white" />
                  </div>
                  <div className="text-left">
                    <p className="text-4xl font-black text-white gradient-text-neon">{collections.filter(c => c.is_live).length}</p>
                    <p className="text-sm text-[#B4B4C8] font-bold uppercase tracking-wide">Live Drops</p>
                  </div>
                </div>
              </div>
              
              <div className="glass-card border-2 border-[#14F195]/40 rounded-2xl p-6 hover:border-[#14F195] transition-all duration-300 group">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-gradient-to-br from-[#14F195] to-[#10B981] rounded-xl shadow-2xl shadow-[#14F195]/60 group-hover:scale-110 transition-transform duration-300">
                    <Users className="h-6 w-6 text-black" />
                  </div>
                  <div className="text-left">
                    <p className="text-4xl font-black text-[#14F195] drop-shadow-[0_0_20px_rgba(20,241,149,0.8)]">{collections.reduce((sum, c) => sum + c.minted_count, 0)}</p>
                    <p className="text-sm text-[#B4B4C8] font-bold uppercase tracking-wide">Total Minted</p>
                  </div>
                </div>
              </div>
              
              <div className="glass-card border-2 border-[#00D4FF]/40 rounded-2xl p-6 hover:border-[#00D4FF] transition-all duration-300 group">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-gradient-to-br from-[#00D4FF] to-[#9945FF] rounded-xl ultra-glow-cyan group-hover:scale-110 transition-transform duration-300">
                    <TrendingUp className="h-6 w-6 text-white" />
                  </div>
                  <div className="text-left">
                    <p className="text-4xl font-black text-[#00D4FF] drop-shadow-[0_0_20px_rgba(0,212,255,0.8)]">{collections.length}</p>
                    <p className="text-sm text-[#B4B4C8] font-bold uppercase tracking-wide">Collections</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Premium Launch Collection Button */}
            <div className="mt-12">
              {isConnected ? (
                <Button
                  onClick={handleOpenLaunchModal}
                  size="lg"
                  className="group px-10 py-7 text-xl font-black bg-gradient-to-r from-[#9945FF] via-[#DC1FFF] to-[#9945FF] text-white rounded-2xl shadow-2xl shadow-[#9945FF]/60 hover:shadow-[#9945FF]/80 transition-all duration-300 hover:scale-105 relative overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-700" />
                  <Plus className="h-6 w-6 mr-3 relative z-10" />
                  <span className="relative z-10">Launch Collection</span>
                  <Sparkles className="h-6 w-6 ml-3 relative z-10" />
                </Button>
              ) : (
                <div className="glass-card border-2 border-[#9945FF]/40 rounded-2xl px-8 py-4 inline-block">
                  <p className="text-[#B4B4C8] text-lg font-bold">
                    Connect your wallet to launch a collection
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

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
      <div className="w-full py-12">
        {/* Filters and Search */}
        <div className="flex flex-col md:flex-row gap-4 mb-8">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--text-secondary)]" />
            <Input
              placeholder="Search collections..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-12"
            />
          </div>
          
          <div className="flex gap-3">
            <Button
              variant={filterStatus === 'all' ? 'default' : 'outline'}
              onClick={() => setFilterStatus('all')}
            >
              ALL
            </Button>
            <Button
              variant={filterStatus === 'live' ? 'default' : 'outline'}
              onClick={() => setFilterStatus('live')}
            >
              <Zap className="h-4 w-4 mr-2" />
              LIVE
            </Button>
            <Button
              variant={filterStatus === 'upcoming' ? 'default' : 'outline'}
              onClick={() => setFilterStatus('upcoming')}
            >
              <Clock className="h-4 w-4 mr-2" />
              UPCOMING
            </Button>
            <Button
              variant={filterStatus === 'ended' ? 'default' : 'outline'}
              onClick={() => setFilterStatus('ended')}
            >
              ENDED
            </Button>
          </div>

          <div className="flex gap-2">
            <Button
              variant={viewMode === 'grid' ? 'default' : 'outline'}
              size="icon"
              onClick={() => setViewMode('grid')}
            >
              <Grid3x3 className="h-5 w-5" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'outline'}
              size="icon"
              onClick={() => setViewMode('list')}
            >
              <List className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Collections Grid/List */}
        {filteredCollections.length === 0 ? (
          <div className="py-20 text-center bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 border border-[var(--solana-purple)]/20 rounded-2xl backdrop-blur-md">
            <div className="text-6xl mb-6 opacity-50 animate-[solanaFloat_4s_ease-in-out_infinite]">🚀</div>
            <h3 className="text-3xl font-black text-white mb-3">No Collections Found</h3>
            <p className="text-[var(--text-secondary)] text-lg font-medium mb-8 max-w-md mx-auto">
              Try adjusting your search or filters to find what you're looking for.
            </p>
          </div>
        ) : (
          <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6' : 'flex flex-col gap-6'}>
            {filteredCollections.map((collection) => (
              <CollectionCard
                key={collection.id}
                collection={collection}
                viewMode={viewMode}
              />
            ))}
          </div>
        )}
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
          <div className="relative aspect-square rounded-t-2xl overflow-hidden border-b border-[var(--solana-purple)]/30">
            <img 
              src={collection.image_url} 
              alt={collection.name}
              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
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

          <div className="p-6 space-y-4">
            <div>
              <h3 className="text-xl font-bold text-white mb-2 line-clamp-1">{collection.name}</h3>
              <p className="text-[var(--text-secondary)] text-sm line-clamp-2">{collection.description}</p>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-[var(--text-secondary)] uppercase tracking-wide">Price</p>
                <p className="text-2xl font-black text-[var(--solana-green)]">{collection.mint_price} SOL</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-[var(--text-secondary)] uppercase tracking-wide">Minted</p>
                <p className="text-lg font-black text-white">{collection.minted_count} / {collection.total_supply}</p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="h-2 bg-[#0f0f1e] border border-[var(--solana-purple)]/30 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-[var(--solana-purple)] to-[var(--solana-green)] transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-[var(--text-secondary)] text-center">{progress.toFixed(1)}% minted</p>
            </div>

            <Button className="w-full">
              <Sparkles className="h-4 w-4 mr-2" />
              {isSoldOut ? 'View Collection' : 'Mint Now'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
