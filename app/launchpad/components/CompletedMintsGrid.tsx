'use client'

import { useRouter } from 'next/navigation'

interface Collection {
  id: string
  name: string
  image_url: string
  mint_price: number
  total_supply: number
  minted_count: number
}

interface CompletedMintsGridProps {
  collections: Collection[]
}

export function CompletedMintsGrid({ collections }: CompletedMintsGridProps) {
  const router = useRouter()

  if (collections.length === 0) return null

  return (
    <div className="pt-8">
      <div className="flex items-center gap-3 mb-6 px-6">
        <div className="w-1 h-8 bg-[#D4AF37]" />
        <h2 className="text-2xl font-black text-white uppercase">Completed Mints</h2>
        <span className="text-xs text-[#808080] uppercase tracking-wider">
          {collections.length} {collections.length === 1 ? 'Collection' : 'Collections'}
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4 px-6">
        {collections.map((collection) => {
          const isSoldOut = collection.minted_count >= collection.total_supply
          const progress = (collection.minted_count / collection.total_supply) * 100
          return (
            <div
              key={collection.id}
              className="group bg-[#1a1a1a] border border-[#404040] hover:border-[#D4AF37] transition-all cursor-pointer relative"
              onClick={() => router.push(`/launchpad/${collection.id}`)}
            >
              {/* Stats Overlay on Top */}
              <div className="absolute top-0 left-0 right-0 z-10 p-2 bg-gradient-to-b from-black/90 to-transparent">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-[#D4AF37]">{collection.mint_price} SOL</span>
                  <span className="text-xs font-bold text-white">{collection.minted_count}/{collection.total_supply}</span>
                </div>
                <div className="h-0.5 bg-[#404040]">
                  <div className="h-full bg-[#D4AF37]" style={{ width: `${progress}%` }} />
                </div>
              </div>

              {/* Image */}
              <div className="relative aspect-square bg-[#0a0a0a]">
                <img
                  src={collection.image_url}
                  alt={collection.name}
                  className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity"
                />
              </div>

              {/* Title */}
              <div className="p-2 bg-[#1a1a1a] border-t border-[#404040]">
                <h3 className="text-xs font-bold text-white truncate uppercase">{collection.name}</h3>
                <p className="text-xs text-[#D4AF37] uppercase tracking-wider">
                  {isSoldOut ? 'Sold Out' : 'Completed'}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
