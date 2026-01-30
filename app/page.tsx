'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

function HomePageContent() {
  const searchParams = useSearchParams()
  const seeAll = searchParams.get('seeall') === '1'
  
  if (!seeAll) {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24] flex items-center justify-center overflow-hidden">
        {/* Animated background elements with floating animation */}
        <div className="absolute inset-0">
          <div className="absolute top-20 left-20 w-[500px] h-[500px] bg-[#9945FF]/20 rounded-full blur-3xl animate-[solanaFloat_8s_ease-in-out_infinite]" />
          <div className="absolute bottom-20 right-20 w-[600px] h-[600px] bg-[#14F195]/15 rounded-full blur-3xl animate-[solanaFloat_10s_ease-in-out_infinite]" style={{ animationDelay: '2s' }} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-[#DC1FFF]/10 rounded-full blur-3xl animate-[solanaFloat_12s_ease-in-out_infinite]" style={{ animationDelay: '1s' }} />
          <div className="absolute top-40 right-40 w-[400px] h-[400px] bg-[#00D4FF]/15 rounded-full blur-3xl animate-[solanaFloat_9s_ease-in-out_infinite]" style={{ animationDelay: '3s' }} />
        </div>
        
        {/* Floating particles */}
        <div className="absolute inset-0 overflow-hidden">
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className="absolute w-2 h-2 bg-[#9945FF]/30 rounded-full animate-[solanaFloat_15s_ease-in-out_infinite]"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 5}s`,
                animationDuration: `${10 + Math.random() * 10}s`
              }}
            />
          ))}
        </div>
        
        <div className="container mx-auto px-6 py-12 relative z-10">
          <div className="max-w-5xl mx-auto">
            <div className="relative">
              {/* Glow effect behind card */}
              <div className="absolute inset-0 bg-gradient-to-r from-[#9945FF]/20 to-[#14F195]/20 rounded-3xl blur-3xl" />
              
              <div className="relative bg-[#121218]/90 border-2 border-[#9945FF]/40 rounded-3xl p-12 md:p-20 text-center shadow-2xl shadow-[#9945FF]/30 backdrop-blur-2xl">
                {/* Logo/Icon */}
                <div className="mb-12 relative">
                  <div className="w-32 h-32 mx-auto bg-gradient-to-br from-[#9945FF] via-[#DC1FFF] to-[#14F195] rounded-3xl flex items-center justify-center shadow-2xl shadow-[#9945FF]/50 animate-[solanaPulse_3s_ease-in-out_infinite] relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[shimmer_2s_infinite]" />
                    <span className="text-7xl relative z-10">✨</span>
                  </div>
                  {/* Orbiting elements */}
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48">
                    <div className="absolute top-0 left-1/2 w-3 h-3 bg-[#9945FF] rounded-full animate-[spin_4s_linear_infinite]" />
                    <div className="absolute top-1/2 right-0 w-2 h-2 bg-[#14F195] rounded-full animate-[spin_6s_linear_infinite]" />
                    <div className="absolute bottom-0 left-1/2 w-2 h-2 bg-[#DC1FFF] rounded-full animate-[spin_5s_linear_infinite]" />
                  </div>
                </div>
                
                {/* Main heading */}
                <div className="mb-8">
                  <h1 className="text-7xl md:text-8xl font-black mb-4 bg-gradient-to-r from-[#9945FF] via-[#DC1FFF] to-[#14F195] bg-clip-text text-transparent animate-[solanaGradientShift_8s_ease_infinite] bg-[length:200%_auto]">
                    SolMaker.Fun
                  </h1>
                  <div className="inline-block px-6 py-3 bg-gradient-to-r from-[#9945FF]/20 to-[#14F195]/20 border border-[#9945FF]/50 rounded-full">
                    <p className="text-2xl md:text-3xl font-bold text-white">
                      Coming Soon
                    </p>
                  </div>
                </div>
                
                <p className="text-xl md:text-2xl text-[#A1A1AA] mb-16 leading-relaxed font-medium max-w-3xl mx-auto">
                  The <span className="text-[#9945FF] font-bold">ultimate NFT platform</span> on Solana is launching soon. 
                  Create, launch, and promote your collections with <span className="text-[#14F195] font-bold">powerful tools</span> built for creators.
                </p>
                
                {/* Feature cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-16">
                  <div className="group relative overflow-hidden bg-gradient-to-br from-[#9945FF]/10 to-[#DC1FFF]/10 border border-[#9945FF]/30 rounded-2xl p-6 hover:border-[#9945FF]/60 transition-all duration-500 hover:scale-105 hover:shadow-xl hover:shadow-[#9945FF]/20">
                    <div className="absolute inset-0 bg-gradient-to-r from-[#9945FF]/0 via-[#9945FF]/10 to-[#9945FF]/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                    <div className="relative">
                      <div className="w-12 h-12 bg-gradient-to-br from-[#9945FF] to-[#DC1FFF] rounded-xl flex items-center justify-center mb-4 shadow-lg shadow-[#9945FF]/30">
                        <span className="text-2xl">🎨</span>
                      </div>
                      <h3 className="text-lg font-bold text-white mb-2">AI Collection Generator</h3>
                      <p className="text-sm text-[#A1A1AA]">Create entire NFT collections with AI-powered generation</p>
                    </div>
                  </div>
                  
                  <div className="group relative overflow-hidden bg-gradient-to-br from-[#14F195]/10 to-[#10B981]/10 border border-[#14F195]/30 rounded-2xl p-6 hover:border-[#14F195]/60 transition-all duration-500 hover:scale-105 hover:shadow-xl hover:shadow-[#14F195]/20" style={{ animationDelay: '0.1s' }}>
                    <div className="absolute inset-0 bg-gradient-to-r from-[#14F195]/0 via-[#14F195]/10 to-[#14F195]/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                    <div className="relative">
                      <div className="w-12 h-12 bg-gradient-to-br from-[#14F195] to-[#10B981] rounded-xl flex items-center justify-center mb-4 shadow-lg shadow-[#14F195]/30">
                        <span className="text-2xl">🚀</span>
                      </div>
                      <h3 className="text-lg font-bold text-white mb-2">NFT Launchpad</h3>
                      <p className="text-sm text-[#A1A1AA]">Launch collections with multi-phase minting & whitelists</p>
                    </div>
                  </div>
                  
                  <div className="group relative overflow-hidden bg-gradient-to-br from-[#DC1FFF]/10 to-[#9945FF]/10 border border-[#DC1FFF]/30 rounded-2xl p-6 hover:border-[#DC1FFF]/60 transition-all duration-500 hover:scale-105 hover:shadow-xl hover:shadow-[#DC1FFF]/20" style={{ animationDelay: '0.2s' }}>
                    <div className="absolute inset-0 bg-gradient-to-r from-[#DC1FFF]/0 via-[#DC1FFF]/10 to-[#DC1FFF]/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                    <div className="relative">
                      <div className="w-12 h-12 bg-gradient-to-br from-[#DC1FFF] to-[#9945FF] rounded-xl flex items-center justify-center mb-4 shadow-lg shadow-[#DC1FFF]/30">
                        <span className="text-2xl">📢</span>
                      </div>
                      <h3 className="text-lg font-bold text-white mb-2">Promo Tools</h3>
                      <p className="text-sm text-[#A1A1AA]">Generate stunning flyers & videos for your collection</p>
                    </div>
                  </div>
                  
                  <div className="group relative overflow-hidden bg-gradient-to-br from-[#00D4FF]/10 to-[#9945FF]/10 border border-[#00D4FF]/30 rounded-2xl p-6 hover:border-[#00D4FF]/60 transition-all duration-500 hover:scale-105 hover:shadow-xl hover:shadow-[#00D4FF]/20" style={{ animationDelay: '0.3s' }}>
                    <div className="absolute inset-0 bg-gradient-to-r from-[#00D4FF]/0 via-[#00D4FF]/10 to-[#00D4FF]/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                    <div className="relative">
                      <div className="w-12 h-12 bg-gradient-to-br from-[#00D4FF] to-[#9945FF] rounded-xl flex items-center justify-center mb-4 shadow-lg shadow-[#00D4FF]/30">
                        <span className="text-2xl">⚡</span>
                      </div>
                      <h3 className="text-lg font-bold text-white mb-2">Lightning Fast</h3>
                      <p className="text-sm text-[#A1A1AA]">Built on Solana for instant transactions & low fees</p>
                    </div>
                  </div>
                </div>
                
                {/* Status indicators */}
                <div className="flex flex-wrap items-center justify-center gap-6 mb-12">
                  <div className="flex items-center gap-3 px-6 py-3 bg-[#9945FF]/10 border border-[#9945FF]/30 rounded-full backdrop-blur-sm">
                    <div className="relative">
                      <span className="w-3 h-3 bg-[#9945FF] rounded-full block animate-ping absolute" />
                      <span className="w-3 h-3 bg-[#9945FF] rounded-full block relative" />
                    </div>
                    <span className="text-sm font-bold text-white">Platform in Development</span>
                  </div>
                  <div className="flex items-center gap-3 px-6 py-3 bg-[#14F195]/10 border border-[#14F195]/30 rounded-full backdrop-blur-sm">
                    <div className="relative">
                      <span className="w-3 h-3 bg-[#14F195] rounded-full block animate-ping absolute" style={{ animationDelay: '0.5s' }} />
                      <span className="w-3 h-3 bg-[#14F195] rounded-full block relative" />
                    </div>
                    <span className="text-sm font-bold text-white">Launching Q1 2026</span>
                  </div>
                </div>
                
                {/* Footer text */}
                <div className="pt-8 border-t border-[#9945FF]/20">
                  <p className="text-base text-[#A1A1AA] font-medium">
                    Get ready for the <span className="text-[#9945FF] font-bold">next generation</span> of NFT creation on Solana
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0D0D11]">
      {/* Hero Section - NEW Professional Layout */}
      <section className="relative py-24 overflow-hidden border-b border-[#9945FF]/20">
        {/* Floating Background Elements */}
        <div className="absolute inset-0">
          <div className="absolute top-20 left-20 w-96 h-96 bg-[#9945FF]/10 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-20 right-20 w-96 h-96 bg-[#14F195]/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        </div>
        
        <div className="container mx-auto px-6 relative z-10">
          <div className="max-w-4xl mx-auto text-center space-y-8">
            <h1 className="text-6xl md:text-7xl font-extrabold text-white leading-tight">
              Create & Mint NFTs on
              <span className="block bg-gradient-to-r from-[#9945FF] to-[#14F195] bg-clip-text text-transparent">
                Solana
              </span>
            </h1>
            <p className="text-xl text-[#A1A1AA] max-w-2xl mx-auto">
              The fastest, most affordable NFT launchpad on Solana blockchain
            </p>
            <div className="flex items-center justify-center gap-4 flex-wrap">
              <Link
                href="/collections/create"
                className="px-8 py-4 bg-gradient-to-r from-[#9945FF] to-[#A855F7] hover:from-[#7C3AED] hover:to-[#9945FF] text-white font-semibold rounded-xl shadow-lg shadow-[#9945FF]/30 hover:shadow-xl hover:shadow-[#9945FF]/40 transition-all duration-300 hover:scale-105 active:scale-95"
              >
                Get Started
              </Link>
              <Link
                href="/marketplace"
                className="px-8 py-4 border-2 border-[#9945FF]/50 hover:border-[#9945FF] hover:bg-[#9945FF]/10 text-white font-semibold rounded-xl transition-all duration-300"
              >
                Explore Collections
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid - NEW 3-Column Layout */}
      <section className="py-20 border-b border-[#9945FF]/20">
        <div className="container mx-auto px-6">
          <h2 className="text-4xl font-bold text-center text-white mb-12">
            Why Choose Our Platform
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            <div className="bg-[#121218] border border-[#9945FF]/20 rounded-2xl p-8 hover:border-[#9945FF]/40 transition-all duration-300 hover:scale-105">
              <div className="w-16 h-16 bg-gradient-to-br from-[#9945FF] to-[#DC1FFF] rounded-xl flex items-center justify-center mb-6 shadow-lg shadow-[#9945FF]/30">
                <span className="text-3xl">⚡</span>
              </div>
              <h3 className="text-2xl font-bold text-white mb-4">Lightning Fast</h3>
              <p className="text-[#A1A1AA]">
                Built on Solana for instant transactions and minimal fees. Launch your collection in minutes.
              </p>
            </div>
            
            <div className="bg-[#121218] border border-[#9945FF]/20 rounded-2xl p-8 hover:border-[#9945FF]/40 transition-all duration-300 hover:scale-105">
              <div className="w-16 h-16 bg-gradient-to-br from-[#14F195] to-[#10B981] rounded-xl flex items-center justify-center mb-6 shadow-lg shadow-[#14F195]/30">
                <span className="text-3xl">🎨</span>
              </div>
              <h3 className="text-2xl font-bold text-white mb-4">Easy to Use</h3>
              <p className="text-[#A1A1AA]">
                Intuitive interface designed for creators. No coding required to launch your NFT collection.
              </p>
            </div>
            
            <div className="bg-[#121218] border border-[#9945FF]/20 rounded-2xl p-8 hover:border-[#9945FF]/40 transition-all duration-300 hover:scale-105">
              <div className="w-16 h-16 bg-gradient-to-br from-[#00D4FF] to-[#9945FF] rounded-xl flex items-center justify-center mb-6 shadow-lg shadow-[#00D4FF]/30">
                <span className="text-3xl">🔒</span>
              </div>
              <h3 className="text-2xl font-bold text-white mb-4">Secure & Reliable</h3>
              <p className="text-[#A1A1AA]">
                Enterprise-grade security with multi-phase minting and whitelist management built-in.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Collections Carousel - NEW Horizontal Scroll */}
      <section className="py-20 border-b border-[#9945FF]/20">
        <div className="container mx-auto px-6">
          <div className="flex items-center justify-between mb-12">
            <h2 className="text-4xl font-bold text-white">Featured Collections</h2>
            <Link
              href="/marketplace"
              className="text-[#9945FF] hover:text-[#A855F7] font-semibold flex items-center gap-2 transition-colors"
            >
              View All
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
          </div>
          
          <div className="flex gap-6 overflow-x-auto pb-4 scrollbar-hide">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex-shrink-0 w-80">
                <div className="bg-[#121218] border border-[#9945FF]/20 rounded-2xl overflow-hidden hover:border-[#9945FF]/40 transition-all duration-300 hover:scale-105 group">
                  <div className="aspect-square bg-gradient-to-br from-[#9945FF]/20 to-[#14F195]/20 relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <div className="p-6">
                    <h3 className="text-xl font-bold text-white mb-2">Collection {i}</h3>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-[#A1A1AA]">Floor Price</span>
                      <span className="text-xl font-bold text-[#14F195]">2.5 SOL</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Section - NEW 4-Column Grid */}
      <section className="py-20 border-b border-[#9945FF]/20">
        <div className="container mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-6xl mx-auto">
            <div className="text-center">
              <div className="text-5xl font-extrabold bg-gradient-to-r from-[#9945FF] to-[#DC1FFF] bg-clip-text text-transparent mb-2">
                10K+
              </div>
              <div className="text-[#A1A1AA] font-medium">NFTs Minted</div>
            </div>
            <div className="text-center">
              <div className="text-5xl font-extrabold bg-gradient-to-r from-[#14F195] to-[#10B981] bg-clip-text text-transparent mb-2">
                500+
              </div>
              <div className="text-[#A1A1AA] font-medium">Collections</div>
            </div>
            <div className="text-center">
              <div className="text-5xl font-extrabold bg-gradient-to-r from-[#00D4FF] to-[#9945FF] bg-clip-text text-transparent mb-2">
                2K+
              </div>
              <div className="text-[#A1A1AA] font-medium">Creators</div>
            </div>
            <div className="text-center">
              <div className="text-5xl font-extrabold bg-gradient-to-r from-[#DC1FFF] to-[#9945FF] bg-clip-text text-transparent mb-2">
                100K+
              </div>
              <div className="text-[#A1A1AA] font-medium">Total Volume</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section - NEW Full-Width */}
      <section className="py-24">
        <div className="container mx-auto px-6">
          <div className="relative overflow-hidden bg-gradient-to-r from-[#9945FF] to-[#14F195] rounded-3xl p-16 text-center">
            <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />
            <div className="relative z-10">
              <h2 className="text-5xl font-extrabold text-white mb-6">
                Ready to Launch Your Collection?
              </h2>
              <p className="text-xl text-white/90 mb-8 max-w-2xl mx-auto">
                Join thousands of creators building the future of NFTs on Solana
              </p>
              <Link
                href="/collections/create"
                className="inline-block px-10 py-5 bg-white text-[#9945FF] font-bold text-lg rounded-xl shadow-2xl hover:scale-105 transition-all duration-300"
              >
                Start Creating Now
              </Link>
            </div>
          </div>
        </div>
      </section>
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
