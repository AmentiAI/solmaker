'use client'

import { Collection } from '../types'

interface LaunchHeaderProps {
  collection: Collection
  serverTime: Date | null
  launchStatus: string
  onLaunchMint?: () => void
  onEndMint?: () => void
  saving?: boolean
  phasesCount?: number
  actualMintedCount?: number
  totalSupply?: number
  launchMode?: 'owner-mint' | 'launchpad' | 'marketplace' | null
  onShowMetadata?: () => void
}

export default function LaunchHeader({
  collection,
  serverTime,
  launchStatus,
  onLaunchMint,
  onEndMint,
  saving = false,
  phasesCount = 0,
  actualMintedCount,
  totalSupply,
  launchMode,
  onShowMetadata,
}: LaunchHeaderProps) {
  return (
    <div className="mb-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-[#4561ad] to-[#e27d0f] bg-clip-text text-transparent">
            🚀 Launch Settings
          </h1>
          <p className="text-[#a8a8b8]/80 mt-1">{collection.name}</p>
          {serverTime && (
            <div className="mt-3 flex flex-wrap gap-3 text-sm">
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                <span className="text-[#9945FF] font-semibold">Server Time (UTC):</span>
                <span className="ml-2 font-mono text-blue-900">
                  {serverTime.toISOString().slice(0, 19).replace('T', ' ')}
                </span>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                <span className="text-green-600 font-semibold">Your Local Time:</span>
                <span className="ml-2 font-mono text-green-900">
                  {serverTime.toLocaleString()}
                </span>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <span className="text-amber-600 font-semibold">Your Timezone:</span>
                <span className="ml-2 font-mono text-amber-900">
                  {Intl.DateTimeFormat().resolvedOptions().timeZone}
                </span>
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          {launchStatus === 'draft' && onLaunchMint && (
            <button
              onClick={onLaunchMint}
              disabled={saving || phasesCount === 0}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
            >
              🚀 Launch Mint
            </button>
          )}
          {launchStatus === 'active' && onEndMint && (
            <button
              onClick={onEndMint}
              disabled={saving}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
            >
              ⏹ End Mint
            </button>
          )}
        </div>
      </div>

      {/* Status Banner */}
      {launchMode === 'owner-mint' ? (
        <div className="mt-4 p-4 rounded-lg bg-blue-50 border border-blue-200">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-[#14F195]">
              ⚡ Owner Mint Mode
            </span>
          </div>
          <p className="text-sm text-gray-600 mt-2">
            Mint NFTs directly to specific wallets. Perfect for team reserves, giveaways, or pre-launch distribution.
          </p>
          {totalSupply && (
            <p className="text-sm text-gray-600 mt-2">
              Minted: <span className="font-semibold text-[#9945FF]">{actualMintedCount || 0}</span> / {totalSupply}
            </p>
          )}
        </div>
      ) : (
        <div className={`mt-4 p-4 rounded-lg ${
          launchStatus === 'active' 
            ? 'bg-green-50 border border-green-200' 
            : launchStatus === 'completed'
            ? 'bg-gray-50 border border-gray-200'
            : 'bg-yellow-50 border border-yellow-200'
        }`}>
          <div className="flex items-center gap-2">
            <span className={`text-lg ${
              launchStatus === 'active' ? 'animate-pulse' : ''
            }`}>
              {launchStatus === 'active' ? '🔴' : launchStatus === 'completed' ? '✅' : '📝'}
            </span>
            <span className={`font-medium ${
              launchStatus === 'active' 
                ? 'text-green-700' 
                : launchStatus === 'completed'
                ? 'text-gray-700'
                : 'text-yellow-700'
            }`}>
              {launchStatus === 'active'
                ? 'Mint is LIVE!'
                : launchStatus === 'scheduled'
                ? 'Mint Scheduled'
                : launchStatus === 'completed'
                ? 'Mint Completed'
                : 'Draft - Configure your mint settings below'}
            </span>
          </div>
          {totalSupply && (
            <p className="text-sm text-gray-600 mt-2">
              Progress: <span className="font-semibold text-green-600">{collection.total_minted || 0}</span> / {totalSupply} minted
            </p>
          )}
        </div>
      )}
    </div>
  )
}

