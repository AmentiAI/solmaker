'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useWallet } from '@/lib/wallet/compatibility'
import { useCreditCosts, calculateTraitCredits, formatCreditCost } from '@/lib/credits/use-credit-costs'

interface Layer {
  id: string
  name: string
  display_order: number
  created_at: string
  updated_at: string
  collection_id: string
  collection_name: string
}

export default function GenerateTraitPage() {
  const params = useParams()
  const router = useRouter()
  const { isConnected, currentAddress } = useWallet()
  const { costs: creditCosts } = useCreditCosts()
  const [layer, setLayer] = useState<Layer | null>(null)
  const [theme, setTheme] = useState('')
  const [quantity, setQuantity] = useState(5)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [generatedTraits, setGeneratedTraits] = useState<any[]>([])
  const [traitSourceTab, setTraitSourceTab] = useState<'prompt' | 'reference'>('prompt')
  const [referenceImage, setReferenceImage] = useState<File | null>(null)
  const [referenceImagePreview, setReferenceImagePreview] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState(false)

  useEffect(() => {
    if (params.layerId) {
      loadLayer()
    }
  }, [params.layerId])

  const loadLayer = async () => {
    try {
      const response = await fetch(`/api/layers/${params.layerId}`)
      if (response.ok) {
        const data = await response.json()
        setLayer(data.layer)
      }
    } catch (error) {
      console.error('Error loading layer:', error)
    } finally {
      setLoading(false)
    }
  }

  const analyzeReferenceImage = async () => {
    if (!referenceImage) {
      alert('Please upload a reference image first')
      return
    }
    setAnalyzing(true)
    try {
      const imageDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(new Error('Failed to read image'))
        reader.readAsDataURL(referenceImage)
      })

      const res = await fetch('/api/ai/trait-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageDataUrl,
          layerName: layer?.name,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Failed to analyze image')

      const r = data?.result || {}
      // Use the description as the theme for generating multiple similar traits
      if (typeof r.description === 'string' && r.description.trim()) {
        setTheme(r.description)
      }

      alert('Reference image analyzed! The description has been used as the generation theme. Adjust if needed.')
    } catch (e) {
      console.error('Trait analysis failed:', e)
      alert(e instanceof Error ? e.message : 'Trait analysis failed')
    } finally {
      setAnalyzing(false)
    }
  }

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!isConnected || !currentAddress) {
      alert('Please connect your wallet to generate traits')
      return
    }
    
    // Double-check wallet address is valid
    if (!currentAddress || currentAddress.trim() === '') {
      alert('Wallet address is not available. Please reconnect your wallet.')
      return
    }
    
    if (!theme.trim()) {
      alert('Please enter a theme')
      return
    }

    setGenerating(true)
    
    try {
      // Calculate credits needed from database
      const creditsNeeded = calculateTraitCredits(quantity, creditCosts.trait_generation)
      
      const response = await fetch('/api/traits/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          layer_id: params.layerId,
          theme: theme.trim(),
          quantity: quantity,
          wallet_address: currentAddress.trim(), // Ensure trimmed
        }),
      })

      if (response.ok) {
        const data = await response.json()
        const creditsNeeded = calculateTraitCredits(quantity, creditCosts.trait_generation)
        const traitsPerCredit = Math.round(1 / creditCosts.trait_generation)
        const creditsDisplay = creditsNeeded % 1 === 0 ? creditsNeeded.toFixed(0) : creditsNeeded.toFixed(2)
        setGeneratedTraits(data.traits)
        // Trigger credit refresh in header
        window.dispatchEvent(new CustomEvent('refreshCredits'))
        alert(`✅ Successfully generated ${data.count} trait${data.count > 1 ? 's' : ''}! ${creditsDisplay} credit${creditsNeeded !== 1 ? 's' : ''} deducted (1 credit = ${traitsPerCredit} traits).`)
        // Automatically redirect back to layer page after successful generation
        setTimeout(() => {
          router.push(`/collections/${params.id}/layers/${params.layerId}`)
        }, 1500)
      } else {
        const error = await response.json()
        alert(`Error generating traits: ${error.error}`)
      }
    } catch (error) {
      console.error('Error generating traits:', error)
      alert('Failed to generate traits')
    } finally {
      setGenerating(false)
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <div className="text-center py-8">
            <div className="text-gray-400">Loading layer...</div>
          </div>
        </div>
      </div>
    )
  }

  if (!layer) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <div className="text-center py-8">
            <div className="text-gray-400">Layer not found</div>
            <Link href={`/collections/${params.id}`} className="text-blue-400 hover:text-blue-300 mt-4 inline-block">
              ← Back to Collection
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <Link 
            href={`/collections/${params.id}/layers/${params.layerId}`} 
            className="text-blue-400 hover:text-blue-300 mb-4 inline-block"
          >
            ← Back to Layer
          </Link>
          <h1 className="text-3xl font-bold text-gray-100">Generate AI Traits</h1>
          <p className="text-gray-300 mt-2">Generate multiple traits for "{layer.name}" layer</p>
        </div>

        {generatedTraits.length === 0 ? (
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
            <form onSubmit={handleGenerate} className="space-y-4">
              {/* Trait Source Tabs: Prompt vs Reference Image */}
              <div className="bg-gradient-to-r from-purple-900/30 to-indigo-900/30 border border-purple-500/30 rounded-xl overflow-hidden mb-4">
                {/* Tab Headers */}
                <div className="flex border-b border-purple-500/30 bg-gray-900/50">
                  <button
                    type="button"
                    onClick={() => setTraitSourceTab('prompt')}
                    className={`flex-1 px-6 py-3 text-sm font-semibold transition-colors relative ${
                      traitSourceTab === 'prompt'
                        ? 'text-purple-300 bg-gray-800'
                        : 'text-gray-400 hover:text-gray-200 hover:bg-purple-900/20'
                    }`}
                  >
                    Prompt-Based
                    {traitSourceTab === 'prompt' && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-500"></div>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTraitSourceTab('reference')}
                    className={`flex-1 px-6 py-3 text-sm font-semibold transition-colors relative ${
                      traitSourceTab === 'reference'
                        ? 'text-purple-300 bg-gray-800'
                        : 'text-gray-400 hover:text-gray-200 hover:bg-purple-900/20'
                    }`}
                  >
                    Reference Image
                    {traitSourceTab === 'reference' && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-500"></div>
                    )}
                  </button>
                </div>

                {/* Tab Content */}
                <div className="p-6">
                  {traitSourceTab === 'prompt' && (
                    <div>
                      <p className="text-sm text-gray-300">
                        Enter a theme and AI will generate multiple trait variations based on it.
                      </p>
                    </div>
                  )}

                  {traitSourceTab === 'reference' && (
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold text-gray-100 mb-2">Auto-fill from Reference Image</h3>
                      <p className="text-sm text-gray-300 mb-4">
                        Upload a reference image and AI will analyze it to generate a theme for creating similar trait variations.
                      </p>

                      <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-4 items-start">
                        <div className="rounded-xl border border-gray-600 bg-gray-900 overflow-hidden">
                          {referenceImagePreview ? (
                            <img src={referenceImagePreview} alt="Reference preview" className="w-full h-[160px] object-cover" />
                          ) : (
                            <div className="w-full h-[160px] flex items-center justify-center text-gray-500">
                              Upload an image
                            </div>
                          )}
                        </div>

                        <div className="space-y-3">
                          <div className="flex items-center gap-3">
                            <input
                              id="referenceImageUpload"
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0] || null
                                setReferenceImage(f)
                                if (f) {
                                  const url = URL.createObjectURL(f)
                                  setReferenceImagePreview(url)
                                } else {
                                  setReferenceImagePreview(null)
                                }
                                e.currentTarget.value = ''
                              }}
                            />
                            <label
                              htmlFor="referenceImageUpload"
                              className="inline-flex items-center justify-center px-4 py-2 rounded-lg font-semibold text-sm bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer transition-colors"
                            >
                              Upload Reference
                            </label>
                            <button
                              type="button"
                              onClick={analyzeReferenceImage}
                              disabled={!referenceImage || analyzing}
                              className="inline-flex items-center justify-center px-4 py-2 rounded-lg font-semibold text-sm bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:text-gray-500 text-white transition-colors"
                            >
                              {analyzing ? 'Analyzing…' : 'Analyze & Auto-Fill'}
                            </button>
                          </div>
                          <p className="text-xs text-gray-400">
                            Tip: Upload a single image that represents the style. AI will generate a theme to create similar variations.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Theme *
                </label>
                <input
                  type="text"
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                  className="w-full border border-gray-600 rounded px-3 py-2 bg-gray-900 text-gray-100 placeholder-gray-400 focus:border-blue-500 focus:outline-none"
                  placeholder="Enter a theme (e.g., 'halloween', 'cyberpunk', 'medieval')"
                  required
                />
                <p className="text-xs text-gray-400 mt-1">
                  AI will generate {quantity} {layer.name} traits based on this theme
                </p>
                <p className="text-xs text-purple-400 mt-1 font-semibold">
                  Cost: {calculateTraitCredits(quantity, creditCosts.trait_generation)} credit{calculateTraitCredits(quantity, creditCosts.trait_generation) > 1 ? 's' : ''} ({formatCreditCost(creditCosts.trait_generation, 'trait')})
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Quantity
                </label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={quantity}
                  onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                  className="w-full border border-gray-600 rounded px-3 py-2 bg-gray-900 text-gray-100 focus:border-blue-500 focus:outline-none"
                />
                <p className="text-xs text-gray-400 mt-1">
                  How many traits to generate (1-10)
                </p>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={generating}
                  className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 disabled:opacity-50"
                >
                  {generating ? `Generating ${quantity} traits...` : `Generate ${quantity} Traits`}
                </button>
                <Link
                  href={`/collections/${params.id}/layers/${params.layerId}`}
                  className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
                >
                  Cancel
                </Link>
              </div>
            </form>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
              <h2 className="text-xl font-bold text-gray-100 mb-4">
                ✅ Generated {generatedTraits.length} Traits Successfully!
              </h2>
              
              <div className="space-y-4">
                {generatedTraits.map((trait, index) => (
                  <div key={index} className="border-b border-gray-700 pb-4 last:border-0">
                    <div className="font-semibold text-gray-100">{trait.name}</div>
                    <div className="text-gray-300 text-sm mt-1">{trait.description}</div>
                  </div>
                ))}
              </div>

              <p className="text-gray-400 text-sm mt-4">
                Redirecting back to layer page...
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
