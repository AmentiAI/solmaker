'use client'

import { useState } from 'react'
import { Phase, Collection, WhitelistStatus, UserMintStatus } from './types'
import { MAX_PER_TRANSACTION } from '@/lib/minting-constants'

interface MintDetailsSectionProps {
  collection: Collection
  activePhase: Phase | null
  isConnected: boolean
  currentAddress?: string
  whitelistStatus: WhitelistStatus | null
  userMintStatus: UserMintStatus | null
  client: any
  isLiveConnection: boolean
  isLive: boolean // Collection is launched and mintable
  isPreview: boolean // Collection is in preview mode (set to launchpad but not launched yet)
  countdown: { [key: string]: string }
  priorityFee: number
  priorityFeeInput: string
  mintQuantity: number
  mintQuantityInput: string
  minting: boolean
  mintStatus: string
  error: string
  txSignature: string
  onPriorityFeeChange: (value: string) => void
  onPriorityFeeFocus: () => void
  onPriorityFeeBlur: (value: number) => void
  onQuantityChange: (value: string) => void
  onQuantityBlur: (value: number) => void
  onMaxClick: () => void
  onMint: () => void
  formatLamports: (lamports: number) => string
  formatTimeUntil: (date: string) => string
}

export function MintDetailsSection({
  collection,
  activePhase,
  isConnected,
  currentAddress,
  whitelistStatus,
  userMintStatus,
  client,
  isLiveConnection,
  isLive,
  isPreview,
  countdown,
  priorityFee,
  priorityFeeInput,
  mintQuantity,
  mintQuantityInput,
  minting,
  mintStatus,
  error,
  txSignature,
  onPriorityFeeChange,
  onPriorityFeeFocus,
  onPriorityFeeBlur,
  onQuantityChange,
  onQuantityBlur,
  onMaxClick,
  onMint,
  formatLamports,
  formatTimeUntil,
}: MintDetailsSectionProps) {
  const [aboutOpen, setAboutOpen] = useState(false)
  
  return (
    <div className="lg:col-span-7">
      {/* Preview Mode Banner */}
      {isPreview && !isLive && (
        <div className="mb-4 p-4 bg-amber-500/20 border-2 border-amber-500 rounded-xl">
          <div className="flex items-center gap-2 text-amber-400 font-bold">
            <span className="text-xl">⚠️</span>
            <span>Preview Mode</span>
          </div>
          <p className="text-amber-300/80 text-sm mt-1">
            This collection is not live yet. Minting is disabled until the collection is officially launched.
          </p>
        </div>
      )}

      {/* Collection Name with About Dropdown */}
      <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#9945FF]/30 rounded-xl mb-4 overflow-hidden">
        <div className="p-4 flex items-center justify-between">
        <h1 className="text-3xl md:text-4xl font-black bg-gradient-to-r from-[#9945FF] to-[#DC1FFF] bg-clip-text text-transparent">{collection.name}</h1>
          {collection.description && (
            <button
              type="button"
              onClick={() => setAboutOpen(!aboutOpen)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-[#9945FF]/10 transition-all text-[#a8a8b8] hover:text-white border border-transparent hover:border-[#9945FF]/30"
              aria-label={aboutOpen ? 'Hide about' : 'Show about'}
            >
              <span className="text-sm font-medium hidden sm:inline">About</span>
              <svg 
                className={`w-5 h-5 transition-transform duration-200 ${aboutOpen ? 'rotate-180' : ''}`} 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}
        </div>
        {/* About Section Dropdown */}
        {collection.description && aboutOpen && (
          <div className="px-4 pb-4 border-t border-[#9945FF]/20 pt-3">
            <p className="text-[#a8a8b8] text-sm leading-relaxed whitespace-pre-wrap">{collection.description}</p>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#9945FF]/30 rounded-xl p-4">
          <div className="text-xs text-[#a8a8b8] mb-1">Supply</div>
          <div className="text-xl font-bold text-white">
            {(collection.max_supply ?? collection.total_supply).toLocaleString()}
          </div>
        </div>
        <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#00d4ff]/30 rounded-xl p-4">
          <div className="text-xs text-[#a8a8b8] mb-1">Total Minted</div>
          <div className="text-xl font-bold text-green-400">
            {collection.total_minted.toLocaleString()}
          </div>
        </div>
        <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#00d4ff]/30 rounded-xl p-4">
          <div className="text-xs text-[#a8a8b8] mb-1">Available</div>
          <div className="text-xl font-bold text-cosmic-blue">
            {Math.max(0, (collection.max_supply ?? collection.total_supply) - collection.total_minted).toLocaleString()}
          </div>
        </div>
      </div>

      {/* Active Phase */}
      {activePhase ? (
        <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#9945FF]/30 rounded-2xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-white">{activePhase.phase_name}</h2>
              {isLive ? (
                <span className="px-2 py-1 bg-gradient-to-r from-[#14F195] to-[#19FB9B] text-[#0a0a0f] text-xs font-bold rounded animate-pulse">
                  LIVE
                </span>
              ) : (
                <span className="px-2 py-1 bg-gradient-to-r from-[#DC1FFF] to-[#9945FF] text-white text-xs font-bold rounded">
                  PREVIEW
                </span>
              )}
              {activePhase.whitelist_only && (
                <span className="px-2 py-1 bg-gradient-to-r from-[#9945FF] to-[#7C3AED] text-white text-xs font-bold rounded">
                  WL
                </span>
              )}
            </div>
            {activePhase.end_time && (
              <span className="text-orange-600 font-bold text-sm tabular-nums">
                ⏰ {countdown[activePhase.id] || formatTimeUntil(activePhase.end_time)}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mb-4">
            <div>
              <span className="text-[#a8a8b8] text-xs block mb-1">Price</span>
              <div className="text-[#9945FF] font-bold text-base">
                {activePhase.mint_price_lamports === 0 ? 'Free' : formatLamports(activePhase.mint_price_lamports)}
              </div>
            </div>
            
            {activePhase.phase_allocation && (
              <div>
                <span className="text-[#a8a8b8] text-xs block mb-1">Phase Minted</span>
                <div className="font-semibold text-white text-base">
                  {activePhase.phase_minted} / {activePhase.phase_allocation}
                </div>
              </div>
            )}
            
            {isConnected && (
              <div>
                <span className="text-[#a8a8b8] text-xs block mb-1">Your Mints</span>
                <div className="font-bold text-cosmic-blue text-base">
                  {activePhase.whitelist_only && whitelistStatus?.is_whitelisted && whitelistStatus.allocation !== undefined
                    ? `${whitelistStatus.minted_count || 0} / ${whitelistStatus.allocation}`
                    : !activePhase.whitelist_only
                    ? `${userMintStatus?.minted_count || 0} / ${activePhase.max_per_wallet ?? 'Unlimited'}`
                    : '...'
                  }
                </div>
              </div>
            )}
          </div>

          {/* Error states */}
          {isConnected && activePhase.whitelist_only && whitelistStatus && !whitelistStatus.is_whitelisted && (
            <div className="p-3 rounded-lg mb-4 bg-red-50 border border-red-200">
              <p className="text-red-700 font-semibold text-sm">
                ❌ Not Whitelisted: <span className="font-mono text-xs">{currentAddress?.slice(0, 8)}...{currentAddress?.slice(-6)}</span>
              </p>
            </div>
          )}
          {isConnected && activePhase.whitelist_only && whitelistStatus?.is_whitelisted && whitelistStatus.remaining_allocation === 0 && (
            <div className="p-3 rounded-lg mb-4 bg-yellow-50 border border-yellow-200">
              <p className="text-yellow-700 font-semibold text-sm">
                ⚠️ Allocation used ({whitelistStatus.minted_count} / {whitelistStatus.allocation})
              </p>
            </div>
          )}
          {isConnected && !activePhase.whitelist_only && userMintStatus?.remaining === 0 && (
            <div className="p-3 rounded-lg mb-4 bg-yellow-50 border border-yellow-200">
              <p className="text-yellow-700 font-semibold text-sm">
                ⚠️ Max mints reached ({userMintStatus.minted_count} / {userMintStatus.max_per_wallet})
              </p>
            </div>
          )}
          {client && isConnected && currentAddress && !isLiveConnection && (
            <div className="p-3 rounded-lg mb-4 bg-orange-50 border border-orange-200">
              <p className="text-orange-700 font-semibold text-sm">
                ⚠️ Wallet reconnecting... Please wait or disconnect and reconnect your wallet.
              </p>
              <p className="text-orange-600 text-xs mt-1">
                Minting is disabled until wallet connection is fully established.
              </p>
            </div>
          )}

          {/* Priority Fee Input */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-[#a8a8b8] mb-2">
              Priority Fee (lamports)
            </label>
            <input
              type="number"
              value={priorityFeeInput}
              onChange={(e) => onPriorityFeeChange(e.target.value)}
              onFocus={onPriorityFeeFocus}
              onBlur={(e) => onPriorityFeeBlur(parseFloat(e.target.value))}
              step="1000"
              min="0"
              disabled={minting || (isPreview && !isLive)}
              className="w-full px-4 py-3 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 border border-[#9945FF]/30 text-white rounded-lg focus:ring-2 focus:ring-[#9945FF]/30 focus:border-[#9945FF]/50 placeholder:text-[#a8a8b8] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            />
          </div>

          {/* Quantity and Mint Button */}
          {isConnected ? (
            <div className="flex gap-3 items-start">
              <div className="w-[35%]">
                <div className="flex gap-1">
                  <input
                    type="number"
                    value={mintQuantityInput}
                    onChange={(e) => onQuantityChange(e.target.value)}
                    onBlur={(e) => onQuantityBlur(parseInt(e.target.value))}
                    min="1"
                    max={MAX_PER_TRANSACTION}
                    className="w-[60%] px-3 py-4 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 border border-[#9945FF]/30 text-white rounded-lg focus:ring-2 focus:ring-[#9945FF]/30 focus:border-[#9945FF]/50 text-center font-semibold placeholder:text-[#a8a8b8] transition-all"
                  />
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={onMaxClick}
                    className="w-[40%] py-4 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 hover:from-[#1a1a24] hover:to-[#202030] text-white text-sm font-semibold rounded-lg transition-all border border-[#9945FF]/30 hover:border-[#9945FF]/50"
                  >
                    Max
                  </button>
                </div>
              </div>

              <div className="w-[65%]">
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={onMint}
                  disabled={
                    !isLive || // Disable if not live (preview mode)
                    minting ||
                    !isLiveConnection ||
                    mintQuantity < 1 ||
                    (collection.total_minted >= collection.total_supply) || // Disable if collection is sold out
                    (activePhase.whitelist_only && !whitelistStatus?.is_whitelisted) ||
                    (activePhase.whitelist_only && whitelistStatus?.remaining_allocation === 0) ||
                    (!activePhase.whitelist_only && userMintStatus?.remaining === 0)
                  }
                  className="w-full py-4 bg-gradient-to-r from-[#9945FF] to-[#DC1FFF] hover:from-[#DC1FFF] hover:to-[#9945FF] text-white font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#9945FF]/20 hover:shadow-[#9945FF]/40"
                >
                  {!isLive ? 'Not Live Yet' : 
                   (collection.total_minted >= collection.total_supply) ? 'Sold Out' :
                   minting ? mintStatus || 'Minting...' : 
                   (client && !isLiveConnection) ? 'Reconnecting...' : 
                   `Mint ${mintQuantity > 1 ? `${mintQuantity} ` : ''}Now`}
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-4 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md rounded-xl border border-[#9945FF]/30">
              <p className="text-[#a8a8b8] mb-3">Not connected</p>
            </div>
          )}

          {/* Estimated Cost Breakdown */}
          {isConnected && (() => {
            // Solana: flat rent + priority fee, no complex vsize calculation
            const rentPerNft = 2039280 // ~0.00204 SOL rent-exempt minimum for token account
            const platformFee = 10000 * mintQuantity // Platform fee per NFT in lamports
            const networkFees = (priorityFee + 5000) * mintQuantity // priority fee + base tx fee
            const mintAndFees = platformFee + networkFees + (rentPerNft * mintQuantity)

            const totalEstimate =
              (activePhase.mint_price_lamports * mintQuantity) + // Mint price
              mintAndFees // Mint + Fees

            return (
              <div className="mt-4 p-4 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 border border-[#9945FF]/20 rounded-xl">
                <div className="text-xs text-[#a8a8b8] mb-2 font-semibold">Estimated Cost Breakdown</div>
                <div className="space-y-1.5 text-sm">
                  {/* Mint Price - goes to creator */}
                  <div className="flex justify-between">
                    <span className="text-[#a8a8b8]">Mint Price {mintQuantity > 1 ? `(${mintQuantity}x)` : ''}</span>
                    <span className="text-white font-medium">
                      {activePhase.mint_price_lamports === 0
                        ? 'Free'
                        : formatLamports(activePhase.mint_price_lamports * mintQuantity)}
                    </span>
                  </div>
                  {/* Mint + Fees - combines Platform Fee, Rent, and Network Fee */}
                  <div className="flex justify-between">
                    <span className="text-[#a8a8b8]">Mint + Fees</span>
                    <span className="text-white font-medium">~{formatLamports(mintAndFees)}</span>
                  </div>
                  <div className="border-t border-[#9945FF]/20 pt-2 mt-2 flex justify-between">
                    <span className="text-[#a8a8b8] font-semibold">Estimated Total</span>
                    <span className="bg-gradient-to-r from-[#9945FF] to-[#DC1FFF] bg-clip-text text-transparent font-bold">~{formatLamports(totalEstimate)}</span>
                  </div>
                </div>
                <p className="text-[10px] text-[#a8a8b8] mt-2">
                  * Includes rent, platform fee, and network fees
                </p>
              </div>
            )
          })()}

          {/* Status Messages */}
          {mintStatus && (
            <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-[#14F195] text-sm">{mintStatus}</p>
            </div>
          )}

          {error && (
            <div className="mt-4 p-4 bg-red-50 border-2 border-red-400 rounded-lg">
              <p className="text-red-700 font-semibold text-sm leading-relaxed whitespace-pre-line">{error}</p>
            </div>
          )}

          {txSignature && (
            <div className="mt-4">
              <a
                href={`https://solscan.io/tx/${txSignature}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#9945FF] hover:text-[#DC1FFF] hover:underline text-sm transition-colors"
              >
                View transaction on Solscan →
              </a>
            </div>
          )}
        </div>
      ) : null}

      {/* No phases at all */}
      {(!collection?.phases || collection.phases.length === 0) && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 mt-6">
          <p className="text-yellow-700 font-semibold">No mint phases configured</p>
          <p className="text-yellow-600 text-sm mt-2">The collection owner needs to set up mint phases</p>
        </div>
      )}
    </div>
  )
}

