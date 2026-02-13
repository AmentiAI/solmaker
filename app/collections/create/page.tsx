'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { PageHeader } from '@/components/page-header'
import { useWallet } from '@/lib/wallet/compatibility'
import { generateApiAuth } from '@/lib/wallet/api-auth'
import { CollectionCreationProgressModal } from '@/components/collection-creation-progress-modal'
import { ART_STYLES, type ArtStyle, getArtStylePreviewImage } from '@/lib/art-styles'
import { useArtStyleExamples } from '@/lib/art-styles-client'
import WireframeEditor, { type WireframeConfig } from '@/app/components/WireframeEditor'
import { useCreditCosts, calculateTraitCredits } from '@/lib/credits/use-credit-costs'

interface ProgressStep {
  id: string
  label: string
  status: 'pending' | 'processing' | 'completed' | 'error'
  details?: string
}

export default function CreateCollectionPage() {
  const { isConnected, currentAddress, signMessage } = useWallet()
  
  // Fetch real collection examples for art styles
  const { examples: artStyleExamples } = useArtStyleExamples()
  
  // Determine active wallet (Bitcoin only)
  const activeWalletConnected = isConnected
  const activeWalletAddress = currentAddress
  
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [compressionQuality, setCompressionQuality] = useState<number | ''>(85)
  const [compressionWidth, setCompressionWidth] = useState<number | ''>(600)
  const [compressionHeight, setCompressionHeight] = useState<number | ''>(600)
  const [compressionFormat, setCompressionFormat] = useState<'jpg' | 'png' | 'webp'>('webp')
  const [isPfpCollection, setIsPfpCollection] = useState(false)
  const [facingDirection, setFacingDirection] = useState('front')
  const [bodyStyle, setBodyStyle] = useState<'full' | 'half' | 'headonly'>('full')
  const [selectedArtStyle, setSelectedArtStyle] = useState<string>('chibi')
  const [customArtStyle, setCustomArtStyle] = useState('')
  const [hoveredArtStyle, setHoveredArtStyle] = useState<string | null>(null)
  const [artStyleDropdownOpen, setArtStyleDropdownOpen] = useState(false)
  const [borderRequirements, setBorderRequirements] = useState('')
  const [colorsDescription, setColorsDescription] = useState('')
  const [lightingDescription, setLightingDescription] = useState('')
  const [customRules, setCustomRules] = useState('')
  const [pixelPerfect, setPixelPerfect] = useState(false)
  const [wireframeConfig, setWireframeConfig] = useState<WireframeConfig | null>(null)
  const [futureEnabled, setFutureEnabled] = useState(false)
  const [imageSourceTab, setImageSourceTab] = useState<'prompt' | 'reference'>('prompt')
  const [styleDetailTab, setStyleDetailTab] = useState<'color' | 'lighting' | 'border'>('color')
  const [futureImage, setFutureImage] = useState<File | null>(null)
  const [futureImagePreview, setFutureImagePreview] = useState<string | null>(null)
  const [futureAnalyzing, setFutureAnalyzing] = useState(false)
  const [analyzingStep, setAnalyzingStep] = useState<string>('')
  const [referenceType, setReferenceType] = useState<'pfp' | 'artwork' | null>(null)
  const [generateCharacterPrompt, setGenerateCharacterPrompt] = useState(false)
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false)
  const [showInstructions, setShowInstructions] = useState(false)
  const [generatingAI, setGeneratingAI] = useState<string | null>(null) // Track which field is generating
  const [showColorMoodModal, setShowColorMoodModal] = useState(false)
  const [colorMoodSuggestions, setColorMoodSuggestions] = useState<string[]>([])
  const [showLightingModal, setShowLightingModal] = useState(false)
  const [lightingSuggestions, setLightingSuggestions] = useState<string[]>([])
  const [showCollectionSuggestionsModal, setShowCollectionSuggestionsModal] = useState(false)
  const [collectionSuggestionsKeyword, setCollectionSuggestionsKeyword] = useState('')
  const [collectionSuggestionsPfp, setCollectionSuggestionsPfp] = useState(false)
  const [collectionSuggestions, setCollectionSuggestions] = useState<Array<{ name: string; description: string }>>([])
  const [loadingCollectionSuggestions, setLoadingCollectionSuggestions] = useState(false)
  const [loading, setLoading] = useState(false)
  const [lazyLoading, setLazyLoading] = useState(false)
  const [showProgressModal, setShowProgressModal] = useState(false)
  const [showLazyConfirm, setShowLazyConfirm] = useState(false)
  const [progressSteps, setProgressSteps] = useState<ProgressStep[]>([
    { id: '1', label: 'Creating collection', status: 'pending' },
    { id: '2', label: 'Creating layers', status: 'pending' },
    { id: '3', label: 'Generating traits', status: 'pending', details: 'This may take a few minutes...' },
  ])
  const [currentStep, setCurrentStep] = useState(0)
  const [progressError, setProgressError] = useState<string | null>(null)
  const [traitProgress, setTraitProgress] = useState({ current: 0, total: 48 })
  const [formStep, setFormStep] = useState<1 | 2 | 3 | 4>(1) // Form wizard step
  const router = useRouter()
  const { costs: creditCosts, loading: loadingCreditCosts } = useCreditCosts()

  // Generate AI suggestion for a field - includes all form context for better suggestions
  const generateAISuggestion = async (
    field: 'border' | 'colors' | 'lighting' | 'rules',
    setter: (value: string) => void
  ) => {
    setGeneratingAI(field)
    try {
      const response = await fetch('/api/ai/generate-prompt-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          field,
          // Include all form context for more appropriate suggestions
          collectionName: name.trim() || undefined,
          description: description.trim() || undefined,
          artStyle: selectedArtStyle !== 'custom' 
            ? ART_STYLES.find(s => s.id === selectedArtStyle)?.name 
            : customArtStyle || undefined,
          isPfp: isPfpCollection,
          facingDirection: isPfpCollection ? facingDirection : undefined,
          // Include other filled fields for context
          colors: field !== 'colors' ? colorsDescription.trim() || undefined : undefined,
          border: field !== 'border' ? borderRequirements.trim() || undefined : undefined,
          lighting: field !== 'lighting' ? lightingDescription.trim() || undefined : undefined,
          rules: field !== 'rules' ? customRules.trim() || undefined : undefined,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        setter(data.selected)
      } else {
        console.error('Failed to generate suggestion')
      }
    } catch (error) {
      console.error('Error generating AI suggestion:', error)
    } finally {
      setGeneratingAI(null)
    }
  }

  // Generate Color Mood suggestions and show modal for user to pick
  const generateColorMoodSuggestions = async () => {
    setGeneratingAI('colors')
    try {
      const response = await fetch('/api/ai/generate-prompt-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          field: 'colors',
          collectionName: name.trim() || undefined,
          description: description.trim() || undefined,
          artStyle: selectedArtStyle !== 'custom' 
            ? ART_STYLES.find(s => s.id === selectedArtStyle)?.name 
            : customArtStyle || undefined,
          isPfp: isPfpCollection,
          facingDirection: isPfpCollection ? facingDirection : undefined,
          border: borderRequirements.trim() || undefined,
          lighting: lightingDescription.trim() || undefined,
          rules: customRules.trim() || undefined,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        setColorMoodSuggestions(data.all || [])
        setShowColorMoodModal(true)
      } else {
        console.error('Failed to generate suggestions')
      }
    } catch (error) {
      console.error('Error generating AI suggestions:', error)
    } finally {
      setGeneratingAI(null)
    }
  }

  const selectColorMood = (mood: string) => {
    setColorsDescription(mood)
    setShowColorMoodModal(false)
    setColorMoodSuggestions([])
  }

  // Generate Lighting suggestions and show modal for user to pick
  const generateLightingSuggestions = async () => {
    setGeneratingAI('lighting')
    try {
      const response = await fetch('/api/ai/generate-prompt-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          field: 'lighting',
          collectionName: name.trim() || undefined,
          description: description.trim() || undefined,
          artStyle: selectedArtStyle !== 'custom' 
            ? ART_STYLES.find(s => s.id === selectedArtStyle)?.name 
            : customArtStyle || undefined,
          isPfp: isPfpCollection,
          facingDirection: isPfpCollection ? facingDirection : undefined,
          colors: colorsDescription.trim() || undefined,
          border: borderRequirements.trim() || undefined,
          rules: customRules.trim() || undefined,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        setLightingSuggestions(data.all || [])
        setShowLightingModal(true)
      } else {
        console.error('Failed to generate suggestions')
      }
    } catch (error) {
      console.error('Error generating AI suggestions:', error)
    } finally {
      setGeneratingAI(null)
    }
  }

  const selectLighting = (lighting: string) => {
    setLightingDescription(lighting)
    setShowLightingModal(false)
    setLightingSuggestions([])
  }

  // Generate collection name and description suggestions
  const generateCollectionSuggestions = async () => {
    if (!collectionSuggestionsKeyword.trim()) {
      toast.error('Please enter a keyword')
      return
    }

    setLoadingCollectionSuggestions(true)
    try {
      const response = await fetch('/api/collections/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword: collectionSuggestionsKeyword.trim(),
          isPfp: collectionSuggestionsPfp,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        setCollectionSuggestions(data.suggestions || [])
        setShowCollectionSuggestionsModal(true)
      } else {
        const error = await response.json()
        toast.error('Error', { description: error.error || 'Failed to generate suggestions' })
      }
    } catch (error) {
      console.error('Error generating collection suggestions:', error)
      toast.error('Failed to generate suggestions')
    } finally {
      setLoadingCollectionSuggestions(false)
    }
  }

  const selectCollectionSuggestion = (suggestion: { name: string; description: string }) => {
    setName(suggestion.name)
    setDescription(suggestion.description)
    setIsPfpCollection(collectionSuggestionsPfp)
    setShowCollectionSuggestionsModal(false)
    setCollectionSuggestionsKeyword('')
    setCollectionSuggestions([])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!name.trim()) {
      toast.error('Collection name is required')
      return
    }

    // Check wallet connection
    const walletAddress = activeWalletAddress
    
    if (!activeWalletConnected || !walletAddress) {
      toast.error('Please connect your wallet to create a collection')
      return
    }

    setLoading(true)
    
    try {
      // Generate signed authentication to prove wallet ownership
      const auth = await generateApiAuth(walletAddress, signMessage)
      if (!auth) {
        toast.error('Failed to sign request. Please try again.')
        setLoading(false)
        return
      }

      const response = await fetch('/api/collections', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          // Include signed authentication
          ...auth,
          name: name.trim(),
          description: description.trim() || null,
          generation_mode: 'trait',
          compression_quality: compressionQuality !== '' ? compressionQuality : undefined,
          compression_dimensions: compressionWidth !== '' && compressionHeight !== ''
            ? (compressionWidth === compressionHeight ? compressionWidth : undefined)
            : undefined,
          compression_format: compressionFormat,
          is_pfp_collection: isPfpCollection,
          facing_direction: isPfpCollection ? facingDirection : undefined,
          body_style: isPfpCollection ? bodyStyle : undefined,
          art_style: selectedArtStyle === 'custom' ? customArtStyle : ART_STYLES.find(s => s.id === selectedArtStyle)?.promptStyle,
          art_style_id: selectedArtStyle,
          border_requirements: borderRequirements.trim() || undefined,
          colors_description: colorsDescription.trim() || undefined,
          lighting_description: lightingDescription.trim() || undefined,
          custom_rules: customRules.trim() || undefined,
          pixel_perfect: pixelPerfect,
          wireframe_config: wireframeConfig || undefined,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        router.push(`/collections/${data.collection.id}`)
      } else {
        const error = await response.json()
        toast.error('Error creating collection', { description: error.error })
      }
    } catch (error) {
      console.error('Error creating collection:', error)
      toast.error('Failed to create collection')
    } finally {
      setLoading(false)
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
          referenceType, // Pass reference type to API
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Failed to analyze image')

      const r = data?.result || {}
      // Store the art style from future-analyze first (we'll append to it if character prompt is enabled)
      let baseArtStyle = ''
      if (typeof r.art_style_id === 'string') {
        setSelectedArtStyle(r.art_style_id)
        if (r.art_style_id === 'custom' && typeof r.custom_art_style === 'string') {
          baseArtStyle = r.custom_art_style
          setCustomArtStyle(baseArtStyle)
        } else if (r.art_style_id !== 'custom') {
          // Get the preset art style prompt
          const presetStyle = ART_STYLES.find(s => s.id === r.art_style_id)
          if (presetStyle) {
            baseArtStyle = presetStyle.promptStyle
            setCustomArtStyle(baseArtStyle)
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
              setSelectedArtStyle('custom')
              // Build the full character prompt including background if available
              let characterPrompt = charResult.description
              if (typeof charResult.background_description === 'string' && charResult.background_description.trim()) {
                characterPrompt = `${characterPrompt}\n\nBackground: ${charResult.background_description}`
              }
              // Combine base art style with character description (including background)
              const combinedArtStyle = baseArtStyle 
                ? `${baseArtStyle}\n\n${characterPrompt}`
                : characterPrompt
              setCustomArtStyle(combinedArtStyle)
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

      // Auto-open advanced if we filled advanced fields
      if (r.border_requirements || r.lighting_description || r.custom_rules || generateCharacterPrompt) {
        setShowAdvancedSettings(true)
      }
      setAnalyzingStep('')
      toast.success('Analysis applied! Review the settings and create your collection.')
    } catch (e) {
      console.error('Future analyze failed:', e)
      toast.error('Future analyze failed', { description: e instanceof Error ? e.message : 'Unknown error' })
      setAnalyzingStep('')
    } finally {
      setFutureAnalyzing(false)
    }
  }

  const handleLazyCreate = async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }

    const trimmedName = name.trim()
    if (!trimmedName) {
      toast.error('Please enter a collection name first')
      return
    }

    if (!activeWalletConnected || !activeWalletAddress) {
      toast.error('Please connect your wallet to create a collection')
      return
    }

    // Show confirmation modal first
    setShowLazyConfirm(true)
  }

  const handleLazyConfirmAccept = async () => {
    setShowLazyConfirm(false)
    
    const trimmedName = name.trim()
    if (!trimmedName) {
      toast.error('Please enter a collection name first')
      return
    }

    if (!activeWalletConnected || !activeWalletAddress) {
      toast.error('Please connect your wallet to create a collection')
      return
    }
    
    setLazyLoading(true)
    setShowProgressModal(true)
    setCurrentStep(0)
    setProgressError(null)
    
    // Reset steps
    setProgressSteps([
      { id: '1', label: 'Creating collection', status: 'pending' },
      { id: '2', label: 'Creating layers', status: 'pending' },
      { id: '3', label: 'Generating traits', status: 'pending', details: 'This may take a few minutes...' },
    ])
    
    let progressInterval: NodeJS.Timeout | null = null
    
    try {
      // Step 1: Creating collection
      setCurrentStep(0)
      setProgressSteps(prev => prev.map((s, i) => i === 0 ? { ...s, status: 'processing' } : s))
      await new Promise(resolve => setTimeout(resolve, 600))
      
      // Step 2: Creating layers
      setCurrentStep(1)
      setProgressSteps(prev => prev.map((s, i) => 
        i === 0 ? { ...s, status: 'completed' } : 
        i === 1 ? { ...s, status: 'processing' } : s
      ))
      await new Promise(resolve => setTimeout(resolve, 700))
      setProgressSteps(prev => prev.map((s, i) => i === 1 ? { ...s, status: 'completed' } : s))
      
      // Step 3: Generating traits (this is the long one)
      setCurrentStep(2)
      setTraitProgress({ current: 0, total: 48 })
      setProgressSteps(prev => prev.map((s, i) =>
        i === 2 ? { ...s, status: 'processing', details: 'Generating trait 0/48...' } : s
      ))

      // Simulate progress as traits are generated (6 layers × 8 traits = 48 total)
      const traitsPerLayer = 8
      let simulatedProgress = 0
      let progressInterval: NodeJS.Timeout | null = null
      let hasReached48 = false

      // Start progress simulation
      progressInterval = setInterval(() => {
        simulatedProgress += traitsPerLayer
        if (simulatedProgress <= 48) {
          setTraitProgress({ current: simulatedProgress, total: 48 })
          setProgressSteps(prev => prev.map((s, i) =>
            i === 2 ? { ...s, status: 'processing', details: `Generating trait ${simulatedProgress}/48...` } : s
          ))
        } else if (!hasReached48) {
          // Once we hit 48, show finalizing message (API is still saving traits to database)
          hasReached48 = true
          setTraitProgress({ current: 48, total: 48 })
          setProgressSteps(prev => prev.map((s, i) =>
            i === 2 ? { ...s, status: 'processing', details: 'All 48 traits generated! Saving to database...' } : s
          ))
        }
      }, 3000) // Update every 3 seconds to simulate layer completion
      
      // Generate signed authentication to prove wallet ownership
      const auth = await generateApiAuth(activeWalletAddress, signMessage)
      if (!auth) {
        if (progressInterval) clearInterval(progressInterval)
        setProgressError('Failed to sign request. Please try again.')
        setLazyLoading(false)
        return
      }
      
      const response = await fetch('/api/collections/lazy-create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          // Include signed authentication
          ...auth,
          name: trimmedName,
          description: description.trim() || null,
          compression_quality: compressionQuality !== '' ? compressionQuality : undefined,
          compression_dimensions: compressionWidth !== '' && compressionHeight !== ''
            ? (compressionWidth === compressionHeight ? compressionWidth : undefined)
            : undefined,
          compression_format: compressionFormat,
          is_pfp_collection: isPfpCollection,
          facing_direction: isPfpCollection ? facingDirection : undefined,
          body_style: isPfpCollection ? bodyStyle : undefined,
          art_style: selectedArtStyle === 'custom' ? customArtStyle : ART_STYLES.find(s => s.id === selectedArtStyle)?.promptStyle,
          art_style_id: selectedArtStyle,
          border_requirements: borderRequirements.trim() || undefined,
          colors_description: colorsDescription.trim() || undefined,
          lighting_description: lightingDescription.trim() || undefined,
          custom_rules: customRules.trim() || undefined,
          pixel_perfect: pixelPerfect,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        if (progressInterval) clearInterval(progressInterval) // Stop progress simulation

        // Set final progress
        setTraitProgress({ current: 48, total: 48 })
        
        // Show completion message
        setProgressSteps(prev => prev.map((s, i) => 
          i === 2 ? { ...s, status: 'completed', details: `✅ ${data.totalTraits} traits generated successfully!` } : s
        ))
        
        // Show success message briefly before redirecting
        setTimeout(() => {
          setShowProgressModal(false)
          router.push(`/collections/${data.collection.id}`)
        }, 2000)
      } else {
        if (progressInterval) clearInterval(progressInterval) // Stop progress simulation on error
        const error = await response.json()
        setProgressError(error.error || 'Failed to create collection')
        setProgressSteps(prev => prev.map((s, i) => 
          i === currentStep ? { ...s, status: 'error' } : s
        ))
      }
    } catch (error: any) {
      if (progressInterval) clearInterval(progressInterval) // Stop progress simulation on error
      console.error('Error creating lazy collection:', error)
      setProgressError(error.message || 'Failed to create collection')
      setProgressSteps(prev => prev.map((s, i) => 
        i === currentStep ? { ...s, status: 'error' } : s
      ))
    } finally {
      setLazyLoading(false)
    }
  }

  return (
    <>
      <CollectionCreationProgressModal
        isOpen={showProgressModal}
        steps={progressSteps}
        currentStep={currentStep}
        error={progressError || undefined}
      />

      {/* Lazy Mode Confirmation Modal */}
      {showLazyConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowLazyConfirm(false)}>
          <div className="bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl border border-[#D4AF37]/30 rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="bg-[#D4AF37] p-6">
              <h2 className="text-2xl font-bold text-white">✨ Auto-Create Collection</h2>
              <p className="text-orange-100 mt-1">Confirm what will be created automatically</p>
            </div>
            
            <div className="p-6">
              <div className="space-y-4">
                <div className="bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl border border-[#D4AF37]/30 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-2xl">🎨</span>
                    <h3 className="text-lg font-semibold text-white">Collection Setup</h3>
                  </div>
                  <div className="text-sm text-white/70">
                    <p className="font-medium mb-1">Collection Name:</p>
                    <p className="text-white font-semibold">{name.trim() || '(No name)'}</p>
                  </div>
                </div>

                <div className="bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl border border-[#D4AF37]/30 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-2xl">📚</span>
                    <h3 className="text-lg font-semibold text-white">Layers & Traits</h3>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-white/70">Layers to create:</span>
                      <span className="font-bold text-white">6 layers</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-white/70">Traits per layer:</span>
                      <span className="font-bold text-white">8 traits</span>
                    </div>
                    <div className="border-t border-[#D4AF37]/30 pt-2 mt-2">
                      <div className="flex justify-between items-center">
                        <span className="text-white font-semibold">Total traits:</span>
                        <span className="text-xl font-bold text-[#D4AF37]">48 traits</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl border border-[#D4AF37]/30 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-2xl">💳</span>
                    <h3 className="text-lg font-semibold text-white">Credit Cost</h3>
                  </div>
                  <div className="space-y-2 text-sm">
                    {loadingCreditCosts ? (
                      <p className="text-white/70">Loading credit costs...</p>
                    ) : (
                      <>
                        <div className="flex justify-between items-center">
                          <span className="text-white/70">Trait generation (48 traits):</span>
                          <span className="font-bold text-white">
                            {calculateTraitCredits(48, creditCosts.trait_generation)} credit{calculateTraitCredits(48, creditCosts.trait_generation) !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <div className="border-t border-[#D4AF37]/30 pt-2 mt-2">
                          <div className="flex justify-between items-center">
                            <span className="text-white font-semibold">Total cost:</span>
                            <span className="text-xl font-bold text-[#D4AF37]">
                              {calculateTraitCredits(48, creditCosts.trait_generation)} credit{calculateTraitCredits(48, creditCosts.trait_generation) !== 1 ? 's' : ''}
                            </span>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl border border-[#D4AF37]/30 rounded-lg p-3">
                  <p className="text-xs text-[#D4AF37]">
                    ⚠️ This will automatically create 6 layers (Background, Character Skin, Eyes, Mouth, Outfit, Headwear) and generate 8 AI traits for each layer. This process may take a few minutes.
                  </p>
                </div>
              </div>
            </div>
            
            <div className="bg-white/10 px-6 py-4 flex gap-3 justify-end border-t border-[#D4AF37]/30">
              <button
                onClick={() => setShowLazyConfirm(false)}
                className="px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg font-semibold transition-colors border border-[#D4AF37]/30"
              >
                Cancel
              </button>
              <button
                onClick={handleLazyConfirmAccept}
                disabled={lazyLoading}
                className="px-6 py-2 bg-[#e27d0f] hover:bg-[#d66f0d] text-white rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Accept & Create
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Color Mood Selection Modal */}
      {showColorMoodModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4">
          <div className="bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl border border-[#D4AF37]/30 rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-[#D4AF37]/30 flex items-center justify-between bg-[#e27d0f]/10">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <span>🎨</span> Choose a Color Mood
              </h3>
              <button
                onClick={() => {
                  setShowColorMoodModal(false)
                  setColorMoodSuggestions([])
                }}
                className="text-[#808080]/80 hover:text-white p-1"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-3 sm:px-4 py-2 max-h-[60vh] overflow-y-auto flex-1">
              <p className="text-sm text-white/70 mb-3">
                Select one of the AI-generated color moods below:
              </p>
              <div className="space-y-2">
                {colorMoodSuggestions.map((mood, index) => (
                  <button
                    key={index}
                    onClick={() => selectColorMood(mood)}
                    className="w-full text-left px-2 py-2 rounded-lg border border-[#D4AF37]/30 hover:border-[#D4AF37] hover:bg-[#e27d0f]/10 transition-colors group bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[#D4AF37] font-bold text-xs flex-shrink-0 w-4">{index + 1}</span>
                      <span className="text-white text-xs group-hover:text-[#D4AF37]">{mood}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <div className="px-4 py-3 border-t border-[#D4AF37]/30 bg-white/10">
              <button
                onClick={() => {
                  setShowColorMoodModal(false)
                  setColorMoodSuggestions([])
                }}
                className="w-full py-2 text-white/70 hover:text-white text-sm font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lighting Selection Modal */}
      {showLightingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4">
          <div className="bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl border border-[#D4AF37]/30 rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-[#D4AF37]/30 flex items-center justify-between bg-[#D4AF37]/10">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <span>💡</span> Choose a Lighting Style
              </h3>
              <button
                onClick={() => {
                  setShowLightingModal(false)
                  setLightingSuggestions([])
                }}
                className="text-[#808080]/80 hover:text-white p-1"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-3 sm:px-4 py-2 max-h-[60vh] overflow-y-auto flex-1">
              <p className="text-sm text-white/70 mb-3">
                Select one of the AI-generated lighting styles below:
              </p>
              <div className="space-y-2">
                {lightingSuggestions.map((lighting, index) => (
                  <button
                    key={index}
                    onClick={() => selectLighting(lighting)}
                    className="w-full text-left px-2 py-2 rounded-lg border border-[#D4AF37]/30 hover:border-[#D4AF37] hover:bg-[#D4AF37]/10 transition-colors group bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[#D4AF37] font-bold text-xs flex-shrink-0 w-4">{index + 1}</span>
                      <span className="text-white text-xs group-hover:text-[#D4AF37]">{lighting}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <div className="px-4 py-3 border-t border-[#D4AF37]/30 bg-white/10">
              <button
                onClick={() => {
                  setShowLightingModal(false)
                  setLightingSuggestions([])
                }}
                className="w-full py-2 text-white/70 hover:text-white text-sm font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Collection Suggestions Modal */}
      {showCollectionSuggestionsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4">
          <div className="bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl border border-[#D4AF37]/30 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-[#D4AF37]/30 flex items-center justify-between bg-[#D4AF37]/10">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <span>✨</span> Collection Suggestions
              </h3>
              <button
                onClick={() => {
                  setShowCollectionSuggestionsModal(false)
                  setCollectionSuggestionsKeyword('')
                  setCollectionSuggestions([])
                }}
                className="text-[#808080]/80 hover:text-white p-1"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {collectionSuggestions.length === 0 ? (
              <div className="p-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-base font-semibold text-white mb-2">
                      Type in 1 word
                    </label>
                    <input
                      type="text"
                      value={collectionSuggestionsKeyword}
                      onChange={(e) => setCollectionSuggestionsKeyword(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && collectionSuggestionsKeyword.trim()) {
                          generateCollectionSuggestions()
                        }
                      }}
                      className="w-full border border-[#D4AF37]/30 rounded-lg px-4 py-2.5 bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl text-white placeholder-white/50 focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20 focus:outline-none"
                      placeholder="e.g., cyberpunk, medieval, space, animals"
                      autoFocus
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="suggestionsPfp"
                      checked={collectionSuggestionsPfp}
                      onChange={(e) => setCollectionSuggestionsPfp(e.target.checked)}
                      className="w-5 h-5 text-[#D4AF37] border-[#D4AF37]/30 rounded focus:ring-[#D4AF37] bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl"
                    />
                    <label htmlFor="suggestionsPfp" className="text-sm font-medium text-white cursor-pointer">
                      This is a PFP collection
                    </label>
                  </div>
                  <button
                    onClick={generateCollectionSuggestions}
                    disabled={!collectionSuggestionsKeyword.trim() || loadingCollectionSuggestions}
                    className="w-full px-6 py-3 bg-[#D4AF37] hover:bg-[#D4AF37]/80 disabled:bg-[#D4AF37]/40 text-white rounded-lg font-semibold transition-colors disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {loadingCollectionSuggestions ? (
                      <>
                        <span className="animate-spin">⚡</span> Generating...
                      </>
                    ) : (
                      <>Generate 10 Suggestions</>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="px-3 sm:px-4 py-2 max-h-[60vh] overflow-y-auto flex-1">
                  <p className="text-sm text-white/70 mb-3">
                    Select one of the AI-generated collection ideas:
                  </p>
                  <div className="space-y-2">
                    {collectionSuggestions.map((suggestion, index) => (
                      <button
                        key={index}
                        onClick={() => selectCollectionSuggestion(suggestion)}
                        className="w-full text-left px-4 py-3 rounded-lg border border-[#D4AF37]/30 hover:border-[#D4AF37] hover:bg-[#D4AF37]/10 transition-colors group bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl"
                      >
                        <div className="flex items-start gap-3">
                          <span className="text-[#D4AF37] font-bold text-sm flex-shrink-0 w-6">{index + 1}</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-white font-semibold text-sm group-hover:text-[#D4AF37] mb-1">
                              {suggestion.name}
                            </div>
                            <div className="text-white/70 text-xs group-hover:text-white">
                              {suggestion.description}
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="px-4 py-3 border-t border-[#D4AF37]/30 bg-white/10">
                  <button
                    onClick={() => {
                      setCollectionSuggestions([])
                      setCollectionSuggestionsKeyword('')
                    }}
                    className="w-full py-2 text-white/70 hover:text-white text-sm font-medium"
                  >
                    Generate New Suggestions
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      
      <div className="min-h-screen w-full bg-[#0a0a0a]">
        <PageHeader
          title="Create Collection"
          subtitle="Build your NFT collection by adding layers and traits to generate unique ordinals"
        />
        <div className="w-full max-w-[min(1600px,96vw)] mx-auto px-4 sm:px-6 md:px-8 lg:px-10 xl:px-12 py-6 sm:py-8 md:py-10 lg:py-12">
            <Link
              href="/collections"
              className="text-[#D4AF37] hover:text-[#14F195] mb-6 inline-flex items-center gap-2 text-base font-medium transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Collections
            </Link>

        {/* Instructions - Collapsible */}
        <div className="bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl border border-[#D4AF37]/30 rounded-xl mb-6 overflow-hidden">
          <button
            onClick={() => setShowInstructions(!showInstructions)}
            className="w-full flex items-center justify-between p-5 sm:p-6 hover:bg-[#D4AF37]/10 transition-colors"
          >
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <span>📝</span> Creating Your Collection
            </h3>
            <svg
              className={`w-6 h-6 text-white/70 transition-transform duration-200 ${showInstructions ? 'transform rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showInstructions && (
            <div className="px-6 pb-6 pt-2">
              <div className="space-y-3 text-base text-[#808080]">
                <p className="flex items-start gap-2">
                  <span className="text-[#D4AF37] mt-1">1.</span>
                  <span><strong>Name your collection</strong> - Choose something memorable that represents your project</span>
                </p>
                <p className="flex items-start gap-2">
                  <span className="text-[#D4AF37] mt-1">2.</span>
                  <span><strong>Add layers and traits</strong> - Once created, add layers and traits to your collection to start generating ordinals</span>
                </p>
                <p className="flex items-start gap-2">
                  <span className="text-[#D4AF37] mt-1">3.</span>
                  <span><strong>Invite collaborators</strong> - Click "+ Invite" on the collection page to invite team members by username or wallet address</span>
                </p>
                <p className="flex items-start gap-2">
                  <span className="text-[#D4AF37] mt-1">4.</span>
                  <span><strong>Configure compression</strong> - Edit collection to set image compression (quality, dimensions, or target KB size)</span>
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl border border-[#D4AF37]/30 rounded-xl p-6 sm:p-8 md:p-10 lg:p-12 shadow-xl backdrop-blur-sm">
          {!activeWalletConnected && (
            <div className="mb-6 p-4 bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl border border-[#D4AF37]/50 rounded-xl backdrop-blur-sm">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-[#D4AF37]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <p className="text-[#D4AF37] text-base">
                  Please connect your wallet in the header to create a collection.
                </p>
              </div>
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-8 text-base">
            {/* Fancy Step Indicator with Theme Colors */}
            <div className="relative mb-10">
              {/* Progress Bar Background */}
              <div className="absolute top-1/2 left-0 right-0 h-1.5 sm:h-2 bg-[#D4AF37]/20 rounded-full transform -translate-y-1/2"></div>
              
              {/* Animated Progress Fill */}
              <div 
                className="absolute top-1/2 left-0 h-1.5 sm:h-2 bg-gradient-to-r from-[#e27d0f] to-[#4561ad] rounded-full transform -translate-y-1/2 transition-all duration-500 ease-out"
                style={{ width: `${((formStep - 1) / 3) * 100}%` }}
              ></div>
              
              {/* Step Indicators */}
              <div className="relative flex items-center justify-between gap-1 sm:gap-2">
                {[1, 2, 3, 4].map((step) => {
                  const isActive = formStep === step
                  const isCompleted = formStep > step
                  const stepLabels = ['Basic', 'Style', 'Advanced', 'Compress']
                  
                  return (
                    <div key={step} className="flex flex-col items-center flex-1 relative z-10 min-w-0">
                      {/* Step Circle */}
                      <button
                        type="button"
                        onClick={() => setFormStep(step as 1 | 2 | 3 | 4)}
                        className={`relative w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded-full font-bold text-sm sm:text-base transition-all duration-300 transform hover:scale-110 ${
                          isActive
                            ? 'bg-gradient-to-br from-[#e27d0f] to-[#d66f0d] text-white shadow-lg shadow-[#e27d0f]/50 ring-2 sm:ring-4 ring-[#e27d0f]/20'
                            : isCompleted
                            ? 'bg-gradient-to-br from-[#4561ad] to-[#3a5294] text-white shadow-md'
                            : 'bg-white/10 text-white/50 hover:bg-white/20'
                        }`}
                      >
                        {isCompleted ? (
                          <svg className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <span>{step}</span>
                        )}
                        {/* Pulse animation for active step */}
                        {isActive && (
                          <span className="absolute inset-0 rounded-full bg-[#e27d0f] animate-ping opacity-20"></span>
                        )}
                      </button>
                      
                      {/* Step Label - Hidden on very small screens, shown on sm+ */}
                      <span className={`mt-2 sm:mt-3 text-xs sm:text-sm font-semibold transition-colors duration-300 text-center ${
                        isActive ? 'text-[#D4AF37]' : isCompleted ? 'text-[#4561ad]' : 'text-white/50'
                      }`}>
                        <span className="hidden sm:inline">{stepLabels[step - 1]}</span>
                        <span className="sm:hidden">{stepLabels[step - 1].charAt(0)}</span>
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* STEP 1: Basic Info */}
            {formStep === 1 && (
            <div className="animate-fadeIn">
            <div className="bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl border border-[#D4AF37]/30 rounded-lg p-5 sm:p-6 md:p-8 space-y-5 sm:space-y-6">
              <div>
                <label className="block text-base sm:text-lg font-semibold text-white mb-3">
                  Collection Name *
                </label>
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="flex-1 border border-[#D4AF37]/30 rounded-lg px-4 sm:px-5 py-3 sm:py-4 bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl text-white placeholder-white/50 focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20 focus:outline-none transition-all duration-200 text-lg"
                    placeholder="Enter collection name"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setCollectionSuggestionsKeyword('')
                      setCollectionSuggestionsPfp(isPfpCollection)
                      setShowCollectionSuggestionsModal(true)
                    }}
                    className="px-5 py-3 sm:py-4 bg-[#D4AF37] hover:bg-[#D4AF37]/80 text-white rounded-lg font-medium text-base transition-colors whitespace-nowrap"
                  >
                    ✨ Suggestions
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-base sm:text-lg font-medium text-white mb-3">
                  Description (Optional)
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full border border-[#D4AF37]/30 rounded-lg px-4 sm:px-5 py-3 sm:py-4 bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl text-white placeholder-white/50 focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20 focus:outline-none text-lg resize-y"
                  placeholder="Enter collection description"
                  rows={4}
                />
              </div>

              {/* PFP Checkbox */}
              <div className="pt-4 border-t border-[#D4AF37]/30">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="isPfpCollection"
                    checked={isPfpCollection}
                    onChange={(e) => setIsPfpCollection(e.target.checked)}
                    className="w-5 h-5 text-[#D4AF37] border-[#D4AF37]/30 rounded focus:ring-[#D4AF37] bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl"
                  />
                  <label htmlFor="isPfpCollection" className="text-base font-semibold text-white cursor-pointer">
                    This is a Profile Picture (PFP) collection
                  </label>
                </div>
                <p className="text-sm text-[#808080]/80 mt-3 ml-8">
                  Check this if you're creating profile pictures with character traits
                </p>
              </div>
            </div>

            {/* Step 1 Navigation */}
            <div className="flex justify-end pt-6 sm:pt-8">
              <button
                type="button"
                onClick={() => setFormStep(2)}
                className="group w-full sm:w-auto px-8 sm:px-10 py-4 sm:py-5 bg-[#D4AF37] hover:bg-[#D4AF37]/80 text-[#0a0a0a] rounded-lg sm:rounded-full font-bold shadow-lg shadow-[#D4AF37]/30 hover:shadow-[#D4AF37]/50 transition-all duration-300 flex items-center justify-center gap-2 sm:gap-3 hover:scale-105"
              >
                <span className="text-base sm:text-lg">Next: Art Style</span>
                <svg className="w-4 h-4 sm:w-5 sm:h-5 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
            </div>
            )}

            {/* STEP 2: Art Style */}
            {formStep === 2 && (
            <div className="animate-fadeIn">
            {/* Back Button at Top */}
            <div className="mb-6">
              <button
                type="button"
                onClick={() => setFormStep(1)}
                className="group px-6 py-3 bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl border-2 border-[#D4AF37]/30 hover:border-[#D4AF37] text-white/70 hover:text-white rounded-full font-semibold transition-all duration-300 flex items-center gap-2 hover:scale-105"
              >
                <svg className="w-5 h-5 transform group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </button>
            </div>

            {/* Image Source Tabs: Prompt Image vs Reference Image */}
            <div className="bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl border border-[#D4AF37]/30 rounded-xl overflow-hidden">
              {/* Tab Headers */}
              <div className="flex border-b border-[#D4AF37]/30 bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl">
                <button
                  type="button"
                  onClick={() => setImageSourceTab('prompt')}
                  className={`flex-1 px-3 sm:px-6 py-2.5 sm:py-3 text-xs sm:text-sm font-semibold transition-colors relative ${
                    imageSourceTab === 'prompt'
                      ? 'text-[#D4AF37] bg-[#D4AF37]/10'
                      : 'text-white/70 hover:text-white hover:bg-[#D4AF37]/5'
                  }`}
                >
                  <span className="hidden sm:inline">Prompt Image</span>
                  <span className="sm:hidden">Prompt</span>
                  {imageSourceTab === 'prompt' && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#D4AF37]"></div>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setImageSourceTab('reference')}
                  className={`flex-1 px-3 sm:px-6 py-2.5 sm:py-3 text-xs sm:text-sm font-semibold transition-colors relative ${
                    imageSourceTab === 'reference'
                      ? 'text-[#D4AF37] bg-[#D4AF37]/10'
                      : 'text-white/70 hover:text-white hover:bg-[#D4AF37]/5'
                  }`}
                >
                  <span className="hidden sm:inline">Reference Image</span>
                  <span className="sm:hidden">Reference</span>
                  {imageSourceTab === 'reference' && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#D4AF37]"></div>
                  )}
                </button>
              </div>

              {/* Tab Content */}
              <div className="p-4 sm:p-6">
                {imageSourceTab === 'prompt' && (
                  <div className="space-y-3 sm:space-y-4">
                    {isPfpCollection && (
                    <>
                    <h3 className="text-lg sm:text-xl font-semibold text-white mb-4">PFP Advanced Settings</h3>

                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        id="pixelPerfect"
                        checked={pixelPerfect}
                        onChange={(e) => setPixelPerfect(e.target.checked)}
                        className="w-4 h-4 text-[#D4AF37] border-[#D4AF37]/30 rounded focus:ring-[#D4AF37] bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl"
                      />
                      <label htmlFor="pixelPerfect" className="text-sm font-medium text-white cursor-pointer">
                        Use pixel-perfect character bodies
                      </label>
                    </div>
                    <p className="text-[10px] sm:text-xs text-[#808080]/80 break-words">
                      When enabled, character skin/body traits will include precise positioning prompts for consistent body alignment across all variations
                    </p>

                    {isPfpCollection && (
                      <div className="space-y-3 sm:space-y-4">
                        <div>
                          <label className="block text-base font-medium text-white mb-2">
                            Character Facing Direction
                          </label>
                          <select
                            value={facingDirection}
                            onChange={(e) => setFacingDirection(e.target.value)}
                            className="w-full border border-[#D4AF37]/30 rounded px-3 py-2 bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl text-white focus:border-[#D4AF37] focus:outline-none"
                          >
                            <option value="left">Left</option>
                            <option value="left-front">Left-Front</option>
                            <option value="front">Front</option>
                            <option value="right-front">Right-Front</option>
                            <option value="right">Right</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-base font-medium text-white mb-2">
                            Body Visibility
                          </label>
                          <select
                            value={bodyStyle}
                            onChange={(e) => setBodyStyle(e.target.value as 'full' | 'half' | 'headonly')}
                            className="w-full border border-[#D4AF37]/30 rounded px-3 py-2 bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl text-white focus:border-[#D4AF37] focus:outline-none"
                          >
                            <option value="full" className="bg-[#0f172a]">Full Body</option>
                            <option value="half" className="bg-[#0f172a]">Upper Body (Waist Up)</option>
                            <option value="headonly" className="bg-[#0f172a]">Head & Shoulders Only</option>
                          </select>
                          <p className="text-xs text-[#808080]/80 mt-1">
                            Choose how much of the character to show in generated images
                          </p>
                        </div>

                        {/* Wireframe Editor - Show when pixel perfect + headonly */}
                        {pixelPerfect && bodyStyle === 'headonly' && (
                          <div className="mt-4 sm:mt-6 p-3 sm:p-4 bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl border-2 border-[#D4AF37]/30 rounded-lg">
                            <WireframeEditor
                              config={wireframeConfig}
                              onChange={setWireframeConfig}
                              bodyStyle={bodyStyle}
                            />
                          </div>
                        )}
                      </div>
                    )}
                    </>
                    )}
                  </div>
                )}

                {imageSourceTab === 'reference' && (
                  <div className="space-y-3 sm:space-y-4">
                    <h3 className="text-lg sm:text-xl font-semibold text-white mb-3">Auto-fill from Reference Image</h3>
                    <p className="text-sm text-white/70 mb-4 break-words">
                      Upload a reference image and we'll analyze the art style + vibe, then auto-fill all creation settings.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] md:grid-cols-[220px_1fr] gap-4 items-start">
                      <div className="rounded-xl border border-[#D4AF37]/30 bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl overflow-hidden">
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
                          <div className="bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl border border-[#D4AF37]/30 rounded-lg p-3 space-y-2">
                            <p className="text-sm font-semibold text-white mb-2">What type of reference is this?</p>
                            <div className="flex flex-col sm:flex-row gap-2">
                              <button
                                type="button"
                                onClick={() => setReferenceType('pfp')}
                                className="flex-1 px-4 py-2.5 bg-[#D4AF37] hover:bg-[#D4AF37]/80 text-white rounded-lg font-medium text-sm transition-colors"
                              >
                                🎭 PFP (Profile Picture)
                              </button>
                              <button
                                type="button"
                                onClick={() => setReferenceType('artwork')}
                                className="flex-1 px-4 py-2.5 bg-[#D4AF37] hover:bg-[#7C3AED] text-white rounded-lg font-medium text-sm transition-colors"
                              >
                                🎨 Artwork
                              </button>
                            </div>
                            <p className="text-xs text-[#808080]/80 mt-1">
                              PFP: Character-focused images for profile pictures. Artwork: General artwork style reference.
                            </p>
                          </div>
                        )}

                        {/* Character Prompt Checkbox - Only show when PFP is selected */}
                        {referenceType === 'pfp' && (
                          <div className="flex items-start gap-2 pt-2 bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl border border-[#D4AF37]/30 rounded-lg p-3">
                            <input
                              type="checkbox"
                              id="generateCharacterPrompt"
                              checked={generateCharacterPrompt}
                              onChange={(e) => setGenerateCharacterPrompt(e.target.checked)}
                              className="w-4 h-4 mt-0.5 text-[#D4AF37] border-[#D4AF37]/30 rounded focus:ring-[#D4AF37] bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl flex-shrink-0"
                            />
                            <label htmlFor="generateCharacterPrompt" className="text-xs sm:text-sm text-[#808080] cursor-pointer">
                              <span className="font-semibold text-white">Generate hardcoded character & trait description prompt</span>
                              <br />
                              <span className="text-[#808080]/80">
                                This will create a detailed prompt describing the character's features, gender, expressions, colors, lighting, and background. The prompt will fill in the description, colors, and lighting fields on the next steps.
                              </span>
                            </label>
                          </div>
                        )}

                        {referenceType && (
                          <div className="text-xs text-[#808080]/80">
                            <p className="font-medium mb-1">
                              {referenceType === 'pfp' 
                                ? '🎭 PFP Mode: Will analyze character features and generate basic character description.'
                                : '🎨 Artwork Mode: Will analyze art style and composition settings.'}
                            </p>
                            {referenceType === 'pfp' && generateCharacterPrompt && (
                              <p className="text-[#D4AF37] mt-1">
                                ✨ Enhanced mode: Will generate comprehensive character & trait description with colors and lighting.
                              </p>
                            )}
                          </div>
                        )}

                        <p className="text-[10px] sm:text-xs text-[#808080]/80 break-words">
                          Tip: Use a single, representative image (same style you want for the collection). You can edit any fields after it fills.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Art Style Section - Compact horizontal layout with hover preview */}
            <div className="bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl border border-[#D4AF37]/30 rounded-lg p-3 sm:p-4">
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-3 sm:gap-4">
                {/* Preview Image - Larger Thumbnail with hover support */}
                <div className="flex-shrink-0 w-full sm:w-auto">
                  <div className="relative w-full sm:w-[120px] md:w-[160px] h-[120px] sm:h-[120px] md:h-[160px] rounded-lg overflow-hidden border-2 border-[#D4AF37]/30 bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl shadow-inner mx-auto sm:mx-0">
                    {(() => {
                      const displayStyle = artStyleDropdownOpen && hoveredArtStyle ? hoveredArtStyle : selectedArtStyle
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

                {/* Style Dropdown and Info */}
                <div className="w-full sm:flex-1 relative">
                  <label className="block text-base font-semibold text-white mb-2">
                    Art Style
                  </label>

                  {/* Custom Dropdown Button */}
                  <button
                    type="button"
                    onClick={() => setArtStyleDropdownOpen(!artStyleDropdownOpen)}
                    onBlur={() => setTimeout(() => setArtStyleDropdownOpen(false), 200)}
                    className="w-full border border-[#D4AF37]/30 rounded-lg px-3 py-2.5 sm:py-1.5 bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl text-white text-base sm:text-sm focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20 focus:outline-none text-left flex items-center justify-between hover:bg-white/10 transition-colors"
                  >
                    <span className="pr-2 flex-1 min-w-0 text-left break-words">{ART_STYLES.find(s => s.id === selectedArtStyle)?.name || 'Select style'}</span>
                    <svg
                      className={`w-4 h-4 sm:w-4 sm:h-4 flex-shrink-0 transition-transform ${artStyleDropdownOpen ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* Custom Dropdown Menu */}
                  {artStyleDropdownOpen && (
                    <div className="absolute z-50 left-0 right-0 mt-1 bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl border border-[#D4AF37]/30 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {ART_STYLES.map(style => (
                        <button
                          key={style.id}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault() // Prevent blur from firing before selection
                            setSelectedArtStyle(style.id)
                            setArtStyleDropdownOpen(false)
                            setHoveredArtStyle(null)
                          }}
                          onMouseEnter={() => setHoveredArtStyle(style.id)}
                          onMouseLeave={() => setHoveredArtStyle(null)}
                          className={`w-full text-left px-3 py-2.5 sm:py-2 text-base sm:text-sm transition-colors break-words whitespace-normal ${
                            selectedArtStyle === style.id
                              ? 'bg-[#D4AF37]/20 text-[#D4AF37] font-medium'
                              : 'hover:bg-white/10 text-white'
                          }`}
                        >
                          {style.name}
                        </button>
                      ))}
                    </div>
                  )}

                  {selectedArtStyle !== 'custom' && !artStyleDropdownOpen && (
                    <p className="text-xs text-[#808080]/80 mt-1 truncate">
                      {ART_STYLES.find(s => s.id === selectedArtStyle)?.description}
                    </p>
                  )}

                  {artStyleDropdownOpen && (
                    <p className="text-xs text-green-600 mt-1 font-medium">
                      Hover to preview styles
                    </p>
                  )}
                </div>
              </div>

              {/* Custom Style Input - Only show when custom is selected */}
              {selectedArtStyle === 'custom' && (
                <div className="mt-3">
                  <textarea
                    value={customArtStyle}
                    onChange={(e) => setCustomArtStyle(e.target.value)}
                    className="w-full border border-[#D4AF37]/30 rounded px-3 py-2 bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl text-white placeholder-white/50 text-sm focus:border-[#D4AF37] focus:outline-none"
                    placeholder="Describe your custom art style..."
                    rows={2}
                  />
                </div>
              )}
            </div>

            {/* Step 2 Navigation */}
            <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 sm:gap-0 pt-4 sm:pt-6 border-t border-[#D4AF37]/30">
              <button
                type="button"
                onClick={() => setFormStep(1)}
                className="group w-full sm:w-auto px-4 sm:px-6 py-2.5 sm:py-3 bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl border-2 border-[#D4AF37]/30 hover:border-[#D4AF37] text-white hover:text-[#D4AF37] rounded-lg sm:rounded-full font-semibold transition-all duration-300 flex items-center justify-center gap-2 hover:scale-105"
              >
                <svg className="w-4 h-4 sm:w-5 sm:h-5 transform group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <span className="text-base sm:text-lg">Back</span>
              </button>
              <button
                type="button"
                onClick={() => setFormStep(3)}
                className="group w-full sm:w-auto px-6 sm:px-8 py-3 sm:py-4 bg-[#D4AF37] hover:from-[#d66f0d] hover:to-[#c96a0a] text-white rounded-lg sm:rounded-full font-bold shadow-lg shadow-[#e27d0f]/30 hover:shadow-[#e27d0f]/50 transition-all duration-300 flex items-center justify-center gap-2 sm:gap-3 hover:scale-105"
              >
                <span className="text-base sm:text-lg">Next: Advanced</span>
                <svg className="w-4 h-4 sm:w-5 sm:h-5 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
            </div>
            )}

            {/* STEP 3: Advanced Settings (Color, Lighting, Border, Custom Rules) */}
            {formStep === 3 && (
            <div className="animate-fadeIn">
            {/* Back Button at Top */}
            <div className="mb-6">
              <button
                type="button"
                onClick={() => setFormStep(2)}
                className="group px-6 py-3 bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl border-2 border-[#D4AF37]/30 hover:border-[#D4AF37] text-white hover:text-[#D4AF37] rounded-full font-semibold transition-all duration-300 flex items-center gap-2 hover:scale-105"
              >
                <svg className="w-5 h-5 transform group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </button>
            </div>

            {/* Style Details Tabs: Color | Lighting | Border */}
            <div className="bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl border border-[#D4AF37]/30 rounded-xl overflow-hidden">
              {/* Tab Headers */}
              <div className="flex border-b border-[#D4AF37]/30 bg-white/5">
                <button
                  type="button"
                  onClick={() => setStyleDetailTab('color')}
                  className={`flex-1 px-3 sm:px-6 py-2.5 sm:py-3 text-xs sm:text-sm font-semibold transition-colors relative ${
                    styleDetailTab === 'color'
                      ? 'text-[#D4AF37] bg-[#e27d0f]/10'
                      : 'text-white/70 hover:text-white hover:bg-[#e27d0f]/10'
                  }`}
                >
                  Color
                  {styleDetailTab === 'color' && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-600"></div>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setStyleDetailTab('lighting')}
                  className={`flex-1 px-3 sm:px-6 py-2.5 sm:py-3 text-xs sm:text-sm font-semibold transition-colors relative ${
                    styleDetailTab === 'lighting'
                      ? 'text-[#D4AF37] bg-[#e27d0f]/10'
                      : 'text-white/70 hover:text-white hover:bg-[#e27d0f]/10'
                  }`}
                >
                  Lighting
                  {styleDetailTab === 'lighting' && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-600"></div>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setStyleDetailTab('border')}
                  className={`flex-1 px-3 sm:px-6 py-2.5 sm:py-3 text-xs sm:text-sm font-semibold transition-colors relative ${
                    styleDetailTab === 'border'
                      ? 'text-[#D4AF37] bg-[#e27d0f]/10'
                      : 'text-white/70 hover:text-white hover:bg-[#e27d0f]/10'
                  }`}
                >
                  Border
                  {styleDetailTab === 'border' && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-600"></div>
                  )}
                </button>
              </div>

              {/* Tab Content */}
              <div className="p-4 sm:p-6">
                {styleDetailTab === 'color' && (
                  <div>
                    <label className="block text-base font-semibold text-white mb-2">
                      Color Mood
                    </label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={colorsDescription}
                        onChange={(e) => setColorsDescription(e.target.value)}
                        className="flex-1 border border-[#D4AF37]/30 rounded-lg px-3 py-2.5 bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl text-white placeholder-white/50 text-base sm:text-sm focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20 focus:outline-none"
                        placeholder="e.g., 'high contrast with deep shadows', 'soft muted tones', 'neon glows on dark backgrounds'"
                      />
                      <button
                        type="button"
                        onClick={generateColorMoodSuggestions}
                        disabled={generatingAI === 'colors'}
                        className="px-4 py-2.5 sm:px-3 sm:py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white text-sm sm:text-xs font-medium rounded-lg sm:rounded transition-colors whitespace-nowrap flex items-center justify-center gap-1"
                      >
                        {generatingAI === 'colors' ? (
                          <><span className="animate-spin">⚡</span> AI...</>
                        ) : (
                          <>✨ Suggest</>
                        )}
                      </button>
                    </div>
                    <p className="text-sm text-[#808080]/80 mt-2">
                      Describe the color mood: contrast, saturation, brightness, warmth, etc.
                    </p>
                  </div>
                )}

                {styleDetailTab === 'lighting' && (
                  <div>
                    <label className="block text-base font-semibold text-white mb-2">
                      Lighting Style
                    </label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={lightingDescription}
                        onChange={(e) => setLightingDescription(e.target.value)}
                        className="flex-1 border border-[#D4AF37]/30 rounded-lg px-3 py-2.5 bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl text-white placeholder-white/50 text-base sm:text-sm focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20 focus:outline-none"
                        placeholder="e.g., 'dramatic rim lighting', 'soft diffused', 'harsh shadows'"
                      />
                      <button
                        type="button"
                        onClick={generateLightingSuggestions}
                        disabled={generatingAI === 'lighting'}
                        className="px-4 py-2.5 sm:px-3 sm:py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white text-sm sm:text-xs font-medium rounded-lg sm:rounded transition-colors whitespace-nowrap flex items-center justify-center gap-1"
                      >
                        {generatingAI === 'lighting' ? (
                          <><span className="animate-spin">⚡</span> AI...</>
                        ) : (
                          <>✨ AI</>
                        )}
                      </button>
                    </div>
                    <p className="text-sm text-[#808080]/80 mt-2">
                      Describe the lighting: direction, intensity, mood, shadows, etc.
                    </p>
                  </div>
                )}

                {styleDetailTab === 'border' && (
                  <div>
                    <label className="block text-base font-semibold text-white mb-2">
                      Border Style
                    </label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={borderRequirements}
                        onChange={(e) => setBorderRequirements(e.target.value)}
                        className="flex-1 border border-[#D4AF37]/30 rounded-lg px-3 py-2.5 bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl text-white placeholder-white/50 text-base sm:text-sm focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20 focus:outline-none"
                        placeholder="e.g., 'thick golden ornate frame', 'thin black line' — leave empty for no border"
                      />
                      <button
                        type="button"
                        onClick={() => generateAISuggestion('border', setBorderRequirements)}
                        disabled={generatingAI === 'border'}
                        className="px-4 py-2.5 sm:px-3 sm:py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white text-sm sm:text-xs font-medium rounded-lg sm:rounded transition-colors whitespace-nowrap flex items-center justify-center gap-1"
                      >
                        {generatingAI === 'border' ? (
                          <><span className="animate-spin">⚡</span> AI...</>
                        ) : (
                          <>✨ AI</>
                        )}
                      </button>
                    </div>
                    <p className="text-sm text-[#808080]/80 mt-2">
                      <strong>Note:</strong> Leave empty for no border. Describe border style, thickness, color, and ornamentations.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Advanced Prompt Settings - Simplified */}
            <div className="bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl border border-[#D4AF37]/30 rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-[#D4AF37]/10 transition-colors"
              >
                <span className="text-sm font-semibold text-white">
                  Advanced Settings
                  {customRules && (
                    <span className="ml-2 text-xs text-[#D4AF37] font-normal">(configured)</span>
                  )}
                </span>
                <svg
                  className={`w-5 h-5 text-white/70 transition-transform ${showAdvancedSettings ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showAdvancedSettings && (
                <div className="px-4 pb-4 space-y-4 border-t border-[#D4AF37]/30">
                  {/* Custom Rules */}
                  <div>
                    <label className="block text-base font-medium text-white mb-2">
                      Custom Generation Rules
                    </label>
                    <div className="flex flex-col sm:flex-row gap-2 items-start">
                      <textarea
                        value={customRules}
                        onChange={(e) => setCustomRules(e.target.value)}
                        className="flex-1 border border-[#D4AF37]/30 rounded-lg px-3 py-2.5 bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl text-white placeholder-white/50 text-base sm:text-sm focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20 focus:outline-none resize-y"
                        placeholder="Any additional rules for AI generation (e.g., 'always include reflections', 'no backgrounds', 'include particle effects')"
                        rows={2}
                      />
                      <button
                        type="button"
                        onClick={() => generateAISuggestion('rules', setCustomRules)}
                        disabled={generatingAI === 'rules'}
                        className="px-4 py-2.5 sm:px-3 sm:py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm sm:text-xs font-medium rounded-lg sm:rounded transition-colors whitespace-nowrap flex items-center justify-center gap-1 self-start sm:self-auto"
                      >
                        {generatingAI === 'rules' ? (
                          <><span className="animate-spin">⚡</span> AI...</>
                        ) : (
                          <>✨ AI</>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Step 3 Navigation */}
            <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 sm:gap-0 pt-4 sm:pt-6 border-t border-[#D4AF37]/30">
              <button
                type="button"
                onClick={() => setFormStep(2)}
                className="group w-full sm:w-auto px-4 sm:px-6 py-2.5 sm:py-3 bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl border-2 border-[#D4AF37]/30 hover:border-[#D4AF37] text-white hover:text-[#D4AF37] rounded-lg sm:rounded-full font-semibold transition-all duration-300 flex items-center justify-center gap-2 hover:scale-105"
              >
                <svg className="w-4 h-4 sm:w-5 sm:h-5 transform group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <span className="text-base sm:text-lg">Back</span>
              </button>
              <button
                type="button"
                onClick={() => setFormStep(4)}
                className="group w-full sm:w-auto px-6 sm:px-8 py-3 sm:py-4 bg-[#D4AF37] hover:from-[#d66f0d] hover:to-[#c96a0a] text-white rounded-lg sm:rounded-full font-bold shadow-lg shadow-[#e27d0f]/30 hover:shadow-[#e27d0f]/50 transition-all duration-300 flex items-center justify-center gap-2 sm:gap-3 hover:scale-105"
              >
                <span className="text-sm sm:text-base">Next: Compression</span>
                <svg className="w-4 h-4 sm:w-5 sm:h-5 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
            </div>
            )}

            {/* STEP 4: Compression Settings */}
            {formStep === 4 && (
            <div className="animate-fadeIn">
            {/* Back Button at Top */}
            <div className="mb-6">
              <button
                type="button"
                onClick={() => setFormStep(3)}
                className="group px-6 py-3 bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl border-2 border-[#D4AF37]/30 hover:border-[#D4AF37] text-white hover:text-[#D4AF37] rounded-full font-semibold transition-all duration-300 flex items-center gap-2 hover:scale-105"
              >
                <svg className="w-5 h-5 transform group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </button>
            </div>

            {/* Compression Settings */}
            <div className="bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl border border-[#D4AF37]/30 rounded-lg p-4 sm:p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Image Compression Settings</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-base font-medium text-[#808080] mb-2">
                    File Format
                  </label>
                  <select
                    value={compressionFormat}
                    onChange={(e) => setCompressionFormat(e.target.value as 'jpg' | 'png' | 'webp')}
                    className="w-full border border-[#D4AF37]/30 rounded px-3 py-2 bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl text-white focus:border-[#D4AF37] focus:outline-none"
                  >
                    <option value="webp" className="bg-[#0f172a]">WebP (Recommended - Best compression)</option>
                    <option value="jpg" className="bg-[#0f172a]">JPEG (Good compression, widely supported)</option>
                    <option value="png" className="bg-[#0f172a]">PNG (Lossless, larger file size)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-base font-medium text-[#808080] mb-2">
                    Compression Quality: {compressionQuality !== '' ? `${compressionQuality}%` : 'Not set'}
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={compressionQuality !== '' ? compressionQuality : 85}
                    onChange={(e) => {
                      const val = parseInt(e.target.value)
                      setCompressionQuality(val === 85 ? '' : val)
                    }}
                    className="w-full"
                  />
                </div>

                <div>
                  <label className="block text-base font-medium text-[#808080] mb-2">
                    Image Dimensions (Width × Height)
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2 sm:gap-2 items-start sm:items-center">
                    <div className="flex items-center gap-2 flex-1 sm:flex-initial">
                    <input
                      type="number"
                      min="1"
                      max="1024"
                      value={compressionWidth}
                      onChange={(e) => {
                        const val = e.target.value === '' ? '' : parseInt(e.target.value)
                        const numVal = val === '' || isNaN(val as number) ? '' : Math.max(1, Math.min(1024, val as number))
                        setCompressionWidth(numVal)
                        // Auto-sync height to width for square dimensions
                        if (numVal !== '') {
                          setCompressionHeight(numVal)
                        } else {
                          setCompressionHeight('')
                        }
                      }}
                      placeholder="Width"
                        className="flex-1 sm:w-24 border border-[#D4AF37]/30 rounded-lg px-3 py-2.5 bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl text-white focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20 focus:outline-none text-base"
                    />
                      <span className="text-white text-lg sm:text-base">×</span>
                    <input
                      type="number"
                      min="1"
                      max="1024"
                      value={compressionHeight}
                      onChange={(e) => {
                        const val = e.target.value === '' ? '' : parseInt(e.target.value)
                        const numVal = val === '' || isNaN(val as number) ? '' : Math.max(1, Math.min(1024, val as number))
                        setCompressionHeight(numVal)
                        // Auto-sync width to height for square dimensions
                        if (numVal !== '') {
                          setCompressionWidth(numVal)
                        } else {
                          setCompressionWidth('')
                        }
                      }}
                      placeholder="Height"
                        className="flex-1 sm:w-24 border border-[#D4AF37]/30 rounded-lg px-3 py-2.5 bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl text-white focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20 focus:outline-none text-base"
                    />
                    </div>
                    <span className="text-white/70 text-xs sm:text-sm">px (square, max 1024×1024)</span>
                  </div>
                </div>

                {/* Estimated File Size */}
                {(() => {
                  const width = compressionWidth !== '' ? Number(compressionWidth) : 600
                  const height = compressionHeight !== '' ? Number(compressionHeight) : 600
                  const quality = compressionQuality !== '' ? Number(compressionQuality) : 85
                  
                  // Estimate file size based on format, dimensions, and quality
                  // These are rough estimates for typical NFT images with moderate detail
                  let estimatedKB = 0
                  const pixels = width * height
                  
                  if (compressionFormat === 'webp') {
                    // WebP: Excellent compression
                    // Based on actual data: 600x600 at 75% quality = ~50 KB = ~1.14 bits/pixel
                    // At 100% quality: ~1.5-2.0 bits/pixel
                    // At 75% quality: ~1.1-1.3 bits/pixel
                    // At 50% quality: ~0.7-0.9 bits/pixel
                    const baseBitsPerPixel = 1.4
                    const qualityFactor = 0.4 + (quality / 100) * 0.6 // Non-linear: lower quality compresses better
                    const bitsPerPixel = baseBitsPerPixel * qualityFactor
                    estimatedKB = Math.round((pixels * bitsPerPixel) / 8 / 1024)
                  } else if (compressionFormat === 'jpg') {
                    // JPEG: Good compression, widely supported
                    // Typically 20-30% larger than WebP at same quality
                    // At 100% quality: ~1.8-2.5 bits/pixel
                    // At 75% quality: ~1.3-1.6 bits/pixel
                    // At 50% quality: ~0.9-1.1 bits/pixel
                    const baseBitsPerPixel = 1.75
                    const qualityFactor = 0.4 + (quality / 100) * 0.6 // Non-linear compression
                    const bitsPerPixel = baseBitsPerPixel * qualityFactor
                    estimatedKB = Math.round((pixels * bitsPerPixel) / 8 / 1024)
                  } else if (compressionFormat === 'png') {
                    // PNG: Lossless, much larger files
                    // Typically 3-6 bits per pixel depending on color complexity
                    const bitsPerPixel = 4.5 // More realistic for lossless PNG
                    estimatedKB = Math.round((pixels * bitsPerPixel) / 8 / 1024)
                  }
                  
                  // Ensure minimum size (even very compressed images have overhead)
                  estimatedKB = Math.max(10, estimatedKB)
                  
                  // Format display name
                  const formatName = compressionFormat === 'jpg' ? 'JPEG' : compressionFormat.toUpperCase()
                  
                  return (
                    <div className="bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl border border-[#D4AF37]/30 rounded-lg p-3">
                      <p className="text-sm font-medium text-white">
                        Estimated File Size: <span className="font-bold text-[#D4AF37]">{estimatedKB} KB</span> ({formatName})
                      </p>
                      {compressionFormat === 'png' && (
                        <p className="text-xs text-white/70 mt-1">
                          PNG is lossless but produces larger files than compressed formats.
                        </p>
                      )}
                    </div>
                  )
                })()}
              </div>
            </div>

            {/* Action Cards - 3 Column Grid */}
            <div className={`grid gap-4 sm:gap-6 pt-6 sm:pt-8 mt-6 sm:mt-8 ${isPfpCollection ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'}`}>
              {/* Create Collection Card */}
              <button
                type="submit"
                disabled={loading || lazyLoading || !activeWalletConnected || !activeWalletAddress}
                className="relative bg-gradient-to-br from-[#4561ad] to-[#3a5294] hover:from-[#3a5294] hover:to-[#2f4379] text-white rounded-xl sm:rounded-2xl p-6 sm:p-8 shadow-xl shadow-[#4561ad]/30 hover:shadow-[#4561ad]/50 transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex flex-col items-center justify-center min-h-[160px] sm:min-h-[200px] border-2 border-[#4561ad]/20 hover:border-[#4561ad]/40"
              >
                <div className="text-3xl sm:text-4xl mb-3 sm:mb-4">🎨</div>
                <h3 className="text-xl sm:text-2xl font-bold mb-1 sm:mb-2">Create Collection</h3>
                <p className="text-[#808080] text-xs sm:text-sm text-center">
                  {loading ? 'Creating...' : 'Create with your custom settings'}
                </p>
              </button>

              {/* Lazy w/Auto Traits Card - Only show for PFP collections */}
              {isPfpCollection && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={handleLazyCreate}
                    disabled={lazyLoading || loading || !activeWalletConnected || !activeWalletAddress || !name.trim()}
                    className="relative bg-gradient-to-br from-[#e27d0f] to-[#d66f0d] hover:from-[#d66f0d] hover:to-[#c96a0a] text-white rounded-xl sm:rounded-2xl p-6 sm:p-8 shadow-xl shadow-[#e27d0f]/30 hover:shadow-[#e27d0f]/50 transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex flex-col items-center justify-center min-h-[160px] sm:min-h-[200px] border-2 border-[#D4AF37]/20 hover:border-[#D4AF37]/40 w-full"
                  >
                    {lazyLoading ? (
                      <>
                        <div className="animate-spin rounded-full h-6 w-6 sm:h-8 sm:w-8 border-b-2 border-white mb-3 sm:mb-4"></div>
                        <h3 className="text-xl sm:text-2xl font-bold mb-1 sm:mb-2">Creating...</h3>
                      </>
                    ) : (
                      <>
                        <div className="text-3xl sm:text-4xl mb-3 sm:mb-4">✨</div>
                        <h3 className="text-xl sm:text-2xl font-bold mb-1 sm:mb-2">Auto-Create Layers & Traits</h3>
                        <p className="text-orange-100 text-xs sm:text-sm text-center px-2 font-medium">
                          Automatically creates 6 layers and 48 traits for you
                        </p>
                        <p className="text-orange-200 text-xs text-center px-2 mt-1">
                          No manual setup needed - ready to generate!
                        </p>
                      </>
                    )}
                  </button>
                  {!lazyLoading && !loading && (lazyLoading || loading || !activeWalletConnected || !activeWalletAddress || !name.trim()) && (
                    <div className="absolute -bottom-6 left-0 right-0 text-center">
                      <p className="text-xs text-[#EF4444] font-medium">
                        {!activeWalletConnected || !activeWalletAddress ? '⚠️ Connect wallet first' : !name.trim() ? '⚠️ Enter collection name first' : ''}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Cancel Card */}
              <Link
                href="/collections"
                className="relative bg-gradient-to-br from-gray-500 to-gray-600 hover:from-gray-600 hover:to-gray-700 text-white rounded-xl sm:rounded-2xl p-6 sm:p-8 shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:scale-105 flex flex-col items-center justify-center min-h-[160px] sm:min-h-[200px] border-2 border-gray-400/20 hover:border-gray-400/40"
              >
                <div className="text-3xl sm:text-4xl mb-3 sm:mb-4">❌</div>
                <h3 className="text-xl sm:text-2xl font-bold mb-1 sm:mb-2">Cancel</h3>
                <p className="text-gray-200 text-xs sm:text-sm text-center">
                  Go back to collections
                </p>
              </Link>
            </div>
            </div>
            )}
          </form>
        </div>
      </div>
    </div>
    </>
  )
}
