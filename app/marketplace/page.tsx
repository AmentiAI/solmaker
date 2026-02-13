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
    <div className="min-h-screen relative bg-[#0a0a0a]">
      {/* Revolutionary Hero Header - Matte Black/Gold Design */}
      <div className="relative bg-[#1a1a1a] border-b-2 border-[#D4AF37] -mx-6 lg:-mx-12 px-6 lg:px-12 overflow-hidden">
        {/* Animated background */}
        <div className="absolute inset-0">
          <div className="absolute top-0 right-0 w-96 h-96 bg-[#D4AF37]/10 blur-[100px]" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-[#D4AF37]/5 blur-[100px]" />
        </div>

        <div className="w-full py-16 relative z-10">
          <div className="max-w-5xl">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#0a0a0a] border-2 border-[#D4AF37] mb-6">
              <div className="w-2 h-2 bg-[#D4AF37]" />
              <span className="text-sm font-black text-[#D4AF37] tracking-wider uppercase">SOLANA NFT MARKETPLACE</span>
            </div>
            <h1 className="text-6xl md:text-7xl font-black text-white mb-6 leading-tight uppercase tracking-wide">
              NFT <span className="text-[#D4AF37]">Marketplace</span>
            </h1>
            <p className="text-2xl text-[#808080] font-semibold max-w-2xl">
              Discover, collect, and trade <span className="text-[#D4AF37] font-black">premium</span> Solana NFTs
            </p>
          </div>
        </div>
      </div>

      <div className="w-full py-8">
        <div className="flex gap-8">
          {/* Premium Left Sidebar Filters - Matte Black/Gold */}
          <aside className="hidden lg:block w-72 flex-shrink-0">
            <div className="sticky top-24 space-y-6">
              {/* Premium Search */}
              <div className="bg-[#1a1a1a] border-2 border-[#404040] p-6 hover:border-[#D4AF37] transition-all duration-300">
                <h3 className="text-lg font-black text-white mb-4 flex items-center gap-2 uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 bg-[#D4AF37]" />
                  Search
                </h3>
                <div className="relative group">
                  <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#808080] group-focus-within:text-[#D4AF37] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search NFTs..."
                    className="w-full pl-12 pr-4 py-3.5 bg-[#0a0a0a] border-2 border-[#404040] focus:border-[#D4AF37] text-white placeholder:text-[#808080] transition-all duration-300 outline-none font-semibold"
                  />
                </div>
              </div>

              {/* Premium Price Range */}
              <div className="bg-[#1a1a1a] border-2 border-[#404040] p-6 hover:border-[#D4AF37] transition-all duration-300">
                <h3 className="text-lg font-black text-white mb-4 flex items-center gap-2 uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 bg-[#D4AF37]" />
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
                      className={`group w-full px-4 py-3 text-left transition-all duration-300 relative overflow-hidden ${priceRange === option.value
                          ? 'bg-[#0a0a0a] border-2 border-[#D4AF37] text-white font-bold'
                          : 'hover:bg-[#0a0a0a] hover:border-2 hover:border-[#404040] text-[#808080] hover:text-white font-semibold'
                        }`}
                    >
                      {priceRange === option.value && (
                        <div className="absolute inset-0 bg-[#D4AF37]/10" />
                      )}
                      <span className="relative z-10">{option.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Premium Sort */}
              <div className="bg-[#1a1a1a] border-2 border-[#404040] p-6 hover:border-[#D4AF37] transition-all duration-300">
                <h3 className="text-lg font-black text-white mb-4 flex items-center gap-2 uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 bg-[#D4AF37]" />
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
                      className={`group w-full px-4 py-3 text-left transition-all duration-300 relative overflow-hidden ${sortBy === option.value
                          ? 'bg-[#0a0a0a] border-2 border-[#D4AF37] text-white font-bold'
                          : 'hover:bg-[#0a0a0a] hover:border-2 hover:border-[#404040] text-[#808080] hover:text-white font-semibold'
                        }`}
                    >
                      {sortBy === option.value && (
                        <div className="absolute inset-0 bg-[#D4AF37]/10" />
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
                className="px-4 py-2 bg-[#1a1a1a] border border-[#404040] text-white"
              >
                <option value="recent">Recently Listed</option>
                <option value="price_low">Price: Low to High</option>
                <option value="price_high">Price: High to Low</option>
              </select>
              <select
                value={priceRange}
                onChange={(e) => setPriceRange(e.target.value as any)}
                className="px-4 py-2 bg-[#1a1a1a] border border-[#404040] text-white"
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
                <span className="text-xl text-[#808080] font-semibold">
                  {filteredListings.length === 1 ? 'NFT' : 'NFTs'}
                </span>
              </div>
              {isConnected && (
                <Link
                  href="/marketplace/list"
                  className="group px-8 py-4 bg-[#1a1a1a] border border-[#D4AF37] text-white font-black tracking-wider uppercase transition-all duration-300 hover:bg-[#D4AF37] hover:text-black relative overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-700" />
                  <span className="relative z-10">List NFT</span>
                </Link>
              )}
            </div>

            {/* Premium NFT Grid - Matte Black/Gold Cards */}
            {loading ? (
              <div className="flex flex-col items-center justify-center py-32">
                <div className="w-16 h-16 border-4 border-[#D4AF37] border-t-transparent animate-spin mb-6" />
                <p className="text-xl font-bold text-[#808080]">Loading NFTs...</p>
              </div>
            ) : filteredListings.length === 0 ? (
              <div className="bg-[#1a1a1a] border-2 border-[#404040] p-16 text-center">
                <div className="text-8xl mb-6">💎</div>
                <h2 className="text-4xl font-black text-white mb-4 uppercase tracking-wide">No NFTs Found</h2>
                <p className="text-xl text-[#808080] font-semibold mb-8">
                  Try adjusting your filters or search query
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredListings.map((listing) => (
                  <Link
                    key={listing.id}
                    href={`/marketplace/nft/${listing.id}`}
                    className="group"
                  >
                    <div className="bg-[#1a1a1a] border-2 border-[#404040] overflow-hidden hover:border-[#D4AF37] transition-all duration-500">
                      {/* Premium Image with overlay */}
                      <div className="aspect-square bg-[#0a0a0a] relative overflow-hidden">
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
                        <div className="absolute top-4 right-4 px-3 py-1.5 bg-[#0a0a0a] border border-[#D4AF37] opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                          <span className="text-xs font-black text-[#D4AF37] tracking-wider uppercase">VIEW</span>
                        </div>
                      </div>

                      {/* Premium Info */}
                      <div className="p-5 space-y-3 relative">
                        <div className="absolute inset-0 bg-[#D4AF37]/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                        <h3 className="text-lg font-black text-white truncate relative z-10 uppercase tracking-wide">
                          {listing.title || 'Solana NFT'}
                        </h3>
                        <div className="flex items-center justify-between relative z-10">
                          <span className="text-sm font-bold text-[#808080]">Price</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xl font-black text-[#D4AF37]">
                              {parseFloat(listing.price_sol).toFixed(2)}
                            </span>
                            <span className="text-sm font-bold text-[#808080]">SOL</span>
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
                <button className="px-4 py-2 bg-[#1a1a1a] border border-[#404040] text-white hover:border-[#D4AF37] transition-all">
                  Previous
                </button>
                <button className="px-4 py-2 bg-[#D4AF37] text-black font-semibold">
                  1
                </button>
                <button className="px-4 py-2 bg-[#1a1a1a] border border-[#404040] text-white hover:border-[#D4AF37] transition-all">
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
