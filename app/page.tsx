'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

function HomePageContent() {
  const searchParams = useSearchParams()
  const seeAll = searchParams.get('seeall') === '1'
  
  if (!seeAll) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden">
        {/* REVOLUTIONARY 2026 Background - Maximum Impact */}
        <div className="absolute inset-0">
          {/* Radial gradient base - deep purple to black */}
          <div className="absolute inset-0 bg-gradient-radial from-[#1a0a2e] via-[#0f0520] to-black" />
          
          {/* MASSIVE animated orbs - ultra intense */}
          <div className="absolute top-0 left-0 w-[900px] h-[900px] bg-[#9945FF]/40 rounded-full blur-[150px] animate-[particleFloat_18s_ease-in-out_infinite]" />
          <div className="absolute bottom-0 right-0 w-[1000px] h-[1000px] bg-[#14F195]/35 rounded-full blur-[150px] animate-[particleFloat_22s_ease-in-out_infinite]" style={{ animationDelay: '2s' }} />
          <div className="absolute top-1/3 right-1/4 w-[800px] h-[800px] bg-[#DC1FFF]/30 rounded-full blur-[140px] animate-[particleFloat_25s_ease-in-out_infinite]" style={{ animationDelay: '1s' }} />
          <div className="absolute bottom-1/3 left-1/4 w-[700px] h-[700px] bg-[#00D4FF]/30 rounded-full blur-[130px] animate-[particleFloat_20s_ease-in-out_infinite]" style={{ animationDelay: '3s' }} />
          
          {/* Subtle cyber grid */}
          <div className="absolute inset-0 opacity-10" style={{
            backgroundImage: `
              repeating-linear-gradient(0deg, transparent, transparent 80px, rgba(153, 69, 255, 0.15) 80px, rgba(153, 69, 255, 0.15) 81px),
              repeating-linear-gradient(90deg, transparent, transparent 80px, rgba(20, 241, 149, 0.1) 80px, rgba(20, 241, 149, 0.1) 81px)
            `
          }} />
          
          {/* Animated scan line */}
          <div className="absolute inset-0 opacity-20">
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#9945FF]/20 to-transparent h-40 animate-[scanLine_10s_linear_infinite]" />
          </div>
        </div>
        
        {/* Premium floating particles */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {[...Array(50)].map((_, i) => (
            <div
              key={i}
              className="absolute rounded-full animate-[particleFloat_25s_ease-in-out_infinite]"
              style={{
                width: `${1 + Math.random() * 3}px`,
                height: `${1 + Math.random() * 3}px`,
                background: i % 4 === 0 ? 'rgba(153, 69, 255, 0.6)' : i % 4 === 1 ? 'rgba(20, 241, 149, 0.5)' : i % 4 === 2 ? 'rgba(0, 212, 255, 0.5)' : 'rgba(220, 31, 255, 0.4)',
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 10}s`,
                animationDuration: `${20 + Math.random() * 20}s`,
                boxShadow: `0 0 ${15 + Math.random() * 25}px currentColor`,
                filter: 'blur(0.5px)'
              }}
            />
          ))}
        </div>
        
        <div className="container mx-auto px-6 py-8 relative z-10">
          <div className="max-w-7xl mx-auto">
            {/* REVOLUTIONARY HERO SECTION */}
            <div className="text-center mb-16">
              {/* MASSIVE Title */}
              <h1 className="text-8xl md:text-9xl lg:text-[10rem] font-black mb-8 leading-none tracking-tighter">
                <span className="gradient-text-neon drop-shadow-[0_0_40px_rgba(153,69,255,0.8)]">
                  SolMaker.Fun
                </span>
              </h1>
              
              {/* Coming Soon Badge */}
              <div className="inline-flex items-center gap-4 px-10 py-5 glass-card border-2 border-[#14F195]/60 rounded-full mb-10 group hover:border-[#14F195] transition-all duration-300">
                <div className="relative">
                  <div className="w-4 h-4 bg-[#14F195] rounded-full animate-ping absolute" />
                  <div className="w-4 h-4 bg-[#14F195] rounded-full relative ultra-glow-green" />
                </div>
                <span className="text-4xl font-black text-white">Coming Soon</span>
              </div>
              
              {/* Description */}
              <p className="text-2xl md:text-3xl lg:text-4xl text-white/90 mb-16 leading-relaxed font-bold max-w-5xl mx-auto">
                The <span className="gradient-text-neon font-black">most revolutionary NFT platform</span> on Solana. 
                Create, launch, and dominate.
              </p>
              
              {/* REVOLUTIONARY Feature Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-20 max-w-7xl mx-auto">
                {/* AI Collection Generator */}
                <div className="group relative h-[320px]">
                  <div className="absolute -inset-1 bg-gradient-to-r from-[#9945FF] via-[#DC1FFF] to-[#9945FF] rounded-3xl blur-xl opacity-50 group-hover:opacity-100 transition duration-500 animate-[cyberPulse_3s_ease-in-out_infinite]" />
                  <div className="relative glass-card border-2 border-[#9945FF]/60 rounded-3xl p-8 hover:border-[#9945FF] transition-all duration-500 transform-3d hover-lift overflow-hidden h-full flex flex-col">
                    <div className="absolute inset-0 bg-gradient-to-br from-[#9945FF]/20 to-transparent" />
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000" />
                    <div className="relative z-10 flex flex-col h-full">
                      <div className="w-20 h-20 bg-gradient-to-br from-[#9945FF] via-[#DC1FFF] to-[#9945FF] rounded-2xl flex items-center justify-center mb-6 shadow-2xl shadow-[#9945FF]/80 group-hover:scale-110 transition-transform duration-300">
                        <span className="text-4xl">🎨</span>
                      </div>
                      <h3 className="text-2xl font-black text-white mb-4 min-h-[64px]">AI Collection Generator</h3>
                      <p className="text-lg text-white/80 font-semibold leading-relaxed">Create any size collections with cutting-edge AI in minutes</p>
                    </div>
                  </div>
                </div>
                
                {/* NFT Launchpad */}
                <div className="group relative h-[320px]">
                  <div className="absolute -inset-1 bg-gradient-to-r from-[#14F195] via-[#10B981] to-[#14F195] rounded-3xl blur-xl opacity-50 group-hover:opacity-100 transition duration-500" />
                  <div className="relative glass-card border-2 border-[#14F195]/60 rounded-3xl p-8 hover:border-[#14F195] transition-all duration-500 transform-3d hover-lift overflow-hidden h-full flex flex-col">
                    <div className="absolute inset-0 bg-gradient-to-br from-[#14F195]/20 to-transparent" />
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000" />
                    <div className="relative z-10 flex flex-col h-full">
                      <div className="w-20 h-20 bg-gradient-to-br from-[#14F195] via-[#10B981] to-[#14F195] rounded-2xl flex items-center justify-center mb-6 shadow-2xl shadow-[#14F195]/80 group-hover:scale-110 transition-transform duration-300">
                        <span className="text-4xl">🚀</span>
                      </div>
                      <h3 className="text-2xl font-black text-white mb-4 min-h-[64px]">NFT Launchpad</h3>
                      <p className="text-lg text-white/80 font-semibold leading-relaxed">Multi-phase minting, whitelists, and instant deployment</p>
                    </div>
                  </div>
                </div>
                
                {/* Promo Tools */}
                <div className="group relative h-[320px]">
                  <div className="absolute -inset-1 bg-gradient-to-r from-[#DC1FFF] via-[#9945FF] to-[#DC1FFF] rounded-3xl blur-xl opacity-50 group-hover:opacity-100 transition duration-500" />
                  <div className="relative glass-card border-2 border-[#DC1FFF]/60 rounded-3xl p-8 hover:border-[#DC1FFF] transition-all duration-500 transform-3d hover-lift overflow-hidden h-full flex flex-col">
                    <div className="absolute inset-0 bg-gradient-to-br from-[#DC1FFF]/20 to-transparent" />
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000" />
                    <div className="relative z-10 flex flex-col h-full">
                      <div className="w-20 h-20 bg-gradient-to-br from-[#DC1FFF] via-[#9945FF] to-[#DC1FFF] rounded-2xl flex items-center justify-center mb-6 shadow-2xl shadow-[#DC1FFF]/80 group-hover:scale-110 transition-transform duration-300">
                        <span className="text-4xl">📢</span>
                      </div>
                      <h3 className="text-2xl font-black text-white mb-4 min-h-[64px]">Promo Tools</h3>
                      <p className="text-lg text-white/80 font-semibold leading-relaxed">AI-powered flyers, videos, and viral marketing content</p>
                    </div>
                  </div>
                </div>
                
                {/* Marketplace */}
                <div className="group relative h-[320px]">
                  <div className="absolute -inset-1 bg-gradient-to-r from-[#00D4FF] via-[#9945FF] to-[#00D4FF] rounded-3xl blur-xl opacity-50 group-hover:opacity-100 transition duration-500" />
                  <div className="relative glass-card border-2 border-[#00D4FF]/60 rounded-3xl p-8 hover:border-[#00D4FF] transition-all duration-500 transform-3d hover-lift overflow-hidden h-full flex flex-col">
                    <div className="absolute inset-0 bg-gradient-to-br from-[#00D4FF]/20 to-transparent" />
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000" />
                    <div className="relative z-10 flex flex-col h-full">
                      <div className="w-20 h-20 bg-gradient-to-br from-[#00D4FF] via-[#9945FF] to-[#00D4FF] rounded-2xl flex items-center justify-center mb-6 shadow-2xl shadow-[#00D4FF]/80 group-hover:scale-110 transition-transform duration-300">
                        <span className="text-4xl">🛒</span>
                      </div>
                      <h3 className="text-2xl font-black text-white mb-4 min-h-[64px]">Marketplace</h3>
                      <p className="text-lg text-white/80 font-semibold leading-relaxed">List or buy NFTs right on our platform</p>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* PREMIUM Status Badges */}
              <div className="flex flex-wrap items-center justify-center gap-6 mb-16">
                <div className="group relative">
                  <div className="absolute -inset-1 bg-[#9945FF] rounded-full blur-lg opacity-50 group-hover:opacity-100 transition duration-300" />
                  <div className="relative glass-card flex items-center gap-4 px-10 py-5 border-2 border-[#9945FF]/60 rounded-full hover:border-[#9945FF] transition-all duration-300">
                    <div className="relative">
                      <div className="w-5 h-5 bg-[#9945FF] rounded-full animate-ping absolute ultra-glow" />
                      <div className="w-5 h-5 bg-[#9945FF] rounded-full relative ultra-glow" />
                    </div>
                    <span className="text-xl font-black text-white">Platform in Development</span>
                  </div>
                </div>
                
                <div className="group relative">
                  <div className="absolute -inset-1 bg-[#14F195] rounded-full blur-lg opacity-50 group-hover:opacity-100 transition duration-300" />
                  <div className="relative glass-card flex items-center gap-4 px-10 py-5 border-2 border-[#14F195]/60 rounded-full hover:border-[#14F195] transition-all duration-300">
                    <div className="relative">
                      <div className="w-5 h-5 bg-[#14F195] rounded-full animate-ping absolute ultra-glow-green" style={{ animationDelay: '0.5s' }} />
                      <div className="w-5 h-5 bg-[#14F195] rounded-full relative ultra-glow-green" />
                    </div>
                    <span className="text-xl font-black text-white">Launching Q1 2026</span>
                  </div>
                </div>
              </div>
              
              {/* Footer Message */}
              <div className="pt-16 border-t-2 border-white/10">
                <p className="text-2xl md:text-3xl text-white/80 font-bold">
                  Get ready for the <span className="gradient-text-neon font-black text-3xl md:text-4xl">future of NFTs</span> on Solana
                </p>
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
