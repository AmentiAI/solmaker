'use client'

import { useState, useEffect, useMemo } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useWallet } from '@/lib/wallet/compatibility'
import { isAuthorized } from '@/lib/auth/access-control'
import { estimateImageGenerationCost, buildFullPrompt, formatCost } from '@/lib/cost-estimation'

interface SimpleImage {
  id: string
  imageUrl: string
  prompt: string
  description: string
  createdAt: string
}

interface Collection {
  id: string
  name: string
  description?: string
  is_active: boolean
}

export default function SimpleGeneratePage() {
  const { isConnected, currentAddress } = useWallet()
  const [images, setImages] = useState<SimpleImage[]>([])
  const [description, setDescription] = useState('')
  const [borderStyle, setBorderStyle] = useState('thin decorative frame with intricate Christmas corner ornaments')
  const [artStyle, setArtStyle] = useState('professional digital illustration, cute cartoonish style')
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [currentPrompt, setCurrentPrompt] = useState('')
  const [batchCount, setBatchCount] = useState(10)
  const [generationProgress, setGenerationProgress] = useState({ current: 0, total: 0 })
  const [christmasCollectionId, setChristmasCollectionId] = useState<string | null>(null)
  const [savingImages, setSavingImages] = useState<Set<string>>(new Set())
  const [saveMessages, setSaveMessages] = useState<Record<string, string>>({})

  const authorized = isAuthorized(currentAddress)

  // Calculate cost estimation
  const costEstimation = useMemo(() => {
    if (!description.trim()) return null
    const fullPrompt = buildFullPrompt(description, borderStyle, artStyle, 0, batchCount)
    return estimateImageGenerationCost(fullPrompt, batchCount, '1024x1024', 'hd')
  }, [description, borderStyle, artStyle, batchCount])

  const borderOptions = [
    'thin decorative frame with intricate Christmas corner ornaments',
    'ornate festive frame with holly leaves, berries, and pine branches',
    'elegant Christmas frame with detailed snowflakes and icicles stretching across corners',
    'cozy holiday frame with twisted pine garlands and red ribbon corner ornaments',
    'classic Christmas frame with candy cane stripes and ornament corner details',
    'warm winter frame with gingerbread cookie decorations and frosting ornamental corners',
    'magical Christmas frame with twinkling stars and snowflake corner elements',
    'traditional holiday frame with Christmas tree shapes and gift box corner details',
    'festive frame with Santa hat decorations and reindeer corner ornaments',
    'merry Christmas frame with wreath patterns and bow corner decorations',
  ]

  // Load collections and find/create "christmas" collection
  useEffect(() => {
    if (!isConnected || !currentAddress) {
      setChristmasCollectionId(null)
      return
    }

    const loadCollections = async () => {
      try {
        const response = await fetch(`/api/collections?wallet_address=${encodeURIComponent(currentAddress)}`)
        if (response.ok) {
          const data = await response.json()
          const collections = data.collections || []
          
          // Find "christmas" collection (case-insensitive)
          const christmas = collections.find((c: Collection) => 
            c.name.toLowerCase() === 'christmas'
          )
          
          if (christmas) {
            setChristmasCollectionId(christmas.id)
          } else {
            // Create "christmas" collection
            try {
              const createResponse = await fetch('/api/collections', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  name: 'christmas',
                  description: 'Christmas collection for simple generator images',
                  traitSelections: {},
                  wallet_address: currentAddress,
                }),
              })
              
              if (createResponse.ok) {
                const newCollection = await createResponse.json()
                setChristmasCollectionId(newCollection.collection.id)
              }
            } catch (err) {
              console.error('Error creating christmas collection:', err)
            }
          }
        }
      } catch (error) {
        console.error('Error loading collections:', error)
      }
    }
    
    loadCollections()
  }, [isConnected, currentAddress])

  const handleSaveToCollection = async (image: SimpleImage) => {
    if (!christmasCollectionId) {
      setError('Christmas collection not available. Please try again.')
      return
    }

    setSavingImages((prev) => new Set(prev).add(image.id))
    setSaveMessages((prev) => ({ ...prev, [image.id]: '' }))

    try {
      const response = await fetch('/api/generate-simple/save-to-collection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          collectionId: christmasCollectionId,
          imageUrl: image.imageUrl,
          prompt: image.prompt,
          description: image.description,
          artStyle: artStyle,
          borderStyle: borderStyle,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to save image to collection')
      }

      setSaveMessages((prev) => ({
        ...prev,
        [image.id]: '✅ Saved to Christmas collection!',
      }))
      
      // Clear message after 3 seconds
      setTimeout(() => {
        setSaveMessages((prev) => {
          const newMessages = { ...prev }
          delete newMessages[image.id]
          return newMessages
        })
      }, 3000)
    } catch (err) {
      console.error('Error saving to collection:', err)
      setSaveMessages((prev) => ({
        ...prev,
        [image.id]: err instanceof Error ? err.message : 'Failed to save',
      }))
    } finally {
      setSavingImages((prev) => {
        const newSet = new Set(prev)
        newSet.delete(image.id)
        return newSet
      })
    }
  }

  const handleGenerate = async () => {
    if (!description.trim()) {
      setError('Please enter a description of what you want to generate')
      return
    }

    setIsGenerating(true)
    setError(null)
    setGenerationProgress({ current: 0, total: batchCount })

    try {
      const response = await fetch('/api/generate-simple', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          description,
          borderStyle,
          artStyle,
          batchCount,
          wallet_address: currentAddress,
        }),
      })

      if (!response.ok) {
        let errorData: any = null
        let rawText = ''
        
        try {
          // Try to get the response as text first to see what we're dealing with
          rawText = await response.text()
          
          // Log raw response for debugging
          console.log('[Generate Simple] Raw API response:', {
            status: response.status,
            statusText: response.statusText,
            rawTextLength: rawText?.length || 0,
            rawTextPreview: rawText ? rawText.substring(0, 200) : 'EMPTY',
            rawTextExact: rawText === '{}' ? 'LITERAL_EMPTY_OBJECT_STRING' : rawText
          })
          
          // Check if response body is empty or is literally just "{}"
          const trimmedText = rawText?.trim() || ''
          if (!trimmedText || trimmedText === '{}') {
            errorData = { 
              error: `HTTP ${response.status}: ${response.statusText || 'Unknown error'}`,
              note: trimmedText === '{}' ? 'Response body was empty JSON object' : 'Response body was empty'
            }
          } else {
            // Try to parse as JSON
            if (trimmedText.startsWith('{') || trimmedText.startsWith('[')) {
              try {
                const parsed = JSON.parse(trimmedText)
                // Check if parsed result is empty object or array
                if (parsed && typeof parsed === 'object') {
                  const keys = Object.keys(parsed)
                  if (keys.length === 0) {
                    // Empty object/array - create meaningful error
                    errorData = { 
                      error: `HTTP ${response.status}: ${response.statusText || 'Unknown error'}`,
                      note: 'Response body parsed to empty object/array',
                      originalRawText: trimmedText
                    }
                  } else {
                    errorData = parsed
                  }
                } else {
                  errorData = { error: trimmedText || `HTTP ${response.status}: ${response.statusText || 'Unknown error'}` }
                }
              } catch (parseError) {
                  errorData = { 
                    error: trimmedText || `HTTP ${response.status}: ${response.statusText || 'Unknown error'}`,
                    parseError: parseError instanceof Error ? parseError.message : String(parseError)
                  }
              }
            } else {
              errorData = { error: trimmedText || `HTTP ${response.status}: ${response.statusText || 'Unknown error'}` }
            }
          }
        } catch (e) {
          // If parsing fails, use the raw text or status
          errorData = { 
            error: rawText || `HTTP ${response.status}: ${response.statusText || 'Unknown error'}`,
            parseError: e instanceof Error ? e.message : String(e)
          }
        }
        
        // Final safety check - ensure errorData has at least an error property
        if (!errorData || typeof errorData !== 'object') {
          errorData = { error: `HTTP ${response.status}: ${response.statusText || 'Unknown error'}` }
        } else if (Object.keys(errorData).length === 0) {
          errorData = { error: `HTTP ${response.status}: ${response.statusText || 'Unknown error'}` }
        } else if (!errorData.error && !errorData.message && !errorData.details) {
          // Has keys but no standard error fields - add error message
          errorData = { 
            ...errorData,
            error: `HTTP ${response.status}: ${response.statusText || 'Unknown error'}`,
            originalData: errorData
          }
        }
        
        // Extract error message from various possible formats
        const message =
          (typeof errorData?.error === 'string' && errorData.error.trim()) ||
          (typeof errorData?.details === 'string' && errorData.details.trim()) ||
          (errorData?.details?.error?.message && String(errorData.details.error.message)) ||
          (errorData?.details?.message && String(errorData.details.message)) ||
          (errorData?.message && String(errorData.message)) ||
          (rawText && rawText.trim() && rawText.trim() !== '{}') ||
          `HTTP ${response.status}: ${response.statusText || 'Unknown error'}`
        
        // Log comprehensive error information with stringified version to avoid empty object display
        const errorDataString = JSON.stringify(errorData, null, 2)
        console.error('[Generate Simple] API Error:', { 
          status: response.status, 
          statusText: response.statusText,
          errorData: errorDataString !== '{}' ? errorData : { error: `HTTP ${response.status}: ${response.statusText || 'Unknown error'}` },
          errorDataStringified: errorDataString,
          rawText: rawText ? rawText.substring(0, 500) : 'Empty response body',
          rawTextLength: rawText?.length || 0,
          hasErrorData: !!errorData,
          errorDataKeys: errorData ? Object.keys(errorData) : [],
          errorDataType: typeof errorData
        })
        throw new Error(message)
      }

      const data = await response.json()
      
      // Trigger credit refresh in header after successful generation
      window.dispatchEvent(new CustomEvent('refreshCredits'))
      
      // Handle both single result (backward compatibility) and batch results
      const newImages: SimpleImage[] = []
      
      if (data.images && Array.isArray(data.images)) {
        // Batch response
        data.images.forEach((img: any, index: number) => {
          newImages.push({
            id: `simple-${Date.now()}-${index}`,
            imageUrl: img.imageUrl,
            prompt: img.prompt,
            description: description,
            createdAt: img.createdAt || new Date().toISOString(),
          })
        })
        setCurrentPrompt(data.images[0]?.prompt || '')
      } else {
        // Single result (backward compatibility)
        newImages.push({
          id: `simple-${Date.now()}`,
          imageUrl: data.imageUrl,
          prompt: data.prompt,
          description: description,
          createdAt: data.createdAt || new Date().toISOString(),
        })
        setCurrentPrompt(data.prompt)
      }

      setImages((prev) => [...newImages, ...prev])
      setGenerationProgress({ current: batchCount, total: batchCount })
      setDescription('') // Clear description after successful generation
      
      // Show success message with credit deduction info
      const creditsDeducted = newImages.length
      setSuccessMessage(
        `Successfully generated ${creditsDeducted} image${creditsDeducted > 1 ? 's' : ''}! ${creditsDeducted} credit${creditsDeducted > 1 ? 's' : ''} deducted.`
      )
      
      // Clear success message after 5 seconds
      setTimeout(() => setSuccessMessage(null), 5000)
    } catch (err) {
      console.error('Generation error:', err)
      let errorMessage = 'Failed to generate image'
      if (err instanceof Error) {
        errorMessage = err.message || errorMessage
      } else if (typeof err === 'string') {
        errorMessage = err
      } else if (err && typeof err === 'object' && 'message' in err) {
        errorMessage = String(err.message)
      }
      setError(errorMessage)
      setSuccessMessage(null) // Clear success message on error
    } finally {
      setIsGenerating(false)
      setGenerationProgress({ current: 0, total: 0 })
    }
  }

  const handleDelete = (id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id))
  }

  // Access control check
  if (!isConnected || !authorized) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center">
        <div className="text-center space-y-4 max-w-md mx-auto px-6">
          <h1 className="text-3xl font-bold text-[#EF4444]">Access Restricted</h1>
          <p className="text-white">
            This feature is only available to authorized users.
          </p>
          {!isConnected && (
            <p className="text-[#a8a8b8] text-sm">Please connect your wallet to continue.</p>
          )}
          <Link
            href="/"
            className="inline-block px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold transition-colors"
          >
            Go Home
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900">
      {/* Header */}
      <header className="border-b border-gray-800 bg-black/40 backdrop-blur-sm sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-white">Simple Image Generator</h1>
            <Link
              href="/"
              className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-semibold transition-colors"
            >
              Back to Collections
            </Link>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12">
        <div className="max-w-6xl mx-auto">
          {/* Generation Form */}
          <div className="mb-16">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Left: Generation Controls */}
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-bold text-white mb-4">Generate Unique Images</h2>
                  <p className="text-[#a8a8b8] text-sm mb-6">
                    Create unique images with edge-to-edge borders. No traits needed - just describe what you want!
                  </p>
                </div>

                <div className="space-y-4">
                  {/* Image Description */}
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">
                      Image Description *
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Describe what you want to generate... (e.g., 'A mystical crystal glowing with blue energy', 'A medieval sword with ornate handle', etc.)"
                      className="w-full h-32 p-3 border border-[#9945FF]/30 rounded-lg bg-[#14141e] text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none resize-none"
                      disabled={isGenerating}
                    />
                  </div>

                  {/* Batch Count */}
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">
                      Generate Count (1-10)
                    </label>
                    <div className="flex gap-2 mb-2">
                      {[1, 5, 10].map((count) => (
                        <button
                          key={count}
                          type="button"
                          onClick={() => setBatchCount(count)}
                          disabled={isGenerating}
                          className={`flex-1 py-2 px-4 rounded-lg font-semibold transition-colors ${
                            batchCount === count
                              ? 'bg-purple-600 text-white'
                              : 'bg-[#1a1a24] text-white hover:bg-[#1a1a24]/80'
                          }`}
                        >
                          {count}
                        </button>
                      ))}
                    </div>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={batchCount}
                      onChange={(e) => {
                        const val = Math.max(1, Math.min(10, parseInt(e.target.value) || 1))
                        setBatchCount(val)
                      }}
                      className="w-full p-3 border border-[#9945FF]/30 rounded-lg bg-[#14141e] text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none"
                      disabled={isGenerating}
                    />
                    <p className="text-xs text-[#a8a8b8]/80 mt-1">
                      Each image will be unique but follow the same art style and vibe
                    </p>
                  </div>

                  {/* Cost Estimation */}
                  {costEstimation && (
                    <div className="bg-gradient-to-r from-blue-900/30 to-purple-900/30 border border-blue-700/50 rounded-lg p-4">
                      <h3 className="text-sm font-semibold text-blue-300 mb-3 flex items-center gap-2">
                        <span>💰</span>
                        Cost Estimation
                      </h3>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between items-center">
                          <span className="text-[#a8a8b8]">Per Image:</span>
                          <span className="text-white font-mono font-semibold">{formatCost(costEstimation.perImage)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[#a8a8b8]">Total ({batchCount} image{batchCount > 1 ? 's' : ''}):</span>
                          <span className="text-green-400 font-mono font-bold text-lg">{formatCost(costEstimation.total)}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs text-[#a8a8b8]/80 pt-2 border-t border-[#9945FF]/20">
                          <span>Estimated Prompt Length:</span>
                          <span className="font-mono">{costEstimation.estimatedTokens} tokens</span>
                        </div>
                        <div className="text-xs text-[#a8a8b8]/80 pt-1">
                          <span>Model: gpt-image-1 | Size: {costEstimation.size} | Quality: {costEstimation.quality.toUpperCase()}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Art Style */}
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">
                      Art Style
                    </label>
                    <input
                      type="text"
                      value={artStyle}
                      onChange={(e) => setArtStyle(e.target.value)}
                      placeholder="Professional digital illustration style..."
                      className="w-full p-3 border border-[#9945FF]/30 rounded-lg bg-[#14141e] text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none"
                      disabled={isGenerating}
                    />
                  </div>

                  {/* Border Style */}
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">
                      Border Style
                    </label>
                    <select
                      value={borderStyle}
                      onChange={(e) => setBorderStyle(e.target.value)}
                      className="w-full p-3 border border-[#9945FF]/30 rounded-lg bg-[#14141e] text-white focus:border-purple-500 focus:outline-none"
                      disabled={isGenerating}
                    >
                      {borderOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Generate Button */}
                  <button
                    onClick={handleGenerate}
                    disabled={isGenerating || !description.trim()}
                    className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-bold py-4 px-6 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                  >
                    {isGenerating ? (
                      <span className="flex flex-col items-center justify-center gap-2">
                        <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        {generationProgress.total > 0 && (
                          <span className="text-sm">
                            Generating {generationProgress.current}/{generationProgress.total}...
                          </span>
                        )}
                      </span>
                    ) : (
                      `✨ Generate ${batchCount} Image${batchCount > 1 ? 's' : ''}`
                    )}
                  </button>

                  {error && (
                    <div className="bg-red-900/50 border border-[#EF4444]/20 text-red-200 px-4 py-3 rounded-lg">
                      {error}
                    </div>
                  )}
                  {successMessage && (
                    <div className="bg-green-900/50 border border-green-700 text-green-200 px-4 py-3 rounded-lg">
                      ✓ {successMessage}
                    </div>
                  )}
                </div>
              </div>

              {/* Right: Generation Prompt Display */}
              <div className="bg-[#1a1a24] border border-[#9945FF]/20 rounded-lg shadow-lg">
                <div className="flex items-center justify-between p-4 border-b border-[#9945FF]/20">
                  <h3 className="text-lg font-semibold text-white">Generation Prompt</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-[#a8a8b8]">
                      {currentPrompt.length.toLocaleString()} characters
                    </span>
                    {currentPrompt && (
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(currentPrompt)
                        }}
                        className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-[#9945FF] text-sm"
                      >
                        Copy
                      </button>
                    )}
                  </div>
                </div>

                <div className="p-4">
                  <textarea
                    value={currentPrompt}
                    onChange={(e) => setCurrentPrompt(e.target.value)}
                    className="w-full h-64 p-3 border border-[#9945FF]/30 rounded-md bg-[#14141e] text-gray-100 font-mono text-sm resize-none"
                    placeholder="Generation prompt will appear here after creating an image..."
                    readOnly
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Generated Images Grid */}
          {images.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-white">
                  Generated Images ({images.length})
                </h2>
                <button
                  onClick={() => setImages([])}
                  className="text-sm text-[#a8a8b8] hover:text-white"
                >
                  Clear All
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {images.map((image) => (
                  <div
                    key={image.id}
                    className="bg-[#1a1a24] border border-[#9945FF]/20 rounded-lg overflow-hidden shadow-lg"
                  >
                    <div className="relative aspect-square">
                      <Image
                        src={image.imageUrl}
                        alt={image.description}
                        fill
                        className="object-cover"
                      />
                    </div>
                    <div className="p-4">
                      <p className="text-sm text-white mb-2 line-clamp-2">
                        {image.description}
                      </p>
                      <p className="text-xs text-[#a8a8b8]/80 mb-3">
                        {new Date(image.createdAt).toLocaleString()}
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleSaveToCollection(image)}
                          disabled={!christmasCollectionId || savingImages.has(image.id)}
                          className="flex-1 text-sm bg-emerald-600 hover:bg-emerald-700 disabled:bg-[#1a1a24]/80 disabled:cursor-not-allowed text-white py-2 px-4 rounded transition-colors"
                        >
                          {savingImages.has(image.id) ? (
                            <span className="flex items-center justify-center gap-1">
                              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              Saving...
                            </span>
                          ) : (
                            '💾 Save to Christmas'
                          )}
                        </button>
                        <button
                          onClick={() => handleDelete(image.id)}
                          className="flex-1 text-sm bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                      {saveMessages[image.id] && (
                        <p className={`text-xs mt-2 ${
                          saveMessages[image.id].startsWith('✅')
                            ? 'text-[#14F195]'
                            : 'text-[#EF4444]'
                        }`}>
                          {saveMessages[image.id]}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {images.length === 0 && !isGenerating && (
            <div className="text-center py-20">
              <div className="text-6xl mb-4">🎨</div>
              <p className="text-xl text-[#a8a8b8] mb-2">No images generated yet</p>
              <p className="text-[#a8a8b8]/80">Describe what you want and generate your first image!</p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

