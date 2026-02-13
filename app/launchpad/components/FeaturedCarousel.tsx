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

interface FeaturedCarouselProps {
  collections: Collection[]
  currentSlide: number
  onSlideChange: (index: number) => void
}

export function FeaturedCarousel({
  collections,
  currentSlide,
  onSlideChange,
}: FeaturedCarouselProps) {
  const router = useRouter()

  if (collections.length === 0) return null

  return (
    <div className="relative border-b border-[#404040]/40">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex gap-6">
          {/* Main Featured Image */}
          <div className="flex-1 relative aspect-[16/9] bg-[#1a1a1a] border border-[#D4AF37]/40 overflow-hidden">
            {collections.map((collection, index) => {
              const progress = (collection.minted_count / collection.total_supply) * 100
              const isActive = index === currentSlide

              return (
                <div
                  key={collection.id}
                  className={`absolute inset-0 transition-opacity duration-500 ${
                    isActive ? 'opacity-100' : 'opacity-0'
                  }`}
                >
                  <img
                    src={collection.image_url}
                    alt={collection.name}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />

                  {/* Content Overlay */}
                  <div className="absolute bottom-0 left-0 right-0 p-6">
                    <h3 className="text-2xl font-black text-white mb-2 uppercase">{collection.name}</h3>
                    <div className="flex items-center gap-4 mb-3">
                      <div>
                        <p className="text-xs text-[#808080] uppercase">Price</p>
                        <p className="text-lg font-bold text-[#D4AF37]">{collection.mint_price} SOL</p>
                      </div>
                      <div className="w-px h-8 bg-[#404040]" />
                      <div>
                        <p className="text-xs text-[#808080] uppercase">Minted</p>
                        <p className="text-lg font-bold text-white">{collection.minted_count}/{collection.total_supply}</p>
                      </div>
                    </div>
                    <div className="h-1 bg-[#404040] mb-3">
                      <div className="h-full bg-[#D4AF37]" style={{ width: `${progress}%` }} />
                    </div>
                    <button
                      onClick={() => router.push(`/${collection.id}`)}
                      className="px-6 py-2 bg-[#1a1a1a] border border-[#D4AF37] hover:bg-[#D4AF37] hover:text-black text-white text-sm font-bold uppercase tracking-wider transition-all"
                    >
                      Mint Now
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Thumbnail Sidebar */}
          <div className="w-64 space-y-3 overflow-y-auto max-h-[600px]">
            {collections.map((collection, index) => {
              const progress = (collection.minted_count / collection.total_supply) * 100
              return (
                <button
                  key={collection.id}
                  onClick={() => onSlideChange(index)}
                  className={`w-full text-left transition-all ${
                    index === currentSlide
                      ? 'border-2 border-[#D4AF37]'
                      : 'border border-[#404040] hover:border-[#D4AF37]/40'
                  }`}
                >
                  <div className="aspect-video relative overflow-hidden bg-[#1a1a1a]">
                    <img
                      src={collection.image_url}
                      alt={collection.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-3 bg-[#1a1a1a]">
                    <h4 className="text-xs font-bold text-white mb-1 truncate uppercase">{collection.name}</h4>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-[#D4AF37]">{collection.mint_price} SOL</span>
                      <span className="text-xs text-[#808080]">{collection.minted_count}/{collection.total_supply}</span>
                    </div>
                    <div className="h-0.5 bg-[#404040]">
                      <div className="h-full bg-[#D4AF37]" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
