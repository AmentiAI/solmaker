import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { isAdmin } from '@/lib/auth/access-control'
import { useCredits } from '@/lib/credits-context'
import JSZip from 'jszip'
import { toast } from 'sonner'
import { GeneratedOrdinal } from '../types'

interface Collection {
  id: string
  name: string
  is_active: boolean
  collection_status?: 'draft' | 'launchpad' | 'self_inscribe' | 'marketplace' | 'deleted'
  wallet_address?: string
}

interface Layer {
  id: string
  name: string
  display_order: number
  trait_count: number
}

export function useCollectionPageLogic(collectionId: string | string[] | undefined, currentAddress: string | null | undefined) {
  const router = useRouter()
  const [collection, setCollection] = useState<Collection | null>(null)
  const [layers, setLayers] = useState<Layer[]>([])
  const [loading, setLoading] = useState(true)
  const [ordinals, setOrdinals] = useState<GeneratedOrdinal[]>([])
  const [generating, setGenerating] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalOrdinals, setTotalOrdinals] = useState(0)
  const [traitFilters, setTraitFilters] = useState<Record<string, string>>({})
  const [showOrphanedTraits, setShowOrphanedTraits] = useState(false)
  const [showPromptId, setShowPromptId] = useState<string | null>(null)
  const [queuedJobs, setQueuedJobs] = useState(0)
  const [processingJobs, setProcessingJobs] = useState(0)
  const [generateQuantity, setGenerateQuantity] = useState(1)
  const [useClassicMode, setUseClassicMode] = useState(false)
  const [layerTraits, setLayerTraits] = useState<Record<string, string[]>>({})
  const [compressing, setCompressing] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showWipeCompressionsConfirm, setShowWipeCompressionsConfirm] = useState(false)
  const [showDeleteOrdinalConfirm, setShowDeleteOrdinalConfirm] = useState<string | null>(null)
  const [showFilterConfirm, setShowFilterConfirm] = useState(false)
  const [showCreditsConfirm, setShowCreditsConfirm] = useState(false)
  const [pendingGeneration, setPendingGeneration] = useState(false)
  const { credits, loading: loadingCredits } = useCredits()
  const [userRole, setUserRole] = useState<'owner' | 'editor' | 'viewer'>('owner')
  const [collectionOwner, setCollectionOwner] = useState<string | null>(null)
  const [collaboratorCount, setCollaboratorCount] = useState(0)
  const [showCollaboratorsModal, setShowCollaboratorsModal] = useState(false)
  const [flippingOrdinal, setFlippingOrdinal] = useState<string | null>(null)
  const [imageSliders, setImageSliders] = useState<Record<string, number>>({})
  const [expandedTraits, setExpandedTraits] = useState<Record<string, boolean>>({})
  const [showCompressionModal, setShowCompressionModal] = useState(false)
  const [compressionModalOrdinal, setCompressionModalOrdinal] = useState<GeneratedOrdinal | null>(null)
  const [compressionModalSlider, setCompressionModalSlider] = useState(50)
  const [downloadProgress, setDownloadProgress] = useState({
    isOpen: false,
    current: 0,
    total: 0,
    status: 'downloading' as 'downloading' | 'generating' | 'completed' | 'error',
    message: '',
    failedCount: 0
  })
  const compressingRef = useRef(false)

  const loadLayerTraits = async (layersList: Layer[]) => {
    const traitsMap: Record<string, string[]> = {}
    await Promise.all(layersList.map(async (layer) => {
      try {
        const response = await fetch(`/api/layers/${layer.id}/traits`)
        if (response.ok) {
          const data = await response.json()
          traitsMap[layer.name] = data.traits.map((t: { name: string }) => t.name)
        }
      } catch {}
    }))
    setLayerTraits(traitsMap)
  }

  const loadJobStatusOnly = async () => {
    if (!collectionId) return
    try {
      const response = await fetch(`/api/collections/${collectionId}/jobs/status`)
      if (response.ok) {
        const data = await response.json()
        setQueuedJobs(data.pending || 0)
        setProcessingJobs(data.processing || 0)
      }
    } catch (error) {
      console.error('Error loading job status:', error)
    }
  }

  const loadOrdinalsOnly = async () => {
    if (!collectionId) return
    try {
      const filterParams = new URLSearchParams()
      filterParams.append('page', currentPage.toString())
      filterParams.append('limit', '15')
      if (showOrphanedTraits) {
        filterParams.append('show_orphaned', 'true')
      } else {
        Object.entries(traitFilters).forEach(([layer, trait]) => {
          if (trait) filterParams.append(`trait_${layer}`, trait)
        })
      }
      const response = await fetch(`/api/collections/${collectionId}/ordinals?${filterParams.toString()}`)
      if (response.ok) {
        const data = await response.json()
        setOrdinals(data.ordinals)
        setTotalPages(data.pagination.totalPages)
        setTotalOrdinals(data.pagination.total)
        const initialSliders: Record<string, number> = {}
        data.ordinals.forEach((ordinal: GeneratedOrdinal) => {
          initialSliders[ordinal.id] = 50
        })
        setImageSliders(prev => ({ ...prev, ...initialSliders }))
      }
    } catch (error) {
      console.error('Error loading ordinals:', error)
    }
  }

  const checkAndCompressOrdinals = async (ordinalsList: GeneratedOrdinal[]) => {
    if (!collectionId) return
    const ordinalsNeedingCompression = ordinalsList.filter(
      ordinal => !ordinal.compressed_image_url || ordinal.compressed_image_url === null
    )
    if (ordinalsNeedingCompression.length === 0 || compressingRef.current) return
    compressingRef.current = true
    setCompressing(true)
    try {
      const ordinalIds = ordinalsNeedingCompression.map(o => o.id)
      const response = await fetch(`/api/collections/${collectionId}/ordinals/compress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ordinal_ids: ordinalIds }),
      })
      if (response.ok) {
        const data = await response.json()
        if (data.compressed > 0) {
          setTimeout(() => loadOrdinalsOnly(), 1000)
        }
      }
    } catch (error) {
      console.error('[Compression] Error compressing ordinals:', error)
    } finally {
      setCompressing(false)
      compressingRef.current = false
    }
  }

  const loadAllData = async () => {
    if (!collectionId || !currentAddress) {
      setLoading(false)
      return
    }
    try {
      const filterParams = new URLSearchParams()
      filterParams.append('page', currentPage.toString())
      filterParams.append('limit', '15')
      filterParams.append('wallet_address', currentAddress) // Auth parameter
      if (showOrphanedTraits) {
        filterParams.append('show_orphaned', 'true')
      } else {
        Object.entries(traitFilters).forEach(([layer, trait]) => {
          if (trait) filterParams.append(`trait_${layer}`, trait)
        })
      }
      const response = await fetch(`/api/collections/${collectionId}/full?${filterParams.toString()}`)
      if (response.ok) {
        const data = await response.json()
        setCollection(data.collection)
        const owner = data.collection.wallet_address || null
        setCollectionOwner(owner)
        if (currentAddress) {
          if (owner === currentAddress) {
            setUserRole('owner')
          } else {
            try {
              const collabResponse = await fetch(`/api/collections/${collectionId}/collaborators`)
              if (collabResponse.ok) {
                const collabData = await collabResponse.json()
                const collaborators = collabData.collaborators || []
                setCollaboratorCount(collaborators.length)
                const userCollab = collaborators.find(
                  (c: any) => c.wallet_address === currentAddress && c.status === 'accepted'
                )
                setUserRole(userCollab ? userCollab.role as 'editor' | 'viewer' : 'viewer')
              }
            } catch {
              setUserRole('viewer')
            }
          }
        } else {
          setUserRole('viewer')
        }
        setLayers(data.layers)
        loadLayerTraits(data.layers)
        setOrdinals(data.ordinals)
        setTotalPages(data.pagination.totalPages)
        setTotalOrdinals(data.pagination.total)
        const initialSliders: Record<string, number> = {}
        data.ordinals.forEach((ordinal: GeneratedOrdinal) => {
          initialSliders[ordinal.id] = 50
        })
        setImageSliders(prev => ({ ...prev, ...initialSliders }))
        setQueuedJobs(data.jobStatus.pending || 0)
        setProcessingJobs(data.jobStatus.processing || 0)
        checkAndCompressOrdinals(data.ordinals)
      } else {
        setCollection(null)
      }
    } catch (error) {
      console.error('Error loading collection data:', error)
      setCollection(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (collectionId && currentAddress) loadAllData()
  }, [collectionId, currentAddress, currentPage, traitFilters, showOrphanedTraits])

  useEffect(() => {
    if (!collectionId) return
    // Poll more frequently (every 5 seconds) when there are jobs processing, otherwise every 30 seconds
    const pollInterval = (queuedJobs > 0 || processingJobs > 0) ? 5000 : 30000
    const interval = setInterval(() => {
      loadJobStatusOnly()
      if (currentPage === 1) loadOrdinalsOnly()
    }, pollInterval)
    return () => clearInterval(interval)
  }, [collectionId, currentPage, queuedJobs, processingJobs])

  const handleGenerate = async () => {
    const isUserAdmin = isAdmin(currentAddress || null)
    if (collection?.collection_status === 'launchpad' && !isUserAdmin) {
      toast.error('Generation Disabled', { description: 'Generation is disabled for collections on launchpad.' })
      return
    }
    const layersWithoutTraits = layers.filter(l => l.trait_count === 0)
    if (layersWithoutTraits.length > 0) {
      toast.error('Missing Traits', { description: `Please add traits to: ${layersWithoutTraits.map(l => l.name).join(', ')}` })
      return
    }
    const activeFilters = Object.entries(traitFilters).filter(([_, value]) => value && value !== '')
    if (activeFilters.length > 0) {
      setPendingGeneration(true)
      setShowFilterConfirm(true)
      return
    }
    // Show credits confirmation modal
    setShowCreditsConfirm(true)
  }

  const handleCreditsConfirmAccept = async () => {
    setShowCreditsConfirm(false)
    await executeGeneration()
  }

  const handleCreditsConfirmCancel = () => {
    setShowCreditsConfirm(false)
  }

  const executeGeneration = async () => {
    if (!collectionId) return
    setGenerating(true)
    try {
      const traitOverrides = Object.fromEntries(
        Object.entries(traitFilters).filter(([_, value]) => value && value !== '')
      )
      const response = await fetch(`/api/collections/${collectionId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ordinal_number: null,
          quantity: generateQuantity,
          trait_overrides: Object.keys(traitOverrides).length > 0 ? traitOverrides : null,
          wallet_address: currentAddress,
          image_model: useClassicMode ? 'gpt-image-1' : 'gpt-image-1.5',
        }),
      })
      if (response.ok) {
        const data = await response.json()
        await loadJobStatusOnly()
        window.dispatchEvent(new CustomEvent('refreshCredits'))
        const jobCount = data.count || generateQuantity
        toast.success('Generation Queued', { description: `${jobCount} generation job${jobCount !== 1 ? 's' : ''} queued successfully.` })
      } else {
        const error = await response.json()
        toast.error('Generation Error', { description: `Error: ${error.error}` })
      }
    } catch (error) {
      console.error('Error queuing generation:', error)
      toast.error('Generation Failed', { description: 'Failed to queue generation' })
    } finally {
      setGenerating(false)
      setPendingGeneration(false)
    }
  }

  const handleDownloadOrdinal = async (ordinal: GeneratedOrdinal) => {
    try {
      const zip = new JSZip()
      const ordinalNum = ordinal.ordinal_number || ordinal.id
      const folder = zip.folder(`ordinal-${ordinalNum}`)
      const imageUrl = ordinal.compressed_image_url || ordinal.image_url
      const imageResponse = await fetch(imageUrl)
      const imageBlob = await imageResponse.blob()
      folder?.file(`image.png`, imageBlob)
      const traitsData = {
        ordinal_number: ordinal.ordinal_number,
        traits: ordinal.traits,
        prompt: ordinal.prompt,
        image_url: ordinal.image_url,
        metadata_url: ordinal.metadata_url,
        created_at: ordinal.created_at,
      }
      folder?.file(`traits.json`, JSON.stringify(traitsData, null, 2))
      const content = await zip.generateAsync({ type: 'blob' })
      const url = window.URL.createObjectURL(content)
      const a = document.createElement('a')
      a.href = url
      a.download = `ordinal-${ordinalNum}-image-and-traits.zip`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error('Failed to download ordinal:', error)
      toast.error('Download Failed', { description: 'Failed to download ordinal. Please try again.' })
    }
  }

  const handleCompressAndDownloadAll = async () => {
    // Simplified version - full implementation would be in a separate handler file
    toast.info('Feature in progress', { description: 'Compress and download all feature coming soon' })
  }

  const handleDeleteOrdinal = (ordinalId: string) => {
    setShowDeleteOrdinalConfirm(ordinalId)
  }

  const executeDeleteOrdinal = async (ordinalId: string) => {
    if (!collectionId || !currentAddress) {
      toast.error('Wallet Required', { description: 'Please connect your wallet' })
      return
    }
    try {
      const response = await fetch(`/api/collections/${collectionId}/ordinals?ordinal_id=${ordinalId}&wallet_address=${encodeURIComponent(currentAddress)}`, {
        method: 'DELETE'
      })
      if (response.ok) {
        toast.success('Ordinal Deleted')
        await loadOrdinalsOnly()
      } else {
        const error = await response.json().catch(() => ({ error: 'Failed to delete ordinal' }))
        toast.error('Delete Failed', { description: error.error })
      }
    } catch (error) {
      console.error('Error deleting ordinal:', error)
      toast.error('Delete Failed', { description: 'Failed to delete ordinal. Please try again.' })
    } finally {
      setShowDeleteOrdinalConfirm(null)
    }
  }

  const handleFlipOrdinal = async (ordinalId: string) => {
    if (!collectionId) return
    setFlippingOrdinal(ordinalId)
    try {
      const response = await fetch(`/api/collections/${collectionId}/ordinals/${ordinalId}/flip`, {
        method: 'POST'
      })
      if (response.ok) {
        toast.success('Image Flipped')
        await loadOrdinalsOnly()
      } else {
        const error = await response.json()
        toast.error('Flip Failed', { description: error.error || 'Failed to flip image' })
      }
    } catch (error) {
      console.error('Error flipping ordinal:', error)
      toast.error('Flip Failed', { description: 'Failed to flip image' })
    } finally {
      setFlippingOrdinal(null)
    }
  }

  const handleDelete = () => {
    setShowDeleteConfirm(true)
  }

  const handleDeleteConfirm = async () => {
    if (!collectionId) return
    setDeleting(true)
    try {
      const response = await fetch(`/api/collections/${collectionId}`, {
        method: 'DELETE'
      })
      if (response.ok) {
        router.push('/collections')
      } else {
        const error = await response.json()
        toast.error('Delete Failed', { description: `Error: ${error.error || 'Unknown error'}` })
        setDeleting(false)
        setShowDeleteConfirm(false)
      }
    } catch (error) {
      console.error('Error deleting collection:', error)
      toast.error('Delete Failed', { description: 'Failed to delete collection. Please try again.' })
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  const handleDeleteCancel = () => {
    setShowDeleteConfirm(false)
  }

  const handleWipeCompressions = () => {
    setShowWipeCompressionsConfirm(true)
  }

  const executeWipeCompressions = async () => {
    if (!collectionId) return
    try {
      const response = await fetch(`/api/collections/${collectionId}/wipe-compressions`, {
        method: 'POST'
      })
      if (response.ok) {
        const data = await response.json()
        toast.success('Compressions Wiped', { description: data.message })
        loadOrdinalsOnly()
      } else {
        const error = await response.json()
        toast.error('Wipe Failed', { description: `Error: ${error.error}` })
      }
    } catch (error) {
      console.error('Error wiping compressions:', error)
      toast.error('Wipe Failed', { description: 'Failed to wipe compressions' })
    } finally {
      setShowWipeCompressionsConfirm(false)
    }
  }

  const clearFilters = () => {
    setTraitFilters({})
    setCurrentPage(1)
  }

  const handleFilterChange = (layerName: string, traitName: string) => {
    setTraitFilters(prev => ({ ...prev, [layerName]: traitName }))
    setCurrentPage(1)
  }

  return {
    collection, layers, ordinals, loading, currentPage, setCurrentPage, totalPages, totalOrdinals,
    queuedJobs, processingJobs, traitFilters, setTraitFilters, showOrphanedTraits, setShowOrphanedTraits,
    layerTraits, userRole, collectionOwner, collaboratorCount, generating, generateQuantity,
    setGenerateQuantity, useClassicMode, setUseClassicMode, imageSliders, setImageSliders,
    expandedTraits, setExpandedTraits, showPromptId, setShowPromptId, flippingOrdinal,
    showDeleteConfirm, setShowDeleteConfirm, deleting, showCollaboratorsModal, setShowCollaboratorsModal,
    showCompressionModal, setShowCompressionModal, compressionModalOrdinal, setCompressionModalOrdinal,
    compressionModalSlider, setCompressionModalSlider, downloadProgress, setDownloadProgress,
    showDeleteOrdinalConfirm, setShowDeleteOrdinalConfirm,
    showWipeCompressionsConfirm, setShowWipeCompressionsConfirm, showFilterConfirm, setShowFilterConfirm,
    showCreditsConfirm, setShowCreditsConfirm, credits, loadingCredits,
    pendingGeneration, setPendingGeneration,
    handleGenerate, handleDelete, handleDeleteConfirm, handleDeleteCancel, handleDeleteOrdinal,
    executeDeleteOrdinal, handleFlipOrdinal, handleDownloadOrdinal, handleCompressAndDownloadAll,
    handleWipeCompressions, executeWipeCompressions, executeGeneration, clearFilters,
    handleFilterChange, handleCreditsConfirmAccept, handleCreditsConfirmCancel, loadAllData
  }
}

