'use client'

import Link from 'next/link'

export default function PassDetailsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#4561ad] via-[#5a7bc4] to-[#e27d0f]">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl md:text-7xl font-black text-white mb-4">
            Creator Pass
          </h1>
          <p className="text-2xl text-white/90">
            Hold 1 of 168 passes • Unlock exclusive benefits
          </p>
        </div>

        {/* 3 Main Benefits - Large Cards */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          {/* 50% Discount */}
          <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md rounded-2xl p-8 shadow-2xl text-center border border-[#9945FF]/30">
            <div className="text-6xl mb-4">💰</div>
            <h2 className="text-3xl font-black text-[#9945FF] mb-2">50% OFF</h2>
            <p className="text-lg font-bold text-white mb-1">All Credits</p>
            <p className="text-sm text-white/70">Automatic discount on every purchase</p>
          </div>

          {/* Revenue Share */}
          <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md rounded-2xl p-8 shadow-2xl text-center border border-[#9945FF]/30">
            <div className="text-6xl mb-4">📊</div>
            <h2 className="text-3xl font-black text-[#DC1FFF] mb-2">30% RevShare</h2>
            <p className="text-lg font-bold text-white mb-1">Platform Revenue</p>
            <p className="text-sm text-white/70">Split among 168 holders</p>
          </div>

          {/* Whitelist Access */}
          <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md rounded-2xl p-8 shadow-2xl text-center border border-[#9945FF]/30">
            <div className="text-6xl mb-4">🎫</div>
            <h2 className="text-3xl font-black text-[#9945FF] mb-2">Whitelist</h2>
            <p className="text-lg font-bold text-white mb-1">Priority Access</p>
            <p className="text-sm text-white/70">Early minting on new collections</p>
          </div>
        </div>

        {/* Quick Details Grid */}
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 mb-8">
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-white font-bold text-lg mb-2">💰 Credit Discount</h3>
              <p className="text-[#a8a8b8] text-sm">
                Every credit purchase is automatically 50% off. No codes needed.
              </p>
            </div>
            <div>
              <h3 className="text-white font-bold text-lg mb-2">📊 Revenue Share</h3>
              <p className="text-[#a8a8b8] text-sm">
                30% of platform revenue (mints, credits, marketplace, inscribing) split by holdings.
              </p>
            </div>
            <div>
              <h3 className="text-white font-bold text-lg mb-2">🎫 Whitelist Access</h3>
              <p className="text-[#a8a8b8] text-sm">
                Priority access to whitelist-only mint phases for new collections.
              </p>
            </div>
            <div>
              <h3 className="text-white font-bold text-lg mb-2">✨ Additional Perks</h3>
              <p className="text-[#a8a8b8] text-sm">
                Priority support, early feature access, community recognition.
              </p>
            </div>
          </div>
        </div>

        {/* How It Works - Minimal */}
        <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md rounded-2xl p-6 mb-8 border border-[#9945FF]/30">
          <h2 className="text-2xl font-black text-white mb-4 text-center">How It Works</h2>
          <div className="flex justify-center gap-8">
            <div className="text-center">
              <div className="w-12 h-12 bg-[#9945FF] text-white rounded-full flex items-center justify-center font-black text-xl mx-auto mb-2 shadow-lg shadow-[#9945FF]/20">1</div>
              <p className="text-sm font-semibold text-white">Hold Pass</p>
            </div>
            <div className="text-white/50 text-2xl">→</div>
            <div className="text-center">
              <div className="w-12 h-12 bg-[#9945FF] text-white rounded-full flex items-center justify-center font-black text-xl mx-auto mb-2 shadow-lg shadow-[#9945FF]/20">2</div>
              <p className="text-sm font-semibold text-white">Connect Wallet</p>
            </div>
            <div className="text-white/50 text-2xl">→</div>
            <div className="text-center">
              <div className="w-12 h-12 bg-[#9945FF] text-white rounded-full flex items-center justify-center font-black text-xl mx-auto mb-2 shadow-lg shadow-[#9945FF]/20">3</div>
              <p className="text-sm font-semibold text-white">Auto Benefits</p>
            </div>
          </div>
        </div>

        {/* Collection Info - Minimal */}
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 text-center mb-8">
          <p className="text-white text-sm">
            <strong>168 Total Supply</strong> • Verified on-chain via Magic Eden
          </p>
        </div>

        {/* CTA */}
        <div className="text-center">
          <Link
            href="/buy-credits"
            className="inline-block px-10 py-5 bg-[#9945FF] text-white font-black text-xl rounded-xl hover:bg-[#14F195] hover:shadow-2xl transition-all duration-200 shadow-lg shadow-[#9945FF]/20"
          >
            Get 50% Off Credits →
          </Link>
        </div>
      </div>
    </div>
  )
}
