'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState } from 'react'

export default function MintPage() {
  const [mounted, setMounted] = useState(false)
  const [showPreviewModal, setShowPreviewModal] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])
  return (
    <div className="relative min-h-screen w-full bg-[#FDFCFA] overflow-hidden">
      {/* Main content container - page layout */}
      <div className="relative z-10 w-full max-w-[1400px] mx-auto px-6 py-6">
        {/* Header with prominent logo - horizontal layout */}
        <div className="relative p-4 md:p-5 mb-5">
          <div className="flex items-center justify-between gap-6">
            {/* Logo and brand */}
            <div className="flex items-center gap-6 flex-shrink min-w-0">
              <div className="relative flex-shrink-0">
                <Image
                  src="/newestlogo.png"
                  alt="Ord Maker"
                  width={350}
                  height={350}
                  className=""
                />
              </div>
           
            </div>
          </div>
        </div>

        {/* Content area */}
        <div className="relative p-4 md:p-6 lg:p-8">
          <div>
            {/* Hero Section - Ultra Compact */}
            <section className="py-4 md:py-5 px-4">
              <div className="max-w-7xl mx-auto">
                <div className="grid lg:grid-cols-2 gap-6 items-center">
                  {/* Left: Hero Content */}
                  <div className={`transition-all duration-1000 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
                    <div className="inline-flex items-center gap-2.5 px-5 py-2 mb-4 bg-gradient-to-r from-[#e27d0f]/10 to-[#e27d0f]/5 border border-[#e27d0f]/30 rounded-full hover:border-[#e27d0f]/60 hover:scale-105 transition-all duration-300 animate-pulse">
                      <div className="w-2 h-2 bg-[#e27d0f] rounded-full animate-ping"></div>
                      <span className="text-[#e27d0f] text-sm font-bold uppercase tracking-[0.15em]">Mint Coming Soon</span>
                    </div>

                    {/* Creator Pass Benefit Card - Enhanced */}
                    <div className="relative bg-gradient-to-br from-white via-white to-[#e27d0f]/5 border-2 border-[#e27d0f]/20 rounded-2xl p-5 md:p-6 shadow-[0_20px_60px_rgba(226,125,15,0.15)] hover:shadow-[0_30px_80px_rgba(226,125,15,0.25)] transition-all duration-500 mb-4 hover:scale-[1.02] hover:border-[#e27d0f]/40 group overflow-hidden">
                      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-1 bg-gradient-to-r from-transparent via-[#e27d0f] to-transparent group-hover:w-full transition-all duration-500"></div>
                      <div className="absolute inset-0 bg-gradient-to-r from-[#e27d0f]/0 via-[#e27d0f]/0 to-[#e27d0f]/0 group-hover:from-[#e27d0f]/5 group-hover:via-[#e27d0f]/0 group-hover:to-[#e27d0f]/5 transition-all duration-500"></div>
                      <div className="relative">
                        <div className="flex items-center justify-center gap-3 mb-3">
                          <span className="text-sm font-bold text-[#e27d0f] uppercase tracking-[0.2em]">Creator Pass Benefit</span>
                        </div>
                        <p className="text-xl md:text-2xl lg:text-3xl font-bold text-gray-900 text-center leading-[1.15] tracking-tight uppercase">
                          <span className="text-[#e27d0f] bg-gradient-to-r from-[#e27d0f] to-[#f59e0b] bg-clip-text text-transparent">222 PASSES</span>
                          <span className="text-gray-800"> — OWNING A CREATOR PASS GETS YOU </span>
                          <span className="text-[#e27d0f] bg-gradient-to-r from-[#e27d0f] to-[#f59e0b] bg-clip-text text-transparent">50% OFF</span>
                          <span className="text-gray-800"> ORDMAKER.FUN CREDITS</span>
                        </p>
                      </div>
                    </div>

                    {/* Social CTA */}
                    <div className="text-center flex flex-col sm:flex-row gap-4 items-center justify-center">
                      <button
                        onClick={() => setShowPreviewModal(true)}
                        className="group inline-flex items-center gap-3 px-10 py-3 bg-gradient-to-r from-gray-800 to-gray-900 text-white font-bold text-base rounded-full hover:from-gray-700 hover:to-gray-800 transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-gray-800/50 transform hover:-translate-y-1"
                      >
                        <svg 
                          className="w-5 h-5 transition-transform duration-300 group-hover:scale-110" 
                          fill="currentColor" 
                          viewBox="0 0 24 24"
                        >
                          <path d="M8 5v14l11-7z"/>
                        </svg>
                        <span>Preview Platform</span>
                      </button>
                      <a 
                        href="https://x.com/ordmakerfun" 
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group inline-flex items-center gap-3 px-10 py-3 bg-gradient-to-r from-[#e27d0f] to-[#f59e0b] text-white font-bold text-base rounded-full hover:from-[#d66f0d] hover:to-[#e27d0f] transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-[#e27d0f]/50 transform hover:-translate-y-1"
                      >
                        <svg 
                          className="w-5 h-5 transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110" 
                          fill="currentColor" 
                          viewBox="0 0 24 24"
                        >
                          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                        </svg>
                        <span>Follow on X</span>
                      </a>
                    </div>
                  </div>

                  {/* Right: Stats & Quick Info - Enhanced Cards */}
                  <div className={`grid grid-cols-2 gap-4 transition-all duration-1000 delay-200 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
                    {[
                      { value: 'Accurate', label: 'Revolutionary AI Image Creation', desc: 'Minimal Credit Burns' },
                      { value: 'Instant', label: 'Speed', desc: 'Minutes not days' },
                      { value: 'Premium', label: 'Quality', desc: 'Super high quality' },
                      { value: '222', label: 'Limited', desc: 'Exclusive passes' }
                    ].map((stat, idx) => (
                      <div 
                        key={idx}
                        className="relative bg-gradient-to-br from-white to-gray-50 border-2 border-gray-200 rounded-xl p-4 shadow-lg hover:shadow-2xl hover:shadow-[#e27d0f]/20 transition-all duration-300 hover:scale-110 hover:border-[#e27d0f]/40 group overflow-hidden"
                        style={{ transitionDelay: `${idx * 50}ms` }}
                      >
                        <div className="absolute inset-0 bg-gradient-to-br from-[#e27d0f]/0 to-[#e27d0f]/0 group-hover:from-[#e27d0f]/10 group-hover:to-transparent transition-all duration-300"></div>
                        <div className="relative">
                          <div className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-[#e27d0f] to-[#f59e0b] bg-clip-text text-transparent mb-2 group-hover:scale-110 transition-transform duration-300">{stat.value}</div>
                          <p className="text-sm font-bold text-gray-900 mb-1">{stat.label}</p>
                          <p className="text-xs text-gray-600 font-medium">{stat.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* Combined Features & Platform Section - Ultra Compact with Animations */}
            <section className="py-4 md:py-5 px-4 border-t border-gray-100">
              <div className="max-w-7xl mx-auto">
                <div className="grid lg:grid-cols-3 gap-4 mb-5">
                  {/* Benefits Cards - Enhanced */}
                  {[
                    { 
                      icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
                      title: 'Pass Holders 50% Off On Credits',
                      desc: 'Permanent savings'
                    },
                    {
                      icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
                      title: 'Limited Edition',
                      desc: 'Only 222 passes exist'
                    },
                    {
                      icon: 'M13 10V3L4 14h7v7l9-11h-7z',
                      title: 'Priority Access',
                      desc: 'Early features & updates'
                    }
                  ].map((feature, idx) => (
                    <div 
                      key={idx}
                      className={`relative bg-gradient-to-br from-white via-white to-[#e27d0f]/5 border-2 border-gray-200 rounded-xl p-4 hover:shadow-2xl hover:shadow-[#e27d0f]/20 transition-all duration-300 hover:scale-105 hover:border-[#e27d0f]/40 group overflow-hidden ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
                      style={{ transitionDelay: `${idx * 100}ms` }}
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-[#e27d0f]/0 via-transparent to-[#e27d0f]/0 group-hover:from-[#e27d0f]/10 group-hover:to-transparent transition-all duration-500"></div>
                      <div className="relative flex items-start gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-[#e27d0f]/20 to-[#e27d0f]/10 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:scale-110 group-hover:rotate-6 transition-transform duration-300">
                          <svg className="w-5 h-5 text-[#e27d0f]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={feature.icon} />
                          </svg>
                        </div>
                        <div className="flex-1">
                          <h3 className="text-base font-bold text-gray-900 mb-1 group-hover:text-[#e27d0f] transition-colors duration-300">{feature.title}</h3>
                          <p className="text-gray-700 text-xs font-medium">{feature.desc}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Platform Features - Compact Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { icon: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z', title: 'Smart Generation', desc: 'AI vision' },
                    { icon: 'M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01', title: 'Custom Styles', desc: 'Many styles' },
                    { icon: 'M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4', title: 'Lazy Mode', desc: 'AI auto-creates 7 layers, 56 traits' },
                    { icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z', title: 'Advanced Creation Settings', desc: 'Full control' }
                  ].map((tech, idx) => (
                    <div 
                      key={idx}
                      className={`relative bg-gradient-to-br from-white to-gray-50 border-2 border-gray-200 rounded-lg p-3 hover:shadow-xl hover:shadow-[#e27d0f]/20 transition-all duration-300 hover:scale-110 hover:border-[#e27d0f]/40 group text-center overflow-hidden ${mounted ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
                      style={{ transitionDelay: `${idx * 75}ms` }}
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-[#e27d0f]/0 to-[#e27d0f]/0 group-hover:from-[#e27d0f]/10 group-hover:to-transparent transition-all duration-300"></div>
                      <div className="relative">
                        <div className="w-10 h-10 bg-gradient-to-br from-[#e27d0f]/20 to-[#e27d0f]/10 rounded-lg flex items-center justify-center mx-auto mb-2 group-hover:scale-110 group-hover:rotate-6 transition-transform duration-300">
                          <svg className="w-5 h-5 text-[#e27d0f]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tech.icon} />
                          </svg>
                        </div>
                        <h3 className="text-sm font-bold text-gray-900 mb-1 group-hover:text-[#e27d0f] transition-colors duration-300">{tech.title}</h3>
                        <p className="text-xs text-gray-600 font-medium">{tech.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* Sponsors Section - Enhanced */}
            <section className="py-4 md:py-5 px-4 border-t border-gray-100 bg-gradient-to-b from-gray-50/50 to-white">
              <div className="max-w-7xl mx-auto">
                <div className="text-center mb-4">
                  <h2 className="text-xl md:text-2xl font-bold mb-1 text-gray-900 tracking-tight">
                    Proudly Partnered With
                  </h2>
                  <p className="text-xs text-gray-600 font-medium">
                    Leading innovators in the Ordinals ecosystem
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-w-5xl mx-auto">
                  {[
                    { 
                      name: 'Ordzaar', 
                      desc: 'Premium Ordinals Platform',
                      logo: '/sponsors/ordzaar.png',
                      logoUrl: null
                    },
                    { 
                      name: 'Satgo', 
                      desc: 'Bitcoin Ecosystem Leader',
                      logo: '/sponsors/satgo.png',
                      logoUrl: null
                    },
                    { 
                      name: 'Gamma', 
                      desc: 'Next-Gen Ordinal Solutions',
                      logo: '/sponsors/gama.png',
                      logoUrl: null
                    }
                  ].map((sponsor, idx) => (
                    <div 
                      key={idx}
                      className={`relative bg-gradient-to-br from-white via-white to-[#e27d0f]/5 border-2 border-gray-200 rounded-xl px-5 py-4 shadow-lg hover:shadow-2xl hover:shadow-[#e27d0f]/30 transition-all duration-300 hover:scale-110 hover:border-[#e27d0f]/50 group overflow-hidden text-center ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
                      style={{ transitionDelay: `${idx * 100}ms` }}
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-[#e27d0f]/0 via-transparent to-[#e27d0f]/0 group-hover:from-[#e27d0f]/10 group-hover:to-[#e27d0f]/5 transition-all duration-500"></div>
                      <div className="relative flex flex-col items-center justify-center">
                        {/* Sponsor Logo */}
                        {sponsor.logo && (
                          <div className="mb-3 h-16 flex items-center justify-center w-full">
                            <div className="relative w-full h-full flex items-center justify-center">
                              {sponsor.logo.endsWith('.svg') || sponsor.name === 'Gamma' ? (
                                <img
                                  src={`${sponsor.logo}?t=${Date.now()}`}
                                  alt={`${sponsor.name} logo`}
                                  className="object-contain transition-opacity duration-300"
                                  style={{ 
                                    maxHeight: '64px', 
                                    maxWidth: '140px', 
                                    height: 'auto', 
                                    width: 'auto',
                                    opacity: 1,
                                    display: 'block'
                                  }}
                                  onError={(e) => {
                                    console.error(`Failed to load logo for ${sponsor.name}:`, sponsor.logo);
                                  }}
                                  onLoad={(e) => {
                                    console.log(`Successfully loaded logo for ${sponsor.name}`);
                                  }}
                                />
                              ) : (
                                <Image
                                  src={sponsor.logo}
                                  alt={`${sponsor.name} logo`}
                                  width={140}
                                  height={64}
                                  className="object-contain opacity-90 group-hover:opacity-100 transition-opacity duration-300"
                                  style={{ maxHeight: '64px', maxWidth: '140px' }}
                                  unoptimized
                                />
                              )}
                            </div>
                          </div>
                        )}
                        {/* Sponsor Name - Always show */}
                        <div className="text-xl md:text-2xl font-bold bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 group-hover:from-[#e27d0f] group-hover:via-[#f59e0b] group-hover:to-[#e27d0f] bg-clip-text text-transparent transition-all duration-300 mb-1">
                          {sponsor.name}
                        </div>
                        <p className="text-xs text-gray-600 font-medium group-hover:text-gray-700 transition-colors duration-300">{sponsor.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* Footer */}
            <footer className="py-3 px-4 border-t border-gray-100">
              <div className="max-w-5xl mx-auto text-center text-gray-600 text-xs font-medium">
                <p>© 2025 Ord Maker. All rights reserved.</p>
              </div>
            </footer>
          </div>
        </div>
      </div>

      {/* Preview Platform Modal */}
      {showPreviewModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setShowPreviewModal(false)}
        >
          <div 
            className="relative bg-[#FDFCFA] rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">Platform Preview</h2>
              <button
                onClick={() => setShowPreviewModal(false)}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                aria-label="Close modal"
              >
                <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Video Container */}
            <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
              <iframe
                className="absolute top-0 left-0 w-full h-full"
                src="https://www.youtube.com/embed/3lqgSfQt-EU"
                title="Platform Preview"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
