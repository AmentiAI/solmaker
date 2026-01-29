'use client'

import { useState, useEffect, use, useRef, useCallback, useMemo, startTransition } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useWallet } from '@/lib/wallet/compatibility'
import { calculateOptimalFeeRate } from '@/lib/mempool-fee-calculator'
import { MAX_PER_TRANSACTION } from '@/lib/minting-constants'
import { validateMintQuantity } from '@/lib/minting-utils'
import { getAdaptivePollInterval } from '@/lib/polling-optimization'
import { CollectionImageDisplay } from './components/CollectionImageDisplay'
import { MintDetailsSection } from './components/MintDetailsSection'
import { OrdinalChoicesMint } from './components/OrdinalChoicesMint'
import { PhaseList } from './components/PhaseList'
import { HistoryModal } from './components/HistoryModal'
import { TopBar } from './components/TopBar'
import type { Phase, Collection, WhitelistStatus, UserMintStatus } from './components/types'

export default function CollectionMintPage({ params }: { params: Promise<{ collectionId: string }> }) {
  const resolvedParams = use(params)
  const collectionId = resolvedParams.collectionId
  const pathname = usePathname()
  const { isConnected, currentAddress, paymentAddress, paymentPublicKey, signPsbt, isLiveConnection, client } = useWallet()

  // ============================================================================
  // DEBUG MODE: Feature flags to disable auto-refreshing features one by one
  // ============================================================================
  // INSTRUCTIONS:
  // 1. Start with ALL set to false - this disables all auto-refreshing
  // 2. Test navigation - links should work instantly
  // 3. Enable features ONE AT A TIME in order (Step 1, then Step 2, etc.)
  // 4. After each enable, test navigation to see if it still works
  // 5. When navigation breaks, you've found the problematic feature
  // ============================================================================
  const DEBUG_FEATURES = {
    // Step 1: Initial Load - all enabled for production
    ENABLE_LOAD_COLLECTION_FETCH: true,     // 1a: Fetch collection data from API
    ENABLE_LOAD_COLLECTION_STATE: true,      // 1b: Update collection state
    ENABLE_LOAD_ISLIVE_STATE: true,        // 1c: Update isLive/isPreview state
    ENABLE_LOAD_USER_MINT_STATUS: true,   // 1d: Update userMintStatus state
    ENABLE_LOAD_LOADING_STATE: true,       // 1e: Update loading state
    ENABLE_COLLECTION_REF_SYNC: true,      // 1f: Sync collectionRef when collection changes
    ENABLE_PHASES_REF_SYNC: true,          // 1g: Sync phasesRef when phases change
    
    // Step 1h: useMemo hooks that recalculate when collection changes
    ENABLE_MEMO_ACTIVE_PHASE_ID: true,      // 1h1: useMemo for currentActivePhaseId
    ENABLE_MEMO_ACTIVE_PHASE: true,         // 1h2: useMemo for activePhase
    ENABLE_MEMO_AUDIO_URL: true,            // 1h3: useMemo for audioUrl
    ENABLE_MEMO_IMAGE_URL: true,            // 1h4: useMemo for imageUrl
    
    // Step 2+: Other features - all enabled for production
    ENABLE_POLLING: true,                  // Step 2: Polling for updates
    ENABLE_MEMPOOL_HEALTH: true,            // Step 3: Mempool health checks
    ENABLE_COUNTDOWN_TIMER: true,          // Step 4: Countdown timer
    ENABLE_IMAGE_DIMENSIONS: true,         // Step 5: Image dimension loading
    ENABLE_WHITELIST_CHECK: true,          // Step 6: Whitelist status checking
    ENABLE_AUDIO_AUTOPLAY: true,           // Step 7: Audio autoplay
    ENABLE_MINT_HISTORY: true,             // Step 8: Mint history loading
    
    // Step 9: Component rendering - all enabled for production
    ENABLE_RENDER_TOPBAR: true,              // 9a: Render TopBar component
    ENABLE_RENDER_AUDIO: true,               // 9b: Render audio element
    ENABLE_RENDER_IMAGE: true,               // 9c: Render CollectionImageDisplay
    ENABLE_RENDER_MINT_DETAILS: true,        // 9d: Render MintDetailsSection
    ENABLE_RENDER_CHOICES_MINT: true,        // 9d1: Render OrdinalChoicesMint
    ENABLE_RENDER_PHASE_LIST: true,          // 9e: Render PhaseList
    ENABLE_RENDER_CONTAINER: true,           // 9f: Render main container divs
    
    // Step 9c breakdown: CollectionImageDisplay parts - all enabled for production
    ENABLE_IMAGE_VIDEO: true,                // 9c1: Render video element
    ENABLE_IMAGE_IMG: true,                 // 9c2: Render img element
    ENABLE_IMAGE_SOCIAL_LINKS: true,        // 9c3: Render social links
    ENABLE_IMAGE_ABOUT: true,                // 9c4: Render about section
  }
  
  // Log debug status on mount
  useEffect(() => {
    const enabled = Object.entries(DEBUG_FEATURES)
      .filter(([_, enabled]) => enabled)
      .map(([name]) => name.replace('ENABLE_', ''))
    console.log('[DEBUG MODE] Enabled features:', enabled.length > 0 ? enabled : 'NONE (all disabled)')
    if (enabled.length === 0) {
      console.log('[DEBUG MODE] All features disabled - page should be static, navigation should work')
    }
  }, [])
  // ============================================================================

  const [collection, setCollection] = useState<Collection | null>(null)
  const [loading, setLoading] = useState(true)
  const [isLive, setIsLive] = useState(true) // Collection is live and mintable
  const [isPreview, setIsPreview] = useState(false) // Collection is in preview mode (launchpad but not launchpad_live)
  const [whitelistStatus, setWhitelistStatus] = useState<WhitelistStatus | null>(null)
  const [whitelistStatuses, setWhitelistStatuses] = useState<Record<string, WhitelistStatus>>({})
  const [userMintStatus, setUserMintStatus] = useState<UserMintStatus | null>(null)
  const [checkingWhitelist, setCheckingWhitelist] = useState(false)
  const [checkingWhitelistPhaseId, setCheckingWhitelistPhaseId] = useState<string | null>(null)

  // Minting state
  const [feeRate, setFeeRate] = useState(0.9)
  const [feeRateInput, setFeeRateInput] = useState('0.9')
  const [feeRateManuallyEdited, setFeeRateManuallyEdited] = useState(false)
  const [mintQuantity, setMintQuantity] = useState(1)
  const [mintQuantityInput, setMintQuantityInput] = useState('1')
  const [mempoolHealth, setMempoolHealth] = useState<{ suggestedFeeRate: number; healthRating: string; healthMessage: string; blocksWithSub1Sat: number; totalBlocks: number; lastSub1SatFee: number | null } | null>(null)
  const [minting, setMinting] = useState(false)
  const [mintStatus, setMintStatus] = useState('')
  const [commitTxid, setCommitTxid] = useState('')
  const [error, setError] = useState('')
  const [countdown, setCountdown] = useState<{ [key: string]: string }>({})
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [audioEnabled, setAudioEnabled] = useState(false)
  const [audioError, setAudioError] = useState<string | null>(null)
  const [audioVolume, setAudioVolume] = useState(0.3) // Default 60% volume
  const [showVolumeControls, setShowVolumeControls] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [mintHistory, setMintHistory] = useState<any[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number; aspectRatio: number } | null>(null)

  // Live countdown timer for upcoming starts and active phase ends
  // Use ref to avoid recreating timer on every collection update
  const phasesRef = useRef(collection?.phases)
  const countdownRef = useRef<{ [key: string]: string }>({})
  
  // Update phasesRef in effect to avoid render-time side effects
  useEffect(() => {
    if (!DEBUG_FEATURES.ENABLE_PHASES_REF_SYNC) return
    if (collection?.phases !== phasesRef.current) {
      phasesRef.current = collection?.phases
    }
  }, [collection?.phases])

  // Countdown timer - Step 4
  useEffect(() => {
    if (!DEBUG_FEATURES.ENABLE_COUNTDOWN_TIMER) return
    
    const timer = setInterval(() => {
      if (phasesRef.current) {
        const newCountdowns: { [key: string]: string } = {}
        const now = new Date()
        phasesRef.current.forEach((phase) => {
          const startTime = new Date(phase.start_time)
          const endTime = phase.end_time ? new Date(phase.end_time) : null
          
          let countdownValue: string | undefined
          
          // Check if upcoming
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
            // Show countdown for active phases with end times
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
        
        // Only update state if countdown values actually changed
        const hasChanges = Object.keys(newCountdowns).length !== Object.keys(countdownRef.current).length ||
          Object.keys(newCountdowns).some(key => newCountdowns[key] !== countdownRef.current[key])
        
        if (hasChanges) {
          countdownRef.current = newCountdowns
          setCountdown(newCountdowns)
        }
      }
    }, 1000)

    return () => clearInterval(timer)
  }, []) // Empty deps - only run once, use ref for phases

  // Ref to prevent duplicate mempool calls
  const mempoolLoadingRef = useRef(false)
  const feeRateManuallyEditedRef = useRef(false)
  
  // Refs for polling to avoid stale closure issues
  const collectionRef = useRef(collection)
  const mintingRef = useRef(minting)
  
  // Track if component is mounted and on the correct route to prevent state updates during navigation
  const isMountedRef = useRef(true)
  const expectedPathRef = useRef<string | null>(null)
  
  // Track expected pathname to detect navigation away
  useEffect(() => {
    expectedPathRef.current = pathname
  }, [pathname])
  
  // Track if navigation is in progress
  const isNavigatingRef = useRef(false)
  
  // Helper to check if we should allow state updates
  const shouldAllowUpdates = useCallback(() => {
    // Don't allow updates if navigating or not on correct route
    if (isNavigatingRef.current) return false
    return isMountedRef.current && expectedPathRef.current === pathname
  }, [pathname])
  
  // Detect navigation start
  useEffect(() => {
    const handleBeforeUnload = () => {
      isNavigatingRef.current = true
    }
    
    // Listen for navigation events
    window.addEventListener('beforeunload', handleBeforeUnload)
    
    // Also check pathname changes
    if (pathname !== `/launchpad/${collectionId}`) {
      isNavigatingRef.current = true
    } else {
      isNavigatingRef.current = false
    }
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [pathname, collectionId])

  // Polling function - uses lightweight endpoint - Step 2
  // Memoize to prevent recreation on every render
  // Use collectionRef.current to avoid stale closure issues with polling effect
  const pollUpdates = useCallback(async () => {
    if (!DEBUG_FEATURES.ENABLE_POLLING) return
    if (!collectionRef.current) return // Wait for initial load
    if (!shouldAllowUpdates()) return // Don't poll if unmounting/navigating
    
    try {
      const params = new URLSearchParams()
      if (currentAddress) params.append('wallet_address', currentAddress)
      
      const response = await fetch(`/api/launchpad/${collectionId}/poll?${params}`)
      if (!response.ok) return

      const data = await response.json()
      
      // Don't update state if component is unmounting/navigating
      if (!isMountedRef.current) return
      
      if (data.success) {
        // Update counts - only update if values actually changed
        if (data.counts) {
          setCollection(prev => {
            if (!prev) return null
            
            // Check if values actually changed to prevent unnecessary re-renders
            const totalMintedChanged = prev.total_minted !== data.counts.total_minted
            const availableCountChanged = prev.available_count !== data.counts.available_count
            
            // Check if active phase changed
            const currentActivePhase = prev.phases?.find(p => p.is_active)
            const newActivePhaseId = data.active_phase?.id
            const phaseChanged = currentActivePhase?.id !== newActivePhaseId
            
            // If nothing changed, return prev to prevent re-render
            if (!totalMintedChanged && !availableCountChanged && !phaseChanged && !data.active_phase) {
              return prev
            }
            
            // Log phase transitions for debugging
            if (phaseChanged) {
              console.log('[Poll] Phase transition detected:', {
                from: currentActivePhase?.phase_name || 'none',
                to: data.active_phase?.phase_name || 'none',
              })
            }
            
            // Update phases with latest data from poll - only if something changed
            let updatedPhases = prev.phases
            let phasesChanged = false
            if (data.active_phase) {
              // Check if we need to update any phase - be VERY strict about what constitutes a change
              const activePhase = prev.phases?.find(p => p.id === data.active_phase.id)
              if (activePhase) {
                // Calculate what the new values would be
                const newMaxPerWallet = data.active_phase.max_per_wallet ?? activePhase.max_per_wallet
                const newPhaseMinted = data.active_phase.phase_minted ?? activePhase.phase_minted
                const newPhaseAllocation = data.active_phase.phase_allocation ?? activePhase.phase_allocation
                const newMintPriceSats = data.active_phase.mint_price_sats ?? activePhase.mint_price_sats
                const newWhitelistOnly = data.active_phase.whitelist_only ?? activePhase.whitelist_only
                
                // Check if ANY value actually changed
                const activePhaseNeedsUpdate = 
                  activePhase.max_per_wallet !== newMaxPerWallet ||
                  activePhase.phase_minted !== newPhaseMinted ||
                  activePhase.phase_allocation !== newPhaseAllocation ||
                  activePhase.mint_price_sats !== newMintPriceSats ||
                  activePhase.whitelist_only !== newWhitelistOnly ||
                  activePhase.is_active !== true
                
                // Check if we need to deactivate other phases
                const needsDeactivation = phaseChanged && prev.phases?.some(p => p.is_active && p.id !== data.active_phase.id)
                
                if (activePhaseNeedsUpdate || needsDeactivation) {
                  phasesChanged = true
                  // Only create new array if we actually need to change something
                  // Check if we actually need a new array by comparing each phase
                  let needsNewArray = false
                  const newPhases = prev.phases?.map(p => {
                    if (p.id === data.active_phase.id) {
                      // Only create new object if values actually changed
                      if (activePhaseNeedsUpdate) {
                        needsNewArray = true
                        return {
                          ...p,
                          is_active: true,
                          max_per_wallet: newMaxPerWallet,
                          phase_minted: newPhaseMinted,
                          phase_allocation: newPhaseAllocation,
                          mint_price_sats: newMintPriceSats,
                          whitelist_only: newWhitelistOnly,
                        }
                      }
                      // No change needed, return same object
                      return p
                    } else if (needsDeactivation && p.is_active) {
                      // Deactivate other phases if phase changed
                      needsNewArray = true
                      return { ...p, is_active: false }
                    }
                    // No change needed, return same object
                    return p
                  })
                  
                  // Only assign new array if we actually created new objects
                  if (needsNewArray && newPhases) {
                    updatedPhases = newPhases
                  } else {
                    // No actual changes, keep same array reference
                    phasesChanged = false
                  }
                }
              }
            } else if (phaseChanged) {
              // Phase ended - deactivate all
              const hasActivePhases = prev.phases?.some(p => p.is_active)
              if (hasActivePhases) {
                phasesChanged = true
                updatedPhases = prev.phases?.map(p => {
                  if (p.is_active) {
                    return { ...p, is_active: false }
                  }
                  return p
                })
                // If all phases were already inactive, no change needed
                if (updatedPhases === prev.phases) {
                  phasesChanged = false
                }
              }
            }
            
            // Only update if something actually changed
            if (!totalMintedChanged && !availableCountChanged && !phasesChanged) {
              return prev // Return exact same object to prevent re-render
            }
            
            // Double-check: if updatedPhases is the same reference as prev.phases, don't create new object
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
        
        // Update whitelist status if changed - only update if actually different
        if (data.user_whitelist_status && shouldAllowUpdates()) {
          setWhitelistStatus(prev => {
            // Only update if values actually changed
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
        
        // Update user mint status for public phases - only update if actually different
        if (data.user_mint_status && shouldAllowUpdates()) {
          setUserMintStatus(prev => {
            // Only update if values actually changed
            if (prev && 
                prev.minted_count === data.user_mint_status.minted_count &&
                prev.remaining === data.user_mint_status.remaining &&
                prev.max_per_wallet === data.user_mint_status.max_per_wallet) {
              return prev
            }
            console.log('[Poll Update] User mint status:', data.user_mint_status)
            return data.user_mint_status
          })
        } else if (shouldAllowUpdates()) {
          console.log('[Poll Update] No user_mint_status in response, isConnected:', isConnected, 'currentAddress:', currentAddress)
        }
        
        // Log phase changes for debugging
        if (data.active_phase && shouldAllowUpdates()) {
          console.log('[Poll Update] Active phase:', data.active_phase.phase_name, 'whitelist_only:', data.active_phase.whitelist_only, 'max_per_wallet:', data.active_phase.max_per_wallet)
        }
      }
    } catch (err) {
      // Silently fail polling - don't spam console
      if (shouldAllowUpdates()) {
        console.debug('Poll update failed:', err)
      }
    }
  }, [collectionId, currentAddress, shouldAllowUpdates])

  // Mempool health - Step 3
  const loadMempoolHealth = useCallback(async () => {
    if (!DEBUG_FEATURES.ENABLE_MEMPOOL_HEALTH) return
    
    // Prevent duplicate calls
    if (mempoolLoadingRef.current) {
      console.log('[Mempool] Already loading, skipping duplicate call')
      return
    }

    mempoolLoadingRef.current = true
    try {
      const health = await calculateOptimalFeeRate()
      if (shouldAllowUpdates()) {
        setMempoolHealth(health)
        // Only update fee rate if user hasn't manually edited it and we have a valid suggestion
        if (!feeRateManuallyEditedRef.current && health.suggestedFeeRate !== -1) {
          setFeeRate(health.suggestedFeeRate)
          setFeeRateInput(health.suggestedFeeRate.toFixed(2))
        }
      }
    } catch (error) {
      console.error('Error loading mempool health:', error)
    } finally {
      mempoolLoadingRef.current = false
    }
  }, [shouldAllowUpdates])

  // Track last mint time and previous counts for adaptive polling
  const lastMintTimeRef = useRef<number | null>(null)
  const previousTotalMintedRef = useRef<number>(0)
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // Initial load - Step 1 (broken down into parts)
  useEffect(() => {
    // If no initial load features are enabled, just set loading to false
    const hasAnyLoadFeature = 
      DEBUG_FEATURES.ENABLE_LOAD_COLLECTION_FETCH ||
      DEBUG_FEATURES.ENABLE_LOAD_COLLECTION_STATE ||
      DEBUG_FEATURES.ENABLE_LOAD_ISLIVE_STATE ||
      DEBUG_FEATURES.ENABLE_LOAD_USER_MINT_STATUS
    
    if (!hasAnyLoadFeature) {
      // Still set loading to false so page renders
      setLoading(false)
      return
    }
    
    // Don't run if we've navigated away
    if (pathname !== `/launchpad/${collectionId}`) {
      return
    }
    
    isMountedRef.current = true
    expectedPathRef.current = pathname
    
    const loadData = async () => {
      try {
        await loadCollection()
        // Only poll if still mounted and on correct route
        if (shouldAllowUpdates() && DEBUG_FEATURES.ENABLE_POLLING) {
          setTimeout(() => {
            if (shouldAllowUpdates()) {
              pollUpdates()
            }
          }, 100)
        }
      } catch (error) {
        // Silently handle errors during navigation
        if (shouldAllowUpdates()) {
          console.error('Error loading collection:', error)
        }
      }
    }
    
    loadData()
    if (shouldAllowUpdates() && DEBUG_FEATURES.ENABLE_MEMPOOL_HEALTH) {
      loadMempoolHealth()
    }
    
    return () => {
      // Don't set to false here - let the unmount effect handle it
      // This prevents race conditions during navigation
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionId, currentAddress, pathname])

  // Keep refs in sync for polling
  useEffect(() => {
    mintingRef.current = minting
  }, [minting])
  
  useEffect(() => {
    feeRateManuallyEditedRef.current = feeRateManuallyEdited
  }, [feeRateManuallyEdited])
  
  // Keep refs in sync - update in effect to avoid render-time side effects
  useEffect(() => {
    if (!DEBUG_FEATURES.ENABLE_COLLECTION_REF_SYNC) return
    if (collection !== collectionRef.current) {
      const prev = collectionRef.current
      // Check if it's a meaningful change
      if (!prev || 
          prev.total_minted !== collection?.total_minted ||
          prev.available_count !== collection?.available_count ||
          prev.phases?.length !== collection?.phases?.length) {
        collectionRef.current = collection
        if (collection?.total_minted !== undefined) {
          previousTotalMintedRef.current = collection.total_minted
        }
      } else {
        // Same data, just update the ref
        collectionRef.current = collection
      }
    }
  }, [collection])

  // Polling effect - Step 2
  useEffect(() => {
    if (!DEBUG_FEATURES.ENABLE_POLLING) return
    
    // Don't start polling if we're not on the correct route
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
            // Silently handle errors during navigation
            if (isPollingActive && shouldAllowUpdates()) {
              scheduleNextPoll()
            }
          })
        }
      }, interval)
    }
    
    scheduleNextPoll()
    
    // Poll gas estimation every minute (60 seconds)
    const gasPollInterval = setInterval(() => {
      if (isPollingActive && shouldAllowUpdates()) {
        loadMempoolHealth()
      }
    }, 60000)
    
    return () => {
      isPollingActive = false
      if (pollTimeout) clearTimeout(pollTimeout)
      clearInterval(gasPollInterval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionId, pathname])

  // Set default volume on audio element
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = audioVolume
    }
  }, [audioVolume])

  // Auto-play audio on load - Step 7
  // Memoize audio URL to avoid re-running when collection object reference changes
  const audioUrl = DEBUG_FEATURES.ENABLE_MEMO_AUDIO_URL
    ? useMemo(() => {
        return collection?.audio_url || null
      }, [collection?.audio_url])
    : (collection?.audio_url || null)
  
  useEffect(() => {
    if (!DEBUG_FEATURES.ENABLE_AUDIO_AUTOPLAY) return
    if (!audioUrl) return

    const tryAutoPlay = async () => {
      const el = audioRef.current
      if (!el) return
      
      try {
        // Start muted to bypass browser autoplay restrictions
        el.muted = true
        el.volume = 0
        await el.play()
        
        // Once playing, unmute and set volume
        el.muted = false
        el.volume = audioVolume
        setAudioEnabled(true)
        setAudioError(null)
      } catch (e) {
        // If muted autoplay fails, try unmuted
        try {
          el.muted = false
          el.volume = audioVolume
          await el.play()
          setAudioEnabled(true)
          setAudioError(null)
        } catch (e2) {
          // Autoplay blocked - user will need to click play button
          console.log('Autoplay blocked, user interaction required')
          el.muted = false
          el.volume = audioVolume
        }
      }
    }

    // Try to autoplay after a short delay to allow page to load
    const timer = setTimeout(() => {
      void tryAutoPlay()
    }, 500)

    return () => clearTimeout(timer)
  }, [audioUrl, audioVolume])

  // Check whitelist status - only when address changes or active phase ID actually changes
  const activePhaseIdRef = useRef<string | null>(null)
  const currentAddressRef = useRef<string | null>(null)
  
  // Memoize active phase ID calculation to avoid recomputing on every render
  const currentActivePhaseId = useMemo(() => {
    return collection?.phases?.find(p => p.is_active)?.id || null
  }, [collection?.phases])
  
  // Update ref only when the ID actually changes (not when array reference changes)
  useEffect(() => {
    if (currentActivePhaseId !== activePhaseIdRef.current) {
      activePhaseIdRef.current = currentActivePhaseId
    }
  }, [currentActivePhaseId])
  
  // Use ref value for stable reference in dependency array
  const stableActivePhaseId = activePhaseIdRef.current
  
  // Whitelist check - Step 6
  useEffect(() => {
    if (!DEBUG_FEATURES.ENABLE_WHITELIST_CHECK) return
    
    const addressChanged = currentAddress !== currentAddressRef.current
    const phaseChanged = currentActivePhaseId !== activePhaseIdRef.current
    
    // Only check if address changed or active phase ID actually changed
    if (currentAddress && collection && (addressChanged || phaseChanged)) {
      activePhaseIdRef.current = currentActivePhaseId
      currentAddressRef.current = currentAddress
      // Use collectionRef to avoid dependency on checkWhitelistStatus
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
  }, [currentAddress, stableActivePhaseId]) // Use stable ref value, not computed value

  // Load image dimensions - Step 5
  // Memoize image URL to avoid re-running when collection object reference changes
  const imageUrl = DEBUG_FEATURES.ENABLE_MEMO_IMAGE_URL
    ? useMemo(() => {
        return collection?.banner_image_url || collection?.mobile_image_url || null
      }, [collection?.banner_image_url, collection?.mobile_image_url])
    : (collection?.banner_image_url || collection?.mobile_image_url || null)
  
  const imageUrlRef = useRef<string | null>(null)
  useEffect(() => {
    if (!DEBUG_FEATURES.ENABLE_IMAGE_DIMENSIONS) return
    
    // Only reload if URL actually changed
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
    // Only show loading spinner on initial load, not on polling updates
    if (!silent && shouldAllowUpdates() && DEBUG_FEATURES.ENABLE_LOAD_LOADING_STATE) {
      setLoading(true)
    }
    
    // Step 1a: Fetch collection data
    if (!DEBUG_FEATURES.ENABLE_LOAD_COLLECTION_FETCH) {
      // Always set loading to false if fetch is disabled, regardless of ENABLE_LOAD_LOADING_STATE
      if (!silent && shouldAllowUpdates()) {
        setLoading(false)
      }
      return
    }
    
    try {
      // Include wallet address in initial load if connected
      const url = currentAddress 
        ? `/api/launchpad/${collectionId}?wallet_address=${encodeURIComponent(currentAddress)}`
        : `/api/launchpad/${collectionId}`
      
      const response = await fetch(url)
      
      // Handle 404 gracefully - just set collection to null (shows "not found" UI)
      if (response.status === 404) {
        if (shouldAllowUpdates()) {
          setCollection(null)
        }
        return
      }
      
      if (!response.ok) throw new Error('Collection not found')

      const data = await response.json()
      
      // Don't update state if component is unmounting/navigating
      if (!shouldAllowUpdates()) return
      
      // Step 1b: Update collection state
      // CRITICAL: Use startTransition to make state update non-blocking for navigation
      if (DEBUG_FEATURES.ENABLE_LOAD_COLLECTION_STATE && shouldAllowUpdates()) {
        // Use a ref to check pathname at the time of state update
        const currentPath = window.location.pathname
        if (currentPath !== `/launchpad/${collectionId}`) {
          console.log('[DEBUG] Skipping setCollection - navigated away:', currentPath)
          return
        }
        
        // Double-check navigation hasn't started
        if (isNavigatingRef.current) {
          console.log('[DEBUG] Skipping setCollection - navigation in progress')
          return
        }
        
        // Use setTimeout to defer state update to next tick, allowing navigation to proceed
        setTimeout(() => {
          // Check again after delay
          if (isNavigatingRef.current || window.location.pathname !== `/launchpad/${collectionId}`) {
            console.log('[DEBUG] Skipping setCollection - navigation started during delay')
            return
          }
          
          // Wrap in startTransition to prevent blocking navigation
          startTransition(() => {
            setCollection(prev => {
          const newCollection = data.collection
          if (!prev) return newCollection
          
          // Compare key properties to avoid unnecessary updates
          if (prev.id !== newCollection.id ||
              prev.total_minted !== newCollection.total_minted ||
              prev.available_count !== newCollection.available_count ||
              prev.banner_image_url !== newCollection.banner_image_url ||
              prev.mobile_image_url !== newCollection.mobile_image_url ||
              prev.audio_url !== newCollection.audio_url ||
              prev.phases?.length !== newCollection.phases?.length) {
            return newCollection
          }
          
          // Check if phases changed
          const phasesChanged = prev.phases?.some((p, i) => {
            const newPhase = newCollection.phases?.[i]
            if (!newPhase || p.id !== newPhase.id) return true
            return p.is_active !== newPhase.is_active ||
                   p.max_per_wallet !== newPhase.max_per_wallet ||
                   p.phase_minted !== newPhase.phase_minted ||
                   p.phase_allocation !== newPhase.phase_allocation ||
                   p.mint_price_sats !== newPhase.mint_price_sats ||
                   p.whitelist_only !== newPhase.whitelist_only
          })
          
          if (phasesChanged) {
            return newCollection
          }
          
          // No meaningful changes, return previous object
          return prev
            })
          })
        }, 0) // Defer to next event loop tick
      }
      // Step 1c: Update isLive/isPreview state
      if (DEBUG_FEATURES.ENABLE_LOAD_ISLIVE_STATE && shouldAllowUpdates()) {
        setIsLive(data.is_live ?? true)
        setIsPreview(data.is_preview ?? false)
      }

      // Step 1d: Update user mint status
      if (DEBUG_FEATURES.ENABLE_LOAD_USER_MINT_STATUS && shouldAllowUpdates()) {
        if (data.user_mint_status) {
          console.log('[Initial Load] User mint status:', data.user_mint_status)
          setUserMintStatus(data.user_mint_status)
        } else if (currentAddress) {
          console.log('[Initial Load] No user_mint_status returned, wallet:', currentAddress.slice(0, 12))
        }
      }

      // Default to 0.9 sat/vB (don't override user's selection)
      // Phase suggested_fee_rate is just a recommendation, not the default
    } catch (err: any) {
      if (shouldAllowUpdates()) {
        setError(err.message)
      }
    } finally {
      // Step 1e: Update loading state
      // Always set loading to false when done, even if ENABLE_LOAD_LOADING_STATE is disabled
      // (we just don't set it to true at the start if disabled)
      // Don't check shouldAllowUpdates here - we need to clear loading state even during navigation
      if (!silent) {
        setLoading(false)
      }
    }
  }, [collectionId, currentAddress, shouldAllowUpdates])

  // Use refs to avoid recreating this function on every collection change
  const currentAddressRefForWhitelist = useRef<string | null>(null)
  const collectionRefForWhitelist = useRef<Collection | null>(null)
  
  // Keep refs updated in effect to avoid render-time side effects
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
            // Compare actual properties instead of JSON.stringify
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
            // Compare actual properties instead of JSON.stringify
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
  }, [collectionId]) // Only depend on collectionId, use refs for the rest

  // Handler for choices mint (takes specific ordinal_ids - supports multiple)
  const handleChoicesMint = useCallback(async (ordinalIds: string[]) => {
    if (!currentAddress || !collection || !isConnected) {
      setError('Please connect your wallet')
      return
    }

    if (!ordinalIds || ordinalIds.length === 0) {
      setError('No ordinals selected')
      return
    }

    // SAFETY CHECK: Collection is sold out
    if (collection.total_minted >= collection.total_supply) {
      setError('⚠️ This collection is sold out. All items have been minted.')
      return
    }

    if (!isLiveConnection) {
      setError('⚠️ Wallet connection not fully established. Please disconnect and reconnect your wallet.')
      return
    }

    const activePhase = collection.phases?.find(p => p.is_active)
    if (!activePhase) {
      setError('No active mint phase')
      return
    }

    // For choices mint, the ordinals should already be reserved when user clicked them
    // We'll validate the existing reservations in create-commit, not reserve again
    setMinting(true)
    setError('')
    setCommitTxid('')

    try {
      // Don't reserve again - the ordinals are already reserved from when user clicked them
      // The create-commit endpoint will validate the existing reservations
      const reservedOrdinalIds = ordinalIds

      // Continue with mint flow (supports batch minting)
      setMintStatus(`Creating commit transaction for ${ordinalIds.length} ordinal${ordinalIds.length > 1 ? 's' : ''}...`)
      const createCommitRes = await fetch('/api/mint/create-commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ordinal_ids: reservedOrdinalIds,
          minter_address: currentAddress,
          payment_address: paymentAddress || currentAddress,
          payment_pubkey: paymentPublicKey,
          fee_rate: feeRate,
          phase_id: activePhase.id,
        }),
      })

      if (!createCommitRes.ok) {
        const errData = await createCommitRes.json()
        throw new Error(errData.error || 'Failed to create commit transaction')
      }

      const commitData = await createCommitRes.json()
      if (!commitData.commit_psbt) {
        throw new Error('No commit PSBT returned from server')
      }

      setMintStatus('Please sign the transaction...')
      const signedResult = await signPsbt(commitData.commit_psbt, true, false)

      let signedPsbtBase64: string | undefined
      let signedPsbtHex: string | undefined
      let txHex: string | undefined

      if (typeof signedResult === 'string') {
        signedPsbtBase64 = signedResult
      } else if (signedResult && typeof signedResult === 'object') {
        signedPsbtBase64 = signedResult.signedPsbtBase64 || signedResult.psbt
        signedPsbtHex = signedResult.signedPsbtHex || signedResult.hex
        txHex = signedResult.txHex || signedResult.tx
      }

      if (!signedPsbtBase64 && !signedPsbtHex && !txHex) {
        throw new Error('Wallet did not return signed PSBT or transaction')
      }

      setMintStatus('Broadcasting commit transaction...')
      const broadcastCommitRes = await fetch('/api/mint/broadcast-commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: commitData.session_id,
          signed_psbt_base64: signedPsbtBase64,
          signed_psbt_hex: signedPsbtHex,
          tx_hex: txHex,
        }),
      })

      if (!broadcastCommitRes.ok) {
        const errData = await broadcastCommitRes.json()
        throw new Error(errData.error || 'Failed to broadcast commit transaction')
      }

      const { commit_tx_id } = await broadcastCommitRes.json()
      setCommitTxid(commit_tx_id)
      setMintStatus('Commit broadcasted! Creating reveal...')
      await new Promise(resolve => setTimeout(resolve, 2000))

      const inscriptionIds = commitData.inscription_ids || []
      for (let i = 0; i < inscriptionIds.length; i++) {
        const mintInscriptionId = inscriptionIds[i]
        setMintStatus(`Creating reveal transaction (${i + 1}/${inscriptionIds.length})...`)
        
        const revealRes = await fetch('/api/mint/reveal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mint_inscription_id: mintInscriptionId,
            commit_tx_id: commit_tx_id,
          }),
        })

        if (!revealRes.ok) {
          const errData = await revealRes.json()
          throw new Error(errData.error || `Failed to create reveal transaction`)
        }

        if (i < inscriptionIds.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500))
        }
      }
      
      setMintStatus('✅ Successfully minted ordinal!')
      // Reload collection data
      if (shouldAllowUpdates()) {
        loadCollection()
      }
    } catch (error: any) {
      console.error('Error minting:', error)
      setError(error.message || 'Failed to mint')
      setMintStatus('')
    } finally {
      setMinting(false)
    }
  }, [currentAddress, collection, isConnected, isLiveConnection, collectionId, feeRate, paymentAddress, paymentPublicKey, signPsbt, shouldAllowUpdates, loadCollection])

  const handleMint = async () => {
    if (!currentAddress || !collection || !isConnected) {
      setError('Please connect your wallet')
      return
    }

    // SAFETY CHECK: Collection is sold out
    if (collection.total_minted >= collection.total_supply) {
      setError('⚠️ This collection is sold out. All items have been minted.')
      return
    }

    // SAFETY CHECK: Only allow minting with a live wallet connection
    // This prevents sending ordinals to a cached/stale address from localStorage
    if (!isLiveConnection) {
      setError('⚠️ Wallet connection not fully established. Please disconnect and reconnect your wallet to ensure the ordinal is sent to the correct address.')
      return
    }

    const activePhase = collection.phases?.find(p => p.is_active)
    if (!activePhase) {
      setError('No active mint phase')
      return
    }

    if (activePhase.whitelist_only && !whitelistStatus?.is_whitelisted) {
      setError(`⚠️ Your connected wallet (${currentAddress?.slice(0, 8)}...${currentAddress?.slice(-6)}) was not found on the whitelist for this phase. Only whitelisted wallets can mint during this phase.`)
      return
    }

    // Calculate remaining mints and max available
    // For whitelist phases: use whitelistStatus.remaining_allocation (already calculated from DB)
    // For public phases: use phase max_per_wallet - userMintStatus.minted_count (from DB query)
    let maxAvailable: number
    if (activePhase.whitelist_only) {
      // Whitelist phase: use the remaining_allocation from whitelistStatus (calculated from DB)
      const remaining = whitelistStatus?.remaining_allocation ?? 0
      maxAvailable = Math.min(MAX_PER_TRANSACTION, remaining)
    } else {
      // Public phase: calculate from phase max_per_wallet and user's actual minted count
      if (activePhase.max_per_wallet != null && userMintStatus?.minted_count != null) {
        const remaining = Math.max(0, activePhase.max_per_wallet - userMintStatus.minted_count)
        maxAvailable = Math.min(MAX_PER_TRANSACTION, remaining)
      } else {
        // Fallback: if we don't have data, assume unlimited (capped at MAX_PER_TRANSACTION)
        maxAvailable = MAX_PER_TRANSACTION
      }
    }

    // Validate mint quantity using shared utility
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
    setCommitTxid('')

    try {
      // Step 1: Reserve ALL ordinals at once (single API call with quantity)
      setMintStatus(`Reserving ${mintQuantity} ordinal${mintQuantity > 1 ? 's' : ''}...`)
      
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
        throw new Error(errData.error || 'Failed to reserve ordinals')
      }

      const reserveData = await reserveRes.json()
      
      // Handle both single and batch responses
      const reservedOrdinals = mintQuantity === 1 
        ? [reserveData.ordinal]
        : reserveData.ordinals
      
      const reservedOrdinalIds = reservedOrdinals.map((o: any) => o.id)
      console.log(`✅ Reserved ${reservedOrdinalIds.length} ordinal(s):`, reservedOrdinalIds)

      // Step 2: Create ONE commit transaction for ALL reserved ordinals
      setMintStatus('Creating commit transaction...')
      const createCommitRes = await fetch('/api/mint/create-commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ordinal_ids: reservedOrdinalIds, // All ordinals at once
          minter_address: currentAddress,
          payment_address: paymentAddress || currentAddress,
          payment_pubkey: paymentPublicKey,
          fee_rate: feeRate,
          phase_id: activePhase.id,
        }),
      })

      if (!createCommitRes.ok) {
        const errData = await createCommitRes.json()
        throw new Error(errData.error || 'Failed to create commit transaction')
      }

      const commitData = await createCommitRes.json()

      if (!commitData.commit_psbt) {
        throw new Error('No commit PSBT returned from server')
      }

      // Step 3: Sign commit PSBT
      setMintStatus('Please sign the transaction...')
      const signedResult = await signPsbt(commitData.commit_psbt, true, false)

      // Step 4: Handle different wallet return formats
      let signedPsbtBase64: string | undefined
      let signedPsbtHex: string | undefined
      let txHex: string | undefined

      if (typeof signedResult === 'string') {
        signedPsbtBase64 = signedResult
      } else if (signedResult && typeof signedResult === 'object') {
        signedPsbtBase64 = signedResult.signedPsbtBase64 || signedResult.psbt
        signedPsbtHex = signedResult.signedPsbtHex || signedResult.hex
        txHex = signedResult.txHex || signedResult.tx
      }

      if (!signedPsbtBase64 && !signedPsbtHex && !txHex) {
        throw new Error('Wallet did not return signed PSBT or transaction')
      }

      // Step 5: Broadcast commit transaction
      setMintStatus('Broadcasting commit transaction...')
      const broadcastCommitRes = await fetch('/api/mint/broadcast-commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: commitData.session_id,
          signed_psbt_base64: signedPsbtBase64,
          signed_psbt_hex: signedPsbtHex,
          tx_hex: txHex,
        }),
      })

      if (!broadcastCommitRes.ok) {
        const errData = await broadcastCommitRes.json()
        throw new Error(errData.error || 'Failed to broadcast commit transaction')
      }

      const { commit_tx_id } = await broadcastCommitRes.json()
      setCommitTxid(commit_tx_id)
      setMintStatus(`Commit broadcasted! Creating reveal...`)

      // Step 6: Wait a moment for transaction propagation
      await new Promise(resolve => setTimeout(resolve, 2000))

      // Step 7: Create and broadcast reveal transaction(s)
      // Use mint_inscription_id (like admin page) instead of session_id for reliable reveal
      // Each inscription needs its own reveal
      const inscriptionIds = commitData.inscription_ids || []
      const revealedInscriptions: string[] = []
      
      for (let i = 0; i < inscriptionIds.length; i++) {
        const mintInscriptionId = inscriptionIds[i]
        setMintStatus(`Creating reveal transaction (${i + 1}/${inscriptionIds.length})...`)
        
        const revealRes = await fetch('/api/mint/reveal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mint_inscription_id: mintInscriptionId,
            commit_tx_id: commit_tx_id,
          }),
        })

        if (!revealRes.ok) {
          const errData = await revealRes.json()
          throw new Error(errData.error || `Failed to create reveal transaction for inscription ${i + 1}`)
        }

        const { inscription_id } = await revealRes.json()
        revealedInscriptions.push(inscription_id)
        
        // Small delay between reveals to avoid rate limiting
        if (i < inscriptionIds.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500))
        }
      }
      
      setMintStatus(`✅ Successfully minted ${mintQuantity} ordinal${mintQuantity > 1 ? 's' : ''}!`)
      
      // Locally update mint counts so UI reflects immediately without waiting for poll
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
      
      // Also update collection total_minted locally
      if (collection) {
        setCollection(prev => prev ? {
          ...prev,
          total_minted: (prev.total_minted || 0) + mintQuantity,
        } : prev)
      }
      
      // Reset quantity
      setMintQuantity(1)
      setMintQuantityInput('1')
      
      // Don't manually refresh - the automatic polling will handle updates
      // This prevents any loading state from being triggered
      
    } catch (err: any) {
      console.error('Mint error:', err)
      setError(err.message || 'Failed to mint')
    } finally {
      setMinting(false)
    }
  }


  const formatSats = (sats: number): string => {
    if (sats >= 100000000) {
      return `${(sats / 100000000).toFixed(4)} BTC`
    }
    return `${sats.toLocaleString()} sats`
  }

  // Memoize these functions to prevent recreating on every render
  const getPhaseStatus = useCallback((phase: Phase) => {
    const now = new Date()
    const startTime = new Date(phase.start_time)
    const endTime = phase.end_time ? new Date(phase.end_time) : null

    // Check time-based status first, not DB flags
    if (now < startTime) {
      return { status: 'upcoming', label: '⏰ Upcoming', color: 'blue' }
    }

    if (endTime && now > endTime) {
      return { status: 'ended', label: 'Ended', color: 'gray' }
    }

    // If we're within the time window, it's active
    if (now >= startTime && (endTime === null || now <= endTime)) {
      // Only mark as completed if explicitly marked AND past end time
      if (phase.is_completed && endTime && now > endTime) {
        return { status: 'completed', label: '✓ Completed', color: 'gray' }
      }
      return { status: 'active', label: '🔴 LIVE NOW', color: 'green' }
    }

    // Fallback: check DB flags if time logic doesn't match
    if (phase.is_completed) {
      return { status: 'completed', label: '✓ Completed', color: 'gray' }
    }

    if (phase.is_active) {
      return { status: 'active', label: '🔴 LIVE NOW', color: 'green' }
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

  // Use ref for currentAddress to avoid recreating callback
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
      setMintHistory(data.inscriptions || [])
    } catch (err) {
      console.error('Error loading mint history:', err)
    } finally {
      setLoadingHistory(false)
    }
  }, [collectionId]) // Only depend on collectionId, use ref for currentAddress

  // Mint history - Step 8
  useEffect(() => {
    if (!DEBUG_FEATURES.ENABLE_MINT_HISTORY) return
    if (showHistory && currentAddressRefForHistory.current) {
      loadMintHistory()
    }
  }, [showHistory, currentAddress, loadMintHistory])

  // Memoize activePhase to prevent recreation on every render
  const activePhase = DEBUG_FEATURES.ENABLE_MEMO_ACTIVE_PHASE
    ? useMemo(() => {
        return collection?.phases?.find(p => p.is_active) || null
      }, [collection?.phases])
    : (collection?.phases?.find(p => p.is_active) || null)

  // Helper functions for MintDetailsSection callbacks
  const handleFeeRateChange = useCallback((value: string) => {
    setFeeRateManuallyEdited(true) // Stop polling from overwriting user input
    setFeeRateInput(value)
    const numValue = parseFloat(value)
    if (!isNaN(numValue) && numValue > 0) {
      setFeeRate(numValue)
    }
  }, [])

  const handleFeeRateFocus = useCallback(() => {
    setFeeRateManuallyEdited(true) // Stop polling from overwriting user input
  }, [])

  const handleFeeRateBlur = useCallback((value: number) => {
    if (isNaN(value) || value < 0.15) {
      setFeeRate(0.15)
      setFeeRateInput('0.15')
    }
  }, [])

  // Use refs for activePhase, whitelistStatus, userMintStatus to avoid recreating callbacks
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
  }, []) // No dependencies - use refs instead

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
  }, []) // No dependencies - use refs instead

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
  }, []) // No dependencies - use refs instead

  if (loading) {
    return (
      <div className="container mx-auto px-6 py-12">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <div className="w-16 h-16 border-4 border-[#4561ad] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-gray-500">Loading collection...</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!collection) {
    return (
      <div className="container mx-auto px-6 py-12">
        <div className="max-w-4xl mx-auto">
          <div className="text-center py-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Collection Not Found</h2>
            <Link
              href="/launchpad"
              className="text-[#4561ad] hover:underline"
            >
              ← Back to Launchpad
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative w-full overflow-x-hidden">
      {/* No background - video is handled in layout */}
      {DEBUG_FEATURES.ENABLE_RENDER_CONTAINER ? (
        <div className="container mx-auto px-6 py-6 relative z-10">
          <div className="max-w-6xl mx-auto">
          {/* Background audio (if configured) - Step 9b */}
          {DEBUG_FEATURES.ENABLE_RENDER_AUDIO && collection.audio_url && (
            <>
              <audio 
                ref={audioRef} 
                src={collection.audio_url} 
                loop 
                preload="auto"
                style={{ display: 'none' }}
                tabIndex={-1}
              />
            </>
          )}

          {/* TopBar - Step 9a */}
          {DEBUG_FEATURES.ENABLE_RENDER_TOPBAR && (
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
          )}

          {/* Determine layout based on image dimensions */}
          {(() => {
            const isWide = imageDimensions && imageDimensions.aspectRatio > 1.3
            
            // Wide images: Banner across top
            if (isWide) {
              return (
                <>
                  {/* CollectionImageDisplay - Step 9c */}
                  {DEBUG_FEATURES.ENABLE_RENDER_IMAGE && (
                    <div className="mb-8">
                      <div className="w-full aspect-[16/8] rounded-2xl overflow-hidden bg-[#0a0e27] border border-[#00d4ff]/30 shadow-xl">
                        {DEBUG_FEATURES.ENABLE_IMAGE_VIDEO && collection.banner_video_url ? (
                          <video
                            className="w-full h-full object-fill"
                            src={collection.banner_video_url}
                            autoPlay
                            muted
                            loop
                            playsInline
                            preload="metadata"
                          />
                        ) : DEBUG_FEATURES.ENABLE_IMAGE_IMG && (collection.banner_image_url || collection.mobile_image_url) ? (
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
                      {DEBUG_FEATURES.ENABLE_IMAGE_SOCIAL_LINKS && (collection.twitter_url || collection.discord_url || collection.telegram_url || collection.website_url) && (
                        <div className="mt-4 cosmic-card border border-[#00d4ff]/30 rounded-xl p-5">
                          <div className="font-bold text-white mb-3">Links</div>
                          <div className="flex flex-wrap gap-3">
                            {collection.twitter_url && (
                              <a
                                href={collection.twitter_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 px-4 py-2 bg-[#1DA1F2] hover:bg-[#1a8cd8] text-white rounded-lg text-sm font-semibold transition-colors"
                              >
                                <span>🐦</span>
                                <span>Twitter</span>
                              </a>
                            )}
                            {collection.discord_url && (
                              <a
                                href={collection.discord_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 px-4 py-2 bg-[#5865F2] hover:bg-[#4752C4] text-white rounded-lg text-sm font-semibold transition-colors"
                              >
                                <span>💬</span>
                                <span>Discord</span>
                              </a>
                            )}
                            {collection.telegram_url && (
                              <a
                                href={collection.telegram_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 px-4 py-2 bg-[#0088cc] hover:bg-[#0077b5] text-white rounded-lg text-sm font-semibold transition-colors"
                              >
                                <span>✈️</span>
                                <span>Telegram</span>
                              </a>
                            )}
                            {collection.website_url && (
                              <a
                                href={collection.website_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 px-4 py-2 bg-[#1a1f3a] hover:bg-[#2a2f4a] text-white rounded-lg text-sm font-semibold transition-colors border border-[#00d4ff]/30"
                              >
                                <span>🌐</span>
                                <span>Website</span>
                              </a>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    <div className="lg:col-span-12">
                      {/* Conditional render based on mint_type - Separated for better React lifecycle */}
                      {DEBUG_FEATURES.ENABLE_RENDER_MINT_DETAILS && DEBUG_FEATURES.ENABLE_RENDER_CHOICES_MINT && collection.mint_type === 'choices' && (
                        <OrdinalChoicesMint
                          collection={collection}
                          activePhase={activePhase ?? null}
                          collectionId={collectionId}
                          currentAddress={currentAddress ?? undefined}
                          isConnected={isConnected}
                          isLive={isLive}
                          isPreview={isPreview}
                          countdown={countdown}
                          mempoolHealth={mempoolHealth}
                          feeRate={feeRate}
                          feeRateInput={feeRateInput}
                          onFeeRateChange={handleFeeRateChange}
                          onFeeRateFocus={handleFeeRateFocus}
                          onFeeRateBlur={handleFeeRateBlur}
                          formatTimeUntil={formatTimeUntil}
                          formatSats={formatSats}
                          onMint={handleChoicesMint}
                          minting={minting}
                        />
                      )}
                      {DEBUG_FEATURES.ENABLE_RENDER_MINT_DETAILS && collection.mint_type !== 'choices' && (
                        <MintDetailsSection
                          collection={collection}
                          activePhase={activePhase ?? null}
                          isConnected={isConnected}
                          currentAddress={currentAddress ?? undefined}
                          whitelistStatus={whitelistStatus}
                          userMintStatus={userMintStatus}
                          client={client}
                          isLiveConnection={isLiveConnection}
                          isLive={isLive}
                          isPreview={isPreview}
                          countdown={countdown}
                          mempoolHealth={mempoolHealth}
                          feeRate={feeRate}
                          feeRateInput={feeRateInput}
                          mintQuantity={mintQuantity}
                          mintQuantityInput={mintQuantityInput}
                          minting={minting}
                          mintStatus={mintStatus}
                          error={error}
                          commitTxid={commitTxid}
                          onFeeRateChange={handleFeeRateChange}
                          onFeeRateFocus={handleFeeRateFocus}
                          onFeeRateBlur={handleFeeRateBlur}
                          onQuantityChange={handleQuantityChange}
                          onQuantityBlur={handleQuantityBlur}
                          onMaxClick={handleMaxClick}
                          onMint={handleMint}
                          formatSats={formatSats}
                          formatTimeUntil={formatTimeUntil}
                        />
                      )}
                      {/* PhaseList - Step 9e */}
                      {DEBUG_FEATURES.ENABLE_RENDER_PHASE_LIST && (
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
                      formatSats={formatSats}
                      formatTimeUntil={formatTimeUntil}
                      formatDateTime={formatDateTime}
                        />
                      )}
                    </div>
                  </div>
                </>
              )
            }
            
            // Square or tall images: Square on left (desktop), responsive on mobile
            return (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* CollectionImageDisplay - Step 9c */}
                {DEBUG_FEATURES.ENABLE_RENDER_IMAGE && (
                  <div className="lg:col-span-5">
                    <div className="lg:sticky lg:top-28">
                      <div className="rounded-2xl overflow-hidden bg-[#0a0e27] border border-[#00d4ff]/30 shadow-xl aspect-square">
                        {DEBUG_FEATURES.ENABLE_IMAGE_VIDEO && collection.banner_video_url ? (
                          <video
                            className="w-full h-full object-fill"
                            src={collection.banner_video_url}
                            autoPlay
                            muted
                            loop
                            playsInline
                            preload="metadata"
                          />
                        ) : DEBUG_FEATURES.ENABLE_IMAGE_IMG && (collection.banner_image_url || collection.mobile_image_url) ? (
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
                      {DEBUG_FEATURES.ENABLE_IMAGE_SOCIAL_LINKS && (collection.twitter_url || collection.discord_url || collection.telegram_url || collection.website_url) && (
                        <div className="mt-4 cosmic-card border border-[#00d4ff]/30 rounded-xl p-5">
                          <div className="font-bold text-white mb-3">Links</div>
                          <div className="flex flex-wrap gap-3">
                            {collection.twitter_url && (
                              <a
                                href={collection.twitter_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 px-4 py-2 bg-[#1DA1F2] hover:bg-[#1a8cd8] text-white rounded-lg text-sm font-semibold transition-colors"
                              >
                                <span>🐦</span>
                                <span>Twitter</span>
                              </a>
                            )}
                            {collection.discord_url && (
                              <a
                                href={collection.discord_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 px-4 py-2 bg-[#5865F2] hover:bg-[#4752C4] text-white rounded-lg text-sm font-semibold transition-colors"
                              >
                                <span>💬</span>
                                <span>Discord</span>
                              </a>
                            )}
                            {collection.telegram_url && (
                              <a
                                href={collection.telegram_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 px-4 py-2 bg-[#0088cc] hover:bg-[#0077b5] text-white rounded-lg text-sm font-semibold transition-colors"
                              >
                                <span>✈️</span>
                                <span>Telegram</span>
                              </a>
                            )}
                            {collection.website_url && (
                              <a
                                href={collection.website_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 px-4 py-2 bg-[#1a1f3a] hover:bg-[#2a2f4a] text-white rounded-lg text-sm font-semibold transition-colors border border-[#00d4ff]/30"
                              >
                                <span>🌐</span>
                                <span>Website</span>
                              </a>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <div className="lg:col-span-7">
                  {/* Conditional render based on mint_type - Separated for better React lifecycle */}
                  {DEBUG_FEATURES.ENABLE_RENDER_MINT_DETAILS && DEBUG_FEATURES.ENABLE_RENDER_CHOICES_MINT && collection.mint_type === 'choices' && (
                    <OrdinalChoicesMint
                      collection={collection}
                      activePhase={activePhase ?? null}
                      collectionId={collectionId}
                      currentAddress={currentAddress ?? undefined}
                      isConnected={isConnected}
                      isLive={isLive}
                      isPreview={isPreview}
                      countdown={countdown}
                      mempoolHealth={mempoolHealth}
                      feeRate={feeRate}
                      feeRateInput={feeRateInput}
                      onFeeRateChange={handleFeeRateChange}
                      onFeeRateFocus={handleFeeRateFocus}
                      onFeeRateBlur={handleFeeRateBlur}
                      formatTimeUntil={formatTimeUntil}
                      formatSats={formatSats}
                      onMint={handleChoicesMint}
                      minting={minting}
                    />
                  )}
                  {DEBUG_FEATURES.ENABLE_RENDER_MINT_DETAILS && collection.mint_type !== 'choices' && (
                    <MintDetailsSection
                      collection={collection}
                      activePhase={activePhase ?? null}
                      isConnected={isConnected}
                      currentAddress={currentAddress ?? undefined}
                      whitelistStatus={whitelistStatus}
                      userMintStatus={userMintStatus}
                      client={client}
                      isLiveConnection={isLiveConnection}
                      isLive={isLive}
                      isPreview={isPreview}
                      countdown={countdown}
                      mempoolHealth={mempoolHealth}
                      feeRate={feeRate}
                      feeRateInput={feeRateInput}
                      mintQuantity={mintQuantity}
                      mintQuantityInput={mintQuantityInput}
                      minting={minting}
                      mintStatus={mintStatus}
                      error={error}
                      commitTxid={commitTxid}
                      onFeeRateChange={handleFeeRateChange}
                      onFeeRateFocus={handleFeeRateFocus}
                      onFeeRateBlur={handleFeeRateBlur}
                      onQuantityChange={handleQuantityChange}
                      onQuantityBlur={handleQuantityBlur}
                      onMaxClick={handleMaxClick}
                      onMint={handleMint}
                      formatSats={formatSats}
                      formatTimeUntil={formatTimeUntil}
                    />
                  )}
                  {/* PhaseList - Step 9e */}
                  {DEBUG_FEATURES.ENABLE_RENDER_PHASE_LIST && (
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
                  formatSats={formatSats}
                  formatTimeUntil={formatTimeUntil}
                      formatDateTime={formatDateTime}
                    />
                  )}
                </div>
              </div>
            )
          })()}
          </div>
        </div>
      ) : (
        <div className="container mx-auto px-6 py-12">
          <div className="max-w-4xl mx-auto">
            <div className="text-center py-12">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Container rendering disabled for debugging</h2>
              <Link
                href="/launchpad"
                className="text-[#4561ad] hover:underline"
              >
                ← Back to Launchpad
              </Link>
            </div>
          </div>
        </div>
      )}

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
