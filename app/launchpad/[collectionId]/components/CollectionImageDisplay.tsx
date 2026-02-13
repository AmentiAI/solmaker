'use client'

import { useState } from 'react'

interface Collection {
  id: string
  name: string
  banner_image_url?: string
  banner_video_url?: string
  mobile_image_url?: string
  twitter_url?: string
  discord_url?: string
  telegram_url?: string
  website_url?: string
  description?: string
}

interface ImageDimensions {
  width: number
  height: number
  aspectRatio: number
}

interface CollectionImageDisplayProps {
  collection: Collection
  imageDimensions: ImageDimensions | null
}

export function CollectionImageDisplay({ collection, imageDimensions }: CollectionImageDisplayProps) {
  const [aboutOpen, setAboutOpen] = useState(true)
  
  const isWide = imageDimensions && imageDimensions.aspectRatio > 1.3
  const isTall = imageDimensions && imageDimensions.aspectRatio < 0.8

  const ImageContent = () => (
    <>
      {collection.banner_video_url ? (
        <video
          className="w-full h-full object-contain"
          src={collection.banner_video_url}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
        />
      ) : collection.banner_image_url || collection.mobile_image_url ? (
        <img
          src={collection.mobile_image_url || collection.banner_image_url}
          alt={collection.name}
          className="w-full h-full object-contain"
        />
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-[#4561ad]/20 to-[#e27d0f]/20 flex items-center justify-center">
          <span className="text-9xl">🎨</span>
        </div>
      )}
    </>
  )

  const SocialLinks = () => (
    (collection.twitter_url || collection.discord_url || collection.telegram_url || collection.website_url) ? (
      <div className="mt-4 bg-[#1a1a1a] border border-[#D4AF37]/30 p-5">
        <div className="font-bold text-[#D4AF37] mb-3">Links</div>
        <div className="flex flex-wrap gap-3">
          {collection.twitter_url && (
            <a
              href={collection.twitter_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#1DA1F2] hover:bg-[#1a8cd8] text-white text-sm font-semibold transition-colors"
            >
              <span>🐦</span>
              <span>Twitter</span>
            </a>
          )}
          {collection.discord_url && (
            <a
              href={collection.discord_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#5865F2] hover:bg-[#4752C4] text-white text-sm font-semibold transition-colors"
            >
              <span>💬</span>
              <span>Discord</span>
            </a>
          )}
          {collection.telegram_url && (
            <a
              href={collection.telegram_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#0088cc] hover:bg-[#0077b5] text-white text-sm font-semibold transition-colors"
            >
              <span>✈️</span>
              <span>Telegram</span>
            </a>
          )}
          {collection.website_url && (
            <a
              href={collection.website_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#1a1a1a] hover:bg-[#404040] text-white text-sm font-semibold transition-all border border-[#D4AF37]/30 hover:border-[#D4AF37]/50"
            >
              <span>🌐</span>
              <span>Website</span>
            </a>
          )}
        </div>
      </div>
    ) : null
  )

  const AboutSection = () => (
    collection.description ? (
      <div className="mt-4 bg-[#1a1a1a] border border-[#D4AF37]/30">
        <button
          type="button"
          onClick={() => setAboutOpen(!aboutOpen)}
          className="w-full cursor-pointer select-none px-5 py-4 flex items-center justify-between text-left"
        >
          <span className="font-bold text-white">About</span>
          <span className="text-sm text-[#808080]">{aboutOpen ? '▲ Collapse' : '▼ Expand'}</span>
        </button>
        {aboutOpen && (
          <div className="px-5 pb-5 border-t border-[#D4AF37]/20 pt-4">
            <p className="text-white text-sm leading-relaxed whitespace-pre-wrap">{collection.description}</p>
          </div>
        )}
      </div>
    ) : null
  )

  // Wide images: Banner across top - stretch to full width
  if (isWide) {
    return (
      <div className="mb-8">
        <div className="w-full overflow-hidden bg-gray-100 border border-gray-200" style={{ height: '500px' }}>
          {collection.banner_video_url ? (
            <video
              className="w-full h-full object-cover"
              src={collection.banner_video_url}
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
            />
          ) : collection.banner_image_url || collection.mobile_image_url ? (
            <img
              src={collection.mobile_image_url || collection.banner_image_url}
              alt={collection.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-[#4561ad]/20 to-[#e27d0f]/20 flex items-center justify-center">
              <span className="text-9xl">🎨</span>
            </div>
          )}
        </div>
        {/* Social links and About section for wide images */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SocialLinks />
          <AboutSection />
        </div>
      </div>
    )
  }

  // Square or tall images: Square on left (desktop), responsive on mobile
  return (
    <div className="lg:col-span-5">
      <div className="lg:sticky lg:top-28">
        <div className={`overflow-hidden bg-gray-100 border border-gray-200 ${isTall ? 'aspect-[3/4] md:aspect-square' : 'aspect-square'}`}>
          <ImageContent />
        </div>
        <SocialLinks />
        <AboutSection />
      </div>
    </div>
  )
}

