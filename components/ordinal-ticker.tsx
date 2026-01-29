'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'

interface Nft {
  id: string
  collection_id: string
  collection_name: string
  ordinal_number: number | null
  image_url: string
  thumbnail_url?: string | null
}

interface NftTickerProps {
  section?: 'top' | 'bottom'
}

interface CachedData {
  topNfts: Nft[]
  bottomNfts: Nft[]
}
let fetchPromise: Promise<CachedData | null> | null = null

/** @deprecated Use NftTicker instead */
export const OrdinalTicker = NftTicker

export function NftTicker({ section = 'top' }: NftTickerProps) {
  const [nfts, setNfts] = useState<Nft[]>([])
  const [loading, setLoading] = useState(true)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    loadNfts()
    return () => { mountedRef.current = false }
  }, [section])

  const loadNfts = async () => {
    try {
      if (!fetchPromise) {
        fetchPromise = fetchAndCacheNfts()
      }

      const cachedData = await fetchPromise
      fetchPromise = null

      if (!mountedRef.current) return

      if (cachedData) {
        const data = section === 'top' ? cachedData.topNfts : cachedData.bottomNfts
        setNfts(duplicateForScroll(data))
      }
    } catch (error) {
      console.error('Error loading ticker NFTs:', error)
    } finally {
      if (mountedRef.current) {
        setLoading(false)
      }
    }
  }

  if (loading) {
    return (
      <div className="w-full bg-[#0a0a0a] border-y border-[#222] py-6">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#333] border-t-[#9945FF]"></div>
          </div>
        </div>
      </div>
    )
  }

  if (nfts.length === 0) {
    return null
  }

  const animation = section === 'top' ? 'scrollLeft 90s linear infinite' : 'scrollRight 90s linear infinite'

  return (
    <div className="w-full bg-[#0a0a0a] border-y border-[#222] py-6 overflow-hidden relative">
      <div className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-[#0a0a0a] via-[#0a0a0a]/50 to-transparent z-10 pointer-events-none"></div>
      <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-[#0a0a0a] via-[#0a0a0a]/50 to-transparent z-10 pointer-events-none"></div>
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#9945FF]/5 to-transparent opacity-50"></div>

      <div className="relative">
        <div
          className="flex gap-6"
          style={{
            animation,
            width: 'fit-content',
          }}
        >
          {nfts.map((nft, index) => (
            <TickerItem key={`${section}-${nft.id}-${index}`} nft={nft} />
          ))}
        </div>
      </div>
    </div>
  )
}

async function fetchAndCacheNfts(): Promise<CachedData | null> {
  try {
    const response = await fetch(`/api/ordinals/random?limit=40&t=${Date.now()}`, { cache: 'no-store' })
    if (!response.ok) return null

    const data = await response.json()
    const allNfts: Nft[] = data.ordinals || []

    if (allNfts.length === 0) return null

    const shuffled = [...allNfts]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }

    const half = Math.ceil(shuffled.length / 2)
    const topNfts = shuffled.slice(0, half)
    const bottomNfts = shuffled.slice(half)

    return { topNfts, bottomNfts }
  } catch (error) {
    console.error('Error fetching ticker NFTs:', error)
    return null
  }
}

function duplicateForScroll(nfts: Nft[]): Nft[] {
  if (nfts.length === 0) return []
  return [...nfts, ...nfts, ...nfts]
}

function TickerItem({ nft }: { nft: Nft }) {
  const imageUrl = nft.thumbnail_url || nft.image_url

  return (
    <div className="flex-shrink-0 group relative">
      <div className="relative w-32 h-32 sm:w-36 sm:h-36 md:w-40 md:h-40 rounded-lg overflow-hidden border-2 border-[#333] group-hover:border-[#9945FF] transition-all duration-300 shadow-lg shadow-black/20 group-hover:shadow-[#9945FF]/20 group-hover:scale-105">
        <Image
          src={imageUrl}
          alt={`${nft.collection_name} #${nft.ordinal_number || nft.id}`}
          fill
          className="object-cover group-hover:scale-110 transition-transform duration-500"
          sizes="(max-width: 640px) 128px, (max-width: 768px) 144px, 160px"
          loading="lazy"
        />

        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#9945FF]/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
        </div>
      </div>
    </div>
  )
}
