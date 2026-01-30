'use client'

import React, { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useWallet } from '@/lib/wallet/compatibility'
import { toast } from 'sonner'

interface OrdinalListing {
  id: string
  inscription_id: string
  inscription_number?: number
  title?: string
  price_sats: number
  seller_wallet: string
  collection_symbol?: string
  image_url?: string
  status: string
  created_at: string
}

export default function MarketplacePage() {
  const router = useRouter()
  const { isConnected, currentAddress } = useWallet()

  const [ordinalListings, setOrdinalListings] = useState<OrdinalListing[]>([])
  const [filteredListings, setFilteredListings] = useState<OrdinalListing[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'recent' | 'price_low' | 'price_high'>('recent')
  const [priceRange, setPriceRange] = useState<'all' | 'under_1' | '1_to_5' | 'over_5'>('all')

  useEffect(() => {
    loadOrdinalListings()
  }, [])

  useEffect(() => {
    applyFilters()
  }, [ordinalListings, searchQuery, sortBy, priceRange])

  const loadOrdinalListings = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/marketplace/ordinals/listings?status=active')
      const data = await response.json()
      if (response.ok) {
        setOrdinalListings(data.listings || [])
      }
    } catch (error) {
      console.error('Error loading ordinal listings:', error)
    } finally {
      setLoading(false)
    }
  }

  const applyFilters = () => {
    let filtered = [...ordinalListings]

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(listing => 
        listing.title?.toLowerCase().includes(query) ||
        listing.collection_symbol?.toLowerCase().includes(query) ||
        listing.inscription_number?.toString().includes(query)
      )
    }

    // Price range filter
    if (priceRange !== 'all') {
      filtered = filtered.filter(listing => {
        const btc = listing.price_sats / 100000000
        if (priceRange === 'under_1') return btc < 1
        if (priceRange === '1_to_5') return btc >= 1 && btc <= 5
        if (priceRange === 'over_5') return btc > 5
        return true
      })
    }

    // Sort
    if (sortBy === 'price_low') {
      filtered.sort((a, b) => a.price_sats - b.price_sats)
    } else if (sortBy === 'price_high') {
      filtered.sort((a, b) => b.price_sats - a.price_sats)
    } else {
      filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    }

    setFilteredListings(filtered)
  }

  return (
    <div className="min-h-screen">
      {/* Hero Header - NEW Professional */}
      <div className="relative bg-gradient-to-br from-[#121218] to-[#1A1A22] border-b border-[#9945FF]/20 -mx-6 lg:-mx-12 px-6 lg:px-12">
        <div className="w-full py-12">
          <div className="max-w-4xl">
            <h1 className="text-5xl md:text-6xl font-extrabold text-white mb-4">
              NFT Marketplace
            </h1>
            <p className="text-xl text-[#A1A1AA]">
              Discover, collect, and trade unique digital assets on Solana
            </p>
          </div>
        </div>
      </div>

      <div className="w-full py-8">
        <div className="flex gap-8">
          {/* Left Sidebar Filters - NEW Desktop Layout */}
          <aside className="hidden lg:block w-64 flex-shrink-0">
            <div className="sticky top-24 space-y-6">
              {/* Search */}
              <div className="bg-[#121218] border border-[#9945FF]/20 rounded-xl p-6">
                <h3 className="text-lg font-bold text-white mb-4">Search</h3>
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#A1A1AA]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search NFTs..."
                    className="w-full pl-10 pr-4 py-3 bg-[#1A1A22] border-2 border-[#9945FF]/20 focus:border-[#9945FF] focus:ring-4 focus:ring-[#9945FF]/20 text-white placeholder:text-[#71717A] rounded-xl transition-all duration-300 outline-none"
                  />
                </div>
              </div>

              {/* Price Range */}
              <div className="bg-[#121218] border border-[#9945FF]/20 rounded-xl p-6">
                <h3 className="text-lg font-bold text-white mb-4">Price Range</h3>
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
                      className={`w-full px-4 py-2 rounded-lg text-left transition-all duration-300 ${
                        priceRange === option.value
                          ? 'bg-gradient-to-r from-[#9945FF]/20 to-[#14F195]/20 border border-[#9945FF]/30 text-white'
                          : 'hover:bg-[#1A1A22] text-[#A1A1AA] hover:text-white'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sort */}
              <div className="bg-[#121218] border border-[#9945FF]/20 rounded-xl p-6">
                <h3 className="text-lg font-bold text-white mb-4">Sort By</h3>
                <div className="space-y-2">
                  {[
                    { value: 'recent', label: 'Recently Listed' },
                    { value: 'price_low', label: 'Price: Low to High' },
                    { value: 'price_high', label: 'Price: High to Low' }
                  ].map(option => (
                    <button
                      key={option.value}
                      onClick={() => setSortBy(option.value as any)}
                      className={`w-full px-4 py-2 rounded-lg text-left transition-all duration-300 ${
                        sortBy === option.value
                          ? 'bg-gradient-to-r from-[#9945FF]/20 to-[#14F195]/20 border border-[#9945FF]/30 text-white'
                          : 'hover:bg-[#1A1A22] text-[#A1A1AA] hover:text-white'
                      }`}
                    >
                      {option.label}
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

            {/* Results Header */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">
                {filteredListings.length} {filteredListings.length === 1 ? 'NFT' : 'NFTs'}
              </h2>
              {isConnected && (
                <Link
                  href="/marketplace/ordinals/list"
                  className="px-6 py-3 bg-gradient-to-r from-[#9945FF] to-[#A855F7] hover:from-[#7C3AED] hover:to-[#9945FF] text-white font-semibold rounded-xl shadow-lg shadow-[#9945FF]/30 transition-all duration-300 hover:scale-105"
                >
                  List NFT
                </Link>
              )}
            </div>

            {/* NFT Grid - NEW 4-Column Responsive */}
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-12 h-12 border-4 border-[#9945FF] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filteredListings.length === 0 ? (
              <div className="bg-[#121218] border border-[#9945FF]/20 rounded-2xl p-12 text-center">
                <div className="text-6xl mb-4">💎</div>
                <h2 className="text-2xl font-bold text-white mb-2">No NFTs Found</h2>
                <p className="text-[#A1A1AA] mb-6">
                  Try adjusting your filters or search query
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredListings.map((listing) => (
                  <Link
                    key={listing.id}
                    href={`/marketplace/ordinals/${listing.id}`}
                    className="group"
                  >
                    <div className="bg-[#121218] border-2 border-[#9945FF]/20 rounded-2xl overflow-hidden hover:border-[#9945FF]/40 transition-all duration-300 hover:scale-105">
                      {/* Image */}
                      <div className="aspect-square bg-gradient-to-br from-[#9945FF]/20 to-[#14F195]/20 relative overflow-hidden">
                        {listing.image_url ? (
                          <img
                            src={listing.image_url}
                            alt={listing.title || `NFT #${listing.inscription_number}`}
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <span className="text-4xl">💎</span>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      
                      {/* Info */}
                      <div className="p-4 space-y-3">
                        <h3 className="text-lg font-semibold text-white truncate">
                          {listing.title || `NFT #${listing.inscription_number}`}
                        </h3>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-[#A1A1AA]">Price</span>
                          <span className="text-xl font-bold text-[#14F195]">
                            {(listing.price_sats / 100000000).toFixed(4)} BTC
                          </span>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {/* Pagination - NEW Bottom Center */}
            {filteredListings.length > 0 && (
              <div className="mt-12 flex items-center justify-center gap-2">
                <button className="px-4 py-2 bg-[#121218] border border-[#9945FF]/20 text-white rounded-lg hover:border-[#9945FF]/40 transition-all">
                  Previous
                </button>
                <button className="px-4 py-2 bg-gradient-to-r from-[#9945FF] to-[#A855F7] text-white rounded-lg font-semibold">
                  1
                </button>
                <button className="px-4 py-2 bg-[#121218] border border-[#9945FF]/20 text-white rounded-lg hover:border-[#9945FF]/40 transition-all">
                  2
                </button>
                <button className="px-4 py-2 bg-[#121218] border border-[#9945FF]/20 text-white rounded-lg hover:border-[#9945FF]/40 transition-all">
                  3
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
