'use client'

import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useWallet } from '@/lib/wallet/compatibility'
import { toast } from 'sonner'
import { NftTicker } from '@/components/ordinal-ticker'

interface Phase {
  id: string
  name: string
  start_time: string
  end_time: string | null
  mint_price_lamports: number
  whitelist_only: boolean
  phase_allocation: number | null
  phase_minted: number
  is_active?: boolean
  max_per_wallet?: number
}

interface Collection {
  id: string
  name: string
  description?: string
  banner_image_url?: string
  banner_video_url?: string
  mobile_image_url?: string
  audio_url?: string
  video_url?: string
  launch_status: string
  creator_wallet: string
  total_supply: number
  minted_count: number
  total_minted?: number
  launch_date?: string
  mint_ended_at?: string
  phases?: Phase[]
}

interface LaunchpadData {
  spotlight: Collection | null
  upcoming: Collection[]
  active: Collection[]
  completed: Collection[]
  stats: {
    upcoming_count: number
    active_count: number
    completed_count: number
  }
}

function formatSol(lamports: number): string {
  if (lamports >= 1000000000) {
    return `${(lamports / 1000000000).toFixed(4)} SOL`
  }
  if (lamports >= 1000000) {
    return `${(lamports / 1000000000).toFixed(6)} SOL`
  }
  return `${lamports.toLocaleString()} lamports`
}

function formatTimeUntil(date: string): string {
  const now = new Date()
  const target = new Date(date)
  const diff = target.getTime() - now.getTime()
  
  if (diff < 0) return 'Started'
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function MintProgress({ minted, total }: { minted: number; total: number }) {
  const percent = total > 0 ? Math.round((minted / total) * 100) : 0
  
  return (
    <div className="w-full">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-[#999]">{minted.toLocaleString()} / {total.toLocaleString()}</span>
        <span className="text-[#9945FF] font-semibold">{percent}%</span>
      </div>
      <div className="h-2 bg-[#0a0a0a] border border-[#333] rounded-full overflow-hidden">
        <div 
          className="h-full bg-[#9945FF] transition-all duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}

function CollectionCard({
  collection,
  type,
  isWatched,
  onToggleWatch,
}: {
  collection: Collection
  type: 'upcoming' | 'active' | 'completed'
  isWatched: boolean
  onToggleWatch: (id: string, name?: string) => void
}) {
  const activePhase = collection.phases?.find(p => p.is_active) || collection.phases?.[0]
  const mintedCount = collection.minted_count || collection.total_minted || 0
  
  return (
    <Link 
      href={`/launchpad/${collection.id}`}
      className="group relative bg-[#1a1a1a] rounded-xl overflow-hidden border border-[#333] hover:border-[#444] transition-all duration-300"
    >
      {/* Card Top Actions */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-[#333]">
        <div className="flex items-center gap-2 min-w-0">
          {type === 'active' && (
            <span className="px-3 py-1 rounded-full text-xs font-semibold text-white bg-[#22c55e]/20 border border-[#22c55e]/30">
              🔴 LIVE
            </span>
          )}
          {type === 'upcoming' && (
            <span className="px-3 py-1 rounded-full text-xs font-semibold text-white bg-[#1a1a1a] border border-[#444]">
              ⏰ Coming Soon
            </span>
          )}
          {type === 'completed' && (
            <span className="px-3 py-1 rounded-full text-xs font-semibold text-[#999] bg-[#1a1a1a] border border-[#333]">
              ✓ Sold Out
            </span>
          )}
          {activePhase?.whitelist_only && (
            <span className="px-3 py-1 rounded-full text-xs font-semibold text-white bg-[#1a1a1a] border border-[#444]">
              WL
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onToggleWatch(collection.id, collection.name)
          }}
          className={`px-3 py-2 rounded-lg border transition-all ${
            isWatched
              ? 'bg-[#9945FF]/20 border-[#9945FF] text-[#9945FF]'
              : 'bg-[#1a1a1a] border-[#333] text-[#999] hover:text-white hover:border-[#444]'
          }`}
          aria-label={isWatched ? 'Remove from watchlist' : 'Add to watchlist'}
        >
          {isWatched ? '🔔' : '🔕'}
        </button>
      </div>

      {/* Media */}
      <div className="relative aspect-[16/10] overflow-hidden bg-[#0a0a0a] group-hover:scale-[1.06] transition-transform duration-700">
        {collection.mobile_image_url || collection.banner_image_url ? (
          <img
            src={collection.mobile_image_url || collection.banner_image_url}
            alt={collection.name}
            className="w-full h-full object-fill"
          />
        ) : null}
        {collection.banner_video_url ? (
          <video
            className="w-full h-full object-fill"
            src={collection.banner_video_url}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
          />
        ) : !collection.mobile_image_url && !collection.banner_image_url ? (
          <div className="w-full h-full bg-[#1a1a1a] flex items-center justify-center">
            <span className="text-6xl">🎨</span>
          </div>
        ) : null}

        {/* Overlays */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

        {/* Title overlay */}
        <div className="absolute bottom-4 left-4 right-4">
          <div className="text-white text-xl font-black drop-shadow truncate">{collection.name}</div>
          {type === 'upcoming' && collection.launch_date ? (
            <div className="mt-1 text-white/85 text-sm font-semibold">
              Starts in <span className="text-white">{formatTimeUntil(collection.launch_date)}</span>
            </div>
          ) : null}
        </div>
      </div>

      {/* Body */}
      <div className="p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-medium text-[#999]">Price</div>
          <div className="text-base font-semibold text-[#9945FF]">
            {activePhase?.mint_price_lamports === 0 ? 'FREE' : formatSol(activePhase?.mint_price_lamports || 0)}
          </div>
        </div>

        <div className="mt-3">
          <MintProgress minted={mintedCount} total={collection.total_supply} />
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 text-xs text-[#999]">
          <div className="font-semibold tabular-nums">
            {mintedCount.toLocaleString()} / {collection.total_supply.toLocaleString()}
          </div>
          {type === 'active' && activePhase?.name ? (
            <div className="truncate font-bold text-white max-w-[60%]">{activePhase.name}</div>
          ) : (
            <div className="font-bold text-white">
              {type === 'completed' ? 'Completed' : 'View Drop'}
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}

type Filters = {
  q: string
  live: boolean
  upcoming: boolean
  wl: boolean
  free: boolean
  sort: 'featured' | 'ending' | 'starting' | 'price_low' | 'progress_high'
}

function getMinStart(collection: Collection): number | null {
  const times = (collection.phases || [])
    .map((p) => (p.start_time ? new Date(p.start_time).getTime() : NaN))
    .filter(Number.isFinite)
  if (!times.length) return null
  return Math.min(...times)
}

function getActiveEnd(collection: Collection): number | null {
  const active = (collection.phases || []).find((p) => p.is_active) || (collection.phases || [])[0]
  if (!active?.end_time) return null
  const t = new Date(active.end_time).getTime()
  return Number.isFinite(t) ? t : null
}

function getPrice(collection: Collection): number {
  const active = (collection.phases || []).find((p) => p.is_active) || (collection.phases || [])[0]
  return typeof active?.mint_price_lamports === 'number' ? active.mint_price_lamports : 0
}

function getProgressPercent(collection: Collection): number {
  const minted = collection.minted_count || collection.total_minted || 0
  return collection.total_supply > 0 ? (minted / collection.total_supply) * 100 : 0
}

function useLaunchpadWatchlist() {
  const [ids, setIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('launchpad_watchlist')
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) setIds(new Set(parsed.filter((x) => typeof x === 'string')))
    } catch {}
  }, [])

  const persist = (next: Set<string>) => {
    setIds(next)
    try {
      window.localStorage.setItem('launchpad_watchlist', JSON.stringify(Array.from(next)))
    } catch {}
  }

  const toggle = (id: string, name?: string) => {
    const next = new Set(ids)
    const had = next.has(id)
    if (had) next.delete(id)
    else next.add(id)
    persist(next)
    toast(had ? 'Removed from Watchlist' : 'Saved to Watchlist', { description: name })
  }

  return { ids, toggle }
}

function LiveActivityTicker({ active, upcoming }: { active: Collection[]; upcoming: Collection[] }) {
  const items = useMemo(() => {
    const list: string[] = []
    for (const c of active || []) {
      const price = getPrice(c)
      list.push(`🔴 ${c.name} is LIVE · ${price === 0 ? 'Free' : `${price.toLocaleString()} SOL`} · ${Math.round(getProgressPercent(c))}% minted`)
    }
    for (const c of upcoming || []) {
      const start = c.launch_date ? formatTimeUntil(c.launch_date) : null
      list.push(`⏰ ${c.name} starts in ${start || 'soon'}`)
    }
    return list.slice(0, 12)
  }, [active, upcoming])

  const [idx, setIdx] = useState(0)
  useEffect(() => {
    if (items.length <= 1) return
    const t = setInterval(() => setIdx((i) => (i + 1) % items.length), 3500)
    return () => clearInterval(t)
  }, [items.length])

  if (!items.length) return null
  return (
    <div className="mb-6">
      <div className="bg-[#1a1a1a] border border-[#333] rounded-lg px-4 py-2 flex items-center gap-3">
        <span className="text-xs font-semibold text-[#9945FF]">⭐ LIVE FEED</span>
        <div className="flex-1 text-sm text-white truncate">{items[Math.min(idx, items.length - 1)]}</div>
      </div>
    </div>
  )
}

function CommandBar({ filters, setFilters }: { filters: Filters; setFilters: (next: Filters) => void }) {
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false)
  const filterDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target as Node)) {
        setFilterDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const activeFilterCount = [filters.live, filters.upcoming, filters.wl, filters.free].filter(Boolean).length
  const filterLabel = activeFilterCount > 0 ? `${activeFilterCount} Filter${activeFilterCount > 1 ? 's' : ''}` : 'Filters'

  const toggleFilter = (key: 'live' | 'upcoming' | 'wl' | 'free') => {
    setFilters({ ...filters, [key]: !filters[key] })
  }

  return (
    <div className="sticky top-[72px] z-30 bg-[#0a0a0a]/95 backdrop-blur border-b border-[#222]">
      <div className="container mx-auto px-6 py-3">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="flex-1 flex items-center gap-3">
            <div className="flex-1">
              <input
                value={filters.q}
                onChange={(e) => setFilters({ ...filters, q: e.target.value })}
                placeholder="Search drops…"
                className="w-full px-5 py-3 rounded-lg border border-[#333] bg-[#1a1a1a] text-base font-medium text-white placeholder:text-[#666] focus:ring-2 focus:ring-[#9945FF]/30 focus:border-[#9945FF]"
              />
            </div>
            <div className="relative">
              <select
                value={filters.sort}
                onChange={(e) => setFilters({ ...filters, sort: e.target.value as Filters['sort'] })}
                className="appearance-none px-4 pr-10 py-3 rounded-lg border border-[#333] bg-[#1a1a1a] text-base font-medium text-white cursor-pointer focus:ring-2 focus:ring-[#9945FF]/30 focus:border-[#9945FF]"
              >
                <option value="featured">Featured</option>
                <option value="ending">Ending Soon</option>
                <option value="starting">Starting Soon</option>
                <option value="price_low">Lowest Price</option>
                <option value="progress_high">Most Minted</option>
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <svg className="w-5 h-5 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative" ref={filterDropdownRef}>
            <button
              type="button"
              onClick={() => setFilterDropdownOpen(!filterDropdownOpen)}
              className="px-4 py-3 pr-10 rounded-lg border border-[#333] bg-[#1a1a1a] text-sm font-medium text-white hover:border-[#444] transition-all relative"
            >
              <span>{filterLabel}</span>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <svg className="w-5 h-5 text-[#666]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>
            {filterDropdownOpen && (
              <div className="absolute top-full left-0 mt-2 w-48 bg-[#1a1a1a] border border-[#333] rounded-lg shadow-lg z-50 overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleFilter('live')}
                  className={`w-full px-4 py-3 text-left text-sm font-medium transition-colors flex items-center gap-2 ${
                    filters.live
                      ? 'bg-[#9945FF] text-white'
                      : 'bg-[#1a1a1a] text-[#999] hover:text-white hover:bg-white/5'
                  }`}
                >
                  <span>🔴</span>
                  <span>Live</span>
                  {filters.live && <span className="ml-auto">✓</span>}
                </button>
                <button
                  type="button"
                  onClick={() => toggleFilter('upcoming')}
                  className={`w-full px-4 py-3 text-left text-sm font-medium transition-colors flex items-center gap-2 border-t border-[#333] ${
                    filters.upcoming
                      ? 'bg-[#9945FF] text-white'
                      : 'bg-[#1a1a1a] text-[#999] hover:text-white hover:bg-white/5'
                  }`}
                >
                  <span>⏰</span>
                  <span>Upcoming</span>
                  {filters.upcoming && <span className="ml-auto">✓</span>}
                </button>
                <button
                  type="button"
                  onClick={() => toggleFilter('wl')}
                  className={`w-full px-4 py-3 text-left text-sm font-medium transition-colors flex items-center gap-2 border-t border-[#333] ${
                    filters.wl
                      ? 'bg-[#9945FF] text-white'
                      : 'bg-[#1a1a1a] text-[#999] hover:text-white hover:bg-white/5'
                  }`}
                >
                  <span>WL</span>
                  {filters.wl && <span className="ml-auto">✓</span>}
                </button>
                <button
                  type="button"
                  onClick={() => toggleFilter('free')}
                  className={`w-full px-4 py-3 text-left text-sm font-medium transition-colors flex items-center gap-2 border-t border-[#333] ${
                    filters.free
                      ? 'bg-[#9945FF] text-white'
                      : 'bg-[#1a1a1a] text-[#999] hover:text-white hover:bg-white/5'
                  }`}
                >
                  <span>FREE</span>
                  {filters.free && <span className="ml-auto">✓</span>}
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setFilters({ q: '', live: false, upcoming: false, wl: false, free: false, sort: 'featured' })}
            className="px-4 py-3 rounded-lg border border-[#333] bg-[#1a1a1a] text-sm font-medium text-white hover:border-[#444]"
          >
              Reset
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function CollectionSection({ title, icon, collections, type, emptyMessage, watchlist }: { 
  title: string
  icon: string
  collections: Collection[]
  type: 'upcoming' | 'active' | 'completed'
  emptyMessage?: string
  watchlist?: { ids: Set<string>; toggle: (id: string, name?: string) => void }
}) {
  return (
    <section className="mb-10">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-2xl">{icon}</span>
        <h2 className="text-2xl font-bold text-white">{title}</h2>
      </div>
      
      {collections.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {collections.map((collection) => (
            <CollectionCard
              key={collection.id}
              collection={collection}
              type={type}
              isWatched={watchlist?.ids?.has(collection.id) ?? false}
              onToggleWatch={watchlist?.toggle ?? (() => {})}
            />
          ))}
        </div>
      ) : (
        <div className="py-12 text-center text-[#999] bg-[#1a1a1a] border border-[#333] rounded-xl">
          {emptyMessage || 'No collections found'}
        </div>
      )}
    </section>
  )
}

function ActiveMintsTable({ collections }: { collections: Collection[] }) {
  if (collections.length === 0) return null
  
  return (
    <section className="mb-10">
   
      
      <div className="bg-[#1a1a1a] border border-[#333] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[#0a0a0a] border-b border-[#333]">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-medium text-[#999] uppercase tracking-wider">Collection</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-[#999] uppercase tracking-wider">Phase</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-[#999] uppercase tracking-wider">Price</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-[#999] uppercase tracking-wider">Progress</th>
                <th className="px-6 py-4 text-right text-xs font-medium text-[#999] uppercase tracking-wider">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#333]">
              {collections.map((collection) => {
                const activePhase = collection.phases?.find(p => p.is_active) || collection.phases?.[0]
                const mintedCount = collection.minted_count || collection.total_minted || 0
                
                return (
                  <tr key={collection.id} className="hover:bg-[#222] transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg overflow-hidden bg-[#0a0a0a] flex-shrink-0 border border-[#333]">
                          {collection.mobile_image_url || collection.banner_image_url ? (
                            <img 
                              src={collection.mobile_image_url || collection.banner_image_url} 
                              alt={collection.name}
                              className="w-full h-full object-contain"
                            />
                          ) : collection.banner_video_url ? (
                            <video
                              className="w-full h-full object-contain"
                              src={collection.banner_video_url}
                              autoPlay
                              muted
                              loop
                              playsInline
                              preload="metadata"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-2xl">🎨</div>
                          )}
                        </div>
                        <div>
                          <div className="font-semibold text-white">{collection.name}</div>
                          <div className="text-xs text-white/70">{collection.total_supply.toLocaleString()} items</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {activePhase?.whitelist_only && (
                          <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 border border-purple-500/30 text-xs rounded font-medium">WL</span>
                        )}
                        <span className="text-white">{activePhase?.name || 'Public'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[#9945FF] font-semibold">
                        {activePhase?.mint_price_lamports === 0 ? 'Free' : formatSol(activePhase?.mint_price_lamports || 0)}
                      </span>
                    </td>
                    <td className="px-6 py-4 min-w-[200px]">
                      <MintProgress minted={mintedCount} total={collection.total_supply} />
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link
                        href={`/launchpad/${collection.id}`}
                        className="px-4 py-2 bg-[#9945FF] hover:bg-[#7C3AED] text-white text-sm font-semibold rounded-lg transition-all"
                      >
                        Mint Now
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

function FeaturedDropsBanner({ active, upcoming }: { active: Collection[]; upcoming: Collection[] }) {
  const featured = [...(active || []), ...(upcoming || [])].slice(0, 10)
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    if (featured.length <= 1) return
    const t = setInterval(() => setIdx((i) => (i + 1) % featured.length), 7000)
    return () => clearInterval(t)
  }, [featured.length])

  if (featured.length === 0) return null

  const c = featured[Math.min(idx, featured.length - 1)]
  const isLive = (active || []).some((x) => x.id === c.id)
  const activePhase = c.phases?.find((p) => p.is_active) || c.phases?.[0]
  const minted = c.minted_count || c.total_minted || 0
  const percent = c.total_supply > 0 ? Math.round((minted / c.total_supply) * 100) : 0
  
  // Get the earliest phase start time for upcoming collections
  const getFirstPhaseStart = () => {
    if (!c.phases || c.phases.length === 0) return null
    const startTimes = c.phases
      .map((p) => p.start_time ? new Date(p.start_time).getTime() : null)
      .filter((t): t is number => t !== null)
    if (startTimes.length === 0) return null
    return new Date(Math.min(...startTimes)).toISOString()
  }
  
  const firstPhaseStart = getFirstPhaseStart()

  return (
    <section className="mb-10">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_120px] gap-4">
        {/* Main banner */}
        <div className="relative aspect-[4/3] sm:aspect-[16/10] overflow-hidden rounded-xl border border-[#333]">
          {/* Media */}
          <div className="absolute inset-0">
            {c.banner_video_url ? (
              <video
                className="w-full h-full object-fill"
                src={c.banner_video_url}
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
              />
            ) : c.banner_image_url || c.mobile_image_url ? (
              <img
                src={c.mobile_image_url || c.banner_image_url}
                alt={c.name}
                className="w-full h-full object-fill sm:object-fill"
              />
            ) : (
              <div className="w-full h-full bg-[#1a1a1a]" />
            )}

            {/* Overlays */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent pointer-events-none" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/30 to-transparent pointer-events-none" />
          </div>

          {/* Content */}
          <div className="absolute bottom-0 left-0 right-0 flex items-end px-4 sm:px-6 md:px-10 pb-4 sm:pb-6 md:pb-8">
            <div className="max-w-3xl w-full">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-3 mb-2 sm:mb-4">
                <span className="px-2 sm:px-3 py-0.5 sm:py-1 bg-white/15 backdrop-blur rounded-full text-[10px] sm:text-xs font-semibold text-white">
                  ⭐ Featured
                </span>
                {isLive ? (
                  <span className="px-2 sm:px-3 py-0.5 sm:py-1 bg-[#22c55e] rounded-full text-[10px] sm:text-xs font-semibold text-white animate-pulse">
                    🔴 LIVE
                  </span>
                ) : (
                  <span className="px-2 sm:px-3 py-0.5 sm:py-1 bg-[#1a1a1a] border border-[#444] rounded-full text-[10px] sm:text-xs font-semibold text-white">
                    ⏰ Coming Soon
                  </span>
                )}
                {!isLive && (firstPhaseStart || c.launch_date) ? (
                  <span className="hidden sm:inline-block px-3 py-1 bg-white/15 backdrop-blur rounded-full text-xs font-semibold text-white">
                    Starts in {formatTimeUntil(firstPhaseStart || c.launch_date || '')}
                  </span>
                ) : null}
                {activePhase?.whitelist_only ? (
                  <span className="px-2 sm:px-3 py-0.5 sm:py-1 bg-[#1a1a1a] border border-[#444] rounded-full text-[10px] sm:text-xs font-semibold text-white">
                    WL
                  </span>
                ) : null}
              </div>

              <h2 className="text-xl sm:text-3xl md:text-5xl font-black text-white drop-shadow mb-1 sm:mb-2 md:mb-4 line-clamp-1 sm:line-clamp-none">{c.name}</h2>

              {c.description ? (
                <p className="hidden sm:block text-white/85 text-sm md:text-lg leading-relaxed mb-3 md:mb-6 line-clamp-2">{c.description}</p>
              ) : null}

              <div className="flex flex-wrap items-center gap-2 sm:gap-4 mb-3 sm:mb-6">
                <div className="bg-black/30 backdrop-blur-sm rounded-lg px-2 sm:px-4 py-1 sm:py-2">
                  <div className="text-gray-300 text-[10px] sm:text-xs">Price</div>
                  <div className="text-sm sm:text-xl font-bold text-[#7C3AED]">
                    {activePhase?.mint_price_lamports === 0 ? 'Free' : formatSol(activePhase?.mint_price_lamports || 0)}
                  </div>
                </div>
                <div className="bg-black/30 backdrop-blur-sm rounded-lg px-2 sm:px-4 py-1 sm:py-2">
                  <div className="text-gray-300 text-[10px] sm:text-xs">Supply</div>
                  <div className="text-sm sm:text-xl font-bold text-white tabular-nums">{c.total_supply.toLocaleString()}</div>
                </div>
                <div className="bg-black/30 backdrop-blur-sm rounded-lg px-2 sm:px-4 py-1 sm:py-2">
                  <div className="text-gray-300 text-[10px] sm:text-xs">Minted</div>
                  <div className="text-sm sm:text-xl font-bold text-white tabular-nums">{percent}%</div>
                </div>
              </div>

              <div className="flex items-center gap-2 sm:gap-3">
                <Link
                  href={`/launchpad/${c.id}`}
                  className="px-4 sm:px-7 py-2 sm:py-3 bg-[#9945FF] hover:bg-[#7C3AED] text-white text-sm sm:text-base font-semibold rounded-lg transition-all hover:scale-[1.02]"
                >
                  View Drop →
                </Link>
                <button
                  type="button"
                  onClick={() => setIdx((i) => (i - 1 + featured.length) % featured.length)}
                  className="px-3 sm:px-4 py-2 sm:py-3 bg-[#1a1a1a] hover:bg-[#222] text-white rounded-lg border border-[#333] transition-all"
                  aria-label="Previous featured"
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={() => setIdx((i) => (i + 1) % featured.length)}
                  className="px-3 sm:px-4 py-2 sm:py-3 bg-[#1a1a1a] hover:bg-[#222] text-white rounded-lg border border-[#333] transition-all"
                  aria-label="Next featured"
                >
                  ›
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right rail thumbnails */}
        <div className="hidden lg:block">
          <div className="h-[380px] md:h-[520px] overflow-auto pr-1">
            <div className="flex flex-col gap-3">
              {featured.map((x, i) => {
                const selected = i === idx
                const thumb = x.mobile_image_url || x.banner_image_url
                const selectedClass = selected
                  ? 'ring-2 ring-[#9945FF] border-[#9945FF]'
                  : 'border-[#333] hover:border-[#444]'
                return (
                  <button
                    key={x.id}
                    type="button"
                    onClick={() => setIdx(i)}
                    className={`relative w-full h-[86px] rounded-lg overflow-hidden border ${selectedClass} bg-[#0a0a0a] transition-all`}
                    aria-label={`Select ${x.name}`}
                  >
                    {thumb ? (
                      <img src={thumb} alt={x.name} className="w-full h-full object-cover" />
                    ) : x.banner_video_url ? (
                      <video
                        className="w-full h-full object-cover"
                        src={x.banner_video_url}
                        autoPlay
                        muted
                        loop
                        playsInline
                        preload="metadata"
                      />
                    ) : (
                      <div className="w-full h-full bg-[#1a1a1a]" />
                    )}
                    <div className="absolute inset-0 bg-black/20" />
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile dots */}
      {featured.length > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2 lg:hidden">
          {featured.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIdx(i)}
              className={`h-2 rounded-full transition-all ${i === idx ? 'w-8 bg-[#9945FF]' : 'w-2 bg-[#666] hover:bg-[#999]'}`}
              aria-label={`Go to featured slide ${i + 1}`}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function HomePageContent() {
  const { isConnected, currentAddress } = useWallet()
  const searchParams = useSearchParams()
  const seeAll = searchParams.get('seeall') === '1'
  
  const [data, setData] = useState<LaunchpadData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<Filters>({
    q: '',
    live: false,
    upcoming: false,
    wl: false,
    free: false,
    sort: 'featured',
  })
  const watchlist = useLaunchpadWatchlist()
  
  // Show coming soon page unless seeall=1
  if (!seeAll) {
    return (
      <div className="fixed inset-0 z-[9999] bg-[#0a0a0a] flex items-center justify-center overflow-hidden">
        <div className="container mx-auto px-6 py-12">
          <div className="max-w-2xl mx-auto">
            <div className="bg-gradient-to-br from-[#1a1a1a] to-[#0f0f0f] border border-[#333] rounded-2xl p-12 text-center shadow-2xl">
              {/* Logo/Icon */}
              <div className="mb-8">
                <div className="w-24 h-24 mx-auto bg-gradient-to-br from-[#9945FF] to-[#7C3AED] rounded-2xl flex items-center justify-center shadow-lg shadow-[#9945FF]/20">
                  <span className="text-5xl">🚀</span>
                </div>
              </div>
              
              {/* Title */}
              <h1 className="text-5xl md:text-6xl font-black text-white mb-4 bg-gradient-to-r from-white to-[#9945FF] bg-clip-text text-transparent">
                Coming Soon
              </h1>
              
              {/* Subtitle */}
              <p className="text-xl text-[#999] mb-8 leading-relaxed">
                Something amazing is on the way. We're putting the final touches on the platform.
              </p>
              
              {/* Details */}
              <div className="space-y-4 mb-10">
                <div className="flex items-center justify-center gap-3 text-[#999]">
                  <span className="w-2 h-2 bg-[#9945FF] rounded-full animate-pulse"></span>
                  <span className="text-sm">Solana NFT Launchpad</span>
                </div>
                <div className="flex items-center justify-center gap-3 text-[#999]">
                  <span className="w-2 h-2 bg-[#9945FF] rounded-full animate-pulse" style={{ animationDelay: '0.5s' }}></span>
                  <span className="text-sm">Multi-Phase Minting</span>
                </div>
                <div className="flex items-center justify-center gap-3 text-[#999]">
                  <span className="w-2 h-2 bg-[#9945FF] rounded-full animate-pulse" style={{ animationDelay: '1s' }}></span>
                  <span className="text-sm">Whitelist Management</span>
                </div>
              </div>
              
              {/* Footer note */}
              <p className="text-sm text-[#666]">
                Platform launching soon. Stay tuned for updates.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const loadLaunchpadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    
    try {
      const response = await fetch('/api/launchpad')
      if (!response.ok) throw new Error('Failed to fetch launchpad data')
      
      const result = await response.json()
      setData(result)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadLaunchpadData()
  }, [loadLaunchpadData])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a]">
        <NftTicker section="top" />
        <div className="container mx-auto px-6 py-12">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <div className="w-16 h-16 border-4 border-[#9945FF] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-[#999]">Loading launchpad...</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0a0a0a]">
        <NftTicker section="top" />
        <div className="container mx-auto px-6 py-12">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <p className="text-[#ef4444] mb-4">Error: {error}</p>
              <button 
                onClick={loadLaunchpadData}
                className="px-6 py-2 bg-[#9945FF] hover:bg-[#7C3AED] text-white rounded-lg transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Hero Header - Simplified */}
      <div className="relative bg-[#0a0a0a] text-white border-b border-[#222]">
        <div className="container mx-auto px-6 py-8">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div className="pl-4">
              <h1 className="text-4xl md:text-5xl font-black tracking-tight text-white">Launchpad</h1>
             
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-2 text-xs text-[#999] bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-1.5">
                <span className="font-medium">Upcoming:</span>
                <span className="text-white">{data?.stats?.upcoming_count ?? 0}</span>
                <span className="mx-1 text-[#666]">|</span>
                <span className="font-medium">Live:</span>
                <span className="text-white">{data?.stats?.active_count ?? 0}</span>
                <span className="mx-1 text-[#666]">|</span>
                <span className="font-medium">Completed:</span>
                <span className="text-white">{data?.stats?.completed_count ?? 0}</span>
              </div>
              <Link
                href="/collections"
                className="px-4 py-2 pr-6 bg-[#9945FF] hover:bg-[#7C3AED] rounded-lg text-sm font-semibold text-white transition-all"
              >
                Launch my collection
              </Link>
            </div>
          </div>
        </div>
      </div>

      <CommandBar filters={filters} setFilters={setFilters} />

      <div className="container mx-auto px-6 py-8">
        <LiveActivityTicker active={data?.active || []} upcoming={data?.upcoming || []} />

          {/* Featured banner */}
          <FeaturedDropsBanner active={data?.active || []} upcoming={data?.upcoming || []} />
          
          {(() => {
            const q = filters.q.trim().toLowerCase()
            const matchesQ = (c: Collection) =>
              !q || c.name.toLowerCase().includes(q) || (c.description || '').toLowerCase().includes(q)

            const matchesCommon = (c: Collection) => {
              if (!matchesQ(c)) return false
              const activePhase = c.phases?.find((p) => p.is_active) || c.phases?.[0]
              if (filters.wl && !activePhase?.whitelist_only) return false
              if (filters.free && (activePhase?.mint_price_lamports ?? 0) !== 0) return false
              return true
            }

            const applySort = (arr: Collection[]) => {
              const a = [...arr]
              if (filters.sort === 'ending') {
                a.sort((x, y) => (getActiveEnd(x) ?? Infinity) - (getActiveEnd(y) ?? Infinity))
              } else if (filters.sort === 'starting') {
                a.sort((x, y) => (getMinStart(x) ?? Infinity) - (getMinStart(y) ?? Infinity))
              } else if (filters.sort === 'price_low') {
                a.sort((x, y) => getPrice(x) - getPrice(y))
              } else if (filters.sort === 'progress_high') {
                a.sort((x, y) => getProgressPercent(y) - getProgressPercent(x))
              }
              return a
            }

            const liveAll = (data?.active || []).filter(matchesCommon)
            const upcomingAll = (data?.upcoming || []).filter(matchesCommon)
            const completedAll = (data?.completed || []).filter(matchesCommon)

            const showLive = filters.live || (!filters.live && !filters.upcoming)
            const showUpcoming = filters.upcoming || (!filters.live && !filters.upcoming)

            return (
              <>
                {/* Coming Soon */}
                <div className="mb-10">
                  
          {/* Active Mints Table */}
          {data?.active && data.active.length > 0 && (
          <div className="mb-10">
            
                 
                  <ActiveMintsTable collections={data.active} />
                 
              
            </div>
          )}
                </div>

                {/* Recently Minted */}
                <CollectionSection
                  title="Recently Minted"
                  icon="✅"
                  collections={applySort(completedAll).slice(0, 12)}
                  type="completed"
                  emptyMessage="No completed mints yet"
                  watchlist={watchlist}
                />
              </>
            )
          })()}

          {/* Ordinal Ticker */}
          <div className="my-10">
            <NftTicker section="top" />
          </div>
          
          {/* Launch Your Collection CTA */}
          <section className="mt-12">
            <div className="text-center bg-[#1a1a1a] border border-[#333] rounded-xl p-10">
              <h2 className="text-2xl md:text-3xl font-semibold text-white mb-3">Launch Your Collection</h2>
              <p className="text-[#999] mb-6 max-w-xl mx-auto">
                Lock your collection, set phases, upload media, and submit to the launchpad.
              </p>
              <Link
                href="/collections"
                className="inline-block px-7 py-3 bg-[#9945FF] hover:bg-[#7C3AED] text-white text-base font-semibold rounded-lg transition-all hover:scale-[1.02]"
              >
                Go to My Collections →
              </Link>
            </div>
          </section>
      </div>
    </div>
  )
}
  
export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <HomePageContent />
    </Suspense>
  )
}
