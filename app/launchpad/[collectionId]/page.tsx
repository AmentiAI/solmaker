'use client'

import { useState, useEffect, use, useRef, useCallback, useMemo, startTransition } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useWallet } from '@solana/wallet-adapter-react'
import { useConnection } from '@solana/wallet-adapter-react'
import { VersionedTransaction } from '@solana/web3.js'
import { MAX_PER_TRANSACTION } from '@/lib/minting-constants'
import { validateMintQuantity } from '@/lib/minting-utils'
import { getAdaptivePollInterval } from '@/lib/polling-optimization'
import { CollectionImageDisplay } from './components/CollectionImageDisplay'
import { MintDetailsSection } from './components/MintDetailsSection'
import { NftChoicesMint } from './components/NftChoicesMint'
import { PhaseList } from './components/PhaseList'
import { HistoryModal } from './components/HistoryModal'
import { TopBar } from './components/TopBar'
import type { Phase, Collection, WhitelistStatus, UserMintStatus } from './components/types'

export default function CollectionMintPage({ params }: { params: Promise<{ collectionId: string }> }) {
  const resolvedParams = use(params)
  const collectionId = resolvedParams.collectionId
  const pathname = usePathname()
  const { connected: isConnected, publicKey, sendTransaction, signTransaction } = useWallet()
  const { connection } = useConnection()
  const currentAddress = publicKey?.toBase58() || null

  const [collection, setCollection] = useState<Collection | null>(null)
  const [loading, setLoading] = useState(true)
  const [isLive, setIsLive] = useState(true)
  const [isPreview, setIsPreview] = useState(false)
  const [whitelistStatus, setWhitelistStatus] = useState<WhitelistStatus | null>(null)
  const [whitelistStatuses, setWhitelistStatuses] = useState<Record<string, WhitelistStatus>>({})
  const [userMintStatus, setUserMintStatus] = useState<UserMintStatus | null>(null)
  const [checkingWhitelist, setCheckingWhitelist] = useState(false)
  const [checkingWhitelistPhaseId, setCheckingWhitelistPhaseId] = useState<string | null>(null)

  // Minting state (Solana)
  const [priorityFee, setPriorityFee] = useState(0)
  const [priorityFeeInput, setPriorityFeeInput] = useState('0')
  const [mintQuantity, setMintQuantity] = useState(1)
  const [mintQuantityInput, setMintQuantityInput] = useState('1')
  const [minting, setMinting] = useState(false)
  const [mintStatus, setMintStatus] = useState('')
  const [txSignature, setTxSignature] = useState('')
  const [error, setError] = useState('')
  const [countdown, setCountdown] = useState<{ [key: string]: string }>({})
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [audioEnabled, setAudioEnabled] = useState(false)
  const [audioError, setAudioError] = useState<string | null>(null)
  const [audioVolume, setAudioVolume] = useState(0.3)
  const [showVolumeControls, setShowVolumeControls] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [mintHistory, setMintHistory] = useState<any[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [mintDebug, setMintDebug] = useState<any>(null)
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number; aspectRatio: number } | null>(null)

  // Live countdown timer
  const phasesRef = useRef(collection?.phases)
  const countdownRef = useRef<{ [key: string]: string }>({})

  useEffect(() => {
    if (collection?.phases !== phasesRef.current) {
      phasesRef.current = collection?.phases
    }
  }, [collection?.phases])

  // Countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      if (phasesRef.current) {
        const newCountdowns: { [key: string]: string } = {}
        const now = new Date()
        phasesRef.current.forEach((phase) => {
          const startTime = new Date(phase.start_time)
          const endTime = phase.end_time ? new Date(phase.end_time) : null

          let countdownValue: string | undefined

          if (now < startTime) {
            const diff = startTime.getTime() - now.getTime()
            const days = Math.floor(diff / (1000 * 60 * 60 * 24))
            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
            const seconds = Math.floor((diff % (1000 * 60)) / 1000)
            if (days > 0) countdownValue = `${days}d ${hours}h ${minutes}m`
            else if (hours > 0) countdownValue = `${hours}h ${minutes}m ${seconds}s`
            else if (minutes > 0) countdownValue = `${minutes}m ${seconds}s`
            else countdownValue = `${seconds}s`
          } else if (endTime && now <= endTime) {
            const diff = endTime.getTime() - now.getTime()
            const days = Math.floor(diff / (1000 * 60 * 60 * 24))
            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
            const seconds = Math.floor((diff % (1000 * 60)) / 1000)
            if (days > 0) countdownValue = `${days}d ${hours}h ${minutes}m`
            else if (hours > 0) countdownValue = `${hours}h ${minutes}m ${seconds}s`
            else if (minutes > 0) countdownValue = `${minutes}m ${seconds}s`
            else countdownValue = `${seconds}s`
          }

          if (countdownValue) {
            newCountdowns[phase.id] = countdownValue
          }
        })

        const hasChanges = Object.keys(newCountdowns).length !== Object.keys(countdownRef.current).length ||
          Object.keys(newCountdowns).some(key => newCountdowns[key] !== countdownRef.current[key])

        if (hasChanges) {
          countdownRef.current = newCountdowns
          setCountdown(newCountdowns)
        }
      }
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  // Refs for polling
  const collectionRef = useRef(collection)
  const mintingRef = useRef(minting)

  const isMountedRef = useRef(true)
  const expectedPathRef = useRef<string | null>(null)

  useEffect(() => {
    expectedPathRef.current = pathname
  }, [pathname])

  const isNavigatingRef = useRef(false)

  const shouldAllowUpdates = useCallback(() => {
    if (isNavigatingRef.current) return false
    return isMountedRef.current && expectedPathRef.current === pathname
  }, [pathname])

  useEffect(() => {
    const handleBeforeUnload = () => {
      isNavigatingRef.current = true
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    if (pathname !== `/launchpad/${collectionId}`) {
      isNavigatingRef.current = true
    } else {
      isNavigatingRef.current = false
    }

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [pathname, collectionId])

  // Polling function
  const pollUpdates = useCallback(async () => {
    if (!collectionRef.current) return
    if (!shouldAllowUpdates()) return

    try {
      const params = new URLSearchParams()
      if (currentAddress) params.append('wallet_address', currentAddress)

      const response = await fetch(`/api/launchpad/${collectionId}/poll?${params}`)
      if (!response.ok) return

      const data = await response.json()

      if (!isMountedRef.current) return

      if (data.success) {
        if (data.counts) {
          setCollection(prev => {
            if (!prev) return null

            const totalMintedChanged = prev.total_minted !== data.counts.total_minted
            const availableCountChanged = prev.available_count !== data.counts.available_count

            const currentActivePhase = prev.phases?.find(p => p.is_active)
            const newActivePhaseId = data.active_phase?.id
            const phaseChanged = currentActivePhase?.id !== newActivePhaseId

            if (!totalMintedChanged && !availableCountChanged && !phaseChanged && !data.active_phase) {
              return prev
            }

            let updatedPhases = prev.phases
            let phasesChanged = false
            if (data.active_phase) {
              const activePhase = prev.phases?.find(p => p.id === data.active_phase.id)
              if (activePhase) {
                const newMaxPerWallet = data.active_phase.max_per_wallet ?? activePhase.max_per_wallet
                const newPhaseMinted = data.active_phase.phase_minted ?? activePhase.phase_minted
                const newPhaseAllocation = data.active_phase.phase_allocation ?? activePhase.phase_allocation
                const newMintPriceLamports = data.active_phase.mint_price_lamports ?? data.active_phase.mint_price_sats ?? activePhase.mint_price_lamports
                const newWhitelistOnly = data.active_phase.whitelist_only ?? activePhase.whitelist_only

                const activePhaseNeedsUpdate =
                  activePhase.max_per_wallet !== newMaxPerWallet ||
                  activePhase.phase_minted !== newPhaseMinted ||
                  activePhase.phase_allocation !== newPhaseAllocation ||
                  activePhase.mint_price_lamports !== newMintPriceLamports ||
                  activePhase.whitelist_only !== newWhitelistOnly ||
                  activePhase.is_active !== true

                const needsDeactivation = phaseChanged && prev.phases?.some(p => p.is_active && p.id !== data.active_phase.id)

                if (activePhaseNeedsUpdate || needsDeactivation) {
                  phasesChanged = true
                  let needsNewArray = false
                  const newPhases = prev.phases?.map(p => {
                    if (p.id === data.active_phase.id) {
                      if (activePhaseNeedsUpdate) {
                        needsNewArray = true
                        return {
                          ...p,
                          is_active: true,
                          max_per_wallet: newMaxPerWallet,
                          phase_minted: newPhaseMinted,
                          phase_allocation: newPhaseAllocation,
                          mint_price_lamports: newMintPriceLamports,
                          whitelist_only: newWhitelistOnly,
                        }
                      }
                      return p
                    } else if (needsDeactivation && p.is_active) {
                      needsNewArray = true
                      return { ...p, is_active: false }
                    }
                    return p
                  })

                  if (needsNewArray && newPhases) {
                    updatedPhases = newPhases
                  } else {
                    phasesChanged = false
                  }
                }
              }
            } else if (phaseChanged) {
              const hasActivePhases = prev.phases?.some(p => p.is_active)
              if (hasActivePhases) {
                phasesChanged = true
                updatedPhases = prev.phases?.map(p => {
                  if (p.is_active) {
                    return { ...p, is_active: false }
                  }
                  return p
                })
                if (updatedPhases === prev.phases) {
                  phasesChanged = false
                }
              }
            }

            if (!totalMintedChanged && !availableCountChanged && !phasesChanged) {
              return prev
            }

            if (updatedPhases === prev.phases &&
                !totalMintedChanged &&
                !availableCountChanged) {
              return prev
            }

            return {
              ...prev,
              total_minted: data.counts.total_minted,
              available_count: data.counts.available_count,
              phases: updatedPhases || prev.phases,
            }
          })
        }

        if (data.user_whitelist_status && shouldAllowUpdates()) {
          setWhitelistStatus(prev => {
            if (prev &&
                prev.is_whitelisted === data.user_whitelist_status.is_whitelisted &&
                prev.allocation === data.user_whitelist_status.allocation &&
                prev.minted_count === data.user_whitelist_status.minted_count &&
                prev.remaining_allocation === data.user_whitelist_status.remaining_allocation) {
              return prev
            }
            return data.user_whitelist_status
          })
        }

        if (data.user_mint_status && shouldAllowUpdates()) {
          setUserMintStatus(prev => {
            if (prev &&
                prev.minted_count === data.user_mint_status.minted_count &&
                prev.remaining === data.user_mint_status.remaining &&
                prev.max_per_wallet === data.user_mint_status.max_per_wallet) {
              return prev
            }
            return data.user_mint_status
          })
        }
      }
    } catch (err) {
      if (shouldAllowUpdates()) {
        console.debug('Poll update failed:', err)
      }
    }
  }, [collectionId, currentAddress, shouldAllowUpdates])

  // Track last mint time and previous counts for adaptive polling
  const lastMintTimeRef = useRef<number | null>(null)
  const previousTotalMintedRef = useRef<number>(0)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // Initial load
  useEffect(() => {
    if (pathname !== `/launchpad/${collectionId}`) {
      return
    }

    isMountedRef.current = true
    expectedPathRef.current = pathname

    const loadData = async () => {
      try {
        await loadCollection()
        if (shouldAllowUpdates()) {
          setTimeout(() => {
            if (shouldAllowUpdates()) {
              pollUpdates()
            }
          }, 100)
        }
      } catch (error) {
        if (shouldAllowUpdates()) {
          console.error('Error loading collection:', error)
        }
      }
    }

    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionId, currentAddress, pathname])

  // Keep refs in sync
  useEffect(() => {
    mintingRef.current = minting
  }, [minting])

  useEffect(() => {
    if (collection !== collectionRef.current) {
      const prev = collectionRef.current
      if (!prev ||
          prev.total_minted !== collection?.total_minted ||
          prev.available_count !== collection?.available_count ||
          prev.phases?.length !== collection?.phases?.length) {
        collectionRef.current = collection
        if (collection?.total_minted !== undefined) {
          previousTotalMintedRef.current = collection.total_minted
        }
      } else {
        collectionRef.current = collection
      }
    }
  }, [collection])

  // Polling effect
  useEffect(() => {
    if (pathname !== `/launchpad/${collectionId}`) {
      return
    }

    let pollTimeout: NodeJS.Timeout | null = null
    let isPollingActive = true

    const scheduleNextPoll = () => {
      if (!isPollingActive || !shouldAllowUpdates()) return
      if (pollTimeout) clearTimeout(pollTimeout)

      const interval = getAdaptivePollInterval(
        lastMintTimeRef.current,
        mintingRef.current,
        collectionRef.current?.total_minted || 0,
        previousTotalMintedRef.current
      )

      pollTimeout = setTimeout(() => {
        if (isPollingActive && shouldAllowUpdates()) {
          pollUpdates().then(() => {
            if (isPollingActive && shouldAllowUpdates()) {
              scheduleNextPoll()
            }
          }).catch(() => {
            if (isPollingActive && shouldAllowUpdates()) {
              scheduleNextPoll()
            }
          })
        }
      }, interval)
    }

    scheduleNextPoll()

    return () => {
      isPollingActive = false
      if (pollTimeout) clearTimeout(pollTimeout)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionId, pathname])

  // Audio volume
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = audioVolume
    }
  }, [audioVolume])

  // Auto-play audio
  const audioUrl = useMemo(() => {
    return collection?.audio_url || null
  }, [collection?.audio_url])

  useEffect(() => {
    if (!audioUrl) return

    const tryAutoPlay = async () => {
      const el = audioRef.current
      if (!el) return

      try {
        el.muted = true
        el.volume = 0
        await el.play()
        el.muted = false
        el.volume = audioVolume
        setAudioEnabled(true)
        setAudioError(null)
      } catch (e) {
        try {
          el.muted = false
          el.volume = audioVolume
          await el.play()
          setAudioEnabled(true)
          setAudioError(null)
        } catch (e2) {
          console.log('Autoplay blocked, user interaction required')
          el.muted = false
          el.volume = audioVolume
        }
      }
    }

    const timer = setTimeout(() => {
      void tryAutoPlay()
    }, 500)

    return () => clearTimeout(timer)
  }, [audioUrl, audioVolume])

  // Check whitelist status
  const activePhaseIdRef = useRef<string | null>(null)
  const currentAddressRef = useRef<string | null>(null)

  const currentActivePhaseId = useMemo(() => {
    return collection?.phases?.find(p => p.is_active)?.id || null
  }, [collection?.phases])

  useEffect(() => {
    if (currentActivePhaseId !== activePhaseIdRef.current) {
      activePhaseIdRef.current = currentActivePhaseId
    }
  }, [currentActivePhaseId])

  const stableActivePhaseId = activePhaseIdRef.current

  useEffect(() => {
    const addressChanged = currentAddress !== currentAddressRef.current
    const phaseChanged = currentActivePhaseId !== activePhaseIdRef.current

    if (currentAddress && collection && (addressChanged || phaseChanged)) {
      activePhaseIdRef.current = currentActivePhaseId
      currentAddressRef.current = currentAddress
      if (currentActivePhaseId) {
        checkWhitelistStatus(currentActivePhaseId)
      } else {
        checkWhitelistStatus()
      }
    } else if (!currentAddress) {
      activePhaseIdRef.current = null
      currentAddressRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAddress, stableActivePhaseId])

  // Load image dimensions
  const imageUrl = useMemo(() => {
    return collection?.banner_image_url || collection?.mobile_image_url || null
  }, [collection?.banner_image_url, collection?.mobile_image_url])

  const imageUrlRef = useRef<string | null>(null)
  useEffect(() => {
    if (imageUrl !== imageUrlRef.current) {
      imageUrlRef.current = imageUrl
      if (imageUrl) {
        const img = new Image()
        img.onload = () => {
          if (!shouldAllowUpdates()) return
          const aspectRatio = img.naturalWidth / img.naturalHeight
          setImageDimensions({
            width: img.naturalWidth,
            height: img.naturalHeight,
            aspectRatio
          })
        }
        img.onerror = () => {
          setImageDimensions(null)
        }
        img.src = imageUrl
      } else {
        setImageDimensions(null)
      }
    }
  }, [imageUrl])

  const loadCollection = useCallback(async (silent = false) => {
    if (!silent && shouldAllowUpdates()) {
      setLoading(true)
    }

    try {
      const url = currentAddress
        ? `/api/launchpad/${collectionId}?wallet_address=${encodeURIComponent(currentAddress)}`
        : `/api/launchpad/${collectionId}`

      const response = await fetch(url)

      if (response.status === 404) {
        if (shouldAllowUpdates()) {
          setCollection(null)
        }
        return
      }

      if (!response.ok) throw new Error('Collection not found')

      const data = await response.json()

      if (!shouldAllowUpdates()) return

      if (shouldAllowUpdates()) {
        const currentPath = window.location.pathname
        if (currentPath !== `/launchpad/${collectionId}`) {
          return
        }

        if (isNavigatingRef.current) {
          return
        }

        setTimeout(() => {
          if (isNavigatingRef.current || window.location.pathname !== `/launchpad/${collectionId}`) {
            return
          }

          startTransition(() => {
            setCollection(prev => {
              const newCollection = data.collection
              if (!prev) return newCollection

              if (prev.id !== newCollection.id ||
                  prev.total_minted !== newCollection.total_minted ||
                  prev.available_count !== newCollection.available_count ||
                  prev.banner_image_url !== newCollection.banner_image_url ||
                  prev.mobile_image_url !== newCollection.mobile_image_url ||
                  prev.audio_url !== newCollection.audio_url ||
                  prev.phases?.length !== newCollection.phases?.length) {
                return newCollection
              }

              const phasesChanged = prev.phases?.some((p, i) => {
                const newPhase = newCollection.phases?.[i]
                if (!newPhase || p.id !== newPhase.id) return true
                return p.is_active !== newPhase.is_active ||
                       p.max_per_wallet !== newPhase.max_per_wallet ||
                       p.phase_minted !== newPhase.phase_minted ||
                       p.phase_allocation !== newPhase.phase_allocation ||
                       p.mint_price_lamports !== newPhase.mint_price_lamports ||
                       p.whitelist_only !== newPhase.whitelist_only
              })

              if (phasesChanged) {
                return newCollection
              }

              return prev
            })
          })
        }, 0)
      }

      if (shouldAllowUpdates()) {
        setIsLive(data.is_live ?? true)
        setIsPreview(data.is_preview ?? false)
      }

      if (shouldAllowUpdates()) {
        if (data.user_mint_status) {
          setUserMintStatus(data.user_mint_status)
        }
      }
    } catch (err: any) {
      if (shouldAllowUpdates()) {
        setError(err.message)
      }
    } finally {
      if (!silent) {
        setLoading(false)
      }
    }
  }, [collectionId, currentAddress, shouldAllowUpdates])

  const currentAddressRefForWhitelist = useRef<string | null>(null)
  const collectionRefForWhitelist = useRef<Collection | null>(null)

  useEffect(() => {
    if (currentAddress !== currentAddressRefForWhitelist.current) {
      currentAddressRefForWhitelist.current = currentAddress
    }
  }, [currentAddress])

  useEffect(() => {
    if (collection !== collectionRefForWhitelist.current) {
      collectionRefForWhitelist.current = collection
    }
  }, [collection])

  const checkWhitelistStatus = useCallback(async (phaseId?: string) => {
    const addr = currentAddressRefForWhitelist.current
    const coll = collectionRefForWhitelist.current
    if (!addr || !coll) return

    const targetPhaseId = phaseId || coll.phases?.find(p => p.is_active)?.id
    if (!targetPhaseId) {
      if (!phaseId) {
        setWhitelistStatus(prev => {
          if (prev?.is_whitelisted === true) return prev
          return { is_whitelisted: true }
        })
      }
      return
    }

    const targetPhase = coll.phases?.find(p => p.id === targetPhaseId)
    if (!targetPhase || !targetPhase.whitelist_only) {
      if (phaseId) {
        setWhitelistStatuses(prev => {
          if (prev[phaseId]?.is_whitelisted === true) return prev
          return { ...prev, [phaseId]: { is_whitelisted: true } }
        })
      } else {
        setWhitelistStatus(prev => {
          if (prev?.is_whitelisted === true) return prev
          return { is_whitelisted: true }
        })
      }
      return
    }

    if (phaseId) {
      setCheckingWhitelistPhaseId(phaseId)
    } else {
      setCheckingWhitelist(true)
    }

    try {
      const response = await fetch(
        `/api/launchpad/${collectionId}/whitelist-status?wallet_address=${addr}&phase_id=${targetPhaseId}`
      )

      if (response.ok) {
        const data = await response.json()
        if (phaseId) {
          setWhitelistStatuses(prev => {
            const existing = prev[phaseId]
            if (existing &&
                existing.is_whitelisted === data.is_whitelisted &&
                existing.allocation === data.allocation &&
                existing.minted_count === data.minted_count &&
                existing.remaining_allocation === data.remaining_allocation) {
              return prev
            }
            return { ...prev, [phaseId]: data }
          })
        } else {
          setWhitelistStatus(prev => {
            if (prev &&
                prev.is_whitelisted === data.is_whitelisted &&
                prev.allocation === data.allocation &&
                prev.minted_count === data.minted_count &&
                prev.remaining_allocation === data.remaining_allocation) {
              return prev
            }
            return data
          })
        }
      } else {
        const status = { is_whitelisted: false }
        if (phaseId) {
          setWhitelistStatuses(prev => {
            if (prev[phaseId]?.is_whitelisted === false) return prev
            return { ...prev, [phaseId]: status }
          })
        } else {
          setWhitelistStatus(prev => {
            if (prev?.is_whitelisted === false) return prev
            return status
          })
        }
      }
    } catch (err) {
      console.error('Error checking whitelist:', err)
      const status = { is_whitelisted: false }
      if (phaseId) {
        setWhitelistStatuses(prev => {
          if (prev[phaseId]?.is_whitelisted === false) return prev
          return { ...prev, [phaseId]: status }
        })
      } else {
        setWhitelistStatus(prev => {
          if (prev?.is_whitelisted === false) return prev
          return status
        })
      }
    } finally {
      if (phaseId) {
        setCheckingWhitelistPhaseId(null)
      } else {
        setCheckingWhitelist(false)
      }
    }
  }, [collectionId])

  // Solana minting flow for choices mint
  const handleChoicesMint = useCallback(async (nftIds: string[]) => {
    if (!currentAddress || !collection || !isConnected) {
      setError('Please connect your wallet')
      return
    }

    if (!nftIds || nftIds.length === 0) {
      setError('No NFTs selected')
      return
    }

    if (collection.total_minted >= collection.total_supply) {
      setError('This collection is sold out. All items have been minted.')
      return
    }

    const activePhase = collection.phases?.find(p => p.is_active)
    if (!activePhase) {
      setError('No active mint phase')
      return
    }

    setMinting(true)
    setError('')
    setTxSignature('')

    try {
      // Build Solana mint transaction
      setMintStatus(`Building mint transaction for ${nftIds.length} NFT${nftIds.length > 1 ? 's' : ''}...`)
      const buildRes = await fetch(`/api/launchpad/${collectionId}/mint/build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address: currentAddress,
          phase_id: activePhase.id,
          quantity: nftIds.length,
          ordinal_ids: nftIds,
        }),
      })

      if (!buildRes.ok) {
        const errData = await buildRes.json()
        throw new Error(errData.error || 'Failed to build mint transaction')
      }

      const buildData = await buildRes.json()
      if (!buildData.transaction) {
        throw new Error('No transaction returned from server')
      }

      // Deserialize and sign the transaction
      setMintStatus('Please approve the transaction in your wallet...')
      const txBytes = Buffer.from(buildData.transaction, 'base64')
      const tx = VersionedTransaction.deserialize(txBytes)

      const signature = await sendTransaction(tx, connection)
      setTxSignature(signature)
      setMintStatus('Transaction sent! Confirming...')

      // Confirm the mint with backend
      const confirmRes = await fetch(`/api/launchpad/${collectionId}/mint/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signature,
          nft_mint_address: buildData.nftMint,
          wallet_address: currentAddress,
        }),
      })

      if (!confirmRes.ok) {
        const errData = await confirmRes.json()
        throw new Error(errData.error || 'Failed to confirm mint')
      }

      let confirmData = await confirmRes.json()

      // If not confirmed yet, poll for up to 30 seconds
      if (!confirmData.confirmed && signature) {
        setMintStatus('Transaction sent! Waiting for on-chain confirmation...')
        for (let poll = 0; poll < 10; poll++) {
          await new Promise(r => setTimeout(r, 3000))
          try {
            const pollRes = await fetch(
              `/api/launchpad/${collectionId}/mint/confirm?signature=${signature}`
            )
            if (pollRes.ok) {
              const pollData = await pollRes.json()
              if (pollData.mint?.confirmed || pollData.confirmed) {
                confirmData = { ...confirmData, confirmed: true }
                break
              }
            }
          } catch {
            // ignore poll errors
          }
        }
      }

      if (confirmData.confirmed) {
        setMintStatus('Successfully minted NFT!')
      } else {
        setMintStatus('Mint transaction sent! It may take a moment to confirm on-chain.')
      }

      // Update local state (optimistic - tx was sent successfully)
      if (activePhase?.whitelist_only && whitelistStatus) {
        setWhitelistStatus(prev => prev ? {
          ...prev,
          minted_count: (prev.minted_count || 0) + nftIds.length,
          remaining_allocation: Math.max(0, (prev.remaining_allocation || 0) - nftIds.length),
        } : prev)
      } else if (userMintStatus) {
        setUserMintStatus(prev => prev ? {
          ...prev,
          minted_count: prev.minted_count + nftIds.length,
          remaining: Math.max(0, prev.remaining - nftIds.length),
        } : prev)
      }

      if (collection) {
        setCollection(prev => prev ? {
          ...prev,
          total_minted: (prev.total_minted || 0) + nftIds.length,
        } : prev)
      }

    } catch (error: any) {
      console.error('Error minting:', error)
      setError(error.message || 'Failed to mint')
      setMintStatus('')
    } finally {
      setMinting(false)
    }
  }, [currentAddress, collection, isConnected, collectionId, sendTransaction, connection, whitelistStatus, userMintStatus])

  // Solana minting flow for hidden (random) mint
  const handleMint = async () => {
    if (!currentAddress || !collection || !isConnected) {
      setError('Please connect your wallet')
      return
    }

    if (collection.total_minted >= collection.total_supply) {
      setError('This collection is sold out. All items have been minted.')
      return
    }

    const activePhase = collection.phases?.find(p => p.is_active)
    if (!activePhase) {
      setError('No active mint phase')
      return
    }

    if (activePhase.whitelist_only && !whitelistStatus?.is_whitelisted) {
      setError(`Your connected wallet (${currentAddress?.slice(0, 8)}...${currentAddress?.slice(-6)}) was not found on the whitelist for this phase.`)
      return
    }

    let maxAvailable: number
    if (activePhase.whitelist_only) {
      const remaining = whitelistStatus?.remaining_allocation ?? 0
      maxAvailable = Math.min(MAX_PER_TRANSACTION, remaining)
    } else {
      if (activePhase.max_per_wallet != null && userMintStatus?.minted_count != null) {
        const remaining = Math.max(0, activePhase.max_per_wallet - userMintStatus.minted_count)
        maxAvailable = Math.min(MAX_PER_TRANSACTION, remaining)
      } else {
        maxAvailable = MAX_PER_TRANSACTION
      }
    }

    const validation = validateMintQuantity(mintQuantity, {
      remaining: maxAvailable,
      mintedCount: activePhase.whitelist_only
        ? (whitelistStatus?.minted_count ?? 0)
        : (userMintStatus?.minted_count ?? 0),
      maxAllowed: activePhase.whitelist_only
        ? (whitelistStatus?.allocation ?? null)
        : (activePhase.max_per_wallet ?? null),
      maxAvailable,
    })

    if (!validation.valid) {
      setError(validation.error || 'Invalid mint quantity')
      return
    }

    setMinting(true)
    setError('')
    setTxSignature('')

    try {
      // Step 1: Reserve ordinals
      setMintStatus(`Reserving ${mintQuantity} NFT${mintQuantity > 1 ? 's' : ''}...`)

      const reserveRes = await fetch(`/api/launchpad/${collectionId}/reserve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address: currentAddress,
          phase_id: activePhase.id,
          quantity: mintQuantity,
        }),
      })

      if (!reserveRes.ok) {
        const errData = await reserveRes.json()
        throw new Error(errData.error || 'Failed to reserve NFTs')
      }

      const reserveData = await reserveRes.json()
      const reservedNfts = mintQuantity === 1
        ? [reserveData.ordinal]
        : reserveData.ordinals
      const reservedNftIds = reservedNfts.map((o: any) => o.id)

      // Step 2: Build Solana mint transaction
      setMintStatus('Building mint transaction...')
      const buildRes = await fetch(`/api/launchpad/${collectionId}/mint/build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address: currentAddress,
          phase_id: activePhase.id,
          quantity: mintQuantity,
          ordinal_ids: reservedNftIds,
        }),
      })

      if (!buildRes.ok) {
        const errData = await buildRes.json()
        throw new Error(errData.error || 'Failed to build mint transaction')
      }

      const buildData = await buildRes.json()
      if (!buildData.transaction) {
        throw new Error('No transaction returned from server')
      }

      // Decode transaction for debug
      const txBytes = Buffer.from(buildData.transaction, 'base64')
      const tx = VersionedTransaction.deserialize(txBytes)
      
      // Extract debug info from the transaction
      try {
        const msg = tx.message
        const accountKeys = msg.getAccountKeys()
        const keys = Array.from({ length: accountKeys.length }, (_, i) => accountKeys.get(i)?.toBase58() || 'unknown')
        const header = msg.header
        
        const debugInstructions = msg.compiledInstructions.map((ix: any, idx: number) => {
          const programId = keys[ix.programIdIndex] || 'unknown'
          const accounts = ix.accountKeyIndexes.map((keyIdx: number) => ({
            pubkey: keys[keyIdx] || 'unknown',
            isSigner: keyIdx < header.numRequiredSignatures,
            isWritable: keyIdx < header.numRequiredSignatures - header.numReadonlySignedAccounts || 
              (keyIdx >= header.numRequiredSignatures && keyIdx < keys.length - header.numReadonlyUnsignedAccounts),
          }))
          return {
            index: idx,
            programId,
            accounts,
            dataLength: ix.data.length,
            dataHex: Buffer.from(ix.data).toString('hex').substring(0, 40),
          }
        })

        const signatures = tx.signatures.map((sig, i) => ({
          index: i,
          pubkey: keys[i],
          signed: !sig.every((b: number) => b === 0),
        }))

        setMintDebug({
          timestamp: new Date().toISOString(),
          nftMint: buildData.nftMint,
          mintPrice: buildData.mintPrice,
          platformFee: buildData.platformFee,
          totalCost: buildData.totalCost,
          feePayer: keys[0],
          numSignatures: header.numRequiredSignatures,
          totalAccounts: keys.length,
          signatures,
          instructions: debugInstructions,
          allKeys: keys,
          apiResponse: { success: buildData.success, nftMint: buildData.nftMint, mintPrice: buildData.mintPrice, platformFee: buildData.platformFee, totalCost: buildData.totalCost },
          simulation: buildData.simulation,
          serverDebug: buildData.debug,
        })
      } catch (debugErr) {
        console.error('Debug extraction failed:', debugErr)
        setMintDebug({ error: 'Failed to extract debug info', raw: String(debugErr) })
      }

      // Step 3: Sign and send transaction
      // Use signTransaction + sendRawTransaction instead of sendTransaction
      // to avoid the wallet's internal RPC which may fail with partially-signed txs
      setMintStatus('Please approve the transaction in your wallet...')

      if (!signTransaction) {
        throw new Error('Wallet does not support signTransaction')
      }

      const signed = await signTransaction(tx)
      const rawTx = signed.serialize()

      // Use our own RPC connection (not wallet adapter's) to avoid blockhash mismatch
      const networkRes = await fetch('/api/solana/network')
      const networkData = await networkRes.json()
      const rpcUrl = networkData.rpcUrl || 'https://api.devnet.solana.com'
      const { Connection: Web3Connection } = await import('@solana/web3.js')
      const mintConnection = new Web3Connection(rpcUrl, 'confirmed')

      const signature = await mintConnection.sendRawTransaction(rawTx, {
        skipPreflight: true, // Already simulated on server
        preflightCommitment: 'confirmed',
      })
      setTxSignature(signature)
      setMintStatus('Transaction sent! Confirming...')

      // Step 4: Confirm with backend
      const confirmRes = await fetch(`/api/launchpad/${collectionId}/mint/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signature,
          nft_mint_address: buildData.nftMint,
          wallet_address: currentAddress,
        }),
      })

      if (!confirmRes.ok) {
        const errData = await confirmRes.json()
        throw new Error(errData.error || 'Failed to confirm mint')
      }

      let confirmData = await confirmRes.json()

      // If not confirmed yet, poll for up to 30 seconds
      if (!confirmData.confirmed && signature) {
        setMintStatus('Transaction sent! Waiting for on-chain confirmation...')
        for (let poll = 0; poll < 10; poll++) {
          await new Promise(r => setTimeout(r, 3000))
          try {
            const pollRes = await fetch(
              `/api/launchpad/${collectionId}/mint/confirm?signature=${signature}`
            )
            if (pollRes.ok) {
              const pollData = await pollRes.json()
              if (pollData.mint?.confirmed || pollData.confirmed) {
                confirmData = { ...confirmData, confirmed: true }
                break
              }
            }
          } catch {
            // ignore poll errors
          }
        }
      }

      if (confirmData.confirmed) {
        setMintStatus(`Successfully minted ${mintQuantity} NFT${mintQuantity > 1 ? 's' : ''}!`)
      } else {
        // Even if not confirmed yet, the tx was sent - show optimistic success
        setMintStatus(`Mint transaction sent! It may take a moment to confirm on-chain.`)
      }

      // Update local state (optimistic - tx was sent successfully)
      if (activePhase?.whitelist_only && whitelistStatus) {
        setWhitelistStatus(prev => prev ? {
          ...prev,
          minted_count: (prev.minted_count || 0) + mintQuantity,
          remaining_allocation: Math.max(0, (prev.remaining_allocation || 0) - mintQuantity),
        } : prev)
      } else if (userMintStatus) {
        setUserMintStatus(prev => prev ? {
          ...prev,
          minted_count: prev.minted_count + mintQuantity,
          remaining: Math.max(0, prev.remaining - mintQuantity),
        } : prev)
      }

      if (collection) {
        setCollection(prev => prev ? {
          ...prev,
          total_minted: (prev.total_minted || 0) + mintQuantity,
        } : prev)
      }

      setMintQuantity(1)
      setMintQuantityInput('1')

    } catch (err: any) {
      console.error('Mint error:', err)
      setError(err.message || 'Failed to mint')
    } finally {
      setMinting(false)
    }
  }

  const formatLamports = (lamports: number): string => {
    const sol = lamports / 1_000_000_000
    if (sol >= 1) return `${sol.toFixed(4)} SOL`
    if (sol >= 0.01) return `${sol.toFixed(4)} SOL`
    return `${sol.toFixed(6)} SOL`
  }

  const getPhaseStatus = useCallback((phase: Phase) => {
    const now = new Date()
    const startTime = new Date(phase.start_time)
    const endTime = phase.end_time ? new Date(phase.end_time) : null

    if (now < startTime) {
      return { status: 'upcoming', label: 'Upcoming', color: 'blue' }
    }

    if (endTime && now > endTime) {
      return { status: 'ended', label: 'Ended', color: 'gray' }
    }

    if (now >= startTime && (endTime === null || now <= endTime)) {
      if (phase.is_completed && endTime && now > endTime) {
        return { status: 'completed', label: 'Completed', color: 'gray' }
      }
      return { status: 'active', label: 'LIVE NOW', color: 'green' }
    }

    if (phase.is_completed) {
      return { status: 'completed', label: 'Completed', color: 'gray' }
    }

    if (phase.is_active) {
      return { status: 'active', label: 'LIVE NOW', color: 'green' }
    }

    return { status: 'pending', label: 'Not Started', color: 'yellow' }
  }, [])

  const formatTimeUntil = useCallback((date: string): string => {
    const now = new Date()
    const target = new Date(date)
    const diff = target.getTime() - now.getTime()

    if (diff < 0) return 'Started'

    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    const seconds = Math.floor((diff % (1000 * 60)) / 1000)

    if (days > 0) return `${days}d ${hours}h ${minutes}m`
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
    if (minutes > 0) return `${minutes}m ${seconds}s`
    return `${seconds}s`
  }, [])

  const formatDateTime = (date: string): string => {
    return new Date(date).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  }

  const currentAddressRefForHistory = useRef<string | null>(null)
  useEffect(() => {
    currentAddressRefForHistory.current = currentAddress
  }, [currentAddress])

  const loadMintHistory = useCallback(async () => {
    const addr = currentAddressRefForHistory.current
    if (!addr || !collectionId) return

    setLoadingHistory(true)
    try {
      const response = await fetch(
        `/api/mint/my-transactions?wallet_address=${encodeURIComponent(addr)}&collection_id=${collectionId}`
      )
      if (!response.ok) return

      const data = await response.json()
      setMintHistory(data.inscriptions || data.mints || [])
    } catch (err) {
      console.error('Error loading mint history:', err)
    } finally {
      setLoadingHistory(false)
    }
  }, [collectionId])

  useEffect(() => {
    if (showHistory && currentAddressRefForHistory.current) {
      loadMintHistory()
    }
  }, [showHistory, currentAddress, loadMintHistory])

  const activePhase = useMemo(() => {
    return collection?.phases?.find(p => p.is_active) || null
  }, [collection?.phases])

  // Priority fee handlers
  const handlePriorityFeeChange = useCallback((value: string) => {
    setPriorityFeeInput(value)
    const numValue = parseFloat(value)
    if (!isNaN(numValue) && numValue >= 0) {
      setPriorityFee(numValue)
    }
  }, [])

  const handlePriorityFeeFocus = useCallback(() => {
    // No-op for Solana (no mempool override needed)
  }, [])

  const handlePriorityFeeBlur = useCallback((value: number) => {
    if (isNaN(value) || value < 0) {
      setPriorityFee(0)
      setPriorityFeeInput('0')
    }
  }, [])

  // Quantity handlers (use refs)
  const activePhaseRef = useRef<Phase | null>(null)
  const whitelistStatusRef = useRef<WhitelistStatus | null>(null)
  const userMintStatusRef = useRef<UserMintStatus | null>(null)

  useEffect(() => {
    activePhaseRef.current = activePhase
  }, [activePhase])

  useEffect(() => {
    whitelistStatusRef.current = whitelistStatus
  }, [whitelistStatus])

  useEffect(() => {
    userMintStatusRef.current = userMintStatus
  }, [userMintStatus])

  const handleQuantityChange = useCallback((value: string) => {
    setMintQuantityInput(value)
    const numValue = parseInt(value)
    if (!isNaN(numValue) && numValue > 0) {
      const phase = activePhaseRef.current
      const whitelist = whitelistStatusRef.current
      const userStatus = userMintStatusRef.current

      let remainingMints: number
      if (phase?.whitelist_only) {
        remainingMints = whitelist?.remaining_allocation ?? 0
      } else {
        if (phase?.max_per_wallet != null && userStatus?.minted_count != null) {
          remainingMints = Math.max(0, phase.max_per_wallet - userStatus.minted_count)
        } else if (phase?.max_per_wallet != null) {
          remainingMints = phase.max_per_wallet
        } else if (userStatus?.remaining != null) {
          remainingMints = userStatus.remaining
        } else {
          remainingMints = MAX_PER_TRANSACTION
        }
      }
      const maxAvailable = Math.min(MAX_PER_TRANSACTION, remainingMints)
      const cappedValue = Math.min(numValue, maxAvailable)
      setMintQuantity(cappedValue)
      if (cappedValue !== numValue) {
        setMintQuantityInput(cappedValue.toString())
      }
    }
  }, [])

  const handleQuantityBlur = useCallback((value: number) => {
    if (isNaN(value) || value < 1) {
      setMintQuantity(1)
      setMintQuantityInput('1')
    } else {
      const phase = activePhaseRef.current
      const whitelist = whitelistStatusRef.current
      const userStatus = userMintStatusRef.current

      let maxAvailable: number
      if (phase?.whitelist_only) {
        const remaining = whitelist?.remaining_allocation ?? 0
        maxAvailable = Math.min(MAX_PER_TRANSACTION, remaining)
      } else {
        if (phase?.max_per_wallet != null && userStatus?.minted_count != null) {
          const remaining = Math.max(0, phase.max_per_wallet - userStatus.minted_count)
          maxAvailable = Math.min(MAX_PER_TRANSACTION, remaining)
        } else if (phase?.max_per_wallet != null) {
          maxAvailable = Math.min(MAX_PER_TRANSACTION, phase.max_per_wallet)
        } else {
          maxAvailable = MAX_PER_TRANSACTION
        }
      }
      const cappedValue = Math.min(value, maxAvailable)
      if (cappedValue !== value) {
        setMintQuantity(cappedValue)
        setMintQuantityInput(cappedValue.toString())
      }
    }
  }, [])

  const handleMaxClick = useCallback(() => {
    const phase = activePhaseRef.current
    const whitelist = whitelistStatusRef.current
    const userStatus = userMintStatusRef.current

    let maxAvailable: number
    if (phase?.whitelist_only) {
      const remaining = whitelist?.remaining_allocation ?? 0
      maxAvailable = Math.min(MAX_PER_TRANSACTION, remaining)
    } else {
      if (phase?.max_per_wallet != null && userStatus?.minted_count != null) {
        const remaining = Math.max(0, phase.max_per_wallet - userStatus.minted_count)
        maxAvailable = Math.min(MAX_PER_TRANSACTION, remaining)
      } else {
        maxAvailable = MAX_PER_TRANSACTION
      }
    }
    setMintQuantity(maxAvailable)
    setMintQuantityInput(maxAvailable.toString())
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0D0D11] flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-20 h-20 mx-auto mb-6">
            <div className="absolute inset-0 border-4 border-[#9945FF]/20 rounded-full" />
            <div className="absolute inset-0 border-4 border-[#9945FF] border-t-transparent rounded-full animate-spin" />
            <div className="absolute inset-2 border-4 border-[#14F195]/20 rounded-full" />
            <div className="absolute inset-2 border-4 border-[#14F195] border-b-transparent rounded-full animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
          </div>
          <p className="text-[#A1A1AA] text-lg font-medium">Loading collection...</p>
        </div>
      </div>
    )
  }

  if (!collection) {
    return (
      <div className="min-h-screen bg-[#0D0D11] flex items-center justify-center">
        <div className="text-center px-6">
          <div className="text-6xl mb-6 opacity-50">📦</div>
          <h2 className="text-3xl font-bold text-white mb-4">Collection Not Found</h2>
          <p className="text-[#A1A1AA] mb-8 text-lg">The collection you're looking for doesn't exist or has been removed.</p>
          <Link
            href="/launchpad"
            className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[#9945FF] to-[#DC1FFF] hover:from-[#DC1FFF] hover:to-[#9945FF] text-white font-semibold rounded-xl shadow-lg shadow-[#9945FF]/30 hover:shadow-xl hover:shadow-[#9945FF]/40 transition-all duration-300 hover:scale-105"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Launchpad
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0D0D11]">
      <div className="container mx-auto px-6 py-8 relative z-10">
        <div className="max-w-7xl mx-auto">
          {/* Background audio */}
          {collection.audio_url && (
            <audio
              ref={audioRef}
              src={collection.audio_url}
              loop
              preload="auto"
              style={{ display: 'none' }}
              tabIndex={-1}
            />
          )}

          <TopBar
            isConnected={isConnected}
            onShowHistory={() => setShowHistory(true)}
            audioUrl={collection.audio_url}
            audioRef={audioRef}
            audioEnabled={audioEnabled}
            audioError={audioError}
            audioVolume={audioVolume}
            showVolumeControls={showVolumeControls}
            onToggleAudio={async () => {
              const el = audioRef.current
              if (!el) return
              try {
                if (audioEnabled) {
                  el.pause()
                  setAudioEnabled(false)
                } else {
                  el.volume = audioVolume
                  await el.play()
                  setAudioEnabled(true)
                  setAudioError(null)
                }
              } catch (e) {
                setAudioError('Tap to allow audio playback')
              }
            }}
            onToggleVolumeControls={() => setShowVolumeControls(!showVolumeControls)}
            onVolumeUp={() => {
              const newVolume = Math.min(1, audioVolume + 0.1)
              setAudioVolume(newVolume)
              if (audioRef.current) {
                audioRef.current.volume = newVolume
              }
            }}
            onVolumeDown={() => {
              const newVolume = Math.max(0, audioVolume - 0.1)
              setAudioVolume(newVolume)
              if (audioRef.current) {
                audioRef.current.volume = newVolume
              }
            }}
          />

          {/* Layout based on image dimensions */}
          {(() => {
            const isWide = imageDimensions && imageDimensions.aspectRatio > 1.3

            if (isWide) {
              return (
                <>
                  <div className="mb-8">
                    <div className="w-full aspect-[16/8] rounded-2xl overflow-hidden bg-[#121218] border border-[#9945FF]/20 shadow-xl shadow-[#9945FF]/10">
                      {collection.banner_video_url ? (
                        <video
                          className="w-full h-full object-fill"
                          src={collection.banner_video_url}
                          autoPlay
                          muted
                          loop
                          playsInline
                          preload="metadata"
                        />
                      ) : (collection.banner_image_url || collection.mobile_image_url) ? (
                        <img
                          src={collection.mobile_image_url || collection.banner_image_url}
                          alt={collection.name}
                          className="w-full h-full object-fill"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-[#4561ad]/20 to-[#e27d0f]/20 flex items-center justify-center">
                          <span className="text-9xl">🎨</span>
                        </div>
                      )}
                    </div>
                    {(collection.twitter_url || collection.discord_url || collection.telegram_url || collection.website_url) && (
                      <div className="mt-4 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md rounded-xl p-5">
                        <div className="font-bold text-white mb-3">Links</div>
                        <div className="flex flex-wrap gap-3">
                          {collection.twitter_url && (
                            <a href={collection.twitter_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 bg-[#1DA1F2] hover:bg-[#1a8cd8] text-white rounded-lg text-sm font-semibold transition-colors">
                              <span>🐦</span><span>Twitter</span>
                            </a>
                          )}
                          {collection.discord_url && (
                            <a href={collection.discord_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 bg-[#5865F2] hover:bg-[#4752C4] text-white rounded-lg text-sm font-semibold transition-colors">
                              <span>💬</span><span>Discord</span>
                            </a>
                          )}
                          {collection.telegram_url && (
                            <a href={collection.telegram_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 bg-[#0088cc] hover:bg-[#0077b5] text-white rounded-lg text-sm font-semibold transition-colors">
                              <span>Telegram</span>
                            </a>
                          )}
                          {collection.website_url && (
                            <a href={collection.website_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-br from-[#0f0f1e]/90 to-[#15152a]/90 hover:from-[#15152a] hover:to-[#202030] text-white rounded-lg text-sm font-semibold transition-all border border-[#9945FF]/30 hover:border-[#9945FF]/50">
                              <span>🌐</span><span>Website</span>
                            </a>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    <div className="lg:col-span-12">
                      {collection.mint_type === 'choices' && (
                        <NftChoicesMint
                          collection={collection}
                          activePhase={activePhase ?? null}
                          collectionId={collectionId}
                          currentAddress={currentAddress ?? undefined}
                          isConnected={isConnected}
                          isLive={isLive}
                          isPreview={isPreview}
                          countdown={countdown}
                          priorityFee={priorityFee}
                          priorityFeeInput={priorityFeeInput}
                          onPriorityFeeChange={handlePriorityFeeChange}
                          onPriorityFeeFocus={handlePriorityFeeFocus}
                          onPriorityFeeBlur={handlePriorityFeeBlur}
                          formatTimeUntil={formatTimeUntil}
                          formatLamports={formatLamports}
                          onMint={handleChoicesMint}
                          minting={minting}
                        />
                      )}
                      {collection.mint_type !== 'choices' && (
                        <MintDetailsSection
                          collection={collection}
                          activePhase={activePhase ?? null}
                          isConnected={isConnected}
                          currentAddress={currentAddress ?? undefined}
                          whitelistStatus={whitelistStatus}
                          userMintStatus={userMintStatus}
                          client={null}
                          isLiveConnection={isConnected}
                          isLive={isLive}
                          isPreview={isPreview}
                          countdown={countdown}
                          priorityFee={priorityFee}
                          priorityFeeInput={priorityFeeInput}
                          mintQuantity={mintQuantity}
                          mintQuantityInput={mintQuantityInput}
                          minting={minting}
                          mintStatus={mintStatus}
                          error={error}
                          txSignature={txSignature}
                          onPriorityFeeChange={handlePriorityFeeChange}
                          onPriorityFeeFocus={handlePriorityFeeFocus}
                          onPriorityFeeBlur={handlePriorityFeeBlur}
                          onQuantityChange={handleQuantityChange}
                          onQuantityBlur={handleQuantityBlur}
                          onMaxClick={handleMaxClick}
                          onMint={handleMint}
                          formatLamports={formatLamports}
                          formatTimeUntil={formatTimeUntil}
                        />
                      )}
                      <PhaseList
                        collection={collection}
                        activePhase={activePhase ?? null}
                        isConnected={isConnected}
                        currentAddress={currentAddress ?? undefined}
                        whitelistStatuses={whitelistStatuses}
                        checkingWhitelistPhaseId={checkingWhitelistPhaseId}
                        countdown={countdown}
                        onCheckWhitelist={checkWhitelistStatus}
                        getPhaseStatus={getPhaseStatus}
                        formatLamports={formatLamports}
                        formatTimeUntil={formatTimeUntil}
                        formatDateTime={formatDateTime}
                      />
                    </div>
                  </div>
                </>
              )
            }

            return (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-5">
                  <div className="lg:sticky lg:top-28">
                    <div className="rounded-2xl overflow-hidden bg-[#121218] border-2 border-[#9945FF]/20 shadow-xl shadow-[#9945FF]/10 aspect-square hover:border-[#9945FF]/40 transition-all duration-300">
                      {collection.banner_video_url ? (
                        <video
                          className="w-full h-full object-fill"
                          src={collection.banner_video_url}
                          autoPlay
                          muted
                          loop
                          playsInline
                          preload="metadata"
                        />
                      ) : (collection.banner_image_url || collection.mobile_image_url) ? (
                        <img
                          src={collection.mobile_image_url || collection.banner_image_url}
                          alt={collection.name}
                          className="w-full h-full object-fill"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-[#4561ad]/20 to-[#e27d0f]/20 flex items-center justify-center">
                          <span className="text-9xl">🎨</span>
                        </div>
                      )}
                    </div>
                    {(collection.twitter_url || collection.discord_url || collection.telegram_url || collection.website_url) && (
                      <div className="mt-4 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md rounded-xl p-5">
                        <div className="font-bold text-white mb-3">Links</div>
                        <div className="flex flex-wrap gap-3">
                          {collection.twitter_url && (
                            <a href={collection.twitter_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 bg-[#1DA1F2] hover:bg-[#1a8cd8] text-white rounded-lg text-sm font-semibold transition-colors">
                              <span>🐦</span><span>Twitter</span>
                            </a>
                          )}
                          {collection.discord_url && (
                            <a href={collection.discord_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 bg-[#5865F2] hover:bg-[#4752C4] text-white rounded-lg text-sm font-semibold transition-colors">
                              <span>💬</span><span>Discord</span>
                            </a>
                          )}
                          {collection.telegram_url && (
                            <a href={collection.telegram_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 bg-[#0088cc] hover:bg-[#0077b5] text-white rounded-lg text-sm font-semibold transition-colors">
                              <span>Telegram</span>
                            </a>
                          )}
                          {collection.website_url && (
                            <a href={collection.website_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-br from-[#0f0f1e]/90 to-[#15152a]/90 hover:from-[#15152a] hover:to-[#202030] text-white rounded-lg text-sm font-semibold transition-all border border-[#9945FF]/30 hover:border-[#9945FF]/50">
                              <span>🌐</span><span>Website</span>
                            </a>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="lg:col-span-7">
                  {collection.mint_type === 'choices' && (
                    <NftChoicesMint
                      collection={collection}
                      activePhase={activePhase ?? null}
                      collectionId={collectionId}
                      currentAddress={currentAddress ?? undefined}
                      isConnected={isConnected}
                      isLive={isLive}
                      isPreview={isPreview}
                      countdown={countdown}
                      priorityFee={priorityFee}
                      priorityFeeInput={priorityFeeInput}
                      onPriorityFeeChange={handlePriorityFeeChange}
                      onPriorityFeeFocus={handlePriorityFeeFocus}
                      onPriorityFeeBlur={handlePriorityFeeBlur}
                      formatTimeUntil={formatTimeUntil}
                      formatLamports={formatLamports}
                      onMint={handleChoicesMint}
                      minting={minting}
                    />
                  )}
                  {collection.mint_type !== 'choices' && (
                    <MintDetailsSection
                      collection={collection}
                      activePhase={activePhase ?? null}
                      isConnected={isConnected}
                      currentAddress={currentAddress ?? undefined}
                      whitelistStatus={whitelistStatus}
                      userMintStatus={userMintStatus}
                      client={null}
                      isLiveConnection={isConnected}
                      isLive={isLive}
                      isPreview={isPreview}
                      countdown={countdown}
                      priorityFee={priorityFee}
                      priorityFeeInput={priorityFeeInput}
                      mintQuantity={mintQuantity}
                      mintQuantityInput={mintQuantityInput}
                      minting={minting}
                      mintStatus={mintStatus}
                      error={error}
                      txSignature={txSignature}
                      onPriorityFeeChange={handlePriorityFeeChange}
                      onPriorityFeeFocus={handlePriorityFeeFocus}
                      onPriorityFeeBlur={handlePriorityFeeBlur}
                      onQuantityChange={handleQuantityChange}
                      onQuantityBlur={handleQuantityBlur}
                      onMaxClick={handleMaxClick}
                      onMint={handleMint}
                      formatLamports={formatLamports}
                      formatTimeUntil={formatTimeUntil}
                    />
                  )}

                  {/* Mint Transaction Debug Panel */}
                  {mintDebug && (
                    <div className="mt-4 p-4 bg-black/60 border border-yellow-500/40 rounded-xl text-xs font-mono overflow-auto max-h-[600px]">
                      <div className="flex justify-between items-center mb-3">
                        <h4 className="text-yellow-400 font-bold text-sm">Mint Transaction Debug</h4>
                        <button onClick={() => setMintDebug(null)} className="text-white/40 hover:text-white text-xs">Close</button>
                      </div>
                      
                      <div className="space-y-2 mb-3">
                        <div><span className="text-white/50">Timestamp:</span> <span className="text-white/80">{mintDebug.timestamp}</span></div>
                        <div><span className="text-white/50">NFT Mint:</span> <span className="text-cyan-400">{mintDebug.nftMint}</span></div>
                        <div><span className="text-white/50">Mint Price:</span> <span className="text-white/80">{mintDebug.mintPrice} SOL</span></div>
                        {mintDebug.platformFee !== undefined && <div><span className="text-white/50">Platform Fee:</span> <span className="text-white/80">{mintDebug.platformFee} SOL</span></div>}
                        {mintDebug.totalCost !== undefined && <div><span className="text-white/50">Total Cost:</span> <span className="text-green-400">{mintDebug.totalCost} SOL</span></div>}
                        <div><span className="text-white/50">Fee Payer:</span> <span className="text-cyan-400">{mintDebug.feePayer}</span></div>
                        <div><span className="text-white/50">Required Signatures:</span> <span className="text-white/80">{mintDebug.numSignatures}</span></div>
                        <div><span className="text-white/50">Total Accounts:</span> <span className="text-white/80">{mintDebug.totalAccounts}</span></div>
                      </div>

                      {/* Server-side simulation results */}
                      {mintDebug.simulation && (
                        <div className={`mb-3 p-3 rounded border ${mintDebug.simulation.success ? 'bg-green-900/20 border-green-500/40' : 'bg-red-900/20 border-red-500/40'}`}>
                          <h5 className={`font-semibold mb-2 ${mintDebug.simulation.success ? 'text-green-400' : 'text-red-400'}`}>
                            Server Simulation: {mintDebug.simulation.success ? 'PASSED' : 'FAILED'}
                          </h5>
                          {mintDebug.simulation.error && (
                            <div className="text-red-300 mb-2">
                              <span className="text-white/50">Error:</span> {JSON.stringify(mintDebug.simulation.error)}
                            </div>
                          )}
                          {mintDebug.simulation.unitsConsumed !== undefined && (
                            <div className="text-white/60 mb-2">
                              <span className="text-white/50">Units consumed:</span> {mintDebug.simulation.unitsConsumed}
                            </div>
                          )}
                          {mintDebug.simulation.logs && mintDebug.simulation.logs.length > 0 && (
                            <div>
                              <span className="text-white/50">Logs ({mintDebug.simulation.logs.length}):</span>
                              <div className="mt-1 max-h-[200px] overflow-auto bg-black/40 p-2 rounded text-[10px] leading-relaxed">
                                {mintDebug.simulation.logs.map((log: string, i: number) => (
                                  <div key={i} className={log.includes('failed') || log.includes('Error') || log.includes('error') ? 'text-red-400' : 'text-white/60'}>
                                    {log}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Server debug info */}
                      {mintDebug.serverDebug && (
                        <div className="mb-3 p-2 bg-white/5 rounded border border-white/10">
                          <h5 className="text-yellow-400/80 font-semibold mb-1">Server Context</h5>
                          <div className="space-y-1 text-[10px]">
                            <div><span className="text-white/50">Candy Machine:</span> <span className="text-cyan-400">{mintDebug.serverDebug.candyMachine}</span></div>
                            <div><span className="text-white/50">Collection Mint:</span> <span className="text-cyan-400">{mintDebug.serverDebug.collectionMint}</span></div>
                            <div><span className="text-white/50">Collection Authority:</span> <span className="text-cyan-400">{mintDebug.serverDebug.collectionUpdateAuthority}</span></div>
                            <div><span className="text-white/50">Minter:</span> <span className="text-cyan-400">{mintDebug.serverDebug.minter}</span></div>
                            <div><span className="text-white/50">Mint Price (lamports):</span> <span className="text-white/80">{mintDebug.serverDebug.mintPrice}</span></div>
                          </div>
                        </div>
                      )}

                      {mintDebug.signatures && (
                        <div className="mb-3">
                          <h5 className="text-yellow-400/80 font-semibold mb-1">Signatures ({mintDebug.signatures.length})</h5>
                          {mintDebug.signatures.map((sig: any) => (
                            <div key={sig.index} className="flex gap-2 py-0.5">
                              <span className="text-white/40">#{sig.index}</span>
                              <span className="text-cyan-400">{sig.pubkey?.substring(0, 20)}...</span>
                              <span className={sig.signed ? 'text-green-400' : 'text-red-400'}>
                                {sig.signed ? 'SIGNED' : 'UNSIGNED'}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {mintDebug.instructions && (
                        <div className="mb-3">
                          <h5 className="text-yellow-400/80 font-semibold mb-1">Instructions ({mintDebug.instructions.length})</h5>
                          {mintDebug.instructions.map((ix: any) => (
                            <div key={ix.index} className="mb-3 p-2 bg-white/5 rounded border border-white/10">
                              <div className="mb-1">
                                <span className="text-white/50">Instruction #{ix.index}</span>
                                {' '}<span className="text-purple-400">Program: {ix.programId}</span>
                              </div>
                              <div className="text-white/40 mb-1">Data ({ix.dataLength} bytes): {ix.dataHex}...</div>
                              <div className="text-white/50 text-[10px]">Accounts ({ix.accounts.length}):</div>
                              {ix.accounts.map((acc: any, i: number) => (
                                <div key={i} className="flex gap-2 text-[10px] py-0.5 pl-2">
                                  <span className="text-cyan-400/70">{acc.pubkey?.substring(0, 24)}...</span>
                                  {acc.isSigner && <span className="text-green-400">Signer</span>}
                                  {acc.isWritable && <span className="text-orange-400">Writable</span>}
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}

                      {mintDebug.allKeys && (
                        <div>
                          <h5 className="text-yellow-400/80 font-semibold mb-1">All Account Keys ({mintDebug.allKeys.length})</h5>
                          {mintDebug.allKeys.map((key: string, i: number) => (
                            <div key={i} className="text-[10px] py-0.5">
                              <span className="text-white/40">#{i}</span> <span className="text-cyan-400/70">{key}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <PhaseList
                    collection={collection}
                    activePhase={activePhase ?? null}
                    isConnected={isConnected}
                    currentAddress={currentAddress ?? undefined}
                    whitelistStatuses={whitelistStatuses}
                    checkingWhitelistPhaseId={checkingWhitelistPhaseId}
                    countdown={countdown}
                    onCheckWhitelist={checkWhitelistStatus}
                    getPhaseStatus={getPhaseStatus}
                    formatLamports={formatLamports}
                    formatTimeUntil={formatTimeUntil}
                    formatDateTime={formatDateTime}
                  />
                </div>
              </div>
            )
          })()}
        </div>
      </div>

      <HistoryModal
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
        loading={loadingHistory}
        mintHistory={mintHistory}
        formatDateTime={formatDateTime}
      />
    </div>
  )
}
