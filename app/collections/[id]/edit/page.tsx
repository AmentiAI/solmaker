'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { ART_STYLES, getArtStylePreviewImage } from '@/lib/art-styles'
import { useArtStyleExamples } from '@/lib/art-styles-client'
import WireframeEditor, { type WireframeConfig } from '@/app/components/WireframeEditor'
import { useWallet } from '@/lib/wallet/compatibility'
import { generateApiAuth } from '@/lib/wallet/api-auth'

interface Collection {
  id: string
  name: string
  description?: string
  art_style?: string
  border_requirements?: string
  custom_rules?: string
  colors_description?: string
  lighting_description?: string
  is_pfp_collection?: boolean
  facing_direction?: string
  body_style?: string
  use_hyper_detailed?: boolean
  pixel_perfect?: boolean
  is_active: boolean
  created_at: string
  updated_at: string
  wallet_address?: string
}

export default function EditCollectionPage() {
  const params = useParams()
  const router = useRouter()
  const { currentAddress, isConnected, signMessage } = useWallet()
  const [accessDenied, setAccessDenied] = useState(false)
  
  // Fetch real collection examples for art styles
  const { examples: artStyleExamples } = useArtStyleExamples()
  
  const [collection, setCollection] = useState<Collection | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [artStyle, setArtStyle] = useState('')
  const [selectedArtStyleId, setSelectedArtStyleId] = useState<string>('custom')
  const [borderRequirements, setBorderRequirements] = useState('')
  const [customRules, setCustomRules] = useState('')
  const [colorsDescription, setColorsDescription] = useState('')
  const [lightingDescription, setLightingDescription] = useState('')
  const [generatingAuto, setGeneratingAuto] = useState<string | null>(null)
  const [isPfpCollection, setIsPfpCollection] = useState(false)
  const [facingDirection, setFacingDirection] = useState('front')
  const [bodyStyle, setBodyStyle] = useState<'full' | 'half' | 'headonly'>('full')
  const [pixelPerfect, setPixelPerfect] = useState(false)
  const [wireframeConfig, setWireframeConfig] = useState<WireframeConfig | null>(null)
  const [hoveredArtStyle, setHoveredArtStyle] = useState<string | null>(null)
  const [artStyleDropdownOpen, setArtStyleDropdownOpen] = useState(false)
  const [showInstructions, setShowInstructions] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'general' | 'settings' | 'color' | 'lighting' | 'pfp'>('general')
  const [imageSourceTab, setImageSourceTab] = useState<'prompt' | 'reference'>('prompt')
  const [futureImage, setFutureImage] = useState<File | null>(null)
  const [futureImagePreview, setFutureImagePreview] = useState<string | null>(null)
  const [futureAnalyzing, setFutureAnalyzing] = useState(false)
  const [analyzingStep, setAnalyzingStep] = useState<string>('')
  const [referenceType, setReferenceType] = useState<'pfp' | 'artwork' | null>(null)
  const [generateCharacterPrompt, setGenerateCharacterPrompt] = useState(false)

  useEffect(() => {
    if (params.id && currentAddress) {
      loadCollection()
    }
  }, [params.id, currentAddress])

  const loadCollection = async () => {
    if (!currentAddress) {
      setLoading(false)
      return
    }
    try {
      const response = await fetch(`/api/collections/${params.id}?wallet_address=${encodeURIComponent(currentAddress)}`)
      if (response.status === 403) {
        setAccessDenied(true)
        setLoading(false)
        return
      }
      if (response.ok) {
        const data = await response.json()
        setCollection(data.collection)
        setAccessDenied(false)
        setName(data.collection.name)
        setDescription(data.collection.description || '')
        setArtStyle(data.collection.art_style || '')
        // Try to match art style to a preset
        const matchedStyle = ART_STYLES.find(s => s.promptStyle === data.collection.art_style)
        setSelectedArtStyleId(matchedStyle?.id || 'custom')
        setBorderRequirements(data.collection.border_requirements || '')
        setCustomRules(data.collection.custom_rules || '')
        setColorsDescription(data.collection.colors_description || '')
        setLightingDescription(data.collection.lighting_description || '')
        setIsPfpCollection(data.collection.is_pfp_collection ?? false)
        setFacingDirection(data.collection.facing_direction || 'front')
        setBodyStyle(data.collection.body_style || 'full')
        setPixelPerfect(data.collection.pixel_perfect ?? false)
        // Load wireframe config if it exists
        if (data.collection.wireframe_config) {
          setWireframeConfig(data.collection.wireframe_config as WireframeConfig)
        } else {
          setWireframeConfig(null)
        }
      }
    } catch (error) {
      console.error('Error loading collection:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAutoGenerate = async (fieldType: string, setter: (value: string) => void) => {
    setGeneratingAuto(fieldType)
    try {
      const response = await fetch('/api/collections/auto-generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fieldType,
          collectionName: name,
          collectionDescription: description,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        setter(data.selected)
      } else {
        const error = await response.json()
        toast.error('Error generating options', { description: error.error })
      }
    } catch (error) {
      console.error('Error generating auto options:', error)
      toast.error('Failed to generate options')
    } finally {
      setGeneratingAuto(null)
    }
  }

  const analyzeFutureImage = async () => {
    if (!futureImage) {
      toast.error('Please upload a reference image first')
      return
    }
    if (!referenceType) {
      toast.error('Please select if this is a PFP or Artwork reference')
      return
    }
    setFutureAnalyzing(true)
    setAnalyzingStep('Reading image...')
    try {
      const imageDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(new Error('Failed to read image'))
        reader.readAsDataURL(futureImage)
      })

      // Always analyze for collection settings
      setAnalyzingStep('Analyzing collection settings...')
      const res = await fetch('/api/ai/future-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageDataUrl,
          collectionName: name.trim() || undefined,
          referenceType,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Failed to analyze image')

      const r = data?.result || {}
      // Store the art style from future-analyze first (we'll append to it if character prompt is enabled)
      let baseArtStyle = ''
      if (typeof r.art_style_id === 'string') {
        setSelectedArtStyleId(r.art_style_id)
        if (r.art_style_id === 'custom' && typeof r.custom_art_style === 'string') {
          baseArtStyle = r.custom_art_style
          setArtStyle(baseArtStyle)
        } else if (r.art_style_id !== 'custom') {
          // Get the preset art style prompt
          const presetStyle = ART_STYLES.find(s => s.id === r.art_style_id)
          if (presetStyle) {
            baseArtStyle = presetStyle.promptStyle
            setArtStyle(baseArtStyle)
          }
        }
      }
      if (typeof r.is_pfp_collection === 'boolean') setIsPfpCollection(r.is_pfp_collection)
      if (typeof r.facing_direction === 'string') setFacingDirection(r.facing_direction)
      if (typeof r.body_style === 'string') setBodyStyle(r.body_style)
      if (typeof r.border_requirements === 'string') setBorderRequirements(r.border_requirements)
      if (typeof r.custom_rules === 'string') setCustomRules(r.custom_rules)

      // Handle PFP vs Artwork differently
      if (referenceType === 'pfp') {
        // For PFP: Generate basic character description, or full character prompt if checkbox is checked
        if (generateCharacterPrompt) {
          // Full character prompt with colors and lighting
          setAnalyzingStep('Generating detailed character description...')
          const charRes = await fetch('/api/ai/generate-character-prompt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imageDataUrl,
              collectionName: name.trim() || undefined,
            }),
          })
          const charData = await charRes.json()
          if (!charRes.ok) {
            console.error('Character prompt generation failed:', charData?.error)
            toast.error('Character prompt generation failed', { description: charData?.error || 'Unknown error' })
            // Fall back to basic description from future-analyze
            if (typeof r.description === 'string' && r.description.trim()) setDescription(r.description)
          } else {
            const charResult = charData?.result || {}
            // Append comprehensive character description (including background) to the art style custom field
            if (typeof charResult.description === 'string' && charResult.description.trim()) {
              setSelectedArtStyleId('custom')
              // Build the full character prompt including background if available
              let characterPrompt = charResult.description
              if (typeof charResult.background_description === 'string' && charResult.background_description.trim()) {
                characterPrompt = `${characterPrompt}\n\nBackground: ${charResult.background_description}`
              }
              // Combine base art style with character description (including background)
              const combinedArtStyle = baseArtStyle 
                ? `${baseArtStyle}\n\n${characterPrompt}`
                : characterPrompt
              setArtStyle(combinedArtStyle)
            }
            // Set colors and lighting from character prompt
            if (typeof charResult.colors_description === 'string' && charResult.colors_description.trim()) {
              setColorsDescription(charResult.colors_description)
            }
            if (typeof charResult.lighting_description === 'string' && charResult.lighting_description.trim()) {
              setLightingDescription(charResult.lighting_description)
            }
          }
        } else {
          // Basic character description from future-analyze
          if (typeof r.description === 'string' && r.description.trim()) {
            setDescription(r.description)
          }
          // Don't set colors/lighting for basic PFP mode
        }
      } else {
        // For Artwork: Use standard description and settings
        if (typeof r.description === 'string' && r.description.trim()) setDescription(r.description)
        if (typeof r.colors_description === 'string') setColorsDescription(r.colors_description)
        if (typeof r.lighting_description === 'string') setLightingDescription(r.lighting_description)
      }

      setAnalyzingStep('')
      toast.success('Analysis applied! Review the settings and save your changes.')
    } catch (e) {
      console.error('Future analyze failed:', e)
      toast.error('Future analyze failed', { description: e instanceof Error ? e.message : 'Unknown error' })
      setAnalyzingStep('')
    } finally {
      setFutureAnalyzing(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!name.trim()) {
      toast.error('Collection name is required')
      return
    }

    if (!currentAddress) {
      toast.error('Wallet address required. Please connect your wallet.')
      return
    }

    setSaving(true)
    
    try {
      // Generate signed authentication
      const auth = await generateApiAuth(currentAddress, signMessage)
      if (!auth) {
        toast.error('Signature required for this operation. Please sign the request with your wallet.')
        setSaving(false)
        return
      }

      const response = await fetch(`/api/collections/${params.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...auth,
          name: name.trim(),
          description: description.trim() || null,
          art_style: artStyle.trim() || null,
          border_requirements: borderRequirements.trim() || null,
          custom_rules: customRules.trim() || null,
          colors_description: colorsDescription.trim() || null,
          lighting_description: lightingDescription.trim() || null,
          is_pfp_collection: isPfpCollection,
          facing_direction: isPfpCollection ? facingDirection : null,
          body_style: isPfpCollection ? bodyStyle : null,
          pixel_perfect: pixelPerfect,
          wireframe_config: wireframeConfig,
        }),
      })

      if (response.ok) {
        router.push(`/collections/${params.id}`)
      } else {
        const error = await response.json()
        toast.error('Error updating collection', { description: error.error })
      }
    } catch (error) {
      console.error('Error updating collection:', error)
      toast.error('Failed to update collection')
    } finally {
      setSaving(false)
    }
  }

  // Not connected - show connect prompt
  if (!isConnected || !currentAddress) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto text-center py-12">
          <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border-2 border-[#DC1FFF]/50 rounded-xl p-8">
            <div className="text-6xl mb-4">🔐</div>
            <h2 className="text-2xl font-bold text-white mb-4">Wallet Connection Required</h2>
            <p className="text-[#a8a8b8] mb-6">
              Please connect your wallet to edit collections.
            </p>
            <Link href="/collections" className="px-6 py-3 bg-[#9945FF] hover:bg-[#14F195] text-white rounded-lg font-semibold transition-colors inline-block shadow-lg shadow-[#9945FF]/20">
              Go to Collections
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <div className="text-center py-8">
            <div className="text-[#a8a8b8]">Loading collection...</div>
          </div>
        </div>
      </div>
    )
  }

  // Access denied
  if (accessDenied) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto text-center py-12">
          <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border-2 border-[#EF4444]/50 rounded-xl p-8">
            <div className="text-6xl mb-4">🚫</div>
            <h2 className="text-2xl font-bold text-white mb-4">Access Denied</h2>
            <p className="text-[#a8a8b8] mb-6">
              You don't have permission to edit this collection. Only the collection owner or authorized collaborators can edit collections.
            </p>
            <Link href="/collections" className="px-6 py-3 bg-[#9945FF] hover:bg-[#14F195] text-white rounded-lg font-semibold transition-colors inline-block shadow-lg shadow-[#9945FF]/20">
              Go to Collections
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (!collection) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <div className="text-center py-8">
            <div className="text-[#a8a8b8]">Collection not found</div>
            <Link href="/collections" className="text-[#9945FF] hover:text-[#14F195] mt-4 inline-block transition-colors">
              ← Back to Collections
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <Link 
            href={`/collections/${collection.id}`} 
            className="text-[#9945FF] hover:text-[#14F195] mb-4 inline-block transition-colors"
          >
            ← Back to Collection
          </Link>
          <h1 className="text-3xl font-bold text-white">Edit Collection</h1>
        </div>

        {/* Instructions - Collapsible */}
        <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#9945FF]/30 rounded-lg mb-6 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowInstructions(!showInstructions)}
            className="w-full flex items-center justify-between p-4 hover:bg-[#9945FF]/10 transition-colors"
          >
            <h3 className="text-sm font-bold text-[#9945FF] flex items-center gap-2">
              <span className="text-lg">💡</span> How to Edit Your Collection
            </h3>
            <svg
              className={`w-5 h-5 text-[#9945FF] transition-transform duration-200 ${showInstructions ? 'transform rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showInstructions && (
            <div className="px-4 pb-4">
              <ul className="text-sm text-[#a8a8b8] space-y-1.5 ml-6 list-disc">
                <li><strong>Collection Name & Description:</strong> Basic info about your collection. Name is required, description is optional.</li>
                <li><strong>Art Style:</strong> Describe the visual style you want (e.g., "pixel art", "anime style", "realistic 3D"). Use the "Auto" button to have AI generate suggestions based on your collection name/description.</li>
                <li><strong>Optional Fields:</strong> All fields except name are optional. Empty fields won't be included in the generation prompt, giving you more control.</li>
                <li><strong>Custom Rules:</strong> Add specific requirements like "always include shadows" or "use warm colors only". These rules will be applied to all generations.</li>
                <li><strong>PFP Collections:</strong> Check this if your collection is for profile pictures. This enables pose/facing direction and body visibility settings.</li>
                <li><strong>Compression Settings:</strong> Configure image compression settings from the Compression tab on the collection detail page.</li>
                <li><strong>Collaboration:</strong> Invite team members from the collection detail page. They can help add layers, traits, and generate ordinals.</li>
              </ul>
            </div>
          )}
        </div>

        <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#9945FF]/30 rounded-lg p-6">
          {/* Tabs */}
          <div className="flex border-b border-[#9945FF]/30 mb-6 -mx-6 px-6">
            <button
              type="button"
              onClick={() => setActiveTab('general')}
              className={`px-4 py-3 text-sm font-semibold transition-colors relative ${
                activeTab === 'general'
                  ? 'text-[#9945FF] border-b-2 border-[#9945FF] -mb-[1px]'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              General
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className={`px-4 py-3 text-sm font-semibold transition-colors relative ${
                activeTab === 'settings'
                  ? 'text-[#9945FF] border-b-2 border-[#9945FF] -mb-[1px]'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              Settings
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('color')}
              className={`px-4 py-3 text-sm font-semibold transition-colors relative ${
                activeTab === 'color'
                  ? 'text-[#9945FF] border-b-2 border-[#9945FF] -mb-[1px]'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              Color
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('lighting')}
              className={`px-4 py-3 text-sm font-semibold transition-colors relative ${
                activeTab === 'lighting'
                  ? 'text-[#9945FF] border-b-2 border-[#9945FF] -mb-[1px]'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              Lighting
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('pfp')}
              className={`px-4 py-3 text-sm font-semibold transition-colors relative ${
                activeTab === 'pfp'
                  ? 'text-[#9945FF] border-b-2 border-[#9945FF] -mb-[1px]'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              PFP
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* General Tab */}
            {activeTab === 'general' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Collection Name *
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full border border-[#9945FF]/30 rounded px-3 py-2 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md text-white placeholder-white/50 focus:border-[#9945FF] focus:outline-none focus:ring-2 focus:ring-[#9945FF]/20"
                    placeholder="Enter collection name"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Description (Optional)
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full border border-[#9945FF]/30 rounded px-3 py-2 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md text-white placeholder-white/50 focus:border-[#9945FF] focus:outline-none focus:ring-2 focus:ring-[#9945FF]/20"
                    placeholder="Enter collection description"
                    rows={3}
                  />
                </div>

                {/* Image Source Tabs: Prompt Image vs Reference Image */}
                <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#9945FF]/30 rounded-xl overflow-hidden">
                  {/* Tab Headers */}
                  <div className="flex border-b border-[#9945FF]/30 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md">
                    <button
                      type="button"
                      onClick={() => setImageSourceTab('prompt')}
                      className={`flex-1 px-3 sm:px-6 py-2.5 sm:py-3 text-xs sm:text-sm font-semibold transition-colors relative ${
                        imageSourceTab === 'prompt'
                          ? 'text-[#9945FF] bg-[#9945FF]/10'
                          : 'text-white/70 hover:text-white hover:bg-[#9945FF]/5'
                      }`}
                    >
                      <span className="hidden sm:inline">Prompt Image</span>
                      <span className="sm:hidden">Prompt</span>
                      {imageSourceTab === 'prompt' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#9945FF]"></div>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setImageSourceTab('reference')}
                      className={`flex-1 px-3 sm:px-6 py-2.5 sm:py-3 text-xs sm:text-sm font-semibold transition-colors relative ${
                        imageSourceTab === 'reference'
                          ? 'text-[#9945FF] bg-[#9945FF]/10'
                          : 'text-white/70 hover:text-white hover:bg-[#9945FF]/5'
                      }`}
                    >
                      <span className="hidden sm:inline">Reference Image</span>
                      <span className="sm:hidden">Reference</span>
                      {imageSourceTab === 'reference' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-600"></div>
                      )}
                    </button>
                  </div>

                  {/* Tab Content */}
                  <div className="p-4 sm:p-6">
                    {imageSourceTab === 'prompt' && (
                      <div className="space-y-3 sm:space-y-4">
                        <p className="text-xs sm:text-sm text-white/70">
                          Configure your art style settings manually below.
                        </p>
                      </div>
                    )}

                    {imageSourceTab === 'reference' && (
                      <div className="space-y-3 sm:space-y-4">
                        <h3 className="text-base sm:text-lg font-semibold text-white mb-2">Auto-fill from Reference Image</h3>
                        <p className="text-xs sm:text-sm text-white/70 mb-3 sm:mb-4 break-words">
                          Upload a reference image and we'll analyze the art style + vibe, then auto-fill all creation settings.
                        </p>

                        <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] md:grid-cols-[220px_1fr] gap-4 items-start">
                          <div className="rounded-xl border border-[#9945FF]/30 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md overflow-hidden">
                            {futureImagePreview ? (
                              <img src={futureImagePreview} alt="Reference preview" className="w-full h-[160px] object-cover" />
                            ) : (
                              <div className="w-full h-[160px] flex items-center justify-center text-white/50">
                                Upload an image
                              </div>
                            )}
                          </div>

                          <div className="space-y-3">
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
                              <input
                                id="futureImageUpload"
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const f = e.target.files?.[0] || null
                                  setFutureImage(f)
                                  if (f) {
                                    const url = URL.createObjectURL(f)
                                    setFutureImagePreview(url)
                                  } else {
                                    setFutureImagePreview(null)
                                  }
                                  // Reset reference type when new image is uploaded
                                  setReferenceType(null)
                                  setGenerateCharacterPrompt(false)
                                  e.currentTarget.value = ''
                                }}
                              />
                              <label
                                htmlFor="futureImageUpload"
                                className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg font-semibold text-sm bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer transition-colors"
                              >
                                Upload Reference
                              </label>
                              <button
                                type="button"
                                onClick={analyzeFutureImage}
                                disabled={!futureImage || !referenceType || futureAnalyzing}
                                className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg font-semibold text-sm bg-[#e27d0f] hover:bg-[#c96a0a] disabled:bg-white/10 disabled:text-white/50 text-white transition-colors"
                              >
                                {futureAnalyzing ? (
                                  <span className="flex items-center gap-2">
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    {analyzingStep || 'Analyzing...'}
                                  </span>
                                ) : (
                                  'Analyze & Auto-Fill'
                                )}
                              </button>
                            </div>

                            {/* Reference Type Selection - Only show when image is uploaded */}
                            {futureImage && !referenceType && (
                              <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#9945FF]/30 rounded-lg p-3 space-y-2">
                                <p className="text-sm font-semibold text-white mb-2">What type of reference is this?</p>
                                <div className="flex flex-col sm:flex-row gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setReferenceType('pfp')}
                                    className="flex-1 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium text-sm transition-colors"
                                  >
                                    🎭 PFP (Profile Picture)
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setReferenceType('artwork')}
                                    className="flex-1 px-4 py-2.5 bg-[#9945FF] hover:bg-[#7C3AED] text-white rounded-lg font-medium text-sm transition-colors"
                                  >
                                    🎨 Artwork
                                  </button>
                                </div>
                                <p className="text-xs text-[#a8a8b8]/80 mt-1">
                                  PFP: Character-focused images for profile pictures. Artwork: General artwork style reference.
                                </p>
                              </div>
                            )}

                            {/* Character Prompt Checkbox - Only show when PFP is selected */}
                            {referenceType === 'pfp' && (
                              <div className="flex items-start gap-2 pt-2 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#9945FF]/30 rounded-lg p-3">
                                <input
                                  type="checkbox"
                                  id="generateCharacterPrompt"
                                  checked={generateCharacterPrompt}
                                  onChange={(e) => setGenerateCharacterPrompt(e.target.checked)}
                                  className="w-4 h-4 mt-0.5 text-[#9945FF] border-[#9945FF]/30 rounded focus:ring-[#9945FF] bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md flex-shrink-0"
                                />
                                <label htmlFor="generateCharacterPrompt" className="text-xs sm:text-sm text-[#a8a8b8] cursor-pointer">
                                  <span className="font-semibold text-white">Generate hardcoded character & trait description prompt</span>
                                  <br />
                                  <span className="text-[#a8a8b8]/80">
                                    This will create a detailed prompt describing the character's features, gender, expressions, colors, lighting, and background. The prompt will fill in the description, colors, and lighting fields.
                                  </span>
                                </label>
                              </div>
                            )}

                            {referenceType && (
                              <div className="text-xs text-[#a8a8b8]/80">
                                <p className="font-medium mb-1">
                                  {referenceType === 'pfp' 
                                    ? '🎭 PFP Mode: Will analyze character features and generate basic character description.'
                                    : '🎨 Artwork Mode: Will analyze art style and composition settings.'}
                                </p>
                                {referenceType === 'pfp' && generateCharacterPrompt && (
                                  <p className="text-[#9945FF] mt-1">
                                    ✨ Enhanced mode: Will generate comprehensive character & trait description with colors and lighting.
                                  </p>
                                )}
                              </div>
                            )}

                            <p className="text-[10px] sm:text-xs text-[#a8a8b8]/80 break-words">
                              Tip: Use a single, representative image (same style you want for the collection). You can edit any fields after it fills.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Art Style Section - Compact horizontal layout with hover preview */}
            <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#9945FF]/30 rounded-lg p-4">
              <div className="flex items-start gap-4">
                {/* Preview Image - Larger thumbnail with hover support */}
                <div className="flex-shrink-0">
                  <div className="relative w-[160px] h-[160px] rounded-lg overflow-hidden border-2 border-[#9945FF]/30 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md shadow-inner">
                    {(() => {
                      const displayStyle = artStyleDropdownOpen && hoveredArtStyle ? hoveredArtStyle : selectedArtStyleId
                      return displayStyle !== 'custom' ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={getArtStylePreviewImage(displayStyle, artStyleExamples)}
                          alt={`${displayStyle} style preview`}
                          className="absolute inset-0 w-full h-full object-cover transition-opacity duration-200"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement
                            // Fallback to static image on error
                            target.src = ART_STYLES.find(s => s.id === displayStyle)?.previewImage || '/art-styles/chibi.png'
                          }}
                        />
                      ) : (
                        <div className="flex items-center justify-center w-full h-full text-white/50 text-sm text-center">
                          Custom
                        </div>
                      )
                    })()}
                  </div>
                </div>

                {/* Dropdown and controls */}
                <div className="flex-1 min-w-0 relative">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-sm font-semibold text-white">Art Style</label>
                    <button
                      type="button"
                      onClick={() => handleAutoGenerate('art_style', setArtStyle)}
                      disabled={generatingAuto === 'art_style'}
                      className="text-xs bg-[#9945FF] hover:bg-[#7C3AED] disabled:bg-gray-600 text-white px-2 py-0.5 rounded transition-colors"
                    >
                      {generatingAuto === 'art_style' ? '...' : 'Auto'}
                    </button>
                  </div>

                  {/* Custom Dropdown Button */}
                  <button
                    type="button"
                    onClick={() => setArtStyleDropdownOpen(!artStyleDropdownOpen)}
                    onBlur={() => setTimeout(() => setArtStyleDropdownOpen(false), 200)}
                    className="w-full border border-[#9945FF]/30 rounded px-3 py-1.5 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md text-white text-sm focus:border-[#9945FF] focus:outline-none text-left flex items-center justify-between hover:bg-white/10 transition-colors"
                  >
                    <span>{ART_STYLES.find(s => s.id === selectedArtStyleId)?.name || 'Select style'}</span>
                    <svg
                      className={`w-4 h-4 transition-transform ${artStyleDropdownOpen ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* Custom Dropdown Menu */}
                  {artStyleDropdownOpen && (
                    <div className="absolute z-[9999] w-full mt-1 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#9945FF]/30 rounded-lg shadow-lg max-h-60 overflow-y-auto bg-[#0a0e27]">
                      {ART_STYLES.map(style => (
                        <button
                          key={style.id}
                          type="button"
                          onClick={() => {
                            setSelectedArtStyleId(style.id)
                            if (style.id !== 'custom') {
                              setArtStyle(style.promptStyle)
                            }
                            setArtStyleDropdownOpen(false)
                            setHoveredArtStyle(null)
                          }}
                          onMouseEnter={() => setHoveredArtStyle(style.id)}
                          onMouseLeave={() => setHoveredArtStyle(null)}
                          className={`w-full text-left px-3 py-0.5 text-sm transition-colors ${
                            selectedArtStyleId === style.id
                              ? 'bg-green-100 text-green-900 font-medium'
                              : 'hover:bg-white/10 text-white'
                          }`}
                        >
                          {style.name}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Art Style Prompt Textarea - Always visible */}
                  <textarea
                    value={artStyle}
                    onChange={(e) => {
                      setArtStyle(e.target.value)
                      if (selectedArtStyleId !== 'custom') {
                        const matchedStyle = ART_STYLES.find(s => s.promptStyle === e.target.value)
                        if (!matchedStyle) {
                          setSelectedArtStyleId('custom')
                        }
                      }
                    }}
                    className="w-full mt-2 border border-[#9945FF]/30 rounded px-3 py-2 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md text-white placeholder-white/50 text-sm focus:border-[#9945FF] focus:outline-none focus:ring-2 focus:ring-[#9945FF]/20"
                    placeholder="Describe the art style..."
                    rows={2}
                  />
                </div>
              </div>
            </div>
              </>
            )}

            {/* Settings Tab */}
            {activeTab === 'settings' && (
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-white">
                      Border Requirements (Optional)
                    </label>
                    <button
                      type="button"
                      onClick={() => handleAutoGenerate('border_requirements', setBorderRequirements)}
                      disabled={generatingAuto === 'border_requirements'}
                      className="text-xs bg-[#9945FF] hover:bg-[#14F195] disabled:bg-gray-600 text-white px-2 py-1 rounded transition-colors shadow-lg shadow-[#9945FF]/20"
                    >
                      {generatingAuto === 'border_requirements' ? 'Generating...' : 'Auto'}
                    </button>
                  </div>
                  <textarea
                    value={borderRequirements}
                    onChange={(e) => setBorderRequirements(e.target.value)}
                    className="w-full border border-[#9945FF]/30 rounded px-3 py-2 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md text-white placeholder-white/50 focus:border-[#9945FF] focus:outline-none focus:ring-2 focus:ring-[#9945FF]/20"
                    placeholder="Describe border requirements (e.g., 'no borders', '2px solid black border', 'rounded corners')"
                    rows={3}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-white">
                      Custom Rules (Optional)
                    </label>
                    <button
                      type="button"
                      onClick={() => handleAutoGenerate('custom_rules', setCustomRules)}
                      disabled={generatingAuto === 'custom_rules'}
                      className="text-xs bg-[#9945FF] hover:bg-[#14F195] disabled:bg-gray-600 text-white px-2 py-1 rounded transition-colors shadow-lg shadow-[#9945FF]/20"
                    >
                      {generatingAuto === 'custom_rules' ? 'Generating...' : 'Auto'}
                    </button>
                  </div>
                  <textarea
                    value={customRules}
                    onChange={(e) => setCustomRules(e.target.value)}
                    className="w-full border border-[#9945FF]/30 rounded px-3 py-2 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md text-white placeholder-white/50 focus:border-[#9945FF] focus:outline-none focus:ring-2 focus:ring-[#9945FF]/20"
                    placeholder="Enter custom rules for AI generation (e.g., 'always include shadows', 'use warm colors only', 'maintain consistent lighting')"
                    rows={4}
                  />
                </div>
              </div>
            )}

            {/* Color Tab */}
            {activeTab === 'color' && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-white">
                    Colors Description (Optional)
                  </label>
                  <button
                    type="button"
                    onClick={() => handleAutoGenerate('colors_description', setColorsDescription)}
                    disabled={generatingAuto === 'colors_description'}
                    className="text-xs bg-[#9945FF] hover:bg-[#14F195] disabled:bg-gray-600 text-white px-2 py-1 rounded transition-colors shadow-lg shadow-[#9945FF]/20"
                  >
                    {generatingAuto === 'colors_description' ? 'Generating...' : 'Auto'}
                  </button>
                </div>
                <textarea
                  value={colorsDescription}
                  onChange={(e) => setColorsDescription(e.target.value)}
                  className="w-full border border-[#9945FF]/30 rounded px-3 py-2 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md text-white placeholder-white/50 focus:border-[#9945FF] focus:outline-none focus:ring-2 focus:ring-[#9945FF]/20"
                  placeholder="Enter color description for AI generation (e.g., 'Deep saturated colors, metallic accents, bright glows, rich colored shadows, smooth gradients, high contrast')"
                  rows={3}
                />
                <p className="text-xs text-[#a8a8b8]/80 mt-1">
                  If left empty, the COLORS section will not be included in the generation prompt
                </p>
              </div>
            )}

            {/* Lighting Tab */}
            {activeTab === 'lighting' && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-white">
                    Lighting Description (Optional)
                  </label>
                  <button
                    type="button"
                    onClick={() => handleAutoGenerate('lighting_description', setLightingDescription)}
                    disabled={generatingAuto === 'lighting_description'}
                    className="text-xs bg-[#9945FF] hover:bg-[#14F195] disabled:bg-gray-600 text-white px-2 py-1 rounded transition-colors shadow-lg shadow-[#9945FF]/20"
                  >
                    {generatingAuto === 'lighting_description' ? 'Generating...' : 'Auto'}
                  </button>
                </div>
                <textarea
                  value={lightingDescription}
                  onChange={(e) => setLightingDescription(e.target.value)}
                  className="w-full border border-[#9945FF]/30 rounded px-3 py-2 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md text-white placeholder-white/50 focus:border-[#9945FF] focus:outline-none focus:ring-2 focus:ring-[#9945FF]/20"
                  placeholder="Enter lighting description for AI generation (e.g., 'Multiple sources, dramatic setup, warm key light, cool fill light, rim lighting, atmospheric effects')"
                  rows={3}
                />
                <p className="text-xs text-[#a8a8b8]/80 mt-1">
                  If left empty, the LIGHTING section will not be included in the generation prompt
                </p>
              </div>
            )}

            {/* PFP Tab */}
            {activeTab === 'pfp' && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="isPfpCollection"
                    checked={isPfpCollection}
                    onChange={(e) => setIsPfpCollection(e.target.checked)}
                    className="w-4 h-4 text-[#9945FF] bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border-[#9945FF]/30 rounded focus:ring-[#9945FF]"
                  />
                  <label htmlFor="isPfpCollection" className="text-sm font-medium text-white">
                    This is a PFP (Profile Picture) Collection
                  </label>
                </div>

                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="pixelPerfect"
                    checked={pixelPerfect}
                    onChange={(e) => setPixelPerfect(e.target.checked)}
                    className="w-4 h-4 text-[#9945FF] bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border-[#9945FF]/30 rounded focus:ring-[#9945FF]"
                  />
                  <label htmlFor="pixelPerfect" className="text-sm font-medium text-white">
                    Use pixel-perfect character bodies
                  </label>
                </div>
                <p className="text-xs text-[#a8a8b8]/80 ml-7">
                  When enabled, character skin/body traits will include precise positioning prompts for consistent body alignment across all variations
                </p>

                {isPfpCollection && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-white mb-2">
                        Character Facing Direction
                      </label>
                      <select
                        value={facingDirection}
                        onChange={(e) => setFacingDirection(e.target.value)}
                        className="w-full border border-[#9945FF]/30 rounded px-3 py-2 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md text-white focus:border-[#9945FF] focus:outline-none focus:ring-2 focus:ring-[#9945FF]/20"
                      >
                        <option value="left" className="bg-[#0a0e27]">Left</option>
                        <option value="left-front" className="bg-[#0a0e27]">Left-Front</option>
                        <option value="front" className="bg-[#0a0e27]">Front</option>
                        <option value="right-front" className="bg-[#0a0e27]">Right-Front</option>
                        <option value="right" className="bg-[#0a0e27]">Right</option>
                      </select>
                      <p className="text-xs text-[#a8a8b8]/80 mt-1">
                        The direction the character will face in generated images
                      </p>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-white mb-2">
                        Body Visibility
                      </label>
                      <select
                        value={bodyStyle}
                        onChange={(e) => setBodyStyle(e.target.value as 'full' | 'half' | 'headonly')}
                        className="w-full border border-[#9945FF]/30 rounded px-3 py-2 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md text-white focus:border-[#9945FF] focus:outline-none focus:ring-2 focus:ring-[#9945FF]/20"
                      >
                        <option value="full" className="bg-[#0a0e27]">Full Body</option>
                        <option value="half" className="bg-[#0a0e27]">Upper Body Only (waist up)</option>
                        <option value="headonly" className="bg-[#0a0e27]">Head & Shoulders Only</option>
                      </select>
                      <p className="text-xs text-[#a8a8b8]/80 mt-1">
                        Choose how much of the character to show in generated images
                      </p>
                    </div>

                    {/* Wireframe Editor - Show when pixel perfect + headonly */}
                    {pixelPerfect && bodyStyle === 'headonly' && (
                      <div className="mt-6 p-4 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border-2 border-[#9945FF]/30 rounded-lg">
                        <WireframeEditor
                          config={wireframeConfig}
                          onChange={setWireframeConfig}
                          bodyStyle={bodyStyle}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}


            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                disabled={saving}
                className="bg-[#9945FF] text-white px-4 py-2 rounded hover:bg-[#14F195] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#9945FF]/20 transition-all"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <Link
                href={`/collections/${collection.id}`}
                className="bg-gradient-to-r from-[#9945FF] to-[#DC1FFF] hover:from-[#14F195] hover:to-[#9945FF] text-white px-4 py-2 rounded shadow-lg shadow-[#9945FF]/20 transition-all duration-200"
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
