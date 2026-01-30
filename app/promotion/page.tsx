'use client'

import { useEffect, useMemo, useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useWallet } from '@/lib/wallet/compatibility'
import { useCredits } from '@/lib/credits-context'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'

type Collection = {
  id: string
  name: string
  description?: string
}

type GeneratedOrdinal = {
  id: string
  image_url: string
  thumbnail_url?: string
  compressed_image_url?: string
  ordinal_number?: number
}

type PromotionHistoryItem = {
  id: number | string
  wallet_address: string
  collection_id: number
  collection_name: string
  image_url: string | null
  flyer_text: string | null
  character_count: number
  character_actions: string[]
  no_text: boolean
  created_at: string
  // Video job fields (optional)
  job_status?: 'pending' | 'processing' | 'completed' | 'failed'
  error_message?: string | null
  started_at?: string | null
  completed_at?: string | null
  is_video_job?: boolean
}

// Component to fetch video URL from taskId (for modal)
function FetchVideoButton({ errorMessage, jobId, onSuccess }: { errorMessage: string; jobId: string; onSuccess: () => void }) {
  const [fetching, setFetching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const extractTaskId = (msg: string): string | null => {
    const match = msg.match(/KIE_AI_TASK_ID:(.+)/)
    return match ? match[1].trim() : null
  }

  const handleFetch = async () => {
    const taskId = extractTaskId(errorMessage)
    if (!taskId) {
      setError('No taskId found in error message')
      return
    }

    setFetching(true)
    setError(null)
    try {
      const res = await fetch('/api/promotion/manual-callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, jobId }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch video')
      }
      
      // Check if the job was actually marked as failed
      if (data.error || data.message?.includes('failed') || data.message?.includes('Failed')) {
        toast.error(data.error || data.message || 'Video generation failed')
      } else if (data.message === 'Task still processing') {
        toast.info('Task is still processing. Please wait and try again later.')
      } else {
        toast.success('Video fetched successfully!')
        onSuccess()
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch video'
      setError(msg)
      toast.error(msg)
    } finally {
      setFetching(false)
    }
  }

  return (
    <div className="mt-3">
      <button
        onClick={handleFetch}
        disabled={fetching}
        className="w-full px-4 py-2 rounded-lg bg-gradient-to-r from-[#00E5FF] to-[#FFD60A] hover:from-[#00B8D4] hover:to-[#12D87A] text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {fetching ? (
          <>
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Fetching Video...
          </>
        ) : (
          <>
            <span>🔄</span>
            Fetch Video URL
          </>
        )}
      </button>
      {error && (
        <div className="text-xs text-[#EF4444] mt-1">{error}</div>
      )}
    </div>
  )
}

// Component for retry button in history grid
function RetryVideoButton({ item, onSuccess }: { item: PromotionHistoryItem; onSuccess: () => void }) {
  const [fetching, setFetching] = useState(false)

  const handleRetry = async (e: React.MouseEvent) => {
    e.stopPropagation()
    // Extract taskId - it might be at the start (KIE_AI_TASK_ID:xxx) or at the end (KIE_AI_TASK_ID:xxx)
    const taskIdMatch = item.error_message?.match(/KIE_AI_TASK_ID:\s*([^\s.]+)/)
    if (!taskIdMatch) {
      toast.error('No taskId found in error message')
      return
    }

    const taskId = taskIdMatch[1].trim()
    const jobId = String(item.id).replace('job_', '')

    setFetching(true)
    try {
      const res = await fetch('/api/promotion/manual-callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, jobId }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch video')
      }
      
      // Check if the job was actually marked as failed
      if (data.error || data.message?.includes('failed') || data.message?.includes('Failed')) {
        toast.error(data.error || data.message || 'Video generation failed')
      } else if (data.message === 'Task still processing') {
        toast.info('Task is still processing. Please wait and try again later.')
      } else {
        toast.success('Video fetched successfully!')
        onSuccess()
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch video'
      toast.error(msg)
    } finally {
      setFetching(false)
    }
  }

  return (
    <button
      onClick={handleRetry}
      disabled={fetching}
      className="flex-1 px-3 py-2 rounded-lg bg-gradient-to-r from-[#00E5FF] to-[#FFD60A] hover:from-[#00B8D4] hover:to-[#12D87A] text-white text-sm font-semibold transition-colors text-center disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
    >
      {fetching ? (
        <>
          <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
          Fetching...
        </>
      ) : (
        <>
          <span>🔄</span>
          Retry
        </>
      )}
    </button>
  )
}

export default function PromotionPage() {
  const { isConnected, currentAddress } = useWallet()
  const { credits, loading: loadingCredits, loadCredits } = useCredits()

  const { activeWalletAddress, activeWalletConnected } = useMemo(() => {
    if (currentAddress && isConnected) return { activeWalletAddress: currentAddress, activeWalletConnected: true }
    return { activeWalletAddress: null, activeWalletConnected: false }
  }, [currentAddress, isConnected])

  // Load credits when wallet connects
  useEffect(() => {
    if (activeWalletConnected && activeWalletAddress) {
      loadCredits(activeWalletAddress)
    }
  }, [activeWalletConnected, activeWalletAddress, loadCredits])

  // Collections
  const [collections, setCollections] = useState<Collection[]>([])
  const [loadingCollections, setLoadingCollections] = useState(false)
  const [selectedCollectionId, setSelectedCollectionId] = useState('')

  // Image picker
  const [ordinals, setOrdinals] = useState<GeneratedOrdinal[]>([])
  const [loadingOrdinals, setLoadingOrdinals] = useState(false)
  const [hasMoreOrdinals, setHasMoreOrdinals] = useState(true)
  const [ordinalsPage, setOrdinalsPage] = useState(0)
  const [selectedOrdinalIds, setSelectedOrdinalIds] = useState<Set<string>>(new Set())
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Content type (flyer or video)
  const [contentType, setContentType] = useState<'flyer' | 'video'>('flyer')
  
  // Video source type (collection, flyer, upload)
  const [videoSourceType, setVideoSourceType] = useState<'collection' | 'flyer' | 'upload'>('collection')
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [selectedFlyerId, setSelectedFlyerId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // Flyer settings
  const [subjectCount, setSubjectCount] = useState(1)
  const [scenePrompt, setScenePrompt] = useState('')
  const [noText, setNoText] = useState(false)
  const [flyerText, setFlyerText] = useState('')
  const [aspectRatio, setAspectRatio] = useState<'square' | 'portrait' | 'landscape'>('square')
  
  // Video settings
  const [videoScene, setVideoScene] = useState('') // Scene description (what's happening)
  const [videoActions, setVideoActions] = useState('') // Actions being done
  const [videoSpeech, setVideoSpeech] = useState('') // Optional text/speech (what is being said)
  const [videoImageCount, setVideoImageCount] = useState(1) // How many images for video (1-3)

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [jobStatus, setJobStatus] = useState<'pending' | 'processing' | 'completed' | 'failed' | null>(null)
  const [taskId, setTaskId] = useState<string | null>(null)

  // View mode
  const [viewMode, setViewMode] = useState<'generate' | 'history'>('generate')
  const [history, setHistory] = useState<PromotionHistoryItem[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<PromotionHistoryItem | null>(null)
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<PromotionHistoryItem | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [showCreditsConfirm, setShowCreditsConfirm] = useState(false)

  const ORDINALS_PER_PAGE = 20

  // Load collections
  useEffect(() => {
    const load = async () => {
      if (!activeWalletAddress) return
      setLoadingCollections(true)
      try {
        const res = await fetch(`/api/collections?wallet_address=${encodeURIComponent(activeWalletAddress)}`)
        const data = await res.json()
        if (res.ok) {
          const cols = (data?.collections || []) as Collection[]
          setCollections(cols)
          if (!selectedCollectionId && cols.length) setSelectedCollectionId(cols[0].id)
        }
      } finally {
        setLoadingCollections(false)
      }
    }
    void load()
  }, [activeWalletAddress])

  // Load ordinals when collection changes
  const loadOrdinals = useCallback(async (collectionId: string, page: number, append: boolean = false) => {
    if (!collectionId) return
    setLoadingOrdinals(true)
    try {
      const offset = page * ORDINALS_PER_PAGE
      const res = await fetch(
        `/api/collections/${collectionId}/ordinals?limit=${ORDINALS_PER_PAGE}&offset=${offset}`
      )
      const data = await res.json()
      if (res.ok) {
        const newOrdinals = (data?.ordinals || []) as GeneratedOrdinal[]
        if (append) {
          setOrdinals(prev => [...prev, ...newOrdinals])
        } else {
          setOrdinals(newOrdinals)
        }
        setHasMoreOrdinals(newOrdinals.length === ORDINALS_PER_PAGE)
      }
    } catch (e) {
      console.error('Failed to load ordinals:', e)
    } finally {
      setLoadingOrdinals(false)
    }
  }, [])

  useEffect(() => {
    if (selectedCollectionId) {
      setOrdinals([])
      setOrdinalsPage(0)
      setSelectedOrdinalIds(new Set())
      setHasMoreOrdinals(true)
      loadOrdinals(selectedCollectionId, 0, false)
    }
  }, [selectedCollectionId, loadOrdinals])

  // Load more ordinals
  const loadMore = useCallback(() => {
    if (loadingOrdinals || !hasMoreOrdinals || !selectedCollectionId) return
    const nextPage = ordinalsPage + 1
    setOrdinalsPage(nextPage)
    loadOrdinals(selectedCollectionId, nextPage, true)
  }, [loadingOrdinals, hasMoreOrdinals, selectedCollectionId, ordinalsPage, loadOrdinals])

  // Infinite scroll detection
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return
    const { scrollLeft, scrollWidth, clientWidth } = container
    if (scrollWidth - scrollLeft - clientWidth < 200) {
      loadMore()
    }
  }, [loadMore])

  // Toggle ordinal selection - allow changing selections even when max is reached
  const toggleOrdinalSelection = (id: string) => {
    // Get the max count based on content type
    const maxCount = contentType === 'video' ? videoImageCount : subjectCount
    
    setSelectedOrdinalIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        // Always allow deselection
        newSet.delete(id)
      } else if (newSet.size < maxCount) {
        // Allow selection if under limit
        newSet.add(id)
      } else {
        // If at limit, replace the first selected item (or allow user to deselect first)
        // For better UX, just allow adding if they want to replace
        const firstId = Array.from(newSet)[0]
        newSet.delete(firstId)
        newSet.add(id)
      }
      return newSet
    })
  }

  // Clear selection when subject count changes (for flyers)
  useEffect(() => {
    if (contentType === 'flyer') {
    setSelectedOrdinalIds(prev => {
      if (prev.size > subjectCount) {
        const arr = Array.from(prev).slice(0, subjectCount)
        return new Set(arr)
      }
      return prev
    })
    }
  }, [subjectCount, contentType])
  
  // Clear selection when video image count changes (for videos)
  useEffect(() => {
    if (contentType === 'video') {
      setSelectedOrdinalIds(prev => {
        if (prev.size > videoImageCount) {
          const arr = Array.from(prev).slice(0, videoImageCount)
          return new Set(arr)
        }
        return prev
      })
    }
  }, [videoImageCount, contentType])
  
  // Clear selection when switching content types or video source types
  useEffect(() => {
    setSelectedOrdinalIds(new Set())
  }, [contentType, videoSourceType])

  // Load history
  const reloadHistory = useCallback(async () => {
    if (!activeWalletAddress) return
    setLoadingHistory(true)
    try {
      const res = await fetch(`/api/promotion/history?wallet_address=${encodeURIComponent(activeWalletAddress)}`)
      const data = await res.json()
      if (res.ok) setHistory(data?.promotions || [])
    } catch (e) {
      console.error('Failed to load promotion history:', e)
    } finally {
      setLoadingHistory(false)
    }
  }, [activeWalletAddress])

  useEffect(() => {
    void reloadHistory()
  }, [activeWalletAddress])

  // Handle delete promotion
  const handleDelete = async () => {
    if (!deleteConfirmItem || !activeWalletAddress) return
    
    setDeleting(true)
    try {
      const res = await fetch(
        `/api/promotion/delete?id=${encodeURIComponent(deleteConfirmItem.id)}&wallet_address=${encodeURIComponent(activeWalletAddress)}`,
        { method: 'DELETE' }
      )
      const data = await res.json()
      
      if (res.ok) {
        toast.success('Promotion deleted successfully')
        setDeleteConfirmItem(null)
        // Close modal if deleting the selected item
        if (selectedHistoryItem?.id === deleteConfirmItem.id) {
          setSelectedHistoryItem(null)
        }
        await reloadHistory()
      } else {
        throw new Error(data.error || 'Failed to delete promotion')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete promotion'
      toast.error(msg)
    } finally {
      setDeleting(false)
    }
  }

  // Poll job status - continues indefinitely until job completes or fails
  // No timeout - jobs continue processing in background even if page is closed
  // Also periodically reloads history to catch jobs completed by cron job
  // For stuck jobs with taskId, automatically checks with Kie AI
  useEffect(() => {
    if (!activeWalletAddress || !activeJobId) return
    let cancelled = false
    let pollCount = 0
    let historyReloadCount = 0
    let lastKieAiCheck = 0
    let currentTaskId: string | null = null
    
    const poll = async () => {
      try {
        const res = await fetch(
          `/api/promotion/jobs/${encodeURIComponent(activeJobId)}?wallet_address=${encodeURIComponent(activeWalletAddress)}`
        )
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error || 'Failed to fetch job status')
        const status = (data?.job?.status || null) as any
        if (cancelled) return
        setJobStatus(status)
        
        // Extract taskId from error_message if it exists (for video jobs)
        if (data?.job?.error_message) {
          const taskIdMatch = data.job.error_message.match(/KIE_AI_TASK_ID:\s*([^\s.]+)/)
          if (taskIdMatch) {
            currentTaskId = taskIdMatch[1].trim()
            setTaskId(currentTaskId)
          }
        }
        
        pollCount++
        
        if (status === 'completed') {
          setResultUrl(data?.job?.image_url || null)
          setActiveJobId(null)
          setIsGenerating(false)
          setTaskId(null)
          await reloadHistory()
          return
        }
        if (status === 'failed') {
          setActiveJobId(null)
          setIsGenerating(false)
          setTaskId(null)
          setError(data?.job?.error_message || 'Failed to generate flyer')
          return
        }
        
        // Job still processing - continue polling
        // For videos, this can take several minutes, so we poll indefinitely
        // The cron job will also check and process completed videos in the background
        
        // If job is stuck in processing with a taskId, check with Kie AI every 30 seconds
        // This catches cases where Kie AI has finished (success or fail) but callback didn't fire
        if (status === 'processing' && currentTaskId && (pollCount - lastKieAiCheck) >= 15) {
          lastKieAiCheck = pollCount
          console.log('[Poll] Checking with Kie AI for stuck job, taskId:', currentTaskId)
          try {
            const kieRes = await fetch('/api/promotion/manual-callback', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ taskId: currentTaskId, jobId: activeJobId }),
            })
            const kieData = await kieRes.json()
            if (kieData.success) {
              // Kie AI returned success - job should be completed/failed now
              console.log('[Poll] Kie AI sync completed:', kieData)
              // Don't return - let next poll pick up the new status
            } else if (kieData.error) {
              console.warn('[Poll] Kie AI check returned error:', kieData.error)
            }
          } catch (kieErr) {
            console.error('[Poll] Error checking with Kie AI:', kieErr)
          }
        }
        
        // Periodically reload history (every 15 polls = ~30 seconds) to catch jobs
        // that were completed by the cron job even if job status hasn't updated yet
        historyReloadCount++
        if (historyReloadCount >= 15) {
          historyReloadCount = 0
          // Reload history in background to check if job completed via cron
          reloadHistory().catch(err => {
            console.error('Error reloading history:', err)
          })
        }
      } catch (e) {
        if (!cancelled) {
          // Don't stop polling on transient errors - retry after delay
          console.error('Error polling job status:', e)
          // Only set error if it's been failing for a while
          if (pollCount > 10) {
            setError(e instanceof Error ? e.message : 'Failed to fetch job status')
          }
        }
      }
      // Continue polling every 2 seconds - no timeout
      // For videos, generation can take 2-5 minutes, so we keep polling
      if (!cancelled) setTimeout(poll, 2000)
    }
    void poll()
    return () => { cancelled = true }
  }, [activeJobId, activeWalletAddress, reloadHistory])

  // Check for completed jobs when page loads (in case user closed page while job was processing)
  useEffect(() => {
    if (!activeWalletAddress) return
    // Reload history to show any jobs that completed while page was closed
    void reloadHistory()
  }, [activeWalletAddress])

  // Generate flyer or video
  const handleGenerateClick = () => {
    // Prevent multiple simultaneous API calls
    if (isGenerating) {
      console.log('[Promotion] Already generating, ignoring click')
      return
    }

    if (!activeWalletAddress) {
      setError('Connect your wallet first')
      return
    }
    
    if (contentType === 'flyer') {
      if (!selectedCollectionId) {
        setError('Select a collection')
        return
      }
      if (selectedOrdinalIds.size !== subjectCount) {
        setError(`Select exactly ${subjectCount} image${subjectCount > 1 ? 's' : ''} from the gallery`)
        return
      }
      if (!noText && !flyerText.trim()) {
        setError('Enter flyer text or check "No text"')
        return
      }
    } else {
      // Video validation
      if (videoSourceType === 'collection') {
        if (!selectedCollectionId) {
          setError('Select a collection')
          return
        }
        if (selectedOrdinalIds.size !== videoImageCount) {
          setError(`Select exactly ${videoImageCount} image${videoImageCount > 1 ? 's' : ''} from the gallery`)
          return
        }
      } else if (videoSourceType === 'flyer') {
        if (!selectedFlyerId) {
          setError('Select a flyer')
          return
        }
      } else if (videoSourceType === 'upload') {
        if (!uploadedImageUrl) {
          setError('Upload an image')
          return
        }
      }
      
      if (!videoScene.trim() && !videoActions.trim()) {
        setError('Enter at least a scene or actions description')
        return
      }
    }

    // Show credits confirmation modal
    setShowCreditsConfirm(true)
  }

  const handleCreditsConfirmAccept = async () => {
    setShowCreditsConfirm(false)
    await generate()
  }

  const handleCreditsConfirmCancel = () => {
    setShowCreditsConfirm(false)
  }

  const generate = async () => {
    console.log(`[Promotion] Starting new ${contentType} generation...`)

    setError(null)
    setIsGenerating(true)

    try {
      const endpoint = contentType === 'video' ? '/api/promotion/generate-video' : '/api/promotion/generate-v2'
      const body: any = {
        wallet_address: activeWalletAddress,
        aspect_ratio: aspectRatio,
      }

      if (contentType === 'flyer') {
        body.collection_id = selectedCollectionId
        body.ordinal_ids = Array.from(selectedOrdinalIds)
        body.scene_prompt = scenePrompt.trim()
        body.text = noText ? '' : flyerText.trim()
        body.no_text = noText
      } else {
        // Video with different source types
        body.video_source_type = videoSourceType
        body.video_scene = videoScene.trim()
        body.video_actions = videoActions.trim()
        body.video_speech = videoSpeech.trim() || null
        
        if (videoSourceType === 'collection') {
          body.collection_id = selectedCollectionId
          body.ordinal_ids = Array.from(selectedOrdinalIds)
        } else if (videoSourceType === 'flyer') {
          body.flyer_id = selectedFlyerId
        } else if (videoSourceType === 'upload') {
          body.uploaded_image_url = uploadedImageUrl
        }
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        console.error(`[Promotion] API error:`, data)
        throw new Error(data?.error || `Failed to generate ${contentType}`)
      }
      const jobId = String(data?.job_id || '')
      if (!jobId) {
        console.error(`[Promotion] No job_id in response:`, data)
        throw new Error(`Failed to queue ${contentType} job`)
      }
      
      console.log(`[Promotion] Job queued successfully:`, jobId)
      
      setResultUrl(null)
      setActiveJobId(jobId)
      setTaskId(null) // Reset taskId for new job
      setJobStatus('pending')
      setIsGenerating(false)
      setError(null)
    } catch (e) {
      console.error(`[Promotion] Error generating ${contentType}:`, e)
      setError(e instanceof Error ? e.message : `Failed to generate ${contentType}`)
      setIsGenerating(false)
    }
  }

  const selectedCount = selectedOrdinalIds.size
  
  // Determine if we can generate based on content type and source
  const canGenerate = () => {
    if (!activeWalletConnected || isGenerating) return false
    
    if (contentType === 'flyer') {
      return selectedCount === subjectCount
    } else {
      // Video
      if (videoSourceType === 'collection') {
        return selectedCount === videoImageCount
      } else if (videoSourceType === 'flyer') {
        return !!selectedFlyerId
      } else if (videoSourceType === 'upload') {
        return !!uploadedImageUrl
      }
      return false
    }
  }
  
  const getButtonText = () => {
    if (isGenerating) return '⏳ Queuing Job...'
    
    if (contentType === 'flyer') {
      if (selectedCount !== subjectCount) {
        return `Select ${subjectCount - selectedCount} more image${subjectCount - selectedCount > 1 ? 's' : ''}`
      }
      return '🚀 Generate Flyer (1 credit)'
    } else {
      // Video
      if (videoSourceType === 'collection') {
        if (selectedCount !== videoImageCount) {
          const remaining = videoImageCount - selectedCount
          return `Select ${remaining} more image${remaining > 1 ? 's' : ''}`
        }
      } else if (videoSourceType === 'flyer') {
        if (!selectedFlyerId) {
          return 'Select a flyer'
        }
      } else if (videoSourceType === 'upload') {
        if (!uploadedImageUrl) {
          return 'Upload an image'
        }
      }
      return '🎬 Generate Video (4 credits)'
    }
  }

  return (
    <div className="min-h-screen">
      {/* Hero Header */}
      <div className="relative bg-gradient-to-r from-[#0a0e27]/90 via-[#1a1f3a]/90 to-[#0f172a]/90 text-white border-b border-[#9945FF]/30 -mx-6 lg:-mx-12 px-6 lg:px-12">
        <div className="w-full py-8">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <h1 className="text-4xl md:text-5xl font-black tracking-tight text-white">Promotion</h1>
              <p className="text-[#a5b4fc] mt-2 text-lg">
                Create promotional flyers and videos from your collection
              </p>
            </div>
            <div className="flex gap-2">
              <div className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#00E5FF] to-[#FFD60A] text-sm font-bold shadow-lg shadow-[#00E5FF]/20">
                1 credit / flyer
              </div>
              <div className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#00E5FF] to-[#FFD60A] text-sm font-bold shadow-lg shadow-[#00E5FF]/20">
                4 credits / video
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="w-full py-8">
        <div className="w-full">
          
          {/* Wallet Warning */}
          {!activeWalletConnected && (
            <div className="mb-6 p-4 rounded-2xl bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border-2 border-[#DC1FFF]/50">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🔗</span>
                <div>
                  <div className="font-bold text-[#DC1FFF]">Connect your wallet</div>
                  <div className="text-sm text-[#a8a8b8]">Connect to select a collection and generate flyers</div>
                </div>
              </div>
            </div>
          )}

          {/* Tab Buttons */}
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setViewMode('generate')}
              className={`px-6 py-3 rounded-xl font-bold transition-all ${
                viewMode === 'generate'
                  ? 'bg-gradient-to-r from-[#00E5FF] to-[#FFD60A] text-white shadow-lg shadow-[#00E5FF]/20'
                  : 'bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border-2 border-[#00E5FF]/30 text-white/70 hover:border-[#00E5FF]/50 hover:text-white'
              }`}
            >
              ✨ Create Content
            </button>
            <button
              onClick={() => setViewMode('history')}
              className={`px-6 py-3 rounded-xl font-bold transition-all ${
                viewMode === 'history'
                  ? 'bg-gradient-to-r from-[#00E5FF] to-[#FFD60A] text-white shadow-lg shadow-[#00E5FF]/20'
                  : 'bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border-2 border-[#00E5FF]/30 text-white/70 hover:border-[#00E5FF]/50 hover:text-white'
              }`}
            >
              📁 History {history.length > 0 && <span className="ml-1 px-2 py-0.5 rounded-full bg-white/20 text-xs">{history.length}</span>}
            </button>
          </div>

          {viewMode === 'generate' && (
            <div className="space-y-6">
              
              {/* Content Type Selector */}
              <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md rounded-2xl border-2 border-[#9945FF]/30 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-full bg-[#9945FF] text-white flex items-center justify-center font-bold text-sm shadow-lg shadow-[#9945FF]/20">0</div>
                  <h2 className="text-lg font-black text-white">Content Type</h2>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => setContentType('flyer')}
                    disabled={!activeWalletConnected}
                    className={`p-4 rounded-xl border-2 transition-all ${
                      contentType === 'flyer'
                        ? 'border-[#DC1FFF] bg-[#DC1FFF]/10'
                        : 'border-[#9945FF]/30 hover:border-[#9945FF]/50'
                    } disabled:opacity-50`}
                  >
                    <div className="text-2xl mb-2">🖼️</div>
                    <div className="font-bold text-white">Flyer</div>
                    <div className="text-sm text-white/70 mt-1">1 credit</div>
                  </button>
                  <button
                    onClick={() => setContentType('video')}
                    disabled={!activeWalletConnected}
                    className={`p-4 rounded-xl border-2 transition-all ${
                      contentType === 'video'
                        ? 'border-[#9945FF] bg-[#9945FF]/10'
                        : 'border-[#9945FF]/30 hover:border-[#9945FF]/50'
                    } disabled:opacity-50`}
                  >
                    <div className="text-2xl mb-2">🎬</div>
                    <div className="font-bold text-white">Video</div>
                    <div className="text-sm text-white/70 mt-1">4 credits</div>
                  </button>
                </div>
              </div>

              {/* Step 1: Collection & Count (for flyers) or Video Source (for videos) */}
              {contentType === 'flyer' ? (
                <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md rounded-2xl border-2 border-[#9945FF]/30 p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 rounded-full bg-[#9945FF] text-white flex items-center justify-center font-bold text-sm shadow-lg shadow-[#9945FF]/20">1</div>
                    <h2 className="text-lg font-black text-white">Choose Collection & Count</h2>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-semibold text-white mb-2">Collection</label>
                      <select
                        value={selectedCollectionId}
                        onChange={(e) => setSelectedCollectionId(e.target.value)}
                        disabled={!activeWalletConnected || loadingCollections}
                        className="w-full h-12 rounded-xl border-2 border-[#9945FF]/30 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md px-4 text-base font-medium text-white focus:border-[#9945FF] focus:outline-none focus:ring-2 focus:ring-[#9945FF]/20 transition-colors disabled:opacity-50"
                      >
                        {collections.length === 0 && (
                          <option value="" className="bg-[#0a0e27]">{loadingCollections ? 'Loading...' : 'No collections found'}</option>
                        )}
                        {collections.map((c) => (
                          <option key={c.id} value={c.id} className="bg-[#0a0e27]">{c.name}</option>
                        ))}
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-semibold text-white mb-2">How many images?</label>
                      <div className="flex gap-2">
                        {[1, 2, 3, 4, 6, 8].map((n) => (
                          <button
                            key={n}
                            onClick={() => setSubjectCount(n)}
                            disabled={!activeWalletConnected}
                            className={`flex-1 h-12 rounded-xl font-bold text-lg transition-all ${
                              subjectCount === n
                                ? 'bg-[#DC1FFF] text-white shadow-lg shadow-[#DC1FFF]/20'
                                : 'bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#9945FF]/30 text-white/70 hover:border-[#9945FF]/50 hover:text-white'
                            } disabled:opacity-50`}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md rounded-2xl border-2 border-[#9945FF]/30 p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 rounded-full bg-[#9945FF] text-white flex items-center justify-center font-bold text-sm shadow-lg shadow-[#9945FF]/20">1</div>
                    <h2 className="text-lg font-black text-white">Choose Video Source</h2>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    <button
                      onClick={() => setVideoSourceType('collection')}
                      disabled={!activeWalletConnected}
                      className={`p-4 rounded-xl border-2 transition-all ${
                        videoSourceType === 'collection'
                          ? 'border-[#9945FF] bg-[#9945FF]/10'
                          : 'border-[#9945FF]/30 hover:border-[#9945FF]/50'
                      } disabled:opacity-50`}
                    >
                      <div className="text-2xl mb-2">🖼️</div>
                      <div className="font-bold text-white text-sm">Collection</div>
                    </button>
                    <button
                      onClick={() => setVideoSourceType('flyer')}
                      disabled={!activeWalletConnected}
                      className={`p-4 rounded-xl border-2 transition-all ${
                        videoSourceType === 'flyer'
                          ? 'border-[#9945FF] bg-[#9945FF]/10'
                          : 'border-[#9945FF]/30 hover:border-[#9945FF]/50'
                      } disabled:opacity-50`}
                    >
                      <div className="text-2xl mb-2">📄</div>
                      <div className="font-bold text-white text-sm">Flyer</div>
                    </button>
                    <button
                      onClick={() => setVideoSourceType('upload')}
                      disabled={!activeWalletConnected}
                      className={`p-4 rounded-xl border-2 transition-all ${
                        videoSourceType === 'upload'
                          ? 'border-[#9945FF] bg-[#9945FF]/10'
                          : 'border-[#9945FF]/30 hover:border-[#9945FF]/50'
                      } disabled:opacity-50`}
                    >
                      <div className="text-2xl mb-2">📤</div>
                      <div className="font-bold text-white text-sm">Upload</div>
                    </button>
                  </div>

                  {/* Collection source */}
                  {videoSourceType === 'collection' && (
                    <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-semibold text-white mb-2">Collection</label>
                      <select
                        value={selectedCollectionId}
                        onChange={(e) => setSelectedCollectionId(e.target.value)}
                        disabled={!activeWalletConnected || loadingCollections}
                        className="w-full h-12 rounded-xl border-2 border-[#9945FF]/30 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md px-4 text-base font-medium text-white focus:border-[#9945FF] focus:outline-none focus:ring-2 focus:ring-[#9945FF]/20 transition-colors disabled:opacity-50"
                      >
                        {collections.length === 0 && (
                          <option value="" className="bg-[#0a0e27]">{loadingCollections ? 'Loading...' : 'No collections found'}</option>
                        )}
                        {collections.map((c) => (
                          <option key={c.id} value={c.id} className="bg-[#0a0e27]">{c.name}</option>
                        ))}
                      </select>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-semibold text-white mb-2">How many images?</label>
                        <div className="flex gap-2">
                          {[1, 2, 3].map((n) => (
                            <button
                              key={n}
                              onClick={() => setVideoImageCount(n)}
                              disabled={!activeWalletConnected}
                              className={`flex-1 h-12 rounded-xl font-bold text-lg transition-all ${
                                videoImageCount === n
                                  ? 'bg-[#9945FF] text-white shadow-lg shadow-[#9945FF]/20'
                                  : 'bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#9945FF]/30 text-white/70 hover:border-[#9945FF]/50 hover:text-white'
                              } disabled:opacity-50`}
                            >
                              {n}
                            </button>
                          ))}
                        </div>
                        <div className="mt-2 text-xs text-[#a8a8b8]/80">
                          💡 Select up to 3 images from your collection to animate
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Flyer source */}
                  {videoSourceType === 'flyer' && (
                    <div>
                      <label className="block text-sm font-semibold text-white mb-2">Select Flyer</label>
                      {history.length === 0 ? (
                        <div className="py-8 text-center text-white/70">
                          <span className="text-2xl mb-2 block">📭</span>
                          <div className="text-sm">No flyers found. Generate a flyer first.</div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-4 gap-3 max-h-64 overflow-y-auto">
                          {history.filter(item => !item.is_video_job && item.image_url && !item.image_url.endsWith('.mp4')).map((item) => (
                            <button
                              key={item.id}
                              onClick={() => setSelectedFlyerId(String(item.id))}
                              className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all ${
                                selectedFlyerId === String(item.id)
                                  ? 'border-[#9945FF] ring-2 ring-[#9945FF]/30'
                                  : 'border-[#9945FF]/30 hover:border-[#9945FF]/50'
                              }`}
                            >
                              <img
                                src={item.image_url!}
                                alt={item.collection_name}
                                className="w-full h-full object-cover"
                              />
                              {selectedFlyerId === String(item.id) && (
                                <div className="absolute inset-0 bg-[#9945FF]/20 flex items-center justify-center">
                                  <div className="w-6 h-6 rounded-full bg-[#9945FF] text-white flex items-center justify-center font-bold text-xs">
                                    ✓
                                  </div>
                                </div>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Upload source */}
                  {videoSourceType === 'upload' && (
                    <div>
                      <label className="block text-sm font-semibold text-white mb-2">Upload Image</label>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={async (e) => {
                          const file = e.target.files?.[0]
                          if (!file) return
                          
                          setUploadingImage(true)
                          try {
                            const formData = new FormData()
                            formData.append('image', file)
                            
                            const res = await fetch('/api/promotion/upload-image', {
                              method: 'POST',
                              body: formData,
                            })
                            const data = await res.json()
                            
                            if (!res.ok) {
                              throw new Error(data.error || 'Failed to upload image')
                            }
                            
                            setUploadedImageUrl(data.imageUrl)
                            toast.success('Image uploaded successfully!')
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : 'Failed to upload image')
                          } finally {
                            setUploadingImage(false)
                          }
                        }}
                        className="hidden"
                        disabled={!activeWalletConnected || uploadingImage}
                      />
                      <div className="relative">
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          disabled={!activeWalletConnected || uploadingImage}
                          className="w-full h-32 rounded-xl border-2 border-dashed border-[#9945FF]/30 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md flex flex-col items-center justify-center text-white/70 hover:border-[#9945FF]/50 hover:text-white transition-colors disabled:opacity-50 overflow-hidden relative"
                        >
                          {uploadingImage ? (
                            <>
                              <div className="w-8 h-8 border-2 border-[#9945FF] border-t-transparent rounded-full animate-spin mb-2" />
                              <span className="text-sm">Uploading...</span>
                            </>
                          ) : uploadedImageUrl ? (
                            <img src={uploadedImageUrl} alt="Uploaded" className="w-full h-full object-cover" />
                          ) : (
                            <>
                              <span className="text-3xl mb-2">📤</span>
                              <span className="text-sm font-medium">Click to upload image</span>
                            </>
                          )}
                        </button>
                        {uploadedImageUrl && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setUploadedImageUrl(null)
                              if (fileInputRef.current) fileInputRef.current.value = ''
                            }}
                            className="absolute top-2 right-2 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center text-xs hover:bg-red-600 z-10"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Step 2: Image Selection (only for flyers or collection videos) */}
              {contentType === 'flyer' || (contentType === 'video' && videoSourceType === 'collection') ? (
              <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md rounded-2xl border-2 border-[#9945FF]/30 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#9945FF] text-white flex items-center justify-center font-bold text-sm shadow-lg shadow-[#9945FF]/20">2</div>
                    <h2 className="text-lg font-black text-white">Select Images</h2>
                  </div>
                  <div className={`px-3 py-1.5 rounded-full text-sm font-bold ${
                    selectedCount === (contentType === 'video' ? videoImageCount : subjectCount) 
                      ? 'bg-[#9945FF]/20 text-[#9945FF] border border-[#9945FF]/30' 
                      : 'bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#9945FF]/30 text-[#a8a8b8]/80'
                  }`}>
                    {selectedCount} / {contentType === 'video' ? videoImageCount : subjectCount} selected
                  </div>
                </div>

                {ordinals.length === 0 && !loadingOrdinals ? (
                  <div className="py-12 text-center text-white/70">
                    <span className="text-4xl mb-3 block">🖼️</span>
                    <div className="font-medium">No images found in this collection</div>
                    <div className="text-sm mt-1">Generate some ordinals first</div>
                  </div>
                ) : (
                  <div 
                    ref={scrollContainerRef}
                    onScroll={handleScroll}
                    className="flex gap-3 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100"
                    style={{ scrollbarWidth: 'thin' }}
                  >
                    {ordinals.map((ordinal) => {
                      const isSelected = selectedOrdinalIds.has(ordinal.id)
                      // Get the max count based on content type
                      const maxCount = contentType === 'video' ? videoImageCount : subjectCount
                      // Always allow clicking - can select if under limit, or can deselect if selected
                      const canInteract = isSelected || selectedCount < maxCount
                      // Use image_url first (current/flipped version), then fallback to compressed/thumbnail
                      const imageUrl = ordinal.image_url || ordinal.compressed_image_url || ordinal.thumbnail_url
                      
                      return (
                        <button
                          key={ordinal.id}
                          onClick={() => toggleOrdinalSelection(ordinal.id)}
                          disabled={false} // Always allow interaction to change selections
                          className={`relative flex-shrink-0 w-32 h-32 rounded-xl overflow-hidden border-3 transition-all ${
                            isSelected 
                              ? 'border-[#e27d0f] ring-2 ring-[#e27d0f]/30 scale-105' 
                              : canInteract 
                                ? 'border-[#9945FF]/30 hover:border-[#9945FF]/50 hover:scale-102 cursor-pointer' 
                                : 'border-[#9945FF]/20 hover:border-[#9945FF]/30 cursor-pointer' // Still clickable to replace
                          }`}
                        >
                          <img
                            src={imageUrl}
                            alt={`Ordinal ${ordinal.ordinal_number || ordinal.id}`}
                            className="w-full h-full object-cover"
                          />
                          {isSelected && (
                            <div className="absolute inset-0 bg-[#e27d0f]/20 flex items-center justify-center">
                              <div className="w-8 h-8 rounded-full bg-[#e27d0f] text-white flex items-center justify-center font-bold shadow-lg">
                                ✓
                              </div>
                            </div>
                          )}
                        </button>
                      )
                    })}
                    
                    {/* Load more trigger */}
                    {hasMoreOrdinals && (
                      <button
                        onClick={loadMore}
                        disabled={loadingOrdinals}
                        className="flex-shrink-0 w-32 h-32 rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-[#a8a8b8]/80 hover:border-gray-400 hover:text-gray-600 transition-colors"
                      >
                        {loadingOrdinals ? (
                          <div className="w-6 h-6 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <>
                            <span className="text-2xl mb-1">+</span>
                            <span className="text-xs font-medium">Load more</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                )}
              </div>
              ) : null}

              {/* Step 3: Scene/Action Prompt (only for flyers) */}
              {contentType === 'flyer' && (
                <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md rounded-2xl border-2 border-[#9945FF]/30 p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 rounded-full bg-[#9945FF] text-white flex items-center justify-center font-bold text-sm shadow-lg shadow-[#9945FF]/20">3</div>
                    <h2 className="text-lg font-black text-white">Describe the Scene</h2>
                  </div>
                  
                  <textarea
                    value={scenePrompt}
                    onChange={(e) => setScenePrompt(e.target.value)}
                    placeholder="Describe the scene, action, or composition... e.g., 'Standing together in a neon-lit alley, looking tough' or 'Flying through space with laser beams'"
                    disabled={!activeWalletConnected}
                    rows={3}
                    className="w-full rounded-xl border-2 border-[#9945FF]/30 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md px-4 py-3 text-base text-white placeholder:text-white/50 focus:border-[#9945FF] focus:outline-none focus:ring-2 focus:ring-[#9945FF]/20 transition-colors disabled:opacity-50"
                  />
                  <div className="mt-2 text-xs text-[#a8a8b8]/80">
                    💡 This describes what all selected images are doing together in the flyer
                  </div>
                </div>
              )}

              {/* Step 4 (flyers) / Step 3 (videos): Text & Format / Video Settings */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Flyer Text (only for flyers) */}
                {contentType === 'flyer' && (
                  <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md rounded-2xl border-2 border-[#9945FF]/30 p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#9945FF] text-white flex items-center justify-center font-bold text-sm shadow-lg shadow-[#9945FF]/20">4</div>
                        <h2 className="text-lg font-black text-white">Flyer Text</h2>
                      </div>
                      <label className="flex items-center gap-2 text-sm text-white/70 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={noText}
                          onChange={(e) => setNoText(e.target.checked)}
                          disabled={!activeWalletConnected}
                          className="w-4 h-4 rounded border-[#9945FF]/30 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md text-[#9945FF] focus:ring-[#9945FF]"
                        />
                        No text
                      </label>
                    </div>
                    
                    <textarea
                      value={flyerText}
                      onChange={(e) => setFlyerText(e.target.value)}
                      placeholder="MINT LIVE NOW — BTC Bitches — 1 sat — ordmaker.fun"
                      disabled={noText || !activeWalletConnected}
                      rows={3}
                      className="w-full rounded-xl border-2 border-[#9945FF]/30 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md px-4 py-3 text-base text-white placeholder:text-white/50 focus:border-[#9945FF] focus:outline-none focus:ring-2 focus:ring-[#9945FF]/20 transition-colors disabled:opacity-50"
                    />
                  </div>
                )}

                {/* Video Settings (only for videos) */}
                {contentType === 'video' && (
                  <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md rounded-2xl border-2 border-[#9945FF]/30 p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-8 h-8 rounded-full bg-[#9945FF] text-white flex items-center justify-center font-bold text-sm shadow-lg shadow-[#9945FF]/20">3</div>
                      <h2 className="text-lg font-black text-white">Video Description</h2>
                    </div>
                    
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-semibold text-white mb-2">
                          Scene <span className="text-[#a8a8b8]/80 text-xs font-normal">(what's happening)</span>
                        </label>
                        <textarea
                          value={videoScene}
                          onChange={(e) => setVideoScene(e.target.value)}
                          placeholder="e.g., driving down the road in rainy weather on the tractor"
                          disabled={!activeWalletConnected}
                          rows={3}
                          className="w-full rounded-xl border-2 border-[#9945FF]/30 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md px-4 py-3 text-base text-white placeholder:text-white/50 focus:border-[#9945FF] focus:outline-none focus:ring-2 focus:ring-[#9945FF]/20 transition-colors disabled:opacity-50"
                        />
                        <div className="mt-1 text-xs text-[#a8a8b8]/80">Describe the scene and environment</div>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-semibold text-white mb-2">
                          Actions <span className="text-[#a8a8b8]/80 text-xs font-normal">(what the character is doing)</span>
                        </label>
                        <textarea
                          value={videoActions}
                          onChange={(e) => setVideoActions(e.target.value)}
                          placeholder="e.g., singing, dancing, waving, etc."
                          disabled={!activeWalletConnected}
                          rows={2}
                          className="w-full rounded-xl border-2 border-[#9945FF]/30 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md px-4 py-3 text-base text-white placeholder:text-white/50 focus:border-[#9945FF] focus:outline-none focus:ring-2 focus:ring-[#9945FF]/20 transition-colors disabled:opacity-50"
                        />
                        <div className="mt-1 text-xs text-[#a8a8b8]/80">Describe the actions or movements</div>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-semibold text-white mb-2">
                          Speech/Text <span className="text-[#a8a8b8]/80 text-xs font-normal">(optional - what is being said)</span>
                        </label>
                        <textarea
                          value={videoSpeech}
                          onChange={(e) => setVideoSpeech(e.target.value)}
                          placeholder='e.g., "sweet home alabama" song'
                          disabled={!activeWalletConnected}
                          rows={2}
                          className="w-full rounded-xl border-2 border-[#9945FF]/30 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md px-4 py-3 text-base text-white placeholder:text-white/50 focus:border-[#9945FF] focus:outline-none focus:ring-2 focus:ring-[#9945FF]/20 transition-colors disabled:opacity-50"
                        />
                        <div className="mt-1 text-xs text-[#a8a8b8]/80">Optional: What the character is saying or singing</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Aspect Ratio - only for flyers */}
                {contentType === 'flyer' && (
                  <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md rounded-2xl border-2 border-[#9945FF]/30 p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-8 h-8 rounded-full bg-[#9945FF] text-white flex items-center justify-center font-bold text-sm shadow-lg shadow-[#9945FF]/20">5</div>
                      <h2 className="text-lg font-black text-white">Format</h2>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { id: 'square', label: 'Square', size: '1024×1024', icon: '⬜' },
                        { id: 'portrait', label: 'Portrait', size: '1024×1536', icon: '📱' },
                        { id: 'landscape', label: 'Landscape', size: '1536×1024', icon: '🖼️' },
                      ].map((format) => (
                        <button
                          key={format.id}
                          onClick={() => setAspectRatio(format.id as any)}
                          disabled={!activeWalletConnected}
                          className={`p-3 rounded-xl border-2 text-left transition-all ${
                            aspectRatio === format.id
                              ? 'border-[#9945FF] bg-[#9945FF]/10'
                              : 'border-[#9945FF]/30 hover:border-[#9945FF]/50 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md'
                          } disabled:opacity-50`}
                        >
                          <div className="flex items-center gap-2">
                            <span>{format.icon}</span>
                            <span className={`font-bold text-sm ${aspectRatio === format.id ? 'text-[#9945FF]' : 'text-white'}`}>
                              {format.label}
                            </span>
                          </div>
                          <div className="text-xs text-[#a8a8b8]/80 mt-1">{format.size}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Video Preview - only for videos (fills the space where Format card would be) */}
                {contentType === 'video' && (
                  <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md rounded-2xl border-2 border-[#9945FF]/30 p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-8 h-8 rounded-full bg-[#9945FF] text-white flex items-center justify-center font-bold text-sm shadow-lg shadow-[#9945FF]/20">4</div>
                      <h2 className="text-lg font-black text-white">Preview</h2>
                    </div>
                    
                    <div className="aspect-video rounded-xl border-2 border-[#9945FF]/30 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md overflow-hidden">
                      {resultUrl ? (
                        <video src={resultUrl} controls className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-white/50 p-4">
                          {activeJobId && jobStatus && jobStatus !== 'completed' && jobStatus !== 'failed' ? (
                            <div className="text-center">
                              <div className="w-10 h-10 border-3 border-[#DC1FFF] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                              <span className="text-sm font-semibold text-center block">
                                {jobStatus === 'processing' ? 'Generating Video...' : 'Queued'}
                              </span>
                              <span className="text-xs text-white/40 mt-1 block">This may take 2-5 minutes</span>
                            </div>
                          ) : (
                            <>
                              <span className="text-4xl mb-2">🎬</span>
                              <span className="text-sm text-center">Your video will appear here</span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Error Message */}
              {error && (
                <div className="p-4 rounded-xl bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border-2 border-[#EF4444]/50 text-[#EF4444] font-medium">
                  ⚠️ {error}
                </div>
              )}

              {/* Job Status Banner (non-blocking) */}
              {activeJobId && jobStatus && jobStatus !== 'completed' && jobStatus !== 'failed' && (
                <div className="p-4 rounded-xl bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border-2 border-[#9945FF]/50">
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 border-2 border-[#9945FF] border-t-transparent rounded-full animate-spin" />
                    <div className="flex-1">
                      <div className="font-bold text-[#9945FF]">
                        {jobStatus === 'processing' 
                          ? contentType === 'video' 
                            ? '🔄 Generating Video...' 
                            : '🔄 Generating Flyer...'
                          : '⏳ Job Queued'}
                      </div>
                      <div className="text-sm text-[#a8a8b8]">
                        {jobStatus === 'processing' 
                          ? contentType === 'video'
                            ? `Your video is being generated. This may take 2-5 minutes. The page will keep checking automatically - you can continue working or close the page. Completed videos will appear in your history.${taskId ? ` The TaskId is: ${taskId}` : ''}`
                            : 'Your flyer is being generated. This may take a minute. The page will keep checking automatically.'
                          : contentType === 'video'
                            ? `Your video is in the queue. Processing will continue in the background even if you close this page. Check your history later to see the completed video.${taskId ? ` The TaskId is: ${taskId}` : ''}`
                            : 'Your flyer is in the queue. Processing will continue in the background.'}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Generate Button & Preview */}
              <div className={`grid gap-6 ${contentType === 'video' ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-3'}`}>
                <div className={contentType === 'video' ? '' : 'lg:col-span-2'}>
                  <button
                    onClick={handleGenerateClick}
                    disabled={!canGenerate()}
                    className="w-full h-16 rounded-2xl bg-gradient-to-r from-[#DC1FFF] to-[#9945FF] text-white font-black text-xl shadow-lg shadow-[#DC1FFF]/30 hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {getButtonText()}
                  </button>
                </div>
                
                {/* Mini Preview - only for flyers (videos have preview in the grid above) */}
                {contentType === 'flyer' && (
                  <div className={`rounded-2xl border-2 border-[#9945FF]/30 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md overflow-hidden ${
                    aspectRatio === 'square' ? 'aspect-square' :
                    aspectRatio === 'portrait' ? 'aspect-[2/3]' :
                    'aspect-[3/2]'
                  }`}>
                    {resultUrl ? (
                      <img src={resultUrl} alt="Generated flyer" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-white/50 p-4">
                        {activeJobId && jobStatus && jobStatus !== 'completed' && jobStatus !== 'failed' ? (
                          <div className="text-center">
                            <div className="w-8 h-8 border-3 border-[#DC1FFF] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                            <span className="text-xs text-center block">
                              {jobStatus === 'processing' ? 'Generating...' : 'Queued'}
                            </span>
                          </div>
                        ) : (
                          <>
                            <span className="text-2xl mb-1">🖼️</span>
                            <span className="text-xs text-center">Preview</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Result Actions */}
              {resultUrl && (
                <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md rounded-2xl border-2 border-[#9945FF]/50 p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">✨</span>
                      <div>
                        <div className="font-bold text-[#9945FF]">
                          {contentType === 'video' ? 'Video Generated!' : 'Flyer Generated!'}
                        </div>
                        <div className="text-sm text-[#a8a8b8]">
                          {contentType === 'video' 
                            ? 'Download or share your promotional video' 
                            : 'Download or share your promotional image'}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <a
                        href={resultUrl}
                        download
                        className="px-4 py-2 rounded-xl bg-[#9945FF] text-white font-bold hover:bg-[#14F195] transition-colors shadow-lg shadow-[#9945FF]/20"
                      >
                        Download
                      </a>
                      <a
                        href={resultUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-4 py-2 rounded-xl border-2 border-[#9945FF]/30 text-white/70 font-bold hover:border-[#9945FF]/50 hover:text-white transition-colors bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md"
                      >
                        Open
                      </a>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {viewMode === 'history' && (
            <div>
              {loadingHistory ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <div className="w-12 h-12 rounded-full border-4 border-[#4561ad] border-t-transparent animate-spin mb-4" />
                  <div className="text-gray-600 font-medium">Loading history...</div>
                </div>
              ) : history.length === 0 ? (
                <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md rounded-2xl border-2 border-[#9945FF]/30 p-12 text-center">
                  <span className="text-5xl mb-4 block">📭</span>
                  <h3 className="text-xl font-black text-white mb-2">No flyers yet</h3>
                  <p className="text-white/70 mb-6">Generate your first promotional flyer to see it here</p>
                  <button
                    onClick={() => setViewMode('generate')}
                    className="px-6 py-3 rounded-xl bg-[#DC1FFF] text-white font-bold hover:bg-[#9945FF] transition-colors shadow-lg shadow-[#DC1FFF]/20"
                  >
                    Create Your First Flyer
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {history.map((item) => {
                    const isVideo = item.is_video_job || item.image_url?.endsWith('.mp4') || item.image_url?.includes('.mp4')
                    const isPending = item.job_status === 'pending' || item.job_status === 'processing'
                    const isFailed = item.job_status === 'failed'
                    // Show image if URL exists and job is not pending/failed
                    // Regular promotions don't have job_status, so !item.job_status means it's a completed promotion
                    const hasImage = item.image_url && (item.job_status === 'completed' || !item.job_status)
                    
                    return (
                      <div
                        key={item.id}
                        className={`bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md rounded-2xl border-2 overflow-hidden hover:shadow-lg transition-all group ${
                          isFailed 
                            ? 'border-red-500/50 hover:border-red-500/70' 
                            : isPending
                            ? 'border-yellow-500/50 hover:border-yellow-500/70'
                            : 'border-[#9945FF]/30 hover:border-[#9945FF]/50'
                        }`}
                      >
                        <div 
                          className="cursor-pointer relative"
                          onClick={() => setSelectedHistoryItem(item)}
                        >
                          {hasImage ? (
                            isVideo ? (
                              <video
                                src={item.image_url!}
                                className="w-full aspect-square object-cover"
                                controls
                                muted
                                playsInline
                                onMouseEnter={(e) => e.currentTarget.play()}
                                onMouseLeave={(e) => {
                                  e.currentTarget.pause()
                                  e.currentTarget.currentTime = 0
                                }}
                              />
                            ) : (
                              <img
                                src={item.image_url!}
                                alt={`Flyer for ${item.collection_name}`}
                                className="w-full aspect-square object-cover"
                              />
                            )
                          ) : (
                            <div className="w-full aspect-square bg-gradient-to-br from-[#0a0e27] to-[#1a1f3a] flex flex-col items-center justify-center text-white/50">
                              {isPending ? (
                                <>
                                  <div className="w-12 h-12 border-4 border-[#9945FF] border-t-transparent rounded-full animate-spin mb-3" />
                                  <div className="text-sm font-semibold text-[#9945FF]">
                                    {item.job_status === 'processing' ? 'Processing...' : 'Queued'}
                                  </div>
                                </>
                              ) : isFailed ? (
                                <>
                                  <span className="text-4xl mb-2">❌</span>
                                  <div className="text-sm font-semibold text-[#EF4444]">Failed</div>
                                </>
                              ) : item.image_url ? (
                                item.is_video_job || item.image_url?.endsWith('.mp4') || item.image_url?.includes('.mp4') ? (
                                  <video
                                    src={item.image_url}
                                    className="w-full aspect-square object-cover"
                                    controls
                                    muted
                                    playsInline
                                    onMouseEnter={(e) => e.currentTarget.play()}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.pause()
                                      e.currentTarget.currentTime = 0
                                    }}
                                  />
                                ) : (
                                  <img
                                    src={item.image_url}
                                    alt={`Flyer for ${item.collection_name}`}
                                    className="w-full aspect-square object-cover"
                                  />
                                )
                              ) : (
                                <>
                                  {item.is_video_job ? (
                                    <>
                                      <span className="text-4xl mb-2">🎬</span>
                                      <div className="text-sm font-semibold">Video Job</div>
                                    </>
                                  ) : (
                                    <>
                                      <span className="text-4xl mb-2">🖼️</span>
                                      <div className="text-sm font-semibold">No Image</div>
                                    </>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                          {/* Status badge overlay */}
                          {item.is_video_job && (
                            <div className="absolute top-2 right-2">
                              <span className={`px-2 py-1 rounded-lg text-xs font-bold ${
                                item.job_status === 'completed' 
                                  ? 'bg-green-500/80 text-white' 
                                  : item.job_status === 'failed'
                                  ? 'bg-red-500/80 text-white'
                                  : item.job_status === 'processing'
                                  ? 'bg-yellow-500/80 text-white'
                                  : 'bg-blue-500/80 text-white'
                              }`}>
                                {item.job_status || 'unknown'}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="p-4">
                          <div className="font-bold text-white truncate">{item.collection_name}</div>
                          <div className="text-xs text-[#a8a8b8]/80 mt-1">
                            {new Date(item.created_at).toLocaleDateString()} • {item.character_count} {isVideo ? 'video' : 'image'}{item.character_count !== 1 ? 's' : ''}
                            {item.is_video_job && item.job_status && (
                              <span className="ml-2">• {item.job_status}</span>
                            )}
                          </div>
                          {isFailed && item.error_message && (
                            <div className="text-xs text-[#EF4444] mt-1">
                              <div className="break-words" title={item.error_message}>
                                Error: {item.error_message}
                              </div>
                              {item.error_message.includes('KIE_AI_TASK_ID:') && (
                                <div className="mt-1 text-[#9945FF] font-mono text-[10px] break-all">
                                  TaskID: {item.error_message.match(/KIE_AI_TASK_ID:\s*([^\s.]+)/)?.[1] || 'N/A'}
                                </div>
                              )}
                            </div>
                          )}
                          <div className="flex gap-2 mt-3">
                            <button
                              onClick={() => setSelectedHistoryItem(item)}
                              className="flex-1 px-3 py-2 rounded-lg bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#9945FF]/30 text-white/70 text-sm font-semibold hover:border-[#9945FF]/50 hover:text-white transition-colors"
                            >
                              View
                            </button>
                            {hasImage && (
                              <a
                                href={item.image_url!}
                                download
                                className="flex-1 px-3 py-2 rounded-lg bg-[#9945FF] text-white text-sm font-semibold hover:bg-[#14F195] transition-colors text-center shadow-lg shadow-[#9945FF]/20"
                              >
                                Download
                              </a>
                            )}
                            {isFailed && item.is_video_job && item.error_message && (item.error_message.includes('KIE_AI_TASK_ID:') || item.error_message.match(/KIE_AI_TASK_ID:\s*([^\s.]+)/)) && !item.image_url && (
                              <RetryVideoButton 
                                item={item}
                                onSuccess={async () => {
                                  // Reload history to get fresh data
                                  await reloadHistory()
                                  // Wait a bit for state to update, then refresh the selected item if modal is open
                                  setTimeout(async () => {
                                    // Reload again to ensure we have the latest data
                                    await reloadHistory()
                                    // Check if modal is open for this item and update it
                                    if (selectedHistoryItem?.id === item.id) {
                                      // Fetch fresh history to get updated item
                                      const res = await fetch(`/api/promotion/history?wallet_address=${encodeURIComponent(activeWalletAddress || '')}`)
                                      const data = await res.json()
                                      if (res.ok) {
                                        const updatedItem = (data?.promotions || []).find((h: PromotionHistoryItem) => h.id === item.id)
                                        if (updatedItem && updatedItem.image_url) {
                                          setSelectedHistoryItem(updatedItem)
                                        }
                                      }
                                    }
                                  }, 500)
                                }}
                              />
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setDeleteConfirmItem(item)
                              }}
                              className="px-3 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-[#EF4444] text-sm font-semibold transition-colors border border-red-500/30 hover:border-red-500/50"
                              title="Delete promotion"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* History Item Modal */}
      {selectedHistoryItem && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedHistoryItem(null)}
        >
          <div
            className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-[#9945FF]/30"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-[#9945FF]/30 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-black text-white">{selectedHistoryItem.collection_name}</h3>
                <div className="text-sm text-[#a8a8b8]/80 mt-1">
                  {new Date(selectedHistoryItem.created_at).toLocaleDateString()} at {new Date(selectedHistoryItem.created_at).toLocaleTimeString()}
                </div>
              </div>
              <button
                onClick={() => setSelectedHistoryItem(null)}
                className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#9945FF]/30 flex items-center justify-center text-white/70 hover:border-[#9945FF]/50 hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Show status info for video jobs */}
              {selectedHistoryItem.is_video_job && (
                <div className="p-4 rounded-xl bg-[#0a0e27]/60 border border-[#9945FF]/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-white">Job Status:</span>
                    <span className={`px-3 py-1 rounded-lg text-xs font-bold ${
                      selectedHistoryItem.job_status === 'completed' 
                        ? 'bg-green-500/80 text-white' 
                        : selectedHistoryItem.job_status === 'failed'
                        ? 'bg-red-500/80 text-white'
                        : selectedHistoryItem.job_status === 'processing'
                        ? 'bg-yellow-500/80 text-white'
                        : 'bg-blue-500/80 text-white'
                    }`}>
                      {selectedHistoryItem.job_status || 'unknown'}
                    </span>
                  </div>
                  {selectedHistoryItem.started_at && (
                    <div className="text-xs text-[#a8a8b8]/80 mt-1">
                      Started: {new Date(selectedHistoryItem.started_at).toLocaleString()}
                    </div>
                  )}
                  {selectedHistoryItem.completed_at && (
                    <div className="text-xs text-[#a8a8b8]/80 mt-1">
                      Completed: {new Date(selectedHistoryItem.completed_at).toLocaleString()}
                    </div>
                  )}
                  {selectedHistoryItem.error_message && (
                    <div className="text-xs text-[#EF4444] mt-2 p-2 rounded bg-red-500/10 border border-red-500/30">
                      <div className="mb-2">
                        <div className="font-semibold mb-1">Error:</div>
                        <div className="break-words">{selectedHistoryItem.error_message}</div>
                      </div>
                      {selectedHistoryItem.error_message.includes('KIE_AI_TASK_ID:') && (
                        <div className="mt-2 p-2 rounded bg-[#0a0e27]/60 border border-[#9945FF]/30">
                          <div className="text-[#9945FF] font-semibold mb-1">Task ID:</div>
                          <div className="text-white font-mono text-xs break-all">
                            {selectedHistoryItem.error_message.match(/KIE_AI_TASK_ID:\s*([^\s.]+)/)?.[1]?.trim() || 'N/A'}
                          </div>
                          {!selectedHistoryItem.image_url && (
                            <div className="mt-3">
                              <FetchVideoButton 
                                errorMessage={selectedHistoryItem.error_message}
                                jobId={String(selectedHistoryItem.id).replace('job_', '')}
                                onSuccess={async () => {
                                  // Reload history to get updated video URL
                                  await reloadHistory()
                                  // Close and reopen modal after a short delay to show updated video
                                  const itemId = selectedHistoryItem.id
                                  setSelectedHistoryItem(null)
                                  setTimeout(async () => {
                                    await reloadHistory()
                                    setTimeout(() => {
                                      // Find updated item from fresh history state
                                      const updatedItem = history.find((h: PromotionHistoryItem) => h.id === itemId)
                                      if (updatedItem && updatedItem.image_url) {
                                        setSelectedHistoryItem(updatedItem)
                                      }
                                    }, 200)
                                  }, 500)
                                }}
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {selectedHistoryItem.image_url && (selectedHistoryItem.image_url.endsWith('.mp4') || selectedHistoryItem.image_url.includes('.mp4')) ? (
                <video
                  src={selectedHistoryItem.image_url}
                  className="w-full rounded-xl border border-[#9945FF]/30"
                  controls
                  autoPlay
                  loop
                  playsInline
                />
              ) : selectedHistoryItem.image_url ? (
                <img
                  src={selectedHistoryItem.image_url}
                  alt={`Flyer for ${selectedHistoryItem.collection_name}`}
                  className="w-full rounded-xl border border-[#9945FF]/30"
                />
              ) : (
                <div className="w-full aspect-video bg-gradient-to-br from-[#0a0e27] to-[#1a1f3a] flex flex-col items-center justify-center text-white/50 rounded-xl border border-[#9945FF]/30">
                  {selectedHistoryItem.job_status === 'processing' || selectedHistoryItem.job_status === 'pending' ? (
                    <>
                      <div className="w-16 h-16 border-4 border-[#9945FF] border-t-transparent rounded-full animate-spin mb-4" />
                      <div className="text-lg font-semibold text-[#9945FF]">
                        {selectedHistoryItem.job_status === 'processing' ? 'Processing...' : 'Queued'}
                      </div>
                    </>
                  ) : selectedHistoryItem.job_status === 'failed' ? (
                    <>
                      <span className="text-6xl mb-4">❌</span>
                      <div className="text-lg font-semibold text-[#EF4444]">
                        {selectedHistoryItem.is_video_job ? 'Video Generation Failed' : 'Image Generation Failed'}
                      </div>
                    </>
                  ) : (
                    <>
                      {selectedHistoryItem.is_video_job ? (
                        <>
                          <span className="text-6xl mb-4">🎬</span>
                          <div className="text-lg font-semibold">Video Job</div>
                        </>
                      ) : (
                        <>
                          <span className="text-6xl mb-4">🖼️</span>
                          <div className="text-lg font-semibold">No Image</div>
                        </>
                      )}
                    </>
                  )}
                </div>
              )}

              {selectedHistoryItem.image_url && (
                <div className="flex gap-3">
                  <a
                    href={selectedHistoryItem.image_url}
                    download
                    className="flex-1 h-12 rounded-xl bg-[#9945FF] text-white font-bold flex items-center justify-center hover:bg-[#14F195] transition-colors shadow-lg shadow-[#9945FF]/20"
                  >
                    Download
                  </a>
                  <a
                    href={selectedHistoryItem.image_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 h-12 rounded-xl border-2 border-[#9945FF]/30 text-white/70 font-bold flex items-center justify-center hover:border-[#9945FF]/50 hover:text-white transition-colors bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md"
                  >
                    Open in Tab
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Credits Confirmation Modal */}
      {showCreditsConfirm && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={handleCreditsConfirmCancel}>
          <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden border-2 border-[#9945FF]/50" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-[#9945FF] to-[#8b5cf6] p-6">
              <h2 className="text-2xl font-bold text-white">Confirm Generation</h2>
              <p className="text-white/90 mt-1">Review your credits before generating</p>
            </div>
            
            <div className="p-6">
              {loadingCredits ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#9945FF] mx-auto"></div>
                  <p className="mt-4 text-[#a8a8b8]">Loading credits...</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#9945FF]/30 rounded-lg p-4 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-[#a8a8b8] font-medium">Current Credits:</span>
                      <span className="text-2xl font-bold text-white">{credits ?? 0}</span>
                    </div>
                    
                    <div className="border-t border-[#9945FF]/30 pt-3">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-[#a8a8b8]">
                          {contentType === 'video' ? 'Generating video:' : 'Generating flyer:'}
                        </span>
                        <span className="text-lg font-semibold text-[#DC1FFF]">
                          -{contentType === 'video' ? 4 : 1}
                        </span>
                      </div>
                      <div className="text-xs text-[#a8a8b8]/80">
                        ({contentType === 'video' ? '4 credits per video' : '1 credit per flyer'})
                      </div>
                    </div>
                    
                    <div className="border-t border-[#9945FF]/30 pt-3 mt-3">
                      <div className="flex justify-between items-center">
                        <span className="text-white font-semibold">Total After:</span>
                        <span className={`text-2xl font-bold ${
                          (credits ?? 0) - (contentType === 'video' ? 4 : 1) >= 0 
                            ? 'text-[#9945FF]' 
                            : 'text-[#EF4444]'
                        }`}>
                          {(credits ?? 0) - (contentType === 'video' ? 4 : 1)}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  {(credits ?? 0) - (contentType === 'video' ? 4 : 1) < 0 && (
                    <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#EF4444]/50 rounded-lg p-3">
                      <p className="text-sm text-[#EF4444]">
                        ⚠️ Insufficient credits! You need {(contentType === 'video' ? 4 : 1) - (credits ?? 0)} more credit{(contentType === 'video' ? 4 : 1) - (credits ?? 0) > 1 ? 's' : ''} to generate a {contentType}.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
            
            <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border-t border-[#9945FF]/30 px-6 py-4 flex gap-3 justify-end">
              <button
                onClick={handleCreditsConfirmCancel}
                className="px-6 py-2 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#9945FF]/30 hover:border-[#9945FF]/50 text-[#a8a8b8] hover:text-white rounded-lg font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreditsConfirmAccept}
                disabled={loadingCredits || (credits ?? 0) - (contentType === 'video' ? 4 : 1) < 0}
                className="px-6 py-2 bg-[#9945FF] hover:bg-[#14F195] text-white rounded-lg font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#9945FF]/20 drop-shadow-lg"
              >
                Accept & Generate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmDialog
        isOpen={deleteConfirmItem !== null}
        onClose={() => setDeleteConfirmItem(null)}
        onConfirm={handleDelete}
        title="Delete Promotion"
        message={`Are you sure you want to delete this ${deleteConfirmItem?.is_video_job ? 'video' : 'promotion'}? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        confirmButtonClass="bg-red-600 hover:bg-red-700"
        loading={deleting}
      />
    </div>
  )
}
