'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSolanaWallet } from '@/lib/wallet/solana-wallet-context'
import { toast } from 'sonner'
import { LAMPORTS_PER_SOL } from '@solana/web3.js'

interface SolanaNftListing {
  id: string
  mint_address: string
  title?: string
  price_lamports: number
  price_sol: number
  seller_wallet: string
  collection_name?: string
  image_url: string
  status: string
  created_at: string
  metadata?: any
}

export default function MarketplacePage() {
  const router = useRouter()
  const { isConnected, publicKey } = useSolanaWallet()

  const [nftListings, setNftListings] = useState<SolanaNftListing[]>([])
  const [filteredListings, setFilteredListings] = useState<SolanaNftListing[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'recent' | 'price_low' | 'price_high'>('recent')
  const [priceRange, setPriceRange] = useState<'all' | 'under_1' | '1_to_5' | 'over_5'>('all')

  useEffect(() => {
    loadNftListings()
  }, [])

  useEffect(() => {
    applyFilters()
  }, [nftListings, searchQuery, sortBy, priceRange])

  const loadNftListings = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/marketplace/solana/listings?status=active')
      const data = await response.json()
      if (response.ok) {
        setNftListings(data.listings || [])
      } else {
        toast.error('Failed to load NFT listings')
      }
    } catch (error) {
      console.error('Error loading NFT listings:', error)
      toast.error('Failed to load marketplace')
    } finally {
      setLoading(false)
    }
  }

  const applyFilters = () => {
    let filtered = [...nftListings]

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(listing =>
        listing.title?.toLowerCase().includes(query) ||
        listing.collection_name?.toLowerCase().includes(query) ||
        listing.mint_address.toLowerCase().includes(query)
      )
    }

    // Price range filter
    if (priceRange !== 'all') {
      filtered = filtered.filter(listing => {
        const sol = listing.price_sol
        if (priceRange === 'under_1') return sol < 1
        if (priceRange === '1_to_5') return sol >= 1 && sol <= 5
        if (priceRange === 'over_5') return sol > 5
        return true
      })
    }

    // Sort
    if (sortBy === 'price_low') {
      filtered.sort((a, b) => a.price_lamports - b.price_lamports)
    } else if (sortBy === 'price_high') {
      filtered.sort((a, b) => b.price_lamports - a.price_lamports)
    } else {
      filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    }

    setFilteredListings(filtered)
  }

  return (
    <div className="min-h-screen">
      {/* Revolutionary Hero Header - 2026 Design */}
      <div className="relative bg-gradient-to-br from-[#0a0a0f] via-[#12121a] to-[#0a0a0f] border-b-2 border-[#9945FF]/40 -mx-6 lg:-mx-12 px-6 lg:px-12 overflow-hidden">
        {/* Animated background */}
        <div className="absolute inset-0">
          <div className="absolute top-0 right-0 w-96 h-96 bg-[#9945FF]/20 rounded-full blur-[100px] animate-[particleFloat_20s_ease-in-out_infinite]" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-[#14F195]/15 rounded-full blur-[100px] animate-[particleFloat_25s_ease-in-out_infinite]" />
        </div>

        <div className="w-full py-16 relative z-10">
          <div className="max-w-5xl">
            <div className="inline-flex items-center gap-2 px-4 py-2 glass-card border-2 border-[#9945FF]/40 rounded-full mb-6">
              <div className="w-2 h-2 bg-[#14F195] rounded-full animate-pulse ultra-glow-green" />
              <span className="text-sm font-black text-[#14F195]">SOLANA NFT MARKETPLACE</span>
            </div>
            <h1 className="text-6xl md:text-7xl font-black text-white mb-6 leading-tight">
              NFT <span className="gradient-text-neon">Marketplace</span>
            </h1>
            <p className="text-2xl text-[#B4B4C8] font-semibold max-w-2xl">
              Discover, collect, and trade <span className="text-[#9945FF] font-black">revolutionary</span> Solana NFTs
            </p>
          </div>
        </div>
      </div>

      <div className="w-full py-8">
        <div className="flex gap-8">
          {/* Premium Left Sidebar Filters - 2026 Glass Morphism */}
          <aside className="hidden lg:block w-72 flex-shrink-0">
            <div className="sticky top-24 space-y-6">
              {/* Premium Search */}
              <div className="glass-card border-2 border-[#9945FF]/30 rounded-2xl p-6 hover:border-[#9945FF]/50 transition-all duration-300">
                <h3 className="text-lg font-black text-white mb-4 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-[#9945FF] rounded-full animate-pulse" />
                  Search
                </h3>
                <div className="relative group">
                  <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#B4B4C8] group-focus-within:text-[#9945FF] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search NFTs..."
                    className="w-full pl-12 pr-4 py-3.5 glass-card border-2 border-[#9945FF]/20 focus:border-[#9945FF] focus:ring-4 focus:ring-[#9945FF]/20 text-white placeholder:text-[#71717A] rounded-xl transition-all duration-300 outline-none font-semibold"
                  />
                </div>
              </div>

              {/* Premium Price Range */}
              <div className="glass-card border-2 border-[#14F195]/30 rounded-2xl p-6 hover:border-[#14F195]/50 transition-all duration-300">
                <h3 className="text-lg font-black text-white mb-4 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-[#14F195] rounded-full animate-pulse" />
                  Price Range
                </h3>
                <div className="space-y-2">
                  {[
                    { value: 'all', label: 'All Prices' },
                    { value: 'under_1', label: 'Under 1 SOL' },
                    { value: '1_to_5', label: '1 - 5 SOL' },
                    { value: 'over_5', label: 'Over 5 SOL' }
                  ].map(option => (
                    <button
                      key={option.value}
                      onClick={() => setPriceRange(option.value as any)}
                      className={`group w-full px-4 py-3 rounded-xl text-left transition-all duration-300 relative overflow-hidden ${priceRange === option.value
                          ? 'glass-card border-2 border-[#14F195]/60 text-white font-bold shadow-lg shadow-[#14F195]/20'
                          : 'hover:glass-card hover:border-2 hover:border-[#14F195]/30 text-[#B4B4C8] hover:text-white font-semibold'
                        }`}
                    >
                      {priceRange === option.value && (
                        <div className="absolute inset-0 bg-gradient-to-r from-[#14F195]/10 to-[#10B981]/10" />
                      )}
                      <span className="relative z-10">{option.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Premium Sort */}
              <div className="glass-card border-2 border-[#DC1FFF]/30 rounded-2xl p-6 hover:border-[#DC1FFF]/50 transition-all duration-300">
                <h3 className="text-lg font-black text-white mb-4 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-[#DC1FFF] rounded-full animate-pulse" />
                  Sort By
                </h3>
                <div className="space-y-2">
                  {[
                    { value: 'recent', label: 'Recently Listed' },
                    { value: 'price_low', label: 'Price: Low to High' },
                    { value: 'price_high', label: 'Price: High to Low' }
                  ].map(option => (
                    <button
                      key={option.value}
                      onClick={() => setSortBy(option.value as any)}
                      className={`group w-full px-4 py-3 rounded-xl text-left transition-all duration-300 relative overflow-hidden ${sortBy === option.value
                          ? 'glass-card border-2 border-[#DC1FFF]/60 text-white font-bold shadow-lg shadow-[#DC1FFF]/20'
                          : 'hover:glass-card hover:border-2 hover:border-[#DC1FFF]/30 text-[#B4B4C8] hover:text-white font-semibold'
                        }`}
                    >
                      {sortBy === option.value && (
                        <div className="absolute inset-0 bg-gradient-to-r from-[#DC1FFF]/10 to-[#9945FF]/10" />
                      )}
                      <span className="relative z-10">{option.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </aside>

          {/* Main Content Area */}
          <div className="flex-1">
            {/* Mobile Filters Bar */}
            <div className="lg:hidden mb-6 flex gap-3 overflow-x-auto pb-2">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="px-4 py-2 bg-[#121218] border border-[#9945FF]/20 text-white rounded-xl"
              >
                <option value="recent">Recently Listed</option>
                <option value="price_low">Price: Low to High</option>
                <option value="price_high">Price: High to Low</option>
              </select>
              <select
                value={priceRange}
                onChange={(e) => setPriceRange(e.target.value as any)}
                className="px-4 py-2 bg-[#121218] border border-[#9945FF]/20 text-white rounded-xl"
              >
                <option value="all">All Prices</option>
                <option value="under_1">Under 1 SOL</option>
                <option value="1_to_5">1 - 5 SOL</option>
                <option value="over_5">Over 5 SOL</option>
              </select>
            </div>

            {/* Premium Results Header */}
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <h2 className="text-3xl font-black text-white">
                  {filteredListings.length}
                </h2>
                <span className="text-xl text-[#B4B4C8] font-semibold">
                  {filteredListings.length === 1 ? 'NFT' : 'NFTs'}
                </span>
              </div>
              {isConnected && (
                <Link
                  href="/marketplace/list"
                  className="group px-8 py-4 bg-gradient-to-r from-[#9945FF] via-[#DC1FFF] to-[#9945FF] bg-[length:200%_100%] text-white font-black rounded-xl shadow-2xl shadow-[#9945FF]/50 transition-all duration-300 hover:scale-105 hover:bg-[position:100%_0] hover:shadow-[#9945FF]/70 relative overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-700" />
                  <span className="relative z-10">List NFT</span>
                </Link>
              )}
            </div>

            {/* Premium NFT Grid - Revolutionary Cards */}
            {loading ? (
              <div className="flex flex-col items-center justify-center py-32">
                <div className="w-16 h-16 border-4 border-[#9945FF] border-t-transparent rounded-full animate-spin cyber-glow mb-6" />
                <p className="text-xl font-bold text-[#B4B4C8]">Loading NFTs...</p>
              </div>
            ) : filteredListings.length === 0 ? (
              <div className="glass-card border-2 border-[#9945FF]/40 rounded-3xl p-16 text-center">
                <div className="text-8xl mb-6 animate-bounce">💎</div>
                <h2 className="text-4xl font-black text-white mb-4">No NFTs Found</h2>
                <p className="text-xl text-[#B4B4C8] font-semibold mb-8">
                  Try adjusting your filters or search query
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredListings.map((listing) => (
                  <Link
                    key={listing.id}
                    href={`/marketplace/nft/${listing.mint_address}`}
                    className="group"
                  >
                    <div className="glass-card-hover border-2 border-[#9945FF]/30 rounded-2xl overflow-hidden hover:border-[#9945FF] transition-all duration-500 transform-3d hover-lift">
                      {/* Premium Image with overlay */}
                      <div className="aspect-square bg-gradient-to-br from-[#9945FF]/20 via-[#DC1FFF]/15 to-[#14F195]/20 relative overflow-hidden">
                        {listing.image_url ? (
                          <img
                            src={listing.image_url}
                            alt={listing.title || 'NFT'}
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <span className="text-6xl">💎</span>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                        {/* Premium badge */}
                        <div className="absolute top-4 right-4 px-3 py-1.5 glass-card border border-[#14F195]/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                          <span className="text-xs font-black text-[#14F195]">VIEW</span>
                        </div>
                      </div>

                      {/* Premium Info */}
                      <div className="p-5 space-y-3 relative">
                        <div className="absolute inset-0 bg-gradient-to-br from-[#9945FF]/5 to-[#14F195]/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                        <h3 className="text-lg font-black text-white truncate relative z-10">
                          {listing.title || 'Solana NFT'}
                        </h3>
                        <div className="flex items-center justify-between relative z-10">
                          <span className="text-sm font-bold text-[#B4B4C8]">Price</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xl font-black text-[#14F195] drop-shadow-[0_0_10px_rgba(20,241,149,0.6)]">
                              {listing.price_sol.toFixed(2)}
                            </span>
                            <span className="text-sm font-bold text-[#B4B4C8]">SOL</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {/* Pagination */}
            {filteredListings.length > 0 && (
              <div className="mt-12 flex items-center justify-center gap-2">
                <button className="px-4 py-2 bg-[#121218] border border-[#9945FF]/20 text-white rounded-lg hover:border-[#9945FF]/40 transition-all">
                  Previous
                </button>
                <button className="px-4 py-2 bg-gradient-to-r from-[#9945FF] to-[#A855F7] text-white rounded-lg font-semibold">
                  1
                </button>
                <button className="px-4 py-2 bg-[#121218] border border-[#9945FF]/20 text-white rounded-lg hover:border-[#9945FF]/40 transition-all">
                  Next
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
