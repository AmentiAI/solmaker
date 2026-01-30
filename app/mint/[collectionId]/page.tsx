'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { toast } from 'sonner'
import { useWallet } from '@/lib/wallet/compatibility'
import { WalletConnect } from '@/components/wallet-connect'
import { calculateOptimalFeeRate } from '@/lib/mempool-fee-calculator'

// CSS-in-JS for horror animations
const horrorStyles = `
  @keyframes bloodDrip {
    0% {
      transform: translateY(-100%) scaleY(0);
      opacity: 0;
    }
    5% {
      transform: translateY(-50%) scaleY(0.5);
      opacity: 0.8;
    }
    10% {
      transform: translateY(0%) scaleY(1);
      opacity: 1;
    }
    85% {
      transform: translateY(85vh) scaleY(1);
      opacity: 1;
    }
    95% {
      transform: translateY(95vh) scaleY(1.5);
      opacity: 0.3;
    }
    100% {
      transform: translateY(100vh) scaleY(2);
      opacity: 0;
    }
  }
  
  @keyframes bloodSplatter {
    0% {
      transform: scale(0) rotate(0deg);
      opacity: 0;
    }
    50% {
      transform: scale(1.2) rotate(180deg);
      opacity: 1;
    }
    100% {
      transform: scale(1) rotate(360deg);
      opacity: 0.8;
    }
  }
  
  @keyframes shake {
    0%, 100% { transform: translate(0, 0) rotate(0deg); }
    10% { transform: translate(-2px, -1px) rotate(-0.5deg); }
    20% { transform: translate(2px, 1px) rotate(0.5deg); }
    30% { transform: translate(-1px, 2px) rotate(-0.3deg); }
    40% { transform: translate(2px, -1px) rotate(0.5deg); }
    50% { transform: translate(-2px, 1px) rotate(-0.5deg); }
    60% { transform: translate(1px, -2px) rotate(0.3deg); }
    70% { transform: translate(-2px, 2px) rotate(-0.5deg); }
    80% { transform: translate(2px, -1px) rotate(0.5deg); }
    90% { transform: translate(-1px, 1px) rotate(-0.3deg); }
  }
  
  @keyframes textGlitch {
    0%, 100% { 
      text-shadow: 3px 3px #ff0000, -3px -3px #00ff00, 0 0 20px #ff0000;
      transform: translate(0) skew(0deg);
    }
    25% { 
      text-shadow: -3px 3px #ff0000, 3px -3px #00ff00, 0 0 25px #ff0000;
      transform: translate(3px, -3px) skew(2deg);
    }
    50% { 
      text-shadow: 3px -3px #ff0000, -3px 3px #00ff00, 0 0 30px #ff0000;
      transform: translate(-3px, 3px) skew(-2deg);
    }
    75% { 
      text-shadow: -3px -3px #ff0000, 3px 3px #00ff00, 0 0 25px #ff0000;
      transform: translate(3px, 3px) skew(2deg);
    }
  }
  
  @keyframes bloodPulse {
    0%, 100% { 
      filter: brightness(1) saturate(1);
    }
    50% { 
      filter: brightness(1.3) saturate(1.5);
    }
  }
  
  .blood-drip {
    position: fixed;
    width: 3px;
    background: linear-gradient(to bottom, 
      rgba(139, 0, 0, 0) 0%,
      rgba(180, 0, 0, 0.3) 5%,
      rgba(139, 0, 0, 1) 15%,
      rgba(100, 0, 0, 1) 50%,
      rgba(139, 0, 0, 1) 85%,
      rgba(139, 0, 0, 0) 100%
    );
    animation: bloodDrip 4s ease-in infinite;
    filter: blur(0.8px) drop-shadow(0 0 2px rgba(139, 0, 0, 0.8));
    border-radius: 50%;
    pointer-events: none;
    z-index: 10;
  }
  
  .blood-drip::before {
    content: '';
    position: absolute;
    bottom: -5px;
    left: 50%;
    transform: translateX(-50%);
    width: 8px;
    height: 8px;
    background: radial-gradient(circle, rgba(139, 0, 0, 1) 0%, rgba(139, 0, 0, 0) 70%);
    border-radius: 50%;
    animation: bloodSplatter 4s ease-in infinite;
  }
  
  .shake-screen {
    animation: shake 0.6s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
  }
  
  .damned-title {
    font-family: 'Creepster', cursive, serif;
    text-transform: uppercase;
    letter-spacing: 12px;
    text-shadow: 
      0 0 10px rgba(139, 0, 0, 1),
      0 0 20px rgba(139, 0, 0, 0.8),
      0 0 30px rgba(139, 0, 0, 0.6),
      0 0 40px rgba(139, 0, 0, 0.4),
      0 0 50px rgba(139, 0, 0, 0.2),
      3px 3px 0px #000,
      5px 5px 0px rgba(139, 0, 0, 0.7),
      0 0 100px rgba(255, 0, 0, 0.3);
    animation: textGlitch 1.5s ease-in-out infinite, bloodPulse 3s ease-in-out infinite;
    position: relative;
    filter: drop-shadow(0 0 10px rgba(139, 0, 0, 0.8));
  }
  
  .blood-pool {
    position: relative;
    display: inline-block;
  }
  
  .blood-pool::after {
    content: '';
    position: absolute;
    bottom: -10px;
    left: 0;
    width: 100%;
    height: 15px;
    background: radial-gradient(ellipse at center, 
      rgba(139, 0, 0, 0.6) 0%, 
      rgba(139, 0, 0, 0.3) 40%, 
      rgba(139, 0, 0, 0) 70%
    );
    filter: blur(3px);
    animation: bloodPulse 3s ease-in-out infinite;
  }
`

interface Ordinal {
  id: string
  ordinal_number: number
  image_url: string
  thumbnail_url?: string
  metadata_url: string
  traits: Record<string, { name: string; description: string }>
  file_size_bytes?: number
  created_at: string
}

interface CostEstimate {
  commitFee: number
  revealFee: number
  outputValues: number
  totalCost: number
  perInscription: number
  quantity: number
  feeRate: number
  totalSizeBytes: number
  avgSizeBytes: number
}

interface Collection {
  id: string
  name: string
  description?: string
}

export default function MintPage() {
  const params = useParams()
  const router = useRouter()
  const { isConnected, currentAddress, paymentAddress, paymentPublicKey, signPsbt } = useWallet()

  const [collection, setCollection] = useState<Collection | null>(null)
  const [ordinals, setOrdinals] = useState<Ordinal[]>([])
  const [selectedOrdinals, setSelectedOrdinals] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [minting, setMinting] = useState(false)
  const [selectedFeeRate, setSelectedFeeRate] = useState<number>(0.9)
  const [customFeeRate, setCustomFeeRate] = useState('0.9')
  const [mempoolHealth, setMempoolHealth] = useState<{ suggestedFeeRate: number; healthRating: string; healthMessage: string; blocksWithSub1Sat: number; totalBlocks: number } | null>(null)
  const [mintStatus, setMintStatus] = useState<string>('')
  const [costEstimate, setCostEstimate] = useState<CostEstimate | null>(null)
  const [loadingCost, setLoadingCost] = useState(false)
  
  // Whitelist checking
  const [activePhase, setActivePhase] = useState<any>(null)
  const [whitelistStatus, setWhitelistStatus] = useState<{ is_whitelisted: boolean; allocation?: number; minted_count?: number; remaining_allocation?: number } | null>(null)
  const [checkingWhitelist, setCheckingWhitelist] = useState(false)
  
  // Pagination - API based
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalOrdinals, setTotalOrdinals] = useState(0)
  const ITEMS_PER_PAGE = 20
  
  // Ref to prevent duplicate mempool calls
  const mempoolLoadingRef = useRef(false)
  
  // Horror effects
  const [isShaking, setIsShaking] = useState(false)
  const [bloodDrops, setBloodDrops] = useState<Array<{ id: number; left: number; delay: number; height: number; width: number }>>([])
  
  // Music controls
  const [isReady, setIsReady] = useState(false)
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null)
  const [volume, setVolume] = useState(50)
  const [isMuted, setIsMuted] = useState(false)
  const [showVolumeSlider, setShowVolumeSlider] = useState(false)

  // Initialize audio
  useEffect(() => {
    const audioElement = new Audio('/mintmusic.mp3')
    audioElement.loop = true
    audioElement.volume = volume / 100
    setAudio(audioElement)
    
    return () => {
      audioElement.pause()
      audioElement.src = ''
    }
  }, [])

  // Update audio volume
  useEffect(() => {
    if (audio) {
      audio.volume = isMuted ? 0 : volume / 100
    }
  }, [audio, volume, isMuted])

  // Screen shake every 5 seconds
  useEffect(() => {
    const shakeInterval = setInterval(() => {
      setIsShaking(true)
      setTimeout(() => setIsShaking(false), 500)
    }, 5000)

    return () => clearInterval(shakeInterval)
  }, [])

  // Generate blood drips - more and varied
  useEffect(() => {
    const drops: Array<{ id: number; left: number; delay: number; height: number; width: number }> = []
    for (let i = 0; i < 25; i++) {
      drops.push({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 4,
        height: 80 + Math.random() * 150,
        width: 2 + Math.random() * 3,
      })
    }
    setBloodDrops(drops)
  }, [])

  useEffect(() => {
    if (params.collectionId) {
      loadCollection()
      loadOrdinals()
      loadMempoolHealth()
      loadActivePhase()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.collectionId, currentPage])

  useEffect(() => {
    if (isConnected && currentAddress && activePhase) {
      checkWhitelistStatus()
    }
  }, [isConnected, currentAddress, activePhase])

  const loadCollection = async () => {
    try {
      const response = await fetch(`/api/collections/${params.collectionId}`)
      if (response.ok) {
        const data = await response.json()
        setCollection(data.collection)
      }
    } catch (error) {
      console.error('Error loading collection:', error)
    }
  }

  const loadActivePhase = async () => {
    try {
      const response = await fetch(`/api/launchpad/${params.collectionId}`)
      if (response.ok) {
        const data = await response.json()
        if (data.active_phase) {
          setActivePhase(data.active_phase)
        } else {
          setActivePhase(null)
        }
      }
    } catch (error) {
      console.error('Error loading active phase:', error)
      setActivePhase(null)
    }
  }

  const checkWhitelistStatus = async () => {
    if (!currentAddress || !activePhase) return

    if (!activePhase.whitelist_only) {
      setWhitelistStatus({ is_whitelisted: true })
      return
    }

    setCheckingWhitelist(true)
    try {
      const response = await fetch(
        `/api/launchpad/${params.collectionId}/whitelist-status?wallet_address=${currentAddress}&phase_id=${activePhase.id}`
      )

      if (response.ok) {
        const data = await response.json()
        setWhitelistStatus(data)
      } else {
        setWhitelistStatus({ is_whitelisted: false })
      }
    } catch (err) {
      console.error('Error checking whitelist:', err)
      setWhitelistStatus({ is_whitelisted: false })
    } finally {
      setCheckingWhitelist(false)
    }
  }

  const loadOrdinals = async () => {
    try {
      const url = `/api/mint/available-ordinals/${params.collectionId}?page=${currentPage}&limit=${ITEMS_PER_PAGE}`
      const response = await fetch(url)
      if (response.ok) {
        const data = await response.json()
        const loadedOrdinals = data.ordinals
        setOrdinals(loadedOrdinals)
        
        if (data.pagination) {
          setTotalPages(data.pagination.totalPages)
          setTotalOrdinals(data.pagination.total)
        } else {
          // Fallback if API doesn't return pagination yet
          setTotalOrdinals(data.count || loadedOrdinals.length)
          setTotalPages(Math.ceil((data.count || loadedOrdinals.length) / ITEMS_PER_PAGE))
        }

        // Background: Generate thumbnails for any ordinals missing them
        ensureThumbnails(loadedOrdinals)
        
        // Background: Calculate file sizes for any ordinals missing them
        ensureFileSizes(loadedOrdinals)
      }
    } catch (error) {
      console.error('Error loading ordinals:', error)
    } finally {
      setLoading(false)
    }
  }

  // Background task: Generate thumbnails for ordinals that don't have them
  const ensureThumbnails = async (ordinalsToCheck: Ordinal[]) => {
    const missing = ordinalsToCheck.filter(o => !o.thumbnail_url || o.thumbnail_url.trim() === '')
    
    if (missing.length === 0) return

    console.log(`[Thumbnail] Found ${missing.length} ordinals without thumbnails, generating...`)

    // Use batch endpoint for better performance
    try {
      const response = await fetch('/api/ordinals/batch-thumbnails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          ordinal_ids: missing.map(o => o.id) 
        }),
      })

      if (response.ok) {
        const data = await response.json()
        console.log(`[Thumbnail] Batch complete: ${data.successful} generated, ${data.skipped} skipped, ${data.failed} failed`)
        
        // Reload ordinals to get updated thumbnail URLs
        setTimeout(() => loadOrdinals(), 2000)
      }
    } catch (error) {
      console.error('[Thumbnail] Batch generation failed:', error)
    }
  }

  // Background task: Calculate file sizes for ordinals that don't have them
  const ensureFileSizes = async (ordinalsToCheck: any[]) => {
    const missing = ordinalsToCheck.filter((o: any) => !o.file_size_bytes || o.file_size_bytes === 0)
    
    if (missing.length === 0) return

    console.log(`[FileSize] Found ${missing.length} ordinals without file sizes, calculating...`)

    // Use batch endpoint for better performance
    try {
      const response = await fetch('/api/ordinals/batch-file-sizes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          ordinal_ids: missing.map((o: any) => o.id) 
        }),
      })

      if (response.ok) {
        const data = await response.json()
        console.log(`[FileSize] Batch complete: ${data.successful} calculated, ${data.skipped} skipped, ${data.failed} failed`)
        
        // No need to reload - file sizes will be used on next cost calculation
      }
    } catch (error) {
      console.error('[FileSize] Batch calculation failed:', error)
    }
  }

  const loadMempoolHealth = useCallback(async () => {
    // Prevent duplicate calls
    if (mempoolLoadingRef.current) {
      console.log('[Mempool] Already loading, skipping duplicate call')
      return
    }

    mempoolLoadingRef.current = true
    try {
      const health = await calculateOptimalFeeRate()
      setMempoolHealth(health)
      // Set default fee rate to suggested
      setSelectedFeeRate(health.suggestedFeeRate)
      setCustomFeeRate(health.suggestedFeeRate.toFixed(2))
    } catch (error) {
      console.error('Error loading mempool health:', error)
    } finally {
      mempoolLoadingRef.current = false
    }
  }, [])

  const loadCostEstimate = async () => {
    if (selectedOrdinals.size === 0) {
      setCostEstimate(null)
      return
    }

    setLoadingCost(true)
    const ordinalIdsArray = Array.from(selectedOrdinals)
    console.log(`[Cost] Estimating for ${ordinalIdsArray.length} ordinals at ${selectedFeeRate} sat/vB`)
    
    try {
      const response = await fetch('/api/mint/estimate-cost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ordinalIds: ordinalIdsArray,
          feeRate: selectedFeeRate,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        console.log('[Cost] Estimate received:', data.estimate)
        setCostEstimate(data.estimate)
      } else {
        const errorText = await response.text()
        console.error('Failed to load cost estimate:', response.status, errorText)
        setCostEstimate(null)
      }
    } catch (error) {
      console.error('Error loading cost estimate:', error)
      setCostEstimate(null)
    } finally {
      setLoadingCost(false)
    }
  }

  // Load cost estimate when selection or fee rate changes
  useEffect(() => {
    console.log('[Cost] Trigger: selectedOrdinals size =', selectedOrdinals.size, 'feeRate =', selectedFeeRate)
    loadCostEstimate()
  }, [selectedOrdinals, selectedFeeRate])

  const toggleOrdinalSelection = (ordinalId: string) => {
    const newSelection = new Set(selectedOrdinals)
    if (newSelection.has(ordinalId)) {
      newSelection.delete(ordinalId)
    } else {
      if (newSelection.size >= 10) {
        toast.error('Maximum 10 ordinals per batch')
        return
      }
      newSelection.add(ordinalId)
    }
    setSelectedOrdinals(newSelection)
  }

  const selectQuantity = (quantity: number) => {
    const newSelection = new Set<string>()
    const available = ordinals.slice(0, Math.min(quantity, ordinals.length, 10))
    available.forEach(o => newSelection.add(o.id))
    setSelectedOrdinals(newSelection)
  }

  const calculateCost = () => {
    const quantity = selectedOrdinals.size
    
    // Use real-time estimate if available and matches current selection
    if (costEstimate && costEstimate.quantity === quantity && costEstimate.feeRate === selectedFeeRate) {
      console.log('[Cost] Using API estimate:', costEstimate.totalCost, 'sats')
      return {
        commitFee: costEstimate.commitFee,
        revealFee: costEstimate.revealFee,
        outputs: costEstimate.outputValues,
        total: costEstimate.totalCost,
        btc: (costEstimate.totalCost / 100000000).toFixed(8),
        networkFee: ((costEstimate.commitFee + costEstimate.revealFee) / 100000000).toFixed(4),
        perInscription: costEstimate.perInscription,
        sizeKB: (costEstimate.totalSizeBytes / 1024).toFixed(2),
      }
    }

    // Fallback calculation if no estimate loaded yet or mismatch
    console.log('[Cost] Using fallback calculation for', quantity, 'ordinals at', selectedFeeRate, 'sat/vB')
    const commitFee = (250 + (quantity * 43)) * selectedFeeRate
    // Estimate ~50KB per ordinal, multiply by quantity for total size in reveal tx
    const estimatedTotalSize = 50000 * quantity
    const revealFee = (150 + estimatedTotalSize + (quantity * 43)) * selectedFeeRate
    const outputs = 330 * quantity
    const total = commitFee + revealFee + outputs
    
    return {
      commitFee,
      revealFee,
      outputs,
      total,
      btc: (total / 100000000).toFixed(8),
      networkFee: ((commitFee + revealFee) / 100000000).toFixed(4),
      perInscription: quantity > 0 ? Math.ceil(total / quantity) : 0,
      sizeKB: '~50',
    }
  }

  const handleReady = () => {
    setIsReady(true)
    if (audio) {
      audio.play().catch(err => console.error('Error playing audio:', err))
    }
  }

  const toggleMute = () => {
    setIsMuted(!isMuted)
  }

  const handleMint = async () => {
    if (!isConnected || !currentAddress) {
      toast.error('Please connect your wallet first')
      return
    }

    if (selectedOrdinals.size === 0) {
      toast.error('Please select at least one ordinal')
      return
    }

    // Check whitelist if required
    if (activePhase?.whitelist_only && !whitelistStatus?.is_whitelisted) {
      toast.error('Wallet not whitelisted', { description: `Your wallet (${currentAddress.slice(0, 8)}...${currentAddress.slice(-6)}) is not on the whitelist for this phase. Only whitelisted wallets can mint.` })
      return
    }

    if (whitelistStatus?.remaining_allocation === 0) {
      toast.error('You have reached your whitelist allocation limit')
      return
    }

    setMinting(true)
    setMintStatus('Creating inscription transaction...')

    try {
      // Step 1: Create commit PSBT
      const commitResponse = await fetch('/api/mint/create-commit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ordinal_ids: Array.from(selectedOrdinals),
          minter_address: currentAddress,
          payment_address: paymentAddress || currentAddress,
          payment_pubkey: paymentPublicKey,
          fee_rate: parseFloat(customFeeRate) || selectedFeeRate,
        }),
      })

      if (!commitResponse.ok) {
        const error = await commitResponse.json()
        throw new Error(error.error || 'Failed to create commit transaction')
      }

      const commitData = await commitResponse.json()
      setMintStatus('Signing commit transaction...')

      // Step 2: Sign commit PSBT (autoFinalize=true, broadcast=false - NEVER auto-broadcast for sub 1 sat/vB support)
      if (!commitData.commit_psbt) {
        throw new Error('No commit PSBT returned from API')
      }

      const signedCommit = await signPsbt(commitData.commit_psbt, true, false)
      
      // Handle different wallet return formats
      let signedPsbtBase64: string | undefined
      let signedPsbtHex: string | undefined
      let txHex: string | undefined

      if (typeof signedCommit === 'string') {
        signedPsbtBase64 = signedCommit
      } else if (signedCommit && typeof signedCommit === 'object') {
        signedPsbtBase64 = signedCommit.signedPsbtBase64 || signedCommit.psbtBase64 || signedCommit.psbt
        signedPsbtHex = signedCommit.signedPsbtHex || signedCommit.hex
        txHex = signedCommit.txHex || signedCommit.tx
      }

      if (!signedPsbtBase64 && !signedPsbtHex && !txHex) {
        throw new Error('Wallet did not return signed PSBT or transaction')
      }

      setMintStatus('Broadcasting commit transaction...')

      // Step 3: Broadcast commit via our API (handles sub 1 sat/vB properly)
      const broadcastResponse = await fetch('/api/mint/broadcast-commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: commitData.session_id,
          signed_psbt_base64: signedPsbtBase64,
          signed_psbt_hex: signedPsbtHex,
          tx_hex: txHex,
        }),
      })

      if (!broadcastResponse.ok) {
        const errorData = await broadcastResponse.json()
        throw new Error(errorData.error || 'Failed to broadcast commit transaction')
      }

      const broadcastData = await broadcastResponse.json()
      const commitTxId = broadcastData.commit_tx_id
      
      if (!commitTxId) {
        throw new Error('No commit transaction ID returned from broadcast')
      }

      setMintStatus('Commit transaction sent! Creating reveal transaction...')

      // Step 4: Wait for transaction propagation
      await new Promise(resolve => setTimeout(resolve, 3000))

      // Step 5: Create and broadcast reveal transaction
      const revealResponse = await fetch('/api/mint/reveal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_id: commitData.session_id,
          commit_tx_id: commitTxId,
        }),
      })

      if (!revealResponse.ok) {
        const error = await revealResponse.json()
        throw new Error(error.error || 'Failed to create reveal transaction')
      }

      const revealData = await revealResponse.json()
      setMintStatus('Inscription complete! 🎉')
      
      toast.success(`Successfully inscribed ${selectedOrdinals.size} ordinal(s)!`, { description: `Inscription ID: ${revealData.inscription_id}` })
      
      // Reload ordinals
      setSelectedOrdinals(new Set())
      loadOrdinals()
    } catch (error: any) {
      console.error('Minting error:', error)
      toast.error('Minting failed', { description: error.message })
      setMintStatus('')
    } finally {
      setMinting(false)
    }
  }

  const costs = calculateCost()

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-950 via-black to-purple-950 flex items-center justify-center">
        <div className="text-[#EF4444] text-xl">Loading...</div>
      </div>
    )
  }

  return (
    <>
      {/* Inject horror styles */}
      <style dangerouslySetInnerHTML={{ __html: horrorStyles }} />
      
      {/* Ready Button Overlay */}
      {!isReady && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[100] flex items-center justify-center">
          <button
            onClick={handleReady}
            className="bg-red-600 hover:bg-red-700 text-white px-16 py-8 rounded-2xl font-bold text-4xl shadow-2xl shadow-red-900/50 transition-all transform hover:scale-105 uppercase tracking-wider damned-title"
          >
            Ready
          </button>
        </div>
      )}
      
      <div className="overflow-hidden min-h-screen">
      <div className={`min-h-screen bg-gradient-to-br from-red-950 via-black to-purple-950 ${isShaking ? 'shake-screen' : ''}`}>
        {/* Blood drips */}
        {bloodDrops.map((drop) => (
          <div
            key={drop.id}
            className="blood-drip"
            style={{
              left: `${drop.left}%`,
              animationDelay: `${drop.delay}s`,
              height: `${drop.height}px`,
              width: `${drop.width}px`,
            }}
          />
        ))}
        
        {/* Header */}
        <header className="border-b border-red-900/50 bg-black/40 backdrop-blur-sm sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="blood-pool">
                <h1 className="text-4xl damned-title text-red-600">
                  The Damned
                </h1>
              </div>
              {collection && (
                <p className="text-[#a8a8b8] text-sm mt-2 ml-1">{collection.name}</p>
              )}
            </div>
            <div className="flex items-center gap-4">
              <WalletConnect />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content - Two Column Layout */}
      <main className="container mx-auto px-4 pt-8 pb-8">
        <div className="grid lg:grid-cols-[400px_1fr] gap-8">
          {/* LEFT: Inscribe Menu */}
          <div className="lg:sticky lg:top-8 lg:self-start">
            <div className="hidden lg:block lg:h-40"></div>
            <div className="bg-gradient-to-br from-red-950/80 to-black/80 border-4 border-red-900 rounded-2xl overflow-hidden shadow-2xl shadow-red-900/50 relative">
              {/* Volume Controls */}
              <div className="absolute top-4 right-4 z-10">
                <div className="relative">
                  <button
                    onClick={toggleMute}
                    onMouseEnter={() => setShowVolumeSlider(true)}
                    className="bg-black/80 border-2 border-red-900/50 text-white rounded-lg p-2 hover:bg-red-900/30 hover:border-red-600 transition-all"
                  >
                    {isMuted ? (
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                      </svg>
                    ) : (
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                      </svg>
                    )}
                  </button>
                  
                  {/* Volume Slider Popup */}
                  {showVolumeSlider && (
                    <div
                      onMouseLeave={() => setShowVolumeSlider(false)}
                      className="absolute top-0 right-full mr-2 bg-black/90 border-2 border-red-900 rounded-lg p-4 shadow-xl min-w-[200px]"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-white/70 text-sm font-mono">{isMuted ? 0 : volume}</span>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={volume}
                          onChange={(e) => {
                            setVolume(parseInt(e.target.value))
                            if (isMuted && parseInt(e.target.value) > 0) {
                              setIsMuted(false)
                            }
                          }}
                          className="flex-1 h-2 bg-red-900/50 rounded-lg appearance-none cursor-pointer accent-red-600"
                          style={{
                            background: `linear-gradient(to right, rgb(220, 38, 38) 0%, rgb(220, 38, 38) ${volume}%, rgb(127, 29, 29, 0.5) ${volume}%, rgb(127, 29, 29, 0.5) 100%)`
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="p-6">
                <div className="space-y-6">
                  {/* Quantity Selector */}
                  <div>
                    <label className="block text-[#a8a8b8] text-sm font-bold mb-4 uppercase tracking-wider">
                      Quantity
                    </label>
                    <div className="flex items-center gap-4 mb-2">
                      <button
                        onClick={() => {
                          if (selectedOrdinals.size > 0) {
                            const ids = Array.from(selectedOrdinals)
                            ids.pop()
                            setSelectedOrdinals(new Set(ids))
                          }
                        }}
                        disabled={minting || selectedOrdinals.size === 0}
                        className="w-16 h-16 bg-black/80 border-2 border-red-900/50 text-white rounded-lg text-3xl font-bold hover:bg-red-900/30 hover:border-red-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                      >
                        −
                      </button>
                      
                      <div className="flex-1 bg-black/80 border-2 border-red-900/50 rounded-lg h-16 flex items-center justify-center">
                        <span className="text-4xl font-bold text-white">{selectedOrdinals.size}</span>
                      </div>
                      
                      <button
                        onClick={() => {
                          if (selectedOrdinals.size < 10 && selectedOrdinals.size < ordinals.length) {
                            const newSelection = new Set(selectedOrdinals)
                            const available = ordinals.find(o => !selectedOrdinals.has(o.id))
                            if (available) newSelection.add(available.id)
                            setSelectedOrdinals(newSelection)
                          }
                        }}
                        disabled={minting || selectedOrdinals.size >= 10 || selectedOrdinals.size >= ordinals.length}
                        className="w-16 h-16 bg-black/80 border-2 border-red-900/50 text-white rounded-lg text-3xl font-bold hover:bg-red-900/30 hover:border-red-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                      >
                        +
                      </button>
                    </div>
                    <p className="text-white/40 text-xs text-center">
                      Max 10 per transaction
                    </p>
                  </div>

                  {/* Network Fee Selector */}
                  <div>
                    <label className="block text-[#a8a8b8] text-sm font-bold mb-4 uppercase tracking-wider">
                      Network Fee (sat/vB)
                    </label>
                    {mempoolHealth && (
                      <div className="mb-3 p-3 bg-black/60 border border-red-900/30 rounded-lg">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-[#a8a8b8]">
                            Mempool Health: 
                            <span className={`ml-2 ${
                              mempoolHealth.healthRating === 'excellent' ? 'text-green-400' :
                              mempoolHealth.healthRating === 'good' ? 'text-blue-400' :
                              mempoolHealth.healthRating === 'fair' ? 'text-[#FBBF24]' :
                              'text-[#EF4444]'
                            }`}>
                              {mempoolHealth.healthRating.toUpperCase()}
                            </span>
                          </span>
                          <span className="text-xs text-[#a8a8b8]/80">
                            {mempoolHealth.blocksWithSub1Sat}/{mempoolHealth.totalBlocks} blocks
                          </span>
                        </div>
                        <p className="text-xs text-[#a8a8b8]/80 mb-1">{mempoolHealth.healthMessage}</p>
                        <p className="text-xs text-[#a8a8b8]">
                          Suggested: <span className="font-bold text-[#EF4444]">{mempoolHealth.suggestedFeeRate.toFixed(2)} sat/vB</span> (avg + 0.02)
                        </p>
                      </div>
                    )}
                    <div className="flex items-center gap-4 mb-2">
                      <button
                        onClick={() => {
                          const current = parseFloat(customFeeRate) || selectedFeeRate
                          const newValue = Math.max(0.1, Math.round((current - 0.1) * 10) / 10)
                          setCustomFeeRate(newValue.toString())
                          setSelectedFeeRate(newValue)
                        }}
                        disabled={minting}
                        className="w-16 h-16 bg-black/80 border-2 border-red-900/50 text-white rounded-lg text-3xl font-bold hover:bg-red-900/30 hover:border-red-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                      >
                        −
                      </button>
                      
                      <div className="flex-1 bg-black/80 border-2 border-red-900/50 rounded-lg h-16 flex items-center justify-center">
                        <input
                          type="number"
                          value={customFeeRate}
                          onChange={(e) => {
                            const value = e.target.value
                            setCustomFeeRate(value)
                            const parsed = parseFloat(value)
                            // Fee rates can be decimal (e.g., 0.2 sat/vB), minimum 0.1
                            if (!isNaN(parsed) && parsed >= 0.1) {
                              setSelectedFeeRate(parsed)
                            } else if (value === '' || value === '0' || value === '0.') {
                              // Allow intermediate typing states
                              setSelectedFeeRate(0.1)
                            }
                          }}
                          onBlur={(e) => {
                            // Validate on blur - ensure minimum 0.1
                            const value = parseFloat(e.target.value)
                            if (isNaN(value) || value < 0.1) {
                              setCustomFeeRate('0.1')
                              setSelectedFeeRate(0.1)
                            }
                          }}
                          className="w-full h-full bg-transparent text-4xl font-bold text-white text-center focus:outline-none"
                          min="0.1"
                          step="0.1"
                        />
                      </div>
                      
                      <button
                        onClick={() => {
                          const current = parseFloat(customFeeRate) || selectedFeeRate
                          const newValue = Math.round((current + 0.1) * 10) / 10
                          setCustomFeeRate(newValue.toString())
                          setSelectedFeeRate(newValue)
                        }}
                        disabled={minting}
                        className="w-16 h-16 bg-black/80 border-2 border-red-900/50 text-white rounded-lg text-3xl font-bold hover:bg-red-900/30 hover:border-red-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                      >
                        +
                      </button>
                    </div>
                    <p className="text-white/40 text-xs text-center">
                      {mempoolHealth ? `Auto-calculated from mempool: ${mempoolHealth.suggestedFeeRate.toFixed(2)} sat/vB` : 'Default: 0.9 sat/vB'} (minimum: 0.15)
                    </p>
                  </div>

                  {/* Price Breakdown */}
                  <div className="bg-black/80 border-2 border-red-900/50 rounded-lg p-5">
                    <div className="space-y-3 text-sm">
                      {selectedOrdinals.size > 0 ? (
                        <>
                          <div className="flex justify-between items-center">
                            <span className="text-white/70">Quantity</span>
                            <span className="text-white font-mono">{selectedOrdinals.size} ordinal{selectedOrdinals.size !== 1 ? 's' : ''}</span>
                          </div>
                          {costEstimate && (
                            <div className="flex justify-between items-center">
                              <span className="text-white/70">Total Size</span>
                              <span className="text-white font-mono">{costs.sizeKB} KB</span>
                            </div>
                          )}
                          <div className="border-t border-red-900/30 my-2"></div>
                          <div className="flex justify-between items-center">
                            <span className="text-[#a8a8b8]/80 text-xs">Commit Fee</span>
                            <span className="text-[#a8a8b8] font-mono text-xs">{costs.commitFee} sats</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-[#a8a8b8]/80 text-xs">Reveal Fee</span>
                            <span className="text-[#a8a8b8] font-mono text-xs">{costs.revealFee} sats</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-[#a8a8b8]/80 text-xs">Output Values</span>
                            <span className="text-[#a8a8b8] font-mono text-xs">{costs.outputs} sats</span>
                          </div>
                          <div className="border-t border-red-900/50 pt-3 mt-3">
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-[#a8a8b8]">Per Inscription</span>
                              <span className="text-white font-mono">{costs.perInscription} sats</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-white text-lg font-bold">Total Cost</span>
                              <span className="text-red-500 text-xl font-bold font-mono">{costs.btc} BTC</span>
                            </div>
                            <div className="text-right">
                              <span className="text-white/50 text-xs font-mono">{costs.total} sats</span>
                            </div>
                          </div>
                          {loadingCost && (
                            <div className="text-center text-white/40 text-xs italic mt-2">
                              Calculating exact costs...
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="text-center text-white/40 py-4">
                          Select ordinals to see cost estimate
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Mint Button */}
                  <button
                    onClick={handleMint}
                    disabled={
                      minting || 
                      !isConnected || 
                      selectedOrdinals.size === 0 ||
                      (activePhase?.whitelist_only && !whitelistStatus?.is_whitelisted) ||
                      (whitelistStatus?.remaining_allocation === 0)
                    }
                    className="w-full bg-red-600 hover:bg-red-700 text-white px-6 py-5 rounded-lg font-bold text-xl shadow-lg shadow-red-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all uppercase tracking-wider"
                  >
                    {minting ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        {mintStatus || 'Minting...'}
                      </span>
                    ) : (
                      'MINT'
                    )}
                  </button>

                  {/* Whitelist Status Warning */}
                  {isConnected && activePhase?.whitelist_only && whitelistStatus && (
                    <div className={`mt-4 p-4 rounded-lg border-2 ${
                      whitelistStatus.is_whitelisted 
                        ? 'bg-green-900/30 border-green-600' 
                        : 'bg-red-900/50 border-red-600'
                    }`}>
                      {checkingWhitelist ? (
                        <p className="text-white/70 text-sm">Checking whitelist status...</p>
                      ) : whitelistStatus.is_whitelisted ? (
                        <div>
                          <p className="text-green-400 font-bold text-sm mb-1">✅ You are whitelisted!</p>
                          {whitelistStatus.allocation && (
                            <p className="text-green-300 text-xs">
                              Allocation: {whitelistStatus.minted_count || 0} / {whitelistStatus.allocation} minted
                              {whitelistStatus.remaining_allocation !== undefined && (
                                <span className="ml-2">({whitelistStatus.remaining_allocation} remaining)</span>
                              )}
                            </p>
                          )}
                        </div>
                      ) : (
                        <div>
                          <p className="text-[#EF4444] font-bold text-sm mb-2">
                            ❌ Wallet Not Whitelisted
                          </p>
                          <p className="text-red-300 text-xs mb-1">
                            Your wallet <span className="font-mono font-semibold">{currentAddress?.slice(0, 8)}...{currentAddress?.slice(-6)}</span> was not found on the whitelist.
                          </p>
                          <p className="text-red-300 text-xs">
                            Only whitelisted wallets can mint during this phase.
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Warning */}
                  {!isConnected && (
                    <div className="text-center mt-4">
                      <p className="text-white/40 text-xs italic">
                        ⚠️ Connect your wallet to begin inscribing
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT: Ordinal Selection Grid */}
          <div>

            {/* Pagination Top */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mb-6">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-4 py-2 bg-black/60 border-2 border-red-900 text-[#EF4444] rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-red-900/30 transition-colors"
                >
                  ← Prev
                </button>
                <span className="text-white px-4">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-4 py-2 bg-black/60 border-2 border-red-900 text-[#EF4444] rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-red-900/30 transition-colors"
                >
                  Next →
                </button>
              </div>
            )}

            {/* Ordinals Grid */}
            {loading ? (
              <div className="text-center py-12">
                <div className="text-[#a8a8b8]">Loading ordinals...</div>
              </div>
            ) : ordinals.length === 0 ? (
              <div className="bg-black/40 border-2 border-red-900/50 rounded-lg p-12 text-center">
                <div className="text-6xl mb-4">🎃</div>
                <p className="text-[#a8a8b8] text-lg mb-4">No ordinals available for minting</p>
                <Link
                  href={`/collections/${params.collectionId}`}
                  className="text-[#EF4444] hover:text-red-300 underline"
                >
                  Generate ordinals first →
                </Link>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 mb-6">
                  {ordinals.map((ordinal) => (
                    <button
                      key={ordinal.id}
                      onClick={() => toggleOrdinalSelection(ordinal.id)}
                      disabled={minting}
                      className={`relative aspect-square rounded-lg overflow-hidden border-4 transition-all transform hover:scale-105 disabled:cursor-not-allowed ${
                        selectedOrdinals.has(ordinal.id)
                          ? 'border-yellow-400 shadow-lg shadow-yellow-900/50'
                          : 'border-red-900/50 hover:border-[#EF4444]/20'
                      }`}
                    >
                      <Image
                        src={ordinal.thumbnail_url || ordinal.image_url}
                        alt={`Ordinal #${ordinal.ordinal_number}`}
                        fill
                        className="object-cover"
                      />
                      {selectedOrdinals.has(ordinal.id) && (
                        <div className="absolute inset-0 bg-yellow-400/20 flex items-center justify-center">
                          <div className="bg-yellow-400 text-black rounded-full w-8 h-8 flex items-center justify-center font-bold">
                            ✓
                          </div>
                        </div>
                      )}
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-2">
                        <p className="text-white text-xs font-mono">#{ordinal.ordinal_number}</p>
                      </div>
                    </button>
                  ))}
                </div>

                {/* Pagination Bottom */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="px-4 py-2 bg-black/60 border-2 border-red-900 text-[#EF4444] rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-red-900/30 transition-colors"
                    >
                      ← Prev
                    </button>
                    <span className="text-white px-4">
                      Page {currentPage} of {totalPages}
                    </span>
                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="px-4 py-2 bg-black/60 border-2 border-red-900 text-[#EF4444] rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-red-900/30 transition-colors"
                    >
                      Next →
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </main>
      </div>
      </div>
    </>
  )
}
