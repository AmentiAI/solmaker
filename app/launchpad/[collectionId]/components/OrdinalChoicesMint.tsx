'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Phase, Collection } from './types'
import { NftCard } from './NftCard'
import { PaginationControls } from './PaginationControls'

interface Nft {
  id: string
  ordinal_number: number | null
  image_url: string
  thumbnail_url: string | null
  compressed_size_kb: number | null
  is_minted: boolean
  is_locked: boolean
  locked_until: string | null
  locked_by: string | null
}

interface PaginationInfo {
  page: number
  per_page: number
  total: number
  total_pages: number
  has_next: boolean
  has_prev: boolean
}

interface NftChoicesMintProps {
  collection: Collection
  activePhase: Phase | null
  collectionId: string
  currentAddress?: string
  isConnected: boolean
  isLive: boolean
  isPreview: boolean
  countdown: { [key: string]: string }
  priorityFee: number
  priorityFeeInput: string
  onPriorityFeeChange: (value: string) => void
  onPriorityFeeFocus: () => void
  onPriorityFeeBlur: (value: number) => void
  formatTimeUntil: (date: string) => string
  formatLamports: (lamports: number) => string
  onMint: (nftIds: string[]) => void
  minting: boolean
}

export function NftChoicesMint({
  collection,
  activePhase,
  collectionId,
  currentAddress,
  isConnected,
  isLive,
  isPreview,
  countdown,
  priorityFee,
  priorityFeeInput,
  onPriorityFeeChange,
  onPriorityFeeFocus,
  onPriorityFeeBlur,
  formatTimeUntil,
  formatLamports,
  onMint,
  minting,
}: NftChoicesMintProps) {
  const [nfts, setNfts] = useState<Nft[]>([])
  const [pagination, setPagination] = useState<PaginationInfo | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageInput, setPageInput] = useState('1')
  const [loading, setLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const isMountedRef = useRef(true)

  const selectedCount = selectedIds.size
  const maxSelectable = activePhase?.max_per_wallet ?? 1

  // Load NFTs from database
  const loadNfts = useCallback(async (page: number) => {
    if (!collectionId || !isMountedRef.current) return

    setLoading(true)
    try {
      const response = await fetch(
        `/api/launchpad/${collectionId}/ordinals?page=${page}&per_page=10`
      )
      if (!response.ok) {
        throw new Error('Failed to fetch NFTs')
      }
      const data = await response.json()
      if (isMountedRef.current) {
        setNfts(data.ordinals || [])
        setPagination(data.pagination || null)
        setPageInput(String(page))
      }
    } catch (error) {
      console.error('Error loading NFTs:', error)
    } finally {
      if (isMountedRef.current) {
        setLoading(false)
      }
    }
  }, [collectionId])

  // Toggle NFT selection (local state only — no server locking)
  const handleNftClick = useCallback((nft: Nft) => {
    if (!isConnected || !currentAddress || minting) return
    if (nft.is_minted) return

    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(nft.id)) {
        next.delete(nft.id)
      } else {
        if (next.size >= maxSelectable) {
          // At limit — don't add more
          return prev
        }
        next.add(nft.id)
      }
      return next
    })
  }, [isConnected, currentAddress, minting, maxSelectable])

  // Load NFTs when page changes
  useEffect(() => {
    if (isMountedRef.current) {
      loadNfts(currentPage)
    }
  }, [currentPage, loadNfts])

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const handlePageChange = useCallback((newPage: number) => {
    if (pagination && newPage >= 1 && newPage <= pagination.total_pages) {
      setCurrentPage(newPage)
    }
  }, [pagination])

  const handlePageInputSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    const page = parseInt(pageInput, 10)
    if (page >= 1 && pagination && page <= pagination.total_pages) {
      handlePageChange(page)
    } else {
      setPageInput(String(currentPage))
    }
  }, [pageInput, pagination, currentPage, handlePageChange])

  const handlePageInputChange = useCallback((value: string) => {
    setPageInput(value)
  }, [])

  // Check if phase is active
  const isPhaseActive = activePhase && isLive && (
    (!activePhase.start_time || new Date(activePhase.start_time) <= new Date()) &&
    (!activePhase.end_time || new Date(activePhase.end_time) > new Date())
  )

  if (loading && nfts.length === 0) {
    return (
      <div className="bg-[#1a1a1a] border border-[#D4AF37]/30 p-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-[#D4AF37] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-[#808080]">Loading NFTs...</p>
          </div>
        </div>
      </div>
    )
  }

  // Show countdown if phase hasn't started
  if (!isPhaseActive && activePhase) {
    const phaseStartTime = activePhase.start_time
    const countdownText = phaseStartTime
      ? (countdown[activePhase.id] || formatTimeUntil(phaseStartTime))
      : 'Phase not scheduled'

    return (
      <div className="bg-[#1a1a1a] border border-[#D4AF37]/30 p-6">
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-bold text-[#D4AF37] mb-2">Choose Your NFT</h2>
          <div className="bg-[#1a1a1a] border border-[#D4AF37]/30 p-6">
            <p className="text-[#808080] mb-2">Minting starts in:</p>
            <p className="text-3xl font-bold text-[#D4AF37]">{countdownText}</p>
            {activePhase.mint_price_lamports > 0 && (
              <p className="text-[#808080] mt-4">
                Price: {formatLamports(activePhase.mint_price_lamports)}
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Calculate supply values
  const maxSupply = collection.max_supply ?? collection.total_supply
  const totalMinted = collection.total_minted ?? 0
  const available = Math.max(0, maxSupply - totalMinted)

  return (
    <div className="bg-[#1a1a1a] border border-[#D4AF37]/30 p-6 space-y-6">
      {/* Supply Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-[#1a1a1a] border border-[#D4AF37]/30 p-4">
          <div className="text-xs text-[#808080] mb-1">Supply</div>
          <div className="text-xl font-bold text-white">
            {maxSupply.toLocaleString()}
          </div>
        </div>
        <div className="bg-[#1a1a1a] border border-[#D4AF37]/30 p-4">
          <div className="text-xs text-[#808080] mb-1">Total Minted</div>
          <div className="text-xl font-bold text-[#D4AF37]">
            {totalMinted.toLocaleString()}
          </div>
        </div>
        <div className="bg-[#1a1a1a] border border-[#D4AF37]/30 p-4">
          <div className="text-xs text-[#808080] mb-1">Available</div>
          <div className="text-xl font-bold text-[#D4AF37]">
            {available.toLocaleString()}
          </div>
        </div>
      </div>

      <div className="text-center">
        <h2 className="text-2xl font-bold text-[#D4AF37] mb-2">Browse Collection</h2>
        <p className="text-[#808080]">
          Preview the NFTs in this collection. The Candy Machine assigns NFTs sequentially on mint.
          {activePhase?.max_per_wallet === 1 && (
            <span className="block mt-1 text-sm text-[#D4AF37]">1 per wallet</span>
          )}
        </p>
      </div>

      <PaginationControls
        pagination={pagination}
        currentPage={currentPage}
        pageInput={pageInput}
        loading={loading}
        onPageChange={handlePageChange}
        onPageInputChange={handlePageInputChange}
        onPageInputSubmit={handlePageInputSubmit}
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {nfts.map((nft) => {
          const isSelected = selectedIds.has(nft.id)
          const canClick = !nft.is_minted && isConnected && !minting

          return (
            <NftCard
              key={nft.id}
              nft={nft}
              isSelected={isSelected}
              isLockedByMe={isSelected}
              isLockedByOther={false}
              canClick={canClick}
              lockExpirySeconds={null}
              isLocking={false}
              onClick={handleNftClick}
              currentAddress={currentAddress}
            />
          )
        })}
      </div>

      <PaginationControls
        pagination={pagination}
        currentPage={currentPage}
        pageInput={pageInput}
        loading={loading}
        onPageChange={handlePageChange}
        onPageInputChange={handlePageInputChange}
        onPageInputSubmit={handlePageInputSubmit}
      />

      {/* Mint button — shown when connected */}
      {isConnected && (
        <div className="pt-4 space-y-4">
          {(() => {
            if (!activePhase) return null

            const platformFeeSol = parseFloat(process.env.NEXT_PUBLIC_SOLANA_PLATFORM_FEE_SOL || '0.01')
            const platformFeeLamports = Math.floor(platformFeeSol * 1_000_000_000)
            const rentPerNft = 2_039_280
            const networkFees = (priorityFee + 5000)

            const mintPricePerNft = activePhase.mint_price_lamports || 0
            const totalEstimate = mintPricePerNft + platformFeeLamports + rentPerNft + networkFees

            return (
              <div className="mt-4 p-4 bg-[#1a1a1a] border border-[#D4AF37]/20">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs text-[#808080] font-semibold">Estimated Cost</span>
                </div>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-[#808080]">Mint Price</span>
                    <span className="text-white font-medium">
                      {mintPricePerNft === 0 ? 'Free' : formatLamports(mintPricePerNft)}
                    </span>
                  </div>
                  {platformFeeLamports > 0 && (
                    <div className="flex justify-between">
                      <span className="text-[#808080]">Platform Fee</span>
                      <span className="text-white font-medium">{formatLamports(platformFeeLamports)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-[#808080]">Rent + Network</span>
                    <span className="text-white font-medium">~{formatLamports(rentPerNft + networkFees)}</span>
                  </div>
                  <div className="border-t border-[#D4AF37]/20 pt-2 mt-2 flex justify-between">
                    <span className="text-[#808080] font-semibold">Estimated Total</span>
                    <span className="text-[#D4AF37] font-bold">~{formatLamports(totalEstimate)}</span>
                  </div>
                </div>
              </div>
            )
          })()}

          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onMint(Array.from(selectedIds))}
            disabled={
              minting ||
              (collection.total_minted >= collection.total_supply)
            }
            className="w-full py-4 bg-[#D4AF37] hover:bg-[#D4AF37]/80 text-black font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {collection.total_minted >= collection.total_supply ? 'Sold Out' :
             minting ? 'Minting...' : 'Mint Now'}
          </button>
        </div>
      )}
    </div>
  )
}

/** @deprecated Use NftChoicesMint instead */
export const OrdinalChoicesMint = NftChoicesMint
