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
      <div className="mt-4 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#9945FF]/30 rounded-xl p-5">
        <div className="font-bold bg-gradient-to-r from-[#9945FF] to-[#DC1FFF] bg-clip-text text-transparent mb-3">Links</div>
        <div className="flex flex-wrap gap-3">
          {collection.twitter_url && (
            <a
              href={collection.twitter_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#1DA1F2] hover:bg-[#1a8cd8] text-white rounded-lg text-sm font-semibold transition-colors"
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
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#5865F2] hover:bg-[#4752C4] text-white rounded-lg text-sm font-semibold transition-colors"
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
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#0088cc] hover:bg-[#0077b5] text-white rounded-lg text-sm font-semibold transition-colors"
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
              className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 hover:from-[#1a1a24] hover:to-[#202030] text-white rounded-lg text-sm font-semibold transition-all border border-[#9945FF]/30 hover:border-[#9945FF]/50"
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
      <div className="mt-4 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#00d4ff]/30 rounded-xl">
        <button
          type="button"
          onClick={() => setAboutOpen(!aboutOpen)}
          className="w-full cursor-pointer select-none px-5 py-4 flex items-center justify-between text-left"
        >
          <span className="font-bold text-white">About</span>
          <span className="text-sm text-[#a8a8b8]">{aboutOpen ? '▲ Collapse' : '▼ Expand'}</span>
        </button>
        {aboutOpen && (
          <div className="px-5 pb-5 border-t border-[#00d4ff]/20 pt-4">
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
        <div className="w-full rounded-2xl overflow-hidden bg-gray-100 border border-gray-200 shadow-xl" style={{ height: '500px' }}>
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
        <div className={`rounded-2xl overflow-hidden bg-gray-100 border border-gray-200 shadow-xl ${isTall ? 'aspect-[3/4] md:aspect-square' : 'aspect-square'}`}>
          <ImageContent />
        </div>
        <SocialLinks />
        <AboutSection />
      </div>
    </div>
  )
}

