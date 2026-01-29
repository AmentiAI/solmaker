'use client'

import Image from 'next/image'
import Link from 'next/link'
import { OrdinalTicker } from '@/components/ordinal-ticker'

export default function ComingSoonPage() {
  return (
    <div className="relative min-h-screen w-full bg-[#FDFCFA] overflow-hidden">
      {/* Clean background */}
      <div className="absolute inset-0 pointer-events-none bg-[#FDFCFA]"></div>

      {/* Header with prominent logo - above ticker */}
      <div className="relative z-10 w-full max-w-[1200px] mx-auto px-6 pt-8 pb-4">
        <div className="flex items-center justify-between">
          <div className="relative">
            <Image
              src="/newestlogo.png"
              alt="Ord Maker"
              width={500}
              height={500}
              className=""
            />
          </div>
          <div className="flex items-center gap-4">
            {/* Twitter/X */}
            <a 
              href="https://twitter.com/ordmaker" 
              target="_blank" 
              rel="noopener noreferrer"
              className="w-12 h-12 flex items-center justify-center rounded-full bg-[#e27d0f] hover:bg-[#d66f0d] transition-all duration-300 hover:scale-110 shadow-lg"
            >
              <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
            </a>
          
            {/* Magic Eden */}
            <a 
              href="https://magiceden.io/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="w-12 h-12 flex items-center justify-center rounded-full bg-[#e27d0f] hover:bg-[#d66f0d] transition-all duration-300 hover:scale-110 shadow-lg"
            >
              <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
              </svg>
            </a>
          </div>
        </div>
      </div>

      {/* Ordinal Ticker - Top */}
      <OrdinalTicker section="top" />

      {/* Main content container - page layout */}
      <div className="relative z-10 w-full max-w-[1200px] mx-auto px-6 py-8">
        {/* Futuristic neon card */}
        <div className="relative bg-transparent border-none shadow-none rounded-none overflow-visible">
          {/* Content area - taller */}
          <div className="relative p-4 md:p-6 lg:p-8">
            <div className="text-center">
              {/* Welcome badge with neon glow */}
              <div className="inline-flex items-center gap-3 px-6 py-2.5 bg-[#FDFCFA] border-2 border-[#e27d0f] rounded-full mb-8 shadow-sm">
                <div className="w-3 h-3 bg-[#e27d0f] rounded-full animate-pulse"></div>
                <span className="text-base font-bold text-[#e27d0f] uppercase tracking-widest">
                  The Future is now
                </span>
              </div>

              {/* Main headline */}
              <h2 className="text-6xl md:text-7xl lg:text-8xl font-black mb-6 leading-tight text-gray-900">
                <span className="block mb-2 text-sky-800">
                  CREATOR PASS MINT
                </span>
                <span className="block text-[#e27d0f]">
                  COMING SOON
                </span>
              </h2>
        
              {/* Badges container */}
              <div className="flex flex-col items-center gap-4 mb-8">
                {/* Discount badge */}
                <div className="inline-flex items-center gap-3 px-8 py-3 bg-[#FDFCFA] border-2 border-[#e27d0f] rounded-full shadow-sm">
                  <span className="text-3xl">⚡</span>
                  <span className="text-2xl md:text-3xl font-black text-gray-900">
                    50% OFF ALL CREDITS
                  </span>
                </div>

                {/* Rev Share badge */}
                <div className="inline-flex items-center gap-3 px-8 py-3 bg-[#e27d0f] border-2 border-[#e27d0f] rounded-full shadow-lg">
                  <span className="text-2xl">💰</span>
                  <span className="text-xl md:text-2xl font-black text-white">
                    20% Rev Share
                  </span>
                </div>
              </div>

              {/* Description */}
           

              {/* Guide Link */}
              <Link 
                href="/guide"
                className="inline-flex items-center gap-2 px-6 py-3 bg-[#4561ad] text-white rounded-full font-bold text-lg hover:bg-[#3a5294] transition-all duration-300 hover:scale-105 shadow-lg"
              >
                📖 View Guide
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Ordinal Ticker - Bottom */}
      <OrdinalTicker section="bottom" />
    </div>
  )
}

                                                     
