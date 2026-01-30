'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'

interface Layer {
  id: string
  name: string
  display_order: number
  created_at: string
  updated_at: string
  collection_id: string
  collection_name: string
}

export default function CreateTraitPage() {
  const params = useParams()
  const router = useRouter()
  const [layer, setLayer] = useState<Layer | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [rarityWeight, setRarityWeight] = useState(40)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
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
      toast.error('Please upload a reference image first')
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
      if (typeof r.name === 'string' && r.name.trim()) setName(r.name)
      if (typeof r.description === 'string' && r.description.trim()) setDescription(r.description)

      toast.success('Reference image analyzed! Review the auto-filled name and description.')
    } catch (e) {
      console.error('Trait analysis failed:', e)
      toast.error('Trait analysis failed', { description: e instanceof Error ? e.message : 'Unknown error' })
    } finally {
      setAnalyzing(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!name.trim()) {
      toast.error('Trait name is required')
      return
    }

    setSaving(true)
    
    try {
      const response = await fetch(`/api/layers/${params.layerId}/traits`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          rarity_weight: rarityWeight,
        }),
      })

      if (response.ok) {
        router.push(`/collections/${params.id}/layers/${params.layerId}`)
      } else {
        const error = await response.json()
        toast.error('Error creating trait', { description: error.error })
      }
    } catch (error) {
      console.error('Error creating trait:', error)
      toast.error('Failed to create trait')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <div className="text-center py-8">
            <div className="text-white">Loading layer...</div>
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
            <div className="text-white">Layer not found</div>
            <Link href={`/collections/${params.id}`} className="text-[#9945FF] hover:text-[#14F195] mt-4 inline-block">
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
            className="text-[#9945FF] hover:text-[#14F195] mb-4 inline-block"
          >
            ← Back to Layer
          </Link>
          <h1 className="text-3xl font-bold text-white">Create New Trait</h1>
          <p className="text-white/70 mt-2">Add a trait to "{layer.name}" layer</p>
        </div>

        <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#9945FF]/30 rounded-lg p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Trait Source Tabs: Prompt vs Reference Image */}
            <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#9945FF]/30 rounded-xl overflow-hidden mb-4">
              {/* Tab Headers */}
              <div className="flex border-b border-[#9945FF]/30 bg-white/5">
                <button
                  type="button"
                  onClick={() => setTraitSourceTab('prompt')}
                  className={`flex-1 px-6 py-3 text-sm font-semibold transition-colors relative ${
                    traitSourceTab === 'prompt'
                      ? 'text-[#9945FF] bg-[#9945FF]/10'
                      : 'text-white/70 hover:text-white hover:bg-[#9945FF]/5'
                  }`}
                >
                  Prompt-Based
                  {traitSourceTab === 'prompt' && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#9945FF]"></div>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setTraitSourceTab('reference')}
                  className={`flex-1 px-6 py-3 text-sm font-semibold transition-colors relative ${
                    traitSourceTab === 'reference'
                      ? 'text-[#9945FF] bg-[#9945FF]/10'
                      : 'text-white/70 hover:text-white hover:bg-[#9945FF]/5'
                  }`}
                >
                  Reference Image
                  {traitSourceTab === 'reference' && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#9945FF]"></div>
                  )}
                </button>
              </div>

              {/* Tab Content */}
              <div className="p-6">
                {traitSourceTab === 'prompt' && (
                  <div>
                    <p className="text-sm text-white/70">
                      Enter a name and description for this trait manually. The description will be used to generate similar images.
                    </p>
                  </div>
                )}

                {traitSourceTab === 'reference' && (
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-white mb-2">Auto-fill from Reference Image</h3>
                    <p className="text-sm text-white/70 mb-4">
                      Upload a reference image and AI will analyze it to generate a trait name and description.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-4 items-start">
                      <div className="rounded-xl border border-[#9945FF]/30 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md overflow-hidden">
                        {referenceImagePreview ? (
                          <img src={referenceImagePreview} alt="Reference preview" className="w-full h-[160px] object-cover" />
                        ) : (
                          <div className="w-full h-[160px] flex items-center justify-center text-[#a8a8b8]">
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
                            className="inline-flex items-center justify-center px-4 py-2 rounded-lg font-semibold text-sm bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 disabled:text-gray-600 text-white transition-colors"
                          >
                            {analyzing ? 'Analyzing…' : 'Analyze & Auto-Fill'}
                          </button>
                        </div>
                        <p className="text-xs text-gray-600">
                          Tip: Upload a single image that represents this trait. AI will extract the name and description.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">
                Trait Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 bg-[#FDFCFA] text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                placeholder="Enter trait name"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">
                Description (Optional)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 bg-[#FDFCFA] text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                placeholder="Enter trait description"
                rows={3}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">
                Rarity Weight
              </label>
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={rarityWeight}
                  onChange={(e) => setRarityWeight(parseInt(e.target.value) || 1)}
                  className="flex-1 border border-gray-300 rounded px-3 py-2 bg-[#FDFCFA] text-gray-900 focus:border-blue-500 focus:outline-none"
                />
                <select
                  value={rarityWeight}
                  onChange={(e) => setRarityWeight(parseInt(e.target.value))}
                  className="w-40 border border-gray-300 rounded px-3 py-2 bg-[#FDFCFA] text-gray-900 focus:border-blue-500 focus:outline-none"
                >
                  <option value="40">Common (40)</option>
                  <option value="25">Rare (25)</option>
                  <option value="15">Epic (15)</option>
                  <option value="2">Legendary (2)</option>
                </select>
              </div>
              <p className="text-xs text-[#a8a8b8]/80 mt-1">
                <strong>Higher weight = More common</strong> (appears more often). Lower weight = Rarer (appears less often). 
                The system uses weighted random selection, so Common traits (40) appear much more frequently than Legendary (2).
              </p>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                disabled={saving}
                className="bg-[#9945FF] text-white px-4 py-2 rounded hover:bg-[#7C3AED] disabled:opacity-50"
              >
                {saving ? 'Creating...' : 'Create Trait'}
              </button>
              <Link
                href={`/collections/${params.id}/layers/${params.layerId}`}
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-4 py-2 rounded shadow-lg shadow-blue-500/20 transition-all duration-200"
              >
                Cancel
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
