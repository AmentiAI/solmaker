'use client'

interface LaunchModeSelectorProps {
  onSelectMode: (mode: 'launchpad' | 'marketplace' | 'owner-mint') => void
}

export default function LaunchModeSelector({ onSelectMode }: LaunchModeSelectorProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-8">
      <h2 className="text-2xl font-bold text-gray-900 mb-3">Choose Your Launch Method</h2>
      <p className="text-gray-600 mb-8">How would you like to launch your collection?</p>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Launchpad Option */}
        <button
          onClick={() => onSelectMode('launchpad')}
          className="group bg-white border-2 border-gray-200 rounded-xl p-6 text-left hover:border-[#e27d0f] hover:shadow-lg transition-all"
        >
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-[#e27d0f]/10 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-[#e27d0f]/20 transition-colors">
              <span className="text-2xl">🚀</span>
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-bold text-gray-900 mb-2">Launchpad</h3>
              <p className="text-gray-600 text-sm mb-3">
                Let collectors mint NFTs. Set up phases, pricing, and whitelists
              </p>
              <ul className="text-sm text-[#a8a8b8]/80 space-y-1">
                <li>✓ Public or whitelisted minting</li>
                <li>✓ Multiple mint phases</li>
                <li>✓ Custom pricing per phase</li>
                <li>✓ Automated minting</li>
              </ul>
            </div>
          </div>
        </button>

        {/* Owner Mint Option */}
        <button
          onClick={() => onSelectMode('owner-mint')}
          className="group bg-white border-2 border-gray-200 rounded-xl p-6 text-left hover:border-[#4561ad] hover:shadow-lg transition-all"
        >
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-[#4561ad]/10 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-[#4561ad]/20 transition-colors">
              <span className="text-2xl">⚡</span>
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-bold text-gray-900 mb-2">Owner Mint</h3>
              <p className="text-gray-600 text-sm mb-3">
                Mint specific NFTs from your collection outside the launchpad
              </p>
              <ul className="text-sm text-[#a8a8b8]/80 space-y-1">
                <li>✓ Mint to specific wallets</li>
                <li>✓ Reserve pieces for team/giveaways</li>
                <li>✓ Pre-mint before launch</li>
                <li>✓ Manual control</li>
              </ul>
            </div>
          </div>
        </button>

        {/* Marketplace Option */}
        <button
          onClick={() => onSelectMode('marketplace')}
          className="group bg-white border-2 border-gray-200 rounded-xl p-6 text-left hover:border-green-500 hover:shadow-lg transition-all"
        >
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-green-500/10 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-green-500/20 transition-colors">
              <span className="text-2xl">💰</span>
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-bold text-gray-900 mb-2">Sell on Marketplace</h3>
              <p className="text-gray-600 text-sm mb-3">
                Sell your entire collection (as images) for SOL or credits before minting
              </p>
              <ul className="text-sm text-[#a8a8b8]/80 space-y-1">
                <li>✓ Sell collection for SOL or credits</li>
                <li>✓ Include promotional materials</li>
                <li>✓ Transfer full ownership</li>
                <li>✓ Never mint it yourself</li>
              </ul>
            </div>
          </div>
        </button>
      </div>
    </div>
  )
}

