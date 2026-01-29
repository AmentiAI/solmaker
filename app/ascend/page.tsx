'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'

interface Ordinal {
  id: string
  number: number
  imageUrl: string
  image_url?: string
  traits: Record<string, any>
  metadataUrl?: string
}

interface AscendedImage {
  id: string
  originalOrdinalId: string
  originalImageUrl: string
  transformedImageUrl: string
  transformationType: 'monster' | 'angel'
  traits: Record<string, any>
  createdAt: string
  ordinalNumber?: number
}

export default function AscendPage() {
  const [ordinals, setOrdinals] = useState<Ordinal[]>([])
  const [selectedOrdinal, setSelectedOrdinal] = useState<Ordinal | null>(null)
  const [ascendedImages, setAscendedImages] = useState<AscendedImage[]>([])
  const [isTransforming, setIsTransforming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadOrdinals()
  }, [])

  const loadOrdinals = async () => {
    try {
      const response = await fetch('/api/ordinals/list')
      if (response.ok) {
        const data = await response.json()
        const formattedOrdinals = data.ordinals.map((ord: any) => ({
          id: ord.id || ord.metadataUrl,
          number: ord.number,
          imageUrl: ord.imageUrl || ord.image_url,
          traits: ord.traits,
          metadataUrl: ord.metadataUrl,
        }))
        setOrdinals(formattedOrdinals)
        if (formattedOrdinals.length > 0 && !selectedOrdinal) {
          setSelectedOrdinal(formattedOrdinals[0])
        }
      }
    } catch (error) {
      console.error('Error loading ordinals:', error)
      setError('Failed to load ordinals')
    } finally {
      setLoading(false)
    }
  }

  const handleTransform = async (transformationType: 'monster' | 'angel') => {
    if (!selectedOrdinal) {
      setError('Please select an ordinal first')
      return
    }

    setIsTransforming(true)
    setError(null)

    try {
      const response = await fetch('/api/ascend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ordinalId: selectedOrdinal.metadataUrl || selectedOrdinal.id,
          transformationType,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to transform' }))
        throw new Error(errorData.error || 'Failed to transform ordinal')
      }

      const data = await response.json()

      const newAscendedImage: AscendedImage = {
        id: `ascend-${Date.now()}-${Math.random()}`,
        originalOrdinalId: selectedOrdinal.id,
        originalImageUrl: selectedOrdinal.imageUrl,
        transformedImageUrl: data.imageUrl,
        transformationType,
        traits: data.originalTraits || selectedOrdinal.traits,
        createdAt: new Date().toISOString(),
        ordinalNumber: selectedOrdinal.number,
      }

      setAscendedImages((prev) => [newAscendedImage, ...prev])
    } catch (err) {
      console.error('Transformation error:', err)
      setError(err instanceof Error ? err.message : 'Failed to transform ordinal')
    } finally {
      setIsTransforming(false)
    }
  }

  const handleDelete = (id: string) => {
    setAscendedImages((prev) => prev.filter((img) => img.id !== id))
  }

  const handleDownload = async (imageUrl: string, transformationType: 'monster' | 'angel', ordinalNumber?: number) => {
    try {
      // Fetch the full-size image
      const response = await fetch(imageUrl)
      const blob = await response.blob()
      
      // Create a download link
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `ascended-${transformationType}-${ordinalNumber || Date.now()}.png`
      document.body.appendChild(link)
      link.click()
      
      // Cleanup
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Error downloading image:', error)
      setError('Failed to download image')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-950 via-black to-red-950 flex items-center justify-center">
        <div className="text-purple-400 text-xl">Loading ordinals...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-950 via-black to-red-950">
      {/* Header */}
      <header className="border-b border-purple-900/50 bg-black/40 backdrop-blur-sm sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-purple-400">✨ Ascend Your Ordinal</h1>
            <Link
              href="/"
              className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-semibold transition-colors"
            >
              Back to Home
            </Link>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12">
        <div className="max-w-6xl mx-auto">
          {/* Selection and Transformation Section */}
          <div className="mb-16">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Left: Ordinal Selection */}
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-bold text-white mb-4">Select an Ordinal</h2>
                  <p className="text-gray-400 text-sm mb-6">
                    Choose an ordinal to transform into a monster or angel while keeping the same traits!
                  </p>
                </div>

                {/* Ordinal Selector */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Select Ordinal
                  </label>
                  <select
                    value={selectedOrdinal?.id || ''}
                    onChange={(e) => {
                      const ordinal = ordinals.find((o) => o.id === e.target.value)
                      setSelectedOrdinal(ordinal || null)
                    }}
                    className="w-full p-3 border border-gray-600 rounded-lg bg-gray-900 text-white focus:border-purple-500 focus:outline-none"
                    disabled={isTransforming}
                  >
                    {ordinals.map((ordinal) => (
                      <option key={ordinal.id} value={ordinal.id}>
                        Ordinal #{ordinal.number}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Selected Ordinal Preview */}
                {selectedOrdinal && (
                  <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
                    <div className="relative aspect-square">
                      <Image
                        src={selectedOrdinal.imageUrl}
                        alt={`Ordinal #${selectedOrdinal.number}`}
                        fill
                        className="object-cover"
                      />
                    </div>
                    <div className="p-4">
                      <h3 className="text-white font-semibold mb-2">
                        Ordinal #{selectedOrdinal.number}
                      </h3>
                    </div>
                  </div>
                )}

                {/* Transformation Buttons */}
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => handleTransform('monster')}
                    disabled={!selectedOrdinal || isTransforming}
                    className="bg-gradient-to-r from-red-600 to-red-800 hover:from-red-700 hover:to-red-900 text-white font-bold py-4 px-6 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg border-2 border-red-500"
                  >
                    {isTransforming ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Transforming...
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        👹 Turn into Monster
                      </span>
                    )}
                  </button>

                  <button
                    onClick={() => handleTransform('angel')}
                    disabled={!selectedOrdinal || isTransforming}
                    className="bg-gradient-to-r from-yellow-400 to-yellow-600 hover:from-yellow-500 hover:to-yellow-700 text-black font-bold py-4 px-6 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg border-2 border-yellow-300"
                  >
                    {isTransforming ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Transforming...
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        😇 Turn into Angel
                      </span>
                    )}
                  </button>
                </div>

                {error && (
                  <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded-lg">
                    {error}
                  </div>
                )}
              </div>

              {/* Right: Instructions */}
              <div className="bg-gradient-to-br from-purple-900/50 to-red-900/50 border border-purple-700/50 rounded-lg p-6">
                <h3 className="text-xl font-bold text-white mb-4">✨ Ascension Guide</h3>
                <div className="space-y-4 text-gray-300">
                  <div>
                    <h4 className="text-purple-400 font-semibold mb-2">👹 Monster Transformation</h4>
                    <p className="text-sm">
                      Transform your ordinal into a terrifying monster while preserving all original traits. 
                      Adds demonic features, dark energy, and menacing appearance.
                    </p>
                  </div>
                  <div>
                    <h4 className="text-yellow-400 font-semibold mb-2">😇 Angel Transformation</h4>
                    <p className="text-sm">
                      Transform your ordinal into a divine angel while preserving all original traits. 
                      Adds angelic wings, divine halo, and heavenly glow.
                    </p>
                  </div>
                  <div className="pt-4 border-t border-purple-700/50">
                    <p className="text-sm text-purple-300">
                      <strong>Note:</strong> All traits (background, accessories, eyes, mouth, headwear, outfits, props) 
                      remain exactly the same - only the visual style changes!
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Ascended Images Grid */}
          {ascendedImages.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-white">
                  Ascended Images ({ascendedImages.length})
                </h2>
                <button
                  onClick={() => setAscendedImages([])}
                  className="text-sm text-gray-400 hover:text-white"
                >
                  Clear All
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {ascendedImages.map((image) => (
                  <div
                    key={image.id}
                    className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden shadow-lg"
                  >
                    <div className="grid grid-cols-2 gap-2 p-2">
                      <div className="relative aspect-square">
                        <Image
                          src={image.originalImageUrl}
                          alt="Original"
                          fill
                          className="object-cover rounded"
                        />
                        <div className="absolute top-1 left-1 bg-black/70 text-white text-xs px-1 rounded">
                          Original
                        </div>
                      </div>
                      <div className="relative aspect-square">
                        <Image
                          src={image.transformedImageUrl}
                          alt={image.transformationType}
                          fill
                          className="object-cover rounded"
                        />
                        <div className={`absolute top-1 left-1 px-1 rounded text-xs font-bold ${
                          image.transformationType === 'monster' 
                            ? 'bg-red-900/70 text-red-200' 
                            : 'bg-yellow-900/70 text-yellow-200'
                        }`}>
                          {image.transformationType === 'monster' ? '👹 Monster' : '😇 Angel'}
                        </div>
                      </div>
                    </div>
                    <div className="p-4">
                      <p className="text-xs text-gray-500 mb-3">
                        {new Date(image.createdAt).toLocaleString()}
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => handleDownload(image.transformedImageUrl, image.transformationType, image.ordinalNumber)}
                          className="text-sm bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white py-2 px-3 rounded transition-colors flex items-center justify-center gap-1"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                          Download
                        </button>
                        <button
                          onClick={() => handleDelete(image.id)}
                          className="text-sm bg-red-600 hover:bg-red-700 text-white py-2 px-3 rounded transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {ascendedImages.length === 0 && !isTransforming && (
            <div className="text-center py-20">
              <div className="text-6xl mb-4">✨</div>
              <p className="text-xl text-gray-400 mb-2">No ascended images yet</p>
              <p className="text-gray-500">Select an ordinal and transform it into a monster or angel!</p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

