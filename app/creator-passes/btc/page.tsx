'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'

interface Ordinal {
  id: string
  ordinal_number: number | null
  image_url: string
  compressed_image_url?: string | null
  created_at: string
}

const IMAGES_PER_PANEL = 24
const AUTO_SLIDE_INTERVAL = 5000 // 5 seconds

export default function BTCCreatorPassesPage() {
  const [ordinals, setOrdinals] = useState<Ordinal[]>([])
  const [loading, setLoading] = useState(true)
  const [collectionName, setCollectionName] = useState<string>('')
  const [collectionId, setCollectionId] = useState<string | null>(null)
  const [currentPanel, setCurrentPanel] = useState(0)
  const [totalOrdinals, setTotalOrdinals] = useState(0)
  const [totalPanels, setTotalPanels] = useState(0)
  const [loadedPanels, setLoadedPanels] = useState<Set<number>>(new Set())
  const autoSlideTimerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    loadPassesCollection()
    return () => {
      if (autoSlideTimerRef.current) {
        clearInterval(autoSlideTimerRef.current)
      }
    }
  }, [])

  // Auto-slide functionality
  useEffect(() => {
    if (totalPanels > 1 && !loading) {
      autoSlideTimerRef.current = setInterval(() => {
        setCurrentPanel((prev) => (prev + 1) % totalPanels)
      }, AUTO_SLIDE_INTERVAL)
      
      return () => {
        if (autoSlideTimerRef.current) {
          clearInterval(autoSlideTimerRef.current)
        }
      }
    }
  }, [totalPanels, loading])

  const loadPassesCollection = async () => {
    // Hardcoded collection ID for BTC Creator Passes
    const BTC_PASSES_COLLECTION_ID = '96541454-e6be-469f-9012-00f778ee8a85'
    
    try {
      setCollectionId(BTC_PASSES_COLLECTION_ID)

      // Get collection info
      const collectionResponse = await fetch(`/api/collections/${BTC_PASSES_COLLECTION_ID}`)
      if (collectionResponse.ok) {
        const collectionData = await collectionResponse.json()
        setCollectionName(collectionData.collection?.name || 'BTC Creator Passes')
      } else {
        setCollectionName('BTC Creator Passes')
      }

      // Get total count first
      const countResponse = await fetch(`/api/collections/${BTC_PASSES_COLLECTION_ID}/ordinals?limit=1&page=1`)
      if (countResponse.ok) {
        const countData = await countResponse.json()
        const total = countData.pagination?.total || 0
        setTotalOrdinals(total)
        const panels = Math.ceil(total / IMAGES_PER_PANEL)
        setTotalPanels(panels)
        console.log('[Creator Passes] Total ordinals:', total, 'Total panels:', panels)
      }

      // Load first panel
      await loadPanel(0, BTC_PASSES_COLLECTION_ID)
    } catch (error) {
      console.error('Error loading passes collection:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadPanel = async (panelIndex: number, collectionIdParam?: string) => {
    const cid = collectionIdParam || collectionId
    if (!cid || loadedPanels.has(panelIndex)) {
      return // Already loaded or no collection ID
    }

    try {
      const page = panelIndex + 1
      const response = await fetch(`/api/collections/${cid}/ordinals?page=${page}&limit=${IMAGES_PER_PANEL}`)
      if (!response.ok) {
        console.error('Failed to fetch panel:', panelIndex)
        return
      }

      const data = await response.json()
      const panelOrdinals = data.ordinals || []
      
      // Merge with existing ordinals, maintaining order
      setOrdinals((prev) => {
        const newOrdinals = [...prev]
        const startIndex = panelIndex * IMAGES_PER_PANEL
        panelOrdinals.forEach((ordinal: Ordinal, idx: number) => {
          newOrdinals[startIndex + idx] = ordinal
        })
        return newOrdinals
      })

      setLoadedPanels((prev) => new Set([...prev, panelIndex]))
      console.log(`[Creator Passes] Loaded panel ${panelIndex + 1}/${totalPanels}`)
    } catch (error) {
      console.error(`Error loading panel ${panelIndex}:`, error)
    }
  }

  // Load adjacent panels when current panel changes
  useEffect(() => {
    if (!collectionId || loading) return

    // Load current panel if not loaded
    if (!loadedPanels.has(currentPanel)) {
      loadPanel(currentPanel)
    }

    // Preload next panel
    const nextPanel = (currentPanel + 1) % totalPanels
    if (!loadedPanels.has(nextPanel)) {
      loadPanel(nextPanel)
    }

    // Preload previous panel
    const prevPanel = currentPanel === 0 ? totalPanels - 1 : currentPanel - 1
    if (!loadedPanels.has(prevPanel)) {
      loadPanel(prevPanel)
    }
  }, [currentPanel, collectionId, totalPanels, loadedPanels, loading])

  const goToPanel = (panelIndex: number) => {
    // Reset auto-slide timer
    if (autoSlideTimerRef.current) {
      clearInterval(autoSlideTimerRef.current)
    }
    setCurrentPanel(panelIndex)
  }

  const getCurrentPanelOrdinals = () => {
    const startIndex = currentPanel * IMAGES_PER_PANEL
    const endIndex = startIndex + IMAGES_PER_PANEL
    return ordinals.slice(startIndex, endIndex).filter(Boolean)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-yellow-50">
      <div className="container mx-auto px-4 py-10">
        <div className="max-w-6xl mx-auto">
          {/* Navigation Tabs */}
       

          {/* Hero Section */}
          <div className="text-center ">
            <h1 className="text-5xl md:text-6xl font-extrabold mb-4 bg-gradient-to-r from-orange-600 via-yellow-500 to-orange-600 bg-clip-text text-transparent animate-pulse">
              Bitcoin Creator Passes
            </h1>
           
          </div>

          {/* About Section */}
          <div className="mb-8">
            
             
              <div className="space-y-4">
                <div className="bg-gradient-to-r from-orange-100 to-yellow-100 rounded-lg p-4 border-l-4 border-orange-500">
                  <p className="text-orange-800 font-semibold text-lg mb-2">
                    🎉 Creator Pass holders get <span className="text-2xl">50% OFF</span> credits!
                  </p>
                  <p className="text-orange-700 text-sm">
                    More information coming soon...
                  </p>
                </div>
              </div>
        
          </div>

          {/* Images Grid Section - Full Width */}
          <div className="flex flex-col">
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-orange-500 via-yellow-500 to-orange-500 rounded-2xl blur opacity-75 group-hover:opacity-100 transition duration-1000 group-hover:duration-200 animate-pulse"></div>
              <div className="relative bg-[#FDFCFA] rounded-xl overflow-hidden shadow-2xl p-6">
                {loading ? (
                  <div className="flex items-center justify-center min-h-[600px]">
                    <div className="text-center">
                      <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600 mb-4"></div>
                      <p className="text-gray-600">Loading passes...</p>
                    </div>
                  </div>
                ) : ordinals.length === 0 ? (
                  <div className="flex items-center justify-center min-h-[600px]">
                    <div className="text-center">
                      <p className="text-gray-600 text-lg mb-2">No passes found</p>
                      <p className="text-[#a8a8b8]/80 text-sm">
                        {collectionName ? `Collection "${collectionName}" has no ordinals yet.` : 'Passes collection not found or has no ordinals.'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="relative">
                    {/* Carousel Container */}
                    <div className="overflow-hidden">
                      <div 
                        className="flex transition-transform duration-500 ease-in-out"
                        style={{ transform: `translateX(-${currentPanel * 100}%)` }}
                      >
                        {Array.from({ length: totalPanels }).map((_, panelIndex) => {
                          const panelOrdinals = ordinals.slice(
                            panelIndex * IMAGES_PER_PANEL,
                            (panelIndex + 1) * IMAGES_PER_PANEL
                          ).filter(Boolean)

                          return (
                            <div
                              key={panelIndex}
                              className="w-full flex-shrink-0"
                            >
                              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                                {panelOrdinals.length > 0 ? (
                                  panelOrdinals.map((ordinal) => {
                                    // Use compressed image if available, otherwise fall back to original
                                    const imageUrl = ordinal.compressed_image_url && 
                                                     ordinal.compressed_image_url.trim() !== '' &&
                                                     ordinal.compressed_image_url !== ordinal.image_url
                                      ? ordinal.compressed_image_url
                                      : ordinal.image_url;
                                    
                                    return (
                                    <div
                                      key={ordinal.id}
                                      className="relative aspect-square rounded-lg overflow-hidden border-2 border-orange-200 hover:border-orange-400 transition-all group/item cursor-pointer shadow-md hover:shadow-xl"
                                    >
                                      <Image
                                        src={imageUrl}
                                        alt={`Pass #${ordinal.ordinal_number || ordinal.id}`}
                                        fill
                                        className="object-cover"
                                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                                        loading={panelIndex === currentPanel ? "eager" : "lazy"}
                                      />
                                      {ordinal.ordinal_number !== null && (
                                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2 opacity-0 group-hover/item:opacity-100 transition-opacity">
                                          <p className="text-white text-xs font-semibold text-center">
                                            #{ordinal.ordinal_number}
                                          </p>
                                        </div>
                                      )}
                                    </div>
                                    );
                                  })
                                ) : (
                                  <div className="col-span-full flex items-center justify-center min-h-[400px]">
                                    <div className="text-center">
                                      <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600 mb-2"></div>
                                      <p className="text-gray-600 text-sm">Loading panel {panelIndex + 1}...</p>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    {/* Navigation Controls */}
                    {totalPanels > 1 && (
                      <div className="flex items-center justify-center gap-4 mt-6">
                        <button
                          onClick={() => goToPanel(currentPanel === 0 ? totalPanels - 1 : currentPanel - 1)}
                          className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-semibold transition-colors"
                        >
                          ← Previous
                        </button>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-700 font-semibold">
                            Panel {currentPanel + 1} of {totalPanels}
                          </span>
                          <div className="flex gap-1">
                            {Array.from({ length: totalPanels }).map((_, idx) => (
                              <button
                                key={idx}
                                onClick={() => goToPanel(idx)}
                                className={`w-2 h-2 rounded-full transition-all ${
                                  idx === currentPanel
                                    ? 'bg-orange-500 w-8'
                                    : 'bg-gray-300 hover:bg-gray-400'
                                }`}
                                aria-label={`Go to panel ${idx + 1}`}
                              />
                            ))}
                          </div>
                        </div>
                        <button
                          onClick={() => goToPanel((currentPanel + 1) % totalPanels)}
                          className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-semibold transition-colors"
                        >
                          Next →
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            {collectionName && (
              <p className="text-center text-sm text-gray-600 mt-4">
                Collection: <span className="font-semibold">{collectionName}</span>
              </p>
            )}
          </div>
        </div>
      </div>

    </div>
  )
}

