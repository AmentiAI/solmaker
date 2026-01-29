'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Phase, Collection } from './types'
import { OrdinalCard } from './OrdinalCard'
import { PaginationControls } from './PaginationControls'

interface Ordinal {
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

interface OrdinalChoicesMintProps {
  collection: Collection
  activePhase: Phase | null
  collectionId: string
  currentAddress?: string
  isConnected: boolean
  isLive: boolean
  isPreview: boolean
  countdown: { [key: string]: string }
  mempoolHealth: any
  feeRate: number
  feeRateInput: string
  onFeeRateChange: (value: string) => void
  onFeeRateFocus: () => void
  onFeeRateBlur: (value: number) => void
  formatTimeUntil: (date: string) => string
  formatSats: (sats: number) => string
  onMint: (ordinalIds: string[]) => void
  minting: boolean
}

export function OrdinalChoicesMint({
  collection,
  activePhase,
  collectionId,
  currentAddress,
  isConnected,
  isLive,
  isPreview,
  countdown,
  mempoolHealth,
  feeRate,
  feeRateInput,
  onFeeRateChange,
  onFeeRateFocus,
  onFeeRateBlur,
  formatTimeUntil,
  formatSats,
  onMint,
  minting,
}: OrdinalChoicesMintProps) {
  const [ordinals, setOrdinals] = useState<Ordinal[]>([])
  const [pagination, setPagination] = useState<PaginationInfo | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageInput, setPageInput] = useState('1')
  const [loading, setLoading] = useState(true)
  const [isLocking, setIsLocking] = useState(false) // Only for preventing double-clicks during API call
  const isMountedRef = useRef(true)
  const [currentTime, setCurrentTime] = useState(Date.now()) // Force re-render for countdown timers

  // DERIVED FROM DATABASE - find ALL ordinals I have locked
  const myLockedOrdinals = useMemo(() => {
    if (!currentAddress) return []
    return ordinals.filter(o => o.is_locked && o.locked_by === currentAddress)
  }, [ordinals, currentAddress])
  
  // For backward compatibility - get the first locked ordinal
  const myLockedOrdinal = myLockedOrdinals.length > 0 ? myLockedOrdinals[0] : null
  
  // Total locked count
  const lockedCount = myLockedOrdinals.length

  // Load ordinals from database - this is the source of truth
  const loadOrdinals = useCallback(async (page: number) => {
    if (!collectionId || !isMountedRef.current) return

    setLoading(true)
    try {
      const response = await fetch(
        `/api/launchpad/${collectionId}/ordinals?page=${page}&per_page=10`
      )
      if (!response.ok) {
        throw new Error('Failed to fetch ordinals')
      }
      const data = await response.json()
      if (isMountedRef.current) {
        setOrdinals(data.ordinals || [])
        setPagination(data.pagination || null)
        setPageInput(String(page))
      }
    } catch (error) {
      console.error('Error loading ordinals:', error)
    } finally {
      if (isMountedRef.current) {
        setLoading(false)
      }
    }
  }, [collectionId])

  // Unlock an ordinal (cancel reservation) - then reload from DB
  const handleUnlock = useCallback(async (ordinal: Ordinal) => {
    if (!isConnected || !currentAddress || minting || isLocking) return
    if (!ordinal.is_locked || ordinal.locked_by !== currentAddress) return

    setIsLocking(true)
    try {
      const response = await fetch(
        `/api/launchpad/${collectionId}/reserve?wallet_address=${encodeURIComponent(currentAddress)}&ordinal_id=${ordinal.id}`,
        { method: 'DELETE' }
      )

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || 'Failed to unlock ordinal')
      }

      // Reload from DB - this is the source of truth
      await loadOrdinals(currentPage)
    } catch (error: any) {
      console.error('Error unlocking ordinal:', error)
      alert(error.message || 'Failed to unlock ordinal')
    } finally {
      if (isMountedRef.current) {
        setIsLocking(false)
      }
    }
  }, [isConnected, currentAddress, collectionId, minting, isLocking, currentPage, loadOrdinals])

  // Lock an ordinal when clicked - then reload from DB
  const handleOrdinalClick = useCallback(async (ordinal: Ordinal) => {
    if (!isConnected || !currentAddress || minting || isLocking) return
    if (ordinal.is_minted) return

    setIsLocking(true)

    try {
      // If already locked by me, unlock it
      if (ordinal.is_locked && ordinal.locked_by === currentAddress) {
        // Call unlock directly without setIsLocking (already set above)
        const response = await fetch(
          `/api/launchpad/${collectionId}/reserve?wallet_address=${encodeURIComponent(currentAddress)}&ordinal_id=${ordinal.id}`,
          { method: 'DELETE' }
        )
        if (!response.ok) {
          const err = await response.json()
          throw new Error(err.error || 'Failed to unlock ordinal')
        }
        // Reload from DB
        await loadOrdinals(currentPage)
        return
      }

      // If locked by someone else, can't click
      if (ordinal.is_locked && ordinal.locked_by !== currentAddress) {
        return
      }

      // Check max_per_wallet - can't lock more than allowed (check from DB state)
      if (activePhase?.max_per_wallet && lockedCount >= activePhase.max_per_wallet) {
        alert(`You can only lock ${activePhase.max_per_wallet} ordinal(s) at a time for this phase`)
        return
      }

      const response = await fetch(`/api/launchpad/${collectionId}/reserve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address: currentAddress,
          phase_id: activePhase?.id || null,
          quantity: 1,
          ordinal_id: ordinal.id, // For choices mint, specify the ordinal
        }),
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || 'Failed to lock ordinal')
      }

      // Reload from DB - this is the source of truth
      await loadOrdinals(currentPage)
    } catch (error: any) {
      console.error('Error locking ordinal:', error)
      alert(error.message || 'Failed to lock ordinal')
    } finally {
      if (isMountedRef.current) {
        setIsLocking(false)
      }
    }
  }, [isConnected, currentAddress, collectionId, activePhase, minting, isLocking, currentPage, loadOrdinals, lockedCount])

  // Check if any of my locks expired and reload - driven by database
  useEffect(() => {
    if (myLockedOrdinals.length === 0) return

    const checkExpiry = () => {
      if (!isMountedRef.current) return
      // Check if any lock has expired
      const now = Date.now()
      const hasExpired = myLockedOrdinals.some(o => {
        if (!o.locked_until) return false
        return new Date(o.locked_until).getTime() <= now
      })
      if (hasExpired) {
        // At least one lock expired, reload from DB
        loadOrdinals(currentPage)
      }
    }

    // Check every 2 seconds
    const interval = setInterval(checkExpiry, 2000)
    return () => clearInterval(interval)
  }, [myLockedOrdinals, currentPage, loadOrdinals])

  // Load ordinals when page changes
  useEffect(() => {
    if (isMountedRef.current) {
      loadOrdinals(currentPage)
    }
  }, [currentPage, loadOrdinals])

  // Update current time every second to refresh countdown timers
  useEffect(() => {
    const timeInterval = setInterval(() => {
      if (isMountedRef.current) {
        setCurrentTime(Date.now())
      }
    }, 1000)

    return () => clearInterval(timeInterval)
  }, [])

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
      // No local state to clear - everything is DB-driven
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

  if (loading && ordinals.length === 0) {
    return (
      <div className="cosmic-card border border-[#00d4ff]/30 rounded-xl p-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-[#00d4ff] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-white/80">Loading ordinals...</p>
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
      <div className="cosmic-card border border-[#00d4ff]/30 rounded-xl p-6">
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-bold text-white mb-2">Choose Your Ordinal</h2>
          <div className="bg-[#0a0e27]/50 border border-[#00d4ff]/30 rounded-lg p-6">
            <p className="text-white/70 mb-2">Minting starts in:</p>
            <p className="text-3xl font-bold text-[#00d4ff]">{countdownText}</p>
            {activePhase.mint_price_sats && (
              <p className="text-white/60 mt-4">
                Price: {formatSats(activePhase.mint_price_sats)}
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
    <div className="cosmic-card border border-[#00d4ff]/30 rounded-xl p-6 space-y-6">
      {/* Supply Stats - matching MintDetailsSection */}
      <div className="grid grid-cols-3 gap-3">
        <div className="cosmic-card border border-[#00d4ff]/30 rounded-xl p-4">
          <div className="text-xs text-gray-400 mb-1">Supply</div>
          <div className="text-xl font-bold text-white">
            {maxSupply.toLocaleString()}
          </div>
        </div>
        <div className="cosmic-card border border-[#00d4ff]/30 rounded-xl p-4">
          <div className="text-xs text-gray-400 mb-1">Total Minted</div>
          <div className="text-xl font-bold text-green-400">
            {totalMinted.toLocaleString()}
          </div>
        </div>
        <div className="cosmic-card border border-[#00d4ff]/30 rounded-xl p-4">
          <div className="text-xs text-gray-400 mb-1">Available</div>
          <div className="text-xl font-bold text-cosmic-blue">
            {available.toLocaleString()}
          </div>
        </div>
      </div>

      <div className="text-center">
        <h2 className="text-2xl font-bold text-white mb-2">Choose Your Ordinal</h2>
        <p className="text-white/70">
          Browse and select the ordinal you want to mint. Click on one to lock it for 2 minutes.
          {activePhase?.max_per_wallet === 1 && (
            <span className="block mt-1 text-sm text-amber-400">1 per wallet</span>
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
        {ordinals.map((ordinal) => {
          // All state derived from database (ordinals array)
          const isLockedByMe = ordinal.is_locked && ordinal.locked_by === currentAddress
          const isLockedByOther = ordinal.is_locked && ordinal.locked_by !== currentAddress
          const canClick = !ordinal.is_minted && isConnected && (isLockedByMe || !ordinal.is_locked) && !isLocking
          
          // Calculate lock expiry seconds from DB data
          let ordinalLockExpirySeconds: number | null = null
          if (isLockedByMe && ordinal.locked_until) {
            const expiryTime = new Date(ordinal.locked_until).getTime()
            if (expiryTime > currentTime) {
              ordinalLockExpirySeconds = Math.max(0, Math.floor((expiryTime - currentTime) / 1000))
            }
          }

          return (
            <OrdinalCard
              key={ordinal.id}
              ordinal={ordinal}
              isSelected={isLockedByMe} // Selected = locked by me (from DB)
              isLockedByMe={isLockedByMe}
              isLockedByOther={isLockedByOther}
              canClick={canClick}
              lockExpirySeconds={ordinalLockExpirySeconds}
              isLocking={isLocking}
              onClick={handleOrdinalClick}
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

      {/* Network Fee, Cost Breakdown, and Mint Button - matching MintDetailsSection layout */}
      {/* Only show when user has locked ordinals (from DB) */}
      {lockedCount > 0 && isConnected && (
        <div className="pt-4 space-y-4">
          {/* Network Fee Input - matching MintDetailsSection position */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Network Fee (sat/vB)
            </label>
            {mempoolHealth && (
              <div className="mb-3 p-3 bg-[#0a0e27]/60 border border-[#00d4ff]/30 rounded-lg">
                <p className="text-xs text-gray-300">
                  {mempoolHealth.suggestedFeeRate === -1 ? (
                    <span className="text-amber-400">
                      Unavailable - <a 
                        href="https://mempool.space" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="underline hover:text-amber-300"
                      >Check mempool.space</a> to find the last sub-1 sat block
                    </span>
                  ) : (
                    <>
                      Suggested: <span className="font-bold text-cosmic-blue">{mempoolHealth.suggestedFeeRate.toFixed(2)} sat/vB</span>
                      {mempoolHealth.lastSub1SatFee !== null && (
                        <span className="ml-2">- Last Sub Block: <span className="font-bold text-cosmic-blue">{mempoolHealth.lastSub1SatFee.toFixed(2)} sat/vB</span></span>
                      )}
                      {mempoolHealth.suggestedFeeRate >= 1.0 && (
                        <span className="ml-2 text-amber-400">
                          - High Fees - <a 
                            href="https://mempool.space" 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="underline hover:text-amber-300"
                          >Check mempool.space</a> to set lower. 
                        </span>
                      )}
                    </>
                  )}
                </p>
              </div>
            )}
            <input
              type="number"
              value={feeRateInput}
              onChange={(e) => onFeeRateChange(e.target.value)}
              onFocus={onFeeRateFocus}
              onBlur={(e) => onFeeRateBlur(parseFloat(e.target.value))}
              step="0.02"
              min="0.15"
              disabled={minting || (isPreview && !isLive)}
              className="w-full px-4 py-3 bg-[#0a0e27]/80 border border-[#00d4ff]/30 text-white rounded-lg focus:ring-2 focus:ring-[#00d4ff]/30 focus:border-[#00d4ff]/50 placeholder:text-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          {/* Estimated Cost Breakdown - matching MintDetailsSection format */}
          {isConnected && (() => {
            if (!activePhase || lockedCount === 0) return null

            // Calculate cost for ALL locked ordinals
            // Sum up sizes or use average for each
            let totalSizeKb = 0
            for (const ord of myLockedOrdinals) {
              totalSizeKb += ord.compressed_size_kb 
                ? Number(ord.compressed_size_kb) 
                : (collection.avg_ordinal_size_kb || 50)
            }
            const avgSizeKb = totalSizeKb / lockedCount
            
            // Calculate reveal cost based on total ordinal size
            // Formula: revealVSize = ((nonWitness * 4) + witnessSize) / 4
            // witnessSize = 65 + 110 + contentSizeBytes + 33 + 3 + (numChunks * 2)
            let totalRevealFee = 0
            for (const ord of myLockedOrdinals) {
              const sizeKb = ord.compressed_size_kb ? Number(ord.compressed_size_kb) : (collection.avg_ordinal_size_kb || 50)
              const sizeBytes = sizeKb * 1024
              const numChunks = Math.ceil(sizeBytes / 520)
              const witnessSize = 65 + 110 + sizeBytes + 33 + 3 + (numChunks * 2)
              const nonWitnessSize = 90 // base + output
              const revealVSize = Math.ceil(((nonWitnessSize * 4) + witnessSize) / 4)
              const revealFee = Math.ceil(revealVSize * feeRate)
              const outputValue = 330 // Taproot output
              const safetyBuffer = 20
              totalRevealFee += revealFee + outputValue + safetyBuffer
            }
            
            // Commit fee: base (150) + outputs (N ordinals + creator + platform + change) * 43
            const commitVSize = 150 + ((lockedCount + 3) * 43) // N ordinals + 3 other outputs
            const commitFee = Math.ceil(commitVSize * feeRate)
            
            // Calculate Inscribe + Fees (Platform Fee per ordinal + Reveal Costs + Commit Fee)
            const platformFees = 2500 * lockedCount // Platform fee is 2500 per ordinal
            const inscribeAndFees = platformFees + totalRevealFee + commitFee
            
            const mintPricePerOrdinal = activePhase.mint_price_sats || 0
            const totalMintPrice = mintPricePerOrdinal * lockedCount
            const totalEstimate = totalMintPrice + inscribeAndFees

            return (
              <div className="mt-4 p-4 bg-[#0a0e27]/60 border border-[#00d4ff]/20 rounded-xl">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs text-gray-400 font-semibold">Estimated Cost Breakdown</span>
                  <span className="text-xs bg-[#00d4ff]/20 text-[#00d4ff] px-2 py-0.5 rounded-full font-medium">
                    {lockedCount} ordinal{lockedCount > 1 ? 's' : ''} selected
                  </span>
                </div>
                <div className="space-y-1.5 text-sm">
                  {/* Mint Price - goes to creator */}
                  <div className="flex justify-between">
                    <span className="text-gray-400">
                      Mint Price {lockedCount > 1 ? `(${formatSats(mintPricePerOrdinal)} × ${lockedCount})` : ''}
                    </span>
                    <span className="text-white font-medium">
                      {totalMintPrice === 0 
                        ? 'Free' 
                        : formatSats(totalMintPrice)}
                    </span>
                  </div>
                  {/* Inscribe + Fees - combines Platform Fee, Reveal Cost, and Commit Fee */}
                  <div className="flex justify-between">
                    <span className="text-gray-400">Inscribe + Fees</span>
                    <span className="text-white font-medium">~{formatSats(inscribeAndFees)}</span>
                  </div>
                  <div className="border-t border-[#00d4ff]/20 pt-2 mt-2 flex justify-between">
                    <span className="text-gray-300 font-semibold">Estimated Total</span>
                    <span className="text-[#00d4ff] font-bold">~{formatSats(totalEstimate)}</span>
                  </div>
                </div>
                <p className="text-[10px] text-gray-500 mt-2">
                  * Based on ~{avgSizeKb.toFixed(0)}KB avg size × {lockedCount} ordinal{lockedCount > 1 ? 's' : ''} @ {feeRate.toFixed(2)} sat/vB
                </p>
              </div>
            )
          })()}

          {/* Mint Button - matching MintDetailsSection style */}
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onMint(myLockedOrdinals.map(o => o.id))}
            disabled={
              minting ||
              lockedCount === 0 ||
              myLockedOrdinals.some(o => o.locked_until && new Date(o.locked_until).getTime() <= Date.now()) ||
              (collection.total_minted >= collection.total_supply)
            }
            className="w-full py-4 btn-cosmic font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {collection.total_minted >= collection.total_supply ? 'Sold Out' : 
             minting ? 'Minting...' : 
             lockedCount > 1 ? `Mint ${lockedCount} Ordinals` : 'Mint Now'}
          </button>
          {/* Show earliest lock expiry */}
          {myLockedOrdinals.length > 0 && (() => {
            // Find the earliest expiry time among all locked ordinals
            const earliestExpiry = myLockedOrdinals
              .filter(o => o.locked_until)
              .map(o => new Date(o.locked_until!).getTime())
              .sort((a, b) => a - b)[0]
            
            if (!earliestExpiry) return null
            
            const secondsLeft = Math.max(0, Math.floor((earliestExpiry - currentTime) / 1000))
            if (secondsLeft > 0) {
              return (
                <p className="text-sm text-white/70 mt-2 text-center">
                  Lock{lockedCount > 1 ? 's expire' : ' expires'} in {secondsLeft} seconds
                </p>
              )
            }
            return null
          })()}
        </div>
      )}
    </div>
  )
}

