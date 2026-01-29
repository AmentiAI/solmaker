'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { useWallet } from '@/lib/wallet/compatibility'

interface Ordinal {
  id: string
  inscriptionId?: string
  inscriptionNumber?: number
  collectionSymbol?: string
  name?: string
  image?: string
  thumbnail?: string
  contentURI?: string
  contentPreviewURI?: string
  owner?: string
  listedPrice?: number
  listedPriceUnit?: string
  contentType?: string
  contentLength?: number
  timestamp?: number
  meta?: {
    name?: string
    attributes?: Array<{ trait_type: string; value: string }>
  }
  [key: string]: any
}

interface OrdinalsData {
  success: boolean
  wallet_address: string
  ordinals: Ordinal[]
  total: number
}

export default function RewardsPage() {
  const { isConnected, currentAddress } = useWallet()
  const [ordinalsData, setOrdinalsData] = useState<OrdinalsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [ordmakerCount, setOrdmakerCount] = useState<number | null>(null)
  const [loadingOrdmakers, setLoadingOrdmakers] = useState(false)
  const [attemptStatus, setAttemptStatus] = useState<any>(null)
  const [loadingAttemptStatus, setLoadingAttemptStatus] = useState(false)
  const [attempting, setAttempting] = useState(false)
  const [spinAnimation, setSpinAnimation] = useState(false)
  const [lastAttemptResult, setLastAttemptResult] = useState<any>(null)
  const [claiming, setClaiming] = useState(false)

  useEffect(() => {
    loadOrdinals()
  }, [])

  useEffect(() => {
    if (isConnected && currentAddress) {
      loadOrdmakerCount()
      loadAttemptStatus()
    } else {
      setOrdmakerCount(null)
      setAttemptStatus(null)
    }
  }, [isConnected, currentAddress])

  const loadOrdinals = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/rewards/ordinals')
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to load ordinals')
      }

      const data = await response.json()
      setOrdinalsData(data)
    } catch (err: any) {
      console.error('Error loading ordinals:', err)
      setError(err.message || 'Failed to load ordinals')
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await loadOrdinals()
    if (isConnected && currentAddress) {
      await loadOrdmakerCount()
    }
    setRefreshing(false)
  }

  const loadOrdmakerCount = async () => {
    if (!currentAddress) return

    setLoadingOrdmakers(true)
    try {
      const response = await fetch(`/api/payouts/owed?wallet_address=${encodeURIComponent(currentAddress)}`)
      
      if (!response.ok) {
        console.warn('Failed to load ordmaker count')
        setOrdmakerCount(0)
        return
      }

      const data = await response.json()
      setOrdmakerCount(data.ordmaker_count || 0)
    } catch (err: any) {
      console.error('Error loading ordmaker count:', err)
      setOrdmakerCount(0)
    } finally {
      setLoadingOrdmakers(false)
    }
  }

  const loadAttemptStatus = async () => {
    if (!currentAddress) return

    setLoadingAttemptStatus(true)
    try {
      const response = await fetch(`/api/rewards/attempt?wallet_address=${encodeURIComponent(currentAddress)}`)
      
      if (!response.ok) {
        console.warn('Failed to load attempt status')
        return
      }

      const data = await response.json()
      setAttemptStatus(data)
      
      // If there's a last attempt and it was a win, set it as the last result
      if (data.last_attempt && data.last_attempt.result === 'win') {
        setLastAttemptResult({
          won: true,
          won_ordinal: {
            id: data.last_attempt.won_ordinal_id,
            inscription_id: data.last_attempt.won_ordinal_inscription_id,
            inscription_number: data.last_attempt.won_ordinal_inscription_number,
            name: `Ordinal #${data.last_attempt.won_ordinal_inscription_number || 'Unknown'}`,
          },
          win_chance_percent: (parseFloat(data.last_attempt.win_chance) * 100).toFixed(4),
          attempt_id: data.last_attempt.id,
          claimed: data.last_attempt.claimed || false,
          claim_txid: data.last_attempt.claim_txid,
        })
      } else if (data.last_attempt && data.last_attempt.result === 'lose') {
        setLastAttemptResult({
          won: false,
          win_chance_percent: (parseFloat(data.last_attempt.win_chance) * 100).toFixed(4),
        })
      }
    } catch (err: any) {
      console.error('Error loading attempt status:', err)
    } finally {
      setLoadingAttemptStatus(false)
    }
  }

  const handleAttempt = async () => {
    if (!currentAddress || !ordmakerCount || ordmakerCount < 1) {
      return
    }

    if (attemptStatus && !attemptStatus.can_attempt) {
      return
    }

    setAttempting(true)
    setSpinAnimation(true)
    setLastAttemptResult(null)

    try {
      const response = await fetch('/api/rewards/attempt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address: currentAddress,
          ordmaker_count: ordmakerCount,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to process attempt')
      }

      setLastAttemptResult(data)
      
      // Reload attempt status after a delay
      setTimeout(() => {
        loadAttemptStatus()
      }, 2000)

    } catch (err: any) {
      console.error('Error attempting reward:', err)
      setError(err.message || 'Failed to process attempt')
    } finally {
      setTimeout(() => {
        setSpinAnimation(false)
        setAttempting(false)
      }, 3000) // Keep animation for 3 seconds
    }
  }

  const handleClaim = async () => {
    if (!currentAddress || !lastAttemptResult?.attempt_id) {
      return
    }

    setClaiming(true)
    setError(null)

    try {
      const response = await fetch('/api/rewards/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attempt_id: lastAttemptResult.attempt_id,
          winner_wallet_address: currentAddress,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to claim reward')
      }

      // Update the last attempt result to show it's claimed
      setLastAttemptResult({
        ...lastAttemptResult,
        claimed: true,
        claim_txid: data.txid,
      })

      // Reload attempt status
      await loadAttemptStatus()

    } catch (err: any) {
      console.error('Error claiming reward:', err)
      setError(err.message || 'Failed to claim reward')
    } finally {
      setClaiming(false)
    }
  }

  const formatSats = (sats: number) => {
    if (sats >= 100000000) {
      return `${(sats / 100000000).toFixed(8)} BTC`
    }
    return `${sats.toLocaleString()} sats`
  }

  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Hero Header */}
        <div className="relative bg-gradient-to-r from-[#0a0e27]/90 via-[#1a1f3a]/90 to-[#0f172a]/90 text-white border-b border-[#00d4ff]/30 rounded-2xl mb-8 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-[#00d4ff]/10 via-transparent to-[#8b5cf6]/10" />
          <div className="relative p-8">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="text-4xl font-black text-white mb-2">
                  <span className="text-cosmic-gradient">🎁 Community Rewards</span>
                </h1>
                <p className="text-white/70 text-lg">
                  Ordinals held in the community payout wallet
                </p>
              </div>
              <button
                onClick={handleRefresh}
                disabled={refreshing || loading}
                className="px-6 py-3 bg-gradient-to-r from-[#00d4ff] to-[#8b5cf6] hover:from-[#00b8e6] hover:to-[#7c3aed] text-white rounded-lg font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-[#00d4ff]/30"
              >
                {refreshing || loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Refreshing...
                  </>
                ) : (
                  <>
                    <span>🔄</span>
                    Refresh
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-500/20 border-2 border-red-500/50 rounded-xl text-red-400 flex items-center justify-between cosmic-card">
            <p className="font-semibold">⚠️ {error}</p>
            <button
              onClick={() => setError(null)}
              className="text-red-400 hover:text-red-300 ml-4 text-xl"
            >
              ×
            </button>
          </div>
        )}

      

        {/* Gambling Feature - Only for holders with at least 1 ordmaker */}
        {isConnected && currentAddress && ordmakerCount !== null && ordmakerCount >= 1 && (
          <div className="cosmic-card border-2 border-[#ff6b35]/30 rounded-xl shadow-lg p-6 mb-6">
            {/* Header */}
            <div className="text-center mb-4">
              <h2 className="text-3xl font-black text-white mb-1">
                <span className="text-cosmic-gradient">🎰 Try Your Luck</span>
              </h2>
              <p className="text-white/70 text-sm">
                Spin to win an ordinal from the payout wallet!
              </p>
            </div>

            {/* Stats Grid - 4 Columns */}
            {ordmakerCount >= 1 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="cosmic-card border-2 border-[#00d4ff]/30 rounded-lg p-3 text-center bg-gradient-to-br from-[#00d4ff]/10 to-transparent">
                  <div className="text-xl mb-1">🎯</div>
                  <div className="text-xs text-white/60 mb-0.5 uppercase tracking-wider">Ordmakers</div>
                  <div className="text-xl font-black text-[#00d4ff]">{ordmakerCount}</div>
                </div>
                <div className="cosmic-card border-2 border-[#8b5cf6]/30 rounded-lg p-3 text-center bg-gradient-to-br from-[#8b5cf6]/10 to-transparent">
                  <div className="text-xl mb-1">✨</div>
                  <div className="text-xs text-white/60 mb-0.5 uppercase tracking-wider">Luck</div>
                  <div className="text-xl font-black text-[#8b5cf6]">{ordmakerCount * 50}</div>
                </div>
                <div className="cosmic-card border-2 border-[#ff6b35]/30 rounded-lg p-3 text-center bg-gradient-to-br from-[#ff6b35]/10 to-transparent">
                  <div className="text-xl mb-1">🎲</div>
                  <div className="text-xs text-white/60 mb-0.5 uppercase tracking-wider">Win Chance</div>
                  <div className="text-xl font-black text-[#ff6b35]">
                    {(0.1 + (ordmakerCount * 0.05)).toFixed(4)}%
                  </div>
                </div>
                <div className="cosmic-card border-2 border-[#ec4899]/30 rounded-lg p-3 text-center bg-gradient-to-br from-[#ec4899]/10 to-transparent">
                  <div className="text-xl mb-1">⏱️</div>
                  <div className="text-xs text-white/60 mb-0.5 uppercase tracking-wider">Cooldown</div>
                  {loadingAttemptStatus ? (
                    <div className="flex items-center justify-center">
                      <div className="w-3 h-3 border-2 border-[#ec4899] border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : attemptStatus && !attemptStatus.can_attempt ? (
                    <div className="text-base font-bold text-[#ec4899]">
                      {Math.ceil(attemptStatus.cooldown.minutes_remaining)}m
                    </div>
                  ) : (
                    <div className="text-lg font-black text-green-400">Ready</div>
                  )}
                </div>
              </div>
            )}

            {/* Cooldown Status Banner */}
            {!loadingAttemptStatus && attemptStatus && !attemptStatus.can_attempt && (
              <div className="mb-4 p-3 bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border-2 border-yellow-500/50 rounded-lg">
                <div className="flex items-center justify-center gap-2">
                  <span className="text-lg">⏰</span>
                  <div className="text-center">
                    <p className="text-yellow-400 font-bold text-sm">Cooldown Active</p>
                    <p className="text-white/80 text-xs">
                      Next attempt in: {Math.ceil(attemptStatus.cooldown.minutes_remaining)} minutes
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Last Attempt Result */}
            {lastAttemptResult && (
              <div className={`mb-4 p-4 rounded-lg border-2 ${
                lastAttemptResult.won 
                  ? 'bg-gradient-to-br from-green-500/20 to-emerald-500/20 border-green-500/50' 
                  : 'bg-gradient-to-br from-red-500/20 to-rose-500/20 border-red-500/50'
              }`}>
                <div className="text-center">
                  <div className={`text-4xl mb-2 ${lastAttemptResult.won ? 'text-green-400' : 'text-red-400'}`}>
                    {lastAttemptResult.won ? '🎉' : '😔'}
                  </div>
                  <div className={`text-2xl font-black mb-3 ${lastAttemptResult.won ? 'text-green-400' : 'text-red-400'}`}>
                    {lastAttemptResult.won ? 'YOU WON!' : 'Better luck next time!'}
                  </div>
                  {lastAttemptResult.won && lastAttemptResult.won_ordinal && (
                    <div className="mt-3 p-3 cosmic-card border border-[#00d4ff]/30 rounded-lg bg-gradient-to-br from-[#00d4ff]/10 to-transparent">
                      <p className="text-white/80 text-xs mb-1 uppercase tracking-wider">You Won:</p>
                      <p className="text-lg font-bold text-[#00d4ff] mb-1">{lastAttemptResult.won_ordinal.name}</p>
                      {lastAttemptResult.won_ordinal.inscription_number && (
                        <p className="text-white/60 text-xs mb-3">
                          Inscription #{lastAttemptResult.won_ordinal.inscription_number}
                        </p>
                      )}
                      {lastAttemptResult.claimed ? (
                        <div className="mt-2 p-2 bg-green-500/20 border border-green-500/50 rounded-lg">
                          <p className="text-green-400 font-semibold text-sm mb-1">✅ Claimed!</p>
                          {lastAttemptResult.claim_txid && (
                            <a
                              href={`https://mempool.space/tx/${lastAttemptResult.claim_txid}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[#00d4ff] hover:text-[#00b8e6] text-xs underline"
                            >
                              View Transaction ↗
                            </a>
                          )}
                        </div>
                      ) : (
                        <button
                          onClick={handleClaim}
                          disabled={claiming}
                          className="mt-2 w-full px-4 py-2 bg-gradient-to-r from-[#00d4ff] to-[#8b5cf6] hover:from-[#00b8e6] hover:to-[#7c3aed] text-white rounded-lg font-bold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-[#00d4ff]/30 text-sm"
                        >
                          {claiming ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              Claiming...
                            </>
                          ) : (
                            <>
                              <span>🎁</span>
                              Claim Ordinal
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  )}
                  <div className="mt-3 pt-3 border-t border-white/10">
                    <p className="text-white/60 text-xs">
                      Win chance was: <span className="font-semibold text-white">{lastAttemptResult.win_chance_percent}%</span>
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Spin Button */}
            <div className="text-center">
              <button
                onClick={handleAttempt}
                disabled={attempting || (attemptStatus && !attemptStatus.can_attempt)}
                className={`relative px-12 py-6 rounded-xl font-black text-xl transition-all duration-300 ${
                  attempting || (attemptStatus && !attemptStatus.can_attempt)
                    ? 'opacity-50 cursor-not-allowed'
                    : 'hover:scale-105 hover:shadow-2xl'
                } ${
                  spinAnimation
                    ? 'bg-gradient-to-r from-[#ff6b35] via-[#00d4ff] via-[#8b5cf6] to-[#ec4899] animate-pulse shadow-2xl'
                    : 'bg-gradient-to-r from-[#ff6b35] to-[#ff5722] shadow-lg shadow-[#ff6b35]/30'
                }`}
              >
                {spinAnimation ? (
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin" />
                    <span className="text-white">Spinning...</span>
                  </div>
                ) : (
                  <span className="text-white">🎰 Spin the Wheel</span>
                )}
              </button>
              {!attempting && attemptStatus && attemptStatus.can_attempt && (
                <div className="mt-3 p-2 cosmic-card border border-[#00d4ff]/30 rounded-lg bg-[#00d4ff]/5">
                  <p className="text-white/70 text-xs">
                    Base: <span className="text-[#00d4ff] font-semibold">0.1%</span> + 
                    Luck Bonus: <span className="text-[#ff6b35] font-semibold">{(ordmakerCount * 0.05).toFixed(4)}%</span> = 
                    Total: <span className="text-[#8b5cf6] font-bold">{(0.1 + (ordmakerCount * 0.05)).toFixed(4)}%</span>
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading ? (
          <div className="cosmic-card rounded-xl shadow-lg p-12 text-center border-2 border-[#00d4ff]/30">
            <div className="w-16 h-16 border-4 border-[#00d4ff] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-white/70 text-lg">Loading ordinals...</p>
            <p className="text-white/50 text-sm mt-2">This may take a moment</p>
          </div>
        ) : ordinalsData && ordinalsData.ordinals.length > 0 ? (
          <>
            {/* Ordinals Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {ordinalsData.ordinals.map((ordinal, index) => {
                // Use contentURI for images (full resolution)
                const imageUrl = ordinal.contentURI || ordinal.contentPreviewURI || ordinal.image || ordinal.thumbnail
                const inscriptionId = ordinal.inscriptionId || ordinal.id
                const inscriptionNumber = ordinal.inscriptionNumber
                const name = ordinal.meta?.name || ordinal.displayName || ordinal.name || `Ordinal #${inscriptionNumber || index + 1}`
                const collectionSymbol = ordinal.collectionSymbol || 'Unknown'
                const listedPrice = ordinal.listedPrice
                const contentType = ordinal.contentType || 'unknown'

                return (
                  <div
                    key={ordinal.id || index}
                    className="cosmic-card border-2 border-[#00d4ff]/30 rounded-xl overflow-hidden hover:border-[#00d4ff]/60 transition-all duration-300 hover:shadow-lg hover:shadow-[#00d4ff]/20 group"
                  >
                    {/* Image */}
                    <div className="relative aspect-square bg-gradient-to-br from-[#0a0e27] to-[#1a1f3a] overflow-hidden">
                      {imageUrl ? (
                        <Image
                          src={imageUrl}
                          alt={name}
                          fill
                          className="object-cover group-hover:scale-105 transition-transform duration-300"
                          unoptimized
                          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <span className="text-6xl text-white/20">🎨</span>
                        </div>
                      )}
                      {listedPrice && listedPrice > 0 && (
                        <div className="absolute top-2 right-2 bg-[#ff6b35]/90 text-white px-2 py-1 rounded-lg text-xs font-bold shadow-lg z-10">
                          {formatSats(listedPrice)} {ordinal.listedPriceUnit || 'BTC'}
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="p-4">
                      <div className="text-sm font-semibold text-white mb-1 truncate" title={name}>
                        {name}
                      </div>
                      <div className="text-xs text-white/60 mb-2">
                        {collectionSymbol}
                      </div>
                      
                      {inscriptionNumber && (
                        <div className="text-xs text-[#00d4ff] font-mono mb-2">
                          #{inscriptionNumber}
                        </div>
                      )}

                      {inscriptionId && (
                        <div className="flex items-center gap-2 mt-3">
                          <a
                            href={`https://magiceden.io/ordinals/item-details/${inscriptionId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-[#00d4ff] hover:text-[#00b8e6] transition-colors flex items-center gap-1"
                          >
                            <span>View on Magic Eden</span>
                            <span>↗</span>
                          </a>
                        </div>
                      )}

                      {contentType && (
                        <div className="text-xs text-white/40 mt-2">
                          Type: {contentType}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        ) : ordinalsData && ordinalsData.ordinals.length === 0 ? (
          <div className="cosmic-card rounded-xl shadow-lg p-12 text-center border-2 border-[#00d4ff]/30">
            <div className="text-6xl mb-4">📦</div>
            <h2 className="text-2xl font-bold text-white mb-2">No Ordinals Found</h2>
            <p className="text-white/70">
              The community payout wallet currently holds no ordinals.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  )
}
