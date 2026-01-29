import { useState, useEffect } from 'react'
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

export function useCollectionData(collectionId: string | string[] | undefined) {
  const [collection, setCollection] = useState<Collection | null>(null)
  const [layers, setLayers] = useState<Layer[]>([])
  const [ordinals, setOrdinals] = useState<GeneratedOrdinal[]>([])
  const [loading, setLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalOrdinals, setTotalOrdinals] = useState(0)
  const [queuedJobs, setQueuedJobs] = useState(0)
  const [processingJobs, setProcessingJobs] = useState(0)
  const [traitFilters, setTraitFilters] = useState<Record<string, string>>({})
  const [showOrphanedTraits, setShowOrphanedTraits] = useState(false)
  const [layerTraits, setLayerTraits] = useState<Record<string, string[]>>({})

  const loadAllData = async () => {
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

      const response = await fetch(`/api/collections/${collectionId}/full?${filterParams.toString()}`)
      if (response.ok) {
        const data = await response.json()
        setCollection(data.collection)
        setLayers(data.layers)
        setOrdinals(data.ordinals)
        setTotalPages(data.pagination.totalPages)
        setTotalOrdinals(data.pagination.total)
        setQueuedJobs(data.jobStatus.pending || 0)
        setProcessingJobs(data.jobStatus.processing || 0)
        loadLayerTraits(data.layers)
      }
    } catch (error) {
      console.error('Error loading collection data:', error)
    } finally {
      setLoading(false)
    }
  }

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

  useEffect(() => {
    if (collectionId) loadAllData()
  }, [collectionId, currentPage, traitFilters, showOrphanedTraits])

  return {
    collection,
    layers,
    ordinals,
    loading,
    currentPage,
    setCurrentPage,
    totalPages,
    totalOrdinals,
    queuedJobs,
    processingJobs,
    traitFilters,
    setTraitFilters,
    showOrphanedTraits,
    setShowOrphanedTraits,
    layerTraits,
    loadAllData,
  }
}

