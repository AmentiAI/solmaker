'use client'

import { useState, useEffect } from 'react'
import { Phase, Collection, WhitelistStatus, UserMintStatus } from './types'
import { MAX_PER_TRANSACTION } from '@/lib/minting-constants'
import { getSolscanUrl, preloadSolscanNetwork } from '@/lib/solscan'

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

  useEffect(() => { preloadSolscanNetwork() }, [])

  return (
    <div className="lg:col-span-7">
      {/* Preview Mode Banner */}
      {isPreview && !isLive && (
        <div className="mb-4 p-4 bg-amber-500/20 border-2 border-amber-500">
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
      <div className="bg-[#1a1a1a] border border-[#D4AF37]/30 mb-4 overflow-hidden">
        <div className="p-4 flex items-center justify-between">
        <h1 className="text-3xl md:text-4xl font-black text-[#D4AF37]">{collection.name}</h1>
          {collection.description && (
            <button
              type="button"
              onClick={() => setAboutOpen(!aboutOpen)}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-[#D4AF37]/10 transition-all text-[#808080] hover:text-white border border-transparent hover:border-[#D4AF37]/30"
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
          <div className="px-4 pb-4 border-t border-[#D4AF37]/20 pt-3">
            <p className="text-[#808080] text-sm leading-relaxed whitespace-pre-wrap">{collection.description}</p>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-[#1a1a1a] border border-[#D4AF37]/30 p-4">
          <div className="text-xs text-[#808080] mb-1">Supply</div>
          <div className="text-xl font-bold text-white">
            {(collection.max_supply ?? collection.total_supply).toLocaleString()}
          </div>
        </div>
        <div className="bg-[#1a1a1a] border border-[#D4AF37]/30 p-4">
          <div className="text-xs text-[#808080] mb-1">Total Minted</div>
          <div className="text-xl font-bold text-[#D4AF37]">
            {collection.total_minted.toLocaleString()}
          </div>
        </div>
        <div className="bg-[#1a1a1a] border border-[#D4AF37]/30 p-4">
          <div className="text-xs text-[#808080] mb-1">Available</div>
          <div className="text-xl font-bold text-[#D4AF37]">
            {Math.max(0, (collection.max_supply ?? collection.total_supply) - collection.total_minted).toLocaleString()}
          </div>
        </div>
      </div>

      {/* Active Phase */}
      {activePhase ? (
        <div className="bg-[#1a1a1a] border border-[#D4AF37]/30 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-white">{activePhase.phase_name}</h2>
              {isLive ? (
                <span className="px-2 py-1 bg-[#D4AF37] text-black text-xs font-bold animate-pulse">
                  LIVE
                </span>
              ) : (
                <span className="px-2 py-1 bg-[#404040] text-white text-xs font-bold">
                  PREVIEW
                </span>
              )}
              {activePhase.whitelist_only && (
                <span className="px-2 py-1 bg-[#404040] text-white text-xs font-bold">
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
              <span className="text-[#808080] text-xs block mb-1">Price</span>
              <div className="text-[#D4AF37] font-bold text-base">
                {activePhase.mint_price_lamports === 0 ? 'Free' : formatLamports(activePhase.mint_price_lamports)}
              </div>
            </div>
            
            {activePhase.phase_allocation && (
              <div>
                <span className="text-[#808080] text-xs block mb-1">Phase Minted</span>
                <div className="font-semibold text-white text-base">
                  {activePhase.phase_minted} / {activePhase.phase_allocation}
                </div>
              </div>
            )}

            {isConnected && (
              <div>
                <span className="text-[#808080] text-xs block mb-1">Your Mints</span>
                <div className="font-bold text-[#D4AF37] text-base">
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
            <label className="block text-sm font-medium text-[#808080] mb-2">
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
              className="w-full px-4 py-3 bg-[#1a1a1a] border border-[#D4AF37]/30 text-white focus:ring-2 focus:ring-[#D4AF37]/30 focus:border-[#D4AF37]/50 placeholder:text-[#808080] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
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
                    className="w-[60%] px-3 py-4 bg-[#1a1a1a] border border-[#D4AF37]/30 text-white focus:ring-2 focus:ring-[#D4AF37]/30 focus:border-[#D4AF37]/50 text-center font-semibold placeholder:text-[#808080] transition-all"
                  />
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={onMaxClick}
                    className="w-[40%] py-4 bg-[#1a1a1a] hover:bg-[#404040] text-white text-sm font-semibold transition-all border border-[#D4AF37]/30 hover:border-[#D4AF37]/50"
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
                  className="w-full py-4 bg-[#D4AF37] hover:bg-[#D4AF37]/80 text-black font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
            <div className="text-center py-4 bg-[#1a1a1a] border border-[#D4AF37]/30">
              <p className="text-[#808080] mb-3">Not connected</p>
            </div>
          )}

          {/* Estimated Cost Breakdown */}
          {isConnected && (() => {
            const platformFeeSol = parseFloat(process.env.NEXT_PUBLIC_SOLANA_PLATFORM_FEE_SOL || '0.01')
            const platformFeeLamports = Math.floor(platformFeeSol * 1_000_000_000)
            const rentPerNft = 2_039_280 // ~0.00204 SOL rent for Core Asset account
            const networkFees = (priorityFee + 5000) * mintQuantity // priority fee + base tx fee

            const totalMintPrice = activePhase.mint_price_lamports * mintQuantity
            const totalPlatformFee = platformFeeLamports * mintQuantity
            const totalRent = rentPerNft * mintQuantity
            const totalEstimate = totalMintPrice + totalPlatformFee + totalRent + networkFees

            return (
              <div className="mt-4 p-4 bg-[#1a1a1a] border border-[#D4AF37]/20">
                <div className="text-xs text-[#808080] mb-2 font-semibold">Estimated Cost Breakdown</div>
                <div className="space-y-1.5 text-sm">
                  {/* Mint Price - goes to creator */}
                  <div className="flex justify-between">
                    <span className="text-[#808080]">Mint Price {mintQuantity > 1 ? `(${mintQuantity}x)` : ''}</span>
                    <span className="text-white font-medium">
                      {activePhase.mint_price_lamports === 0
                        ? 'Free'
                        : formatLamports(totalMintPrice)}
                    </span>
                  </div>
                  {/* Platform Fee */}
                  {platformFeeLamports > 0 && (
                    <div className="flex justify-between">
                      <span className="text-[#808080]">Platform Fee {mintQuantity > 1 ? `(${mintQuantity}x)` : ''}</span>
                      <span className="text-white font-medium">{formatLamports(totalPlatformFee)}</span>
                    </div>
                  )}
                  {/* Rent + Network */}
                  <div className="flex justify-between">
                    <span className="text-[#808080]">Rent + Network</span>
                    <span className="text-white font-medium">~{formatLamports(totalRent + networkFees)}</span>
                  </div>
                  <div className="border-t border-[#D4AF37]/20 pt-2 mt-2 flex justify-between">
                    <span className="text-[#808080] font-semibold">Estimated Total</span>
                    <span className="text-[#D4AF37] font-bold">~{formatLamports(totalEstimate)}</span>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* Status Messages */}
          {mintStatus && (
            <div className="mt-4 p-4 bg-blue-50 border border-blue-200">
              <p className="text-[#D4AF37] text-sm">{mintStatus}</p>
            </div>
          )}

          {error && (
            <div className="mt-4 p-4 bg-red-50 border-2 border-red-400">
              <p className="text-red-700 font-semibold text-sm leading-relaxed whitespace-pre-line">{error}</p>
            </div>
          )}

          {txSignature && (
            <div className="mt-4">
              <a
                href={getSolscanUrl(txSignature, 'tx')}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#D4AF37] hover:text-[#D4AF37]/80 hover:underline text-sm transition-colors"
              >
                View transaction on Solscan →
              </a>
            </div>
          )}
        </div>
      ) : null}

      {/* No phases at all */}
      {(!collection?.phases || collection.phases.length === 0) && (
        <div className="bg-yellow-50 border border-yellow-200 p-6 mt-6">
          <p className="text-yellow-700 font-semibold">No mint phases configured</p>
          <p className="text-yellow-600 text-sm mt-2">The collection owner needs to set up mint phases</p>
        </div>
      )}
    </div>
  )
}

