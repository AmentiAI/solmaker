'use client'

import { useState, useEffect, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useWallet } from '@/lib/wallet/compatibility'
import { useCreditCosts, calculateTraitCredits, formatCreditCost } from '@/lib/credits/use-credit-costs'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'

interface Layer {
  id: string
  name: string
  display_order: number
  created_at: string
  updated_at: string
  collection_id: string
  collection_name: string
}

interface Trait {
  id: string
  name: string
  description?: string
  trait_prompt?: string
  rarity_weight: number
  is_ignored?: boolean
  created_at: string
  updated_at: string
}

export default function LayerDetailsPage() {
  const params = useParams()
  const router = useRouter()
  const { isConnected, currentAddress } = useWallet()
  const { costs: creditCosts } = useCreditCosts()
  const [layer, setLayer] = useState<Layer | null>(null)
  const [traits, setTraits] = useState<Trait[]>([])
  const [loading, setLoading] = useState(true)
  const [theme, setTheme] = useState('')
  const [quantity, setQuantity] = useState<number>(5)
  const [quantityDisplay, setQuantityDisplay] = useState<string>('5')
  const [generating, setGenerating] = useState(false)
  const [useItemWord, setUseItemWord] = useState(true)
  const [rarity, setRarity] = useState<{ label: string; weight: number }>({ label: 'Common', weight: 40 })
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'name' | 'created' | 'rarity'>('created')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage] = useState(20)
  const [newlyGeneratedIds, setNewlyGeneratedIds] = useState<Set<string>>(new Set())
  const [showSuccessNotification, setShowSuccessNotification] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [showGenerateInstructions, setShowGenerateInstructions] = useState(false)
  const [showManageInstructions, setShowManageInstructions] = useState(false)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadPreview, setUploadPreview] = useState<string | null>(null)
  const [uploadName, setUploadName] = useState('')
  const [uploadRarity, setUploadRarity] = useState<{ label: string; weight: number }>({ label: 'Common', weight: 40 })
  const [uploading, setUploading] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<{ traitId: string; ordinalCount: number; traitName: string } | null>(null)
  const [deletingTrait, setDeletingTrait] = useState(false)
  
  const rarityOptions = [
    { label: 'Common', weight: 40 },
    { label: 'Rare', weight: 25 },
    { label: 'Epic', weight: 15 },
    { label: 'Legendary', weight: 2 },
  ]

  useEffect(() => {
    if (params.layerId) {
      loadLayer()
      loadTraits()
    }
  }, [params.layerId])

  // Sync quantityDisplay with quantity when quantity changes externally
  useEffect(() => {
    setQuantityDisplay(quantity.toString())
  }, [quantity])

  const loadLayer = async () => {
    try {
      const response = await fetch(`/api/layers/${params.layerId}`)
      if (response.ok) {
        const data = await response.json()
        setLayer(data.layer)
      }
    } catch (error) {
      console.error('Error loading layer:', error)
    }
  }

  const loadTraits = async () => {
    try {
      const response = await fetch(`/api/layers/${params.layerId}/traits`)
      if (response.ok) {
        const data = await response.json()
        setTraits(data.traits)
      }
    } catch (error) {
      console.error('Error loading traits:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteTrait = async (traitId: string) => {
    const trait = traits.find(t => t.id === traitId)
    if (!trait) return

    // First, get count of ordinals with this trait
    let ordinalCount = 0
    try {
      const countResponse = await fetch(`/api/traits/${traitId}/ordinal-count`)
      if (countResponse.ok) {
        const countData = await countResponse.json()
        ordinalCount = countData.count || 0
      }
    } catch (error) {
      console.error('Error fetching ordinal count:', error)
    }

    // Show confirmation dialog
    setShowDeleteConfirm({ traitId, ordinalCount, traitName: trait.name })
  }

  const executeDeleteTrait = async (deleteOrdinals: boolean) => {
    if (!showDeleteConfirm) return

    setDeletingTrait(true)
    try {
      const response = await fetch(`/api/traits/${showDeleteConfirm.traitId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delete_ordinals: deleteOrdinals })
      })
      if (response.ok) {
        await loadTraits()
        if (deleteOrdinals && showDeleteConfirm.ordinalCount > 0) {
          toast.success(`Deleted trait and ${showDeleteConfirm.ordinalCount} ordinal(s)`)
        } else {
          toast.success('Deleted trait (ordinals preserved)')
        }
        setShowDeleteConfirm(null)
      } else {
        const errorData = await response.json()
        toast.error(`Error: ${errorData.error || 'Failed to delete trait'}`)
      }
    } catch (error) {
      console.error('Error deleting trait:', error)
      toast.error('Failed to delete trait')
    } finally {
      setDeletingTrait(false)
    }
  }

  const handleToggleIgnore = async (traitId: string) => {
    const trait = traits.find(t => t.id === traitId)
    if (!trait) return

    const newIgnoreStatus = !trait.is_ignored

    try {
      const response = await fetch(`/api/traits/${traitId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trait.name,
          description: trait.description,
          trait_prompt: trait.trait_prompt,
          rarity_weight: trait.rarity_weight,
          is_ignored: newIgnoreStatus
        })
      })
      if (response.ok) {
        await loadTraits()
        toast.success(`Trait ${newIgnoreStatus ? 'ignored' : 'unignored'}`)
      } else {
        const errorData = await response.json()
        toast.error(`Error: ${errorData.error || 'Failed to update trait'}`)
      }
    } catch (error) {
      console.error('Error toggling ignore:', error)
      toast.error('Failed to update trait')
    }
  }

  // Filter and sort traits
  const filteredAndSortedTraits = useMemo(() => {
    let filtered = traits

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(trait => 
        trait.name.toLowerCase().includes(query) ||
        trait.description?.toLowerCase().includes(query) ||
        trait.trait_prompt?.toLowerCase().includes(query)
      )
    }

    // Apply sorting
    filtered = [...filtered].sort((a, b) => {
      let comparison = 0
      if (sortBy === 'name') {
        comparison = a.name.localeCompare(b.name)
      } else if (sortBy === 'created') {
        comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      } else if (sortBy === 'rarity') {
        comparison = a.rarity_weight - b.rarity_weight
      }
      return sortOrder === 'asc' ? comparison : -comparison
    })

    return filtered
  }, [traits, searchQuery, sortBy, sortOrder])

  // Pagination
  const totalPages = Math.ceil(filteredAndSortedTraits.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedTraits = filteredAndSortedTraits.slice(startIndex, endIndex)

  // Reset to page 1 when search changes
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, sortBy, sortOrder])

  // Handle file selection for upload
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setUploadFile(file)
      const reader = new FileReader()
      reader.onload = (e) => {
        setUploadPreview(e.target?.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  // Handle upload trait with AI analysis
  const handleUploadTrait = async () => {
    if (!uploadFile || !uploadName.trim()) {
      toast.error('Please select an image and enter a name')
      return
    }
    if (!isConnected || !currentAddress) {
      toast.error('Please connect your wallet')
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('image', uploadFile)
      formData.append('name', uploadName.trim())
      formData.append('layer_id', params.layerId as string)
      formData.append('wallet_address', currentAddress)
      formData.append('rarity_weight', uploadRarity.weight.toString())

      const response = await fetch('/api/traits/analyze-image', {
        method: 'POST',
        body: formData,
      })

      if (response.ok) {
        const data = await response.json()
        
        // Show success
        setSuccessMessage(`✅ Uploaded "${data.trait.name}" - AI detected: ${data.analysis.detected_style}`)
        setShowSuccessNotification(true)
        setTimeout(() => setShowSuccessNotification(false), 8000)
        
        // Reset upload form
        setUploadFile(null)
        setUploadPreview(null)
        setUploadName('')
        setShowUploadModal(false)
        
        // Highlight new trait
        setNewlyGeneratedIds(new Set([data.trait.id]))
        setTimeout(() => setNewlyGeneratedIds(new Set()), 5000)
        
        // Reload traits
        await loadTraits()
        
        // Refresh credits
        window.dispatchEvent(new CustomEvent('refreshCredits'))
      } else {
        const error = await response.json()
        toast.error(`Error: ${error.error}`)
      }
    } catch (error) {
      console.error('Error uploading trait:', error)
      toast.error('Failed to upload trait')
    } finally {
      setUploading(false)
    }
  }

  const handleGenerateTraits = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!isConnected || !currentAddress) {
      toast.error('Please connect your wallet to generate traits')
      return
    }
    
    if (!currentAddress || currentAddress.trim() === '') {
      toast.error('Wallet address is not available. Please reconnect your wallet.')
      return
    }
    
    if (!theme.trim()) {
      toast.error('Please enter a theme')
      return
    }

    setGenerating(true)
    
    try {
      const response = await fetch('/api/traits/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          layer_id: params.layerId,
          theme: theme.trim(),
          quantity: quantity,
          use_item_word: useItemWord,
          rarity_weight: rarity.weight,
          wallet_address: currentAddress.trim(),
        }),
      })

      if (response.ok) {
        const data = await response.json()
        const creditsNeeded = calculateTraitCredits(quantity, creditCosts.trait_generation)
        const traitsPerCredit = Math.round(1 / creditCosts.trait_generation)
        const creditsDisplay = creditsNeeded % 1 === 0 ? creditsNeeded.toFixed(0) : creditsNeeded.toFixed(2)
        
        // Get IDs of newly generated traits
        const newTraitIds = data.traits ? data.traits.map((t: any) => t.id) : []
        const newTraitNames = data.traits ? data.traits.map((t: any) => t.name) : []
        
        // Show success notification with trait names
        const traitList = newTraitNames.length > 0 
          ? newTraitNames.slice(0, 5).join(', ') + (newTraitNames.length > 5 ? ` and ${newTraitNames.length - 5} more` : '')
          : `${data.count} trait${data.count > 1 ? 's' : ''}`
        
        setSuccessMessage(`✅ Generated ${data.count} trait${data.count > 1 ? 's' : ''}: ${traitList}`)
        setShowSuccessNotification(true)
        
        // Set newly generated IDs for highlighting
        setNewlyGeneratedIds(new Set(newTraitIds))
        
        // Auto-dismiss notification after 8 seconds
        setTimeout(() => {
          setShowSuccessNotification(false)
        }, 8000)
        
        setTheme('')
        await loadTraits() // Reload traits to show new ones
        
        // Scroll to first new trait after a short delay
        if (newTraitIds.length > 0) {
          setTimeout(() => {
            const firstNewTrait = document.getElementById(`trait-${newTraitIds[0]}`)
            if (firstNewTrait) {
              firstNewTrait.scrollIntoView({ behavior: 'smooth', block: 'center' })
              // Remove highlight after 5 seconds
              setTimeout(() => {
                setNewlyGeneratedIds(new Set())
              }, 5000)
            }
          }, 300)
        }
        
        // Trigger credit refresh in header
        window.dispatchEvent(new CustomEvent('refreshCredits'))
      } else {
        const error = await response.json()
        toast.error(`Error generating traits: ${error.error}`)
      }
    } catch (error) {
      console.error('Error generating traits:', error)
      toast.error('Failed to generate traits')
    } finally {
      setGenerating(false)
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
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
      <div className="max-w-6xl mx-auto">
        <div className="text-center py-8">
          <div className="text-white">Layer not found</div>
          <Link href={`/collections/${params.id}`} className="text-blue-600 hover:text-blue-700 mt-4 inline-block">
            ← Back to Collection
          </Link>
        </div>
      </div>
    </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0f172a]">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6">
            <Link 
              href={`/collections/${params.id}`} 
              className="text-[#00d4ff] hover:text-[#00b8e6] mb-4 inline-block"
            >
              ← Back to Collection
            </Link>
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-3xl font-bold text-white">{layer.name}</h1>
               
                <div className="flex items-center gap-4 mt-4 text-sm text-white/60">
                  <span>Created: {new Date(layer.created_at).toLocaleDateString()}</span>
                  <span>Order: {layer.display_order}</span>
                </div>
              </div>
              <div className="flex gap-2">
                <Link
                  href={`/collections/${params.id}/layers/${params.layerId}/edit`}
                  className="btn-cosmic text-white px-4 py-2 rounded-lg transition-colors"
                >
                  Edit Layer
                </Link>
              </div>
            </div>
          </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="cosmic-card border border-[#00d4ff]/30 rounded-lg p-4">
            <h3 className="font-semibold text-white mb-2">Traits</h3>
            <p className="text-2xl font-bold text-[#00d4ff]">{traits.length}</p>
           
          </div>
          <div className="cosmic-card border border-[#00d4ff]/30 rounded-lg p-4">
            <h3 className="font-semibold text-white mb-2">AI Generated</h3>
            <p className="text-2xl font-bold text-green-400">
              {traits.filter(t => t.trait_prompt).length}
            </p>
           
          </div>
          <div className="cosmic-card border border-[#00d4ff]/30 rounded-lg p-4">
            <h3 className="font-semibold text-white mb-2">Average Rarity</h3>
            <p className="text-2xl font-bold text-purple-400">
              {traits.length > 0 ? Math.round(traits.reduce((sum, t) => sum + t.rarity_weight, 0) / traits.length) : 0}
            </p>
            
          </div>
        </div>

        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-2">
              <Link
                href={`/collections/${params.id}/layers/${params.layerId}/traits/create`}
                className="bg-sky-600 text-white px-4 py-2 rounded-lg hover:bg-sky-700 transition-colors whitespace-nowrap font-medium text-sm"
              >
                + Add Manually
              </Link>
              <button
                onClick={() => setShowUploadModal(true)}
                className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors whitespace-nowrap font-medium text-sm flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Upload Existing
              </button>
            </div>
          </div>
          <div className="cosmic-card border border-[#00d4ff]/30 rounded-xl shadow-sm overflow-hidden">
            <form onSubmit={handleGenerateTraits}>
              {/* Main input area */}
              <div className="p-6">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                  {/* Theme input - takes most space */}
                  <div className="lg:col-span-6">
                    <label className="block text-sm font-semibold text-white/70 mb-1.5">
                      Basic idea for {layer.name} traits
                    </label>
                    <input
                      type="text"
                      value={theme}
                      onChange={(e) => setTheme(e.target.value)}
                      className="w-full border border-[#00d4ff]/30 rounded-lg px-4 py-2.5 cosmic-card text-white placeholder-white/50 focus:border-[#00d4ff] focus:ring-2 focus:ring-[#00d4ff]/20 focus:outline-none transition-all"
                      placeholder="e.g., halloween, cyberpunk, medieval"
                      disabled={generating}
                    />
                  </div>
                  
                  {/* Quantity */}
                  <div className="lg:col-span-2">
                    <label className="block text-sm font-semibold text-white/70 mb-1.5">
                      Quantity
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={quantityDisplay}
                      onChange={(e) => {
                        const val = e.target.value
                        setQuantityDisplay(val)
                        if (val !== '') {
                          const num = parseInt(val, 10)
                          if (!isNaN(num) && num >= 1 && num <= 10) {
                            setQuantity(num)
                          }
                        }
                      }}
                      onBlur={(e) => {
                        const val = e.target.value
                        if (val === '' || parseInt(val, 10) < 1) {
                          setQuantity(1)
                          setQuantityDisplay('1')
                        } else {
                          const num = parseInt(val, 10)
                          if (!isNaN(num) && num >= 1 && num <= 10) {
                            setQuantity(num)
                            setQuantityDisplay(num.toString())
                          } else {
                            setQuantityDisplay(quantity.toString())
                          }
                        }
                      }}
                      className="w-full border border-[#00d4ff]/30 rounded-lg px-4 py-2.5 cosmic-card text-white focus:border-[#00d4ff] focus:ring-2 focus:ring-[#00d4ff]/20 focus:outline-none transition-all"
                      disabled={generating}
                    />
                    <p className="text-xs text-[#e27d0f] mt-1.5 font-medium">
                      Cost: {calculateTraitCredits(quantity, creditCosts.trait_generation)} credit{calculateTraitCredits(quantity, creditCosts.trait_generation) > 1 ? 's' : ''}
                    </p>
                  </div>
                  
                  {/* Rarity */}
                  <div className="lg:col-span-2">
                    <label className="block text-sm font-semibold text-white/70 mb-1.5">
                      Rarity
                    </label>
                    <select
                      value={rarityOptions.findIndex(r => r.weight === rarity.weight)}
                      onChange={(e) => setRarity(rarityOptions[parseInt(e.target.value)])}
                      className="w-full border border-[#00d4ff]/30 rounded-lg px-3 py-2.5 cosmic-card text-white focus:border-[#00d4ff] focus:ring-2 focus:ring-[#00d4ff]/20 focus:outline-none transition-all"
                      disabled={generating}
                    >
                      {rarityOptions.map((r, idx) => (
                        <option key={idx} value={idx} className="bg-[#0f172a]">
                          {r.label}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-white/60 mt-1.5">
                      Weight: {rarity.weight}
                    </p>
                  </div>
                  
                  {/* Generate button */}
                  <div className="lg:col-span-2">
                    <label className="block text-sm font-semibold text-white/70 mb-1.5 opacity-0 select-none pointer-events-none lg:block hidden">
                      Action
                    </label>
                    <button
                      type="submit"
                      disabled={generating || !theme.trim()}
                      className="w-full bg-[#e27d0f] hover:bg-[#d66f0d] text-white px-6 py-2.5 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                    >
                      {generating ? (
                        <span className="flex items-center justify-center gap-2">
                          <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Generating...
                        </span>
                      ) : 'Generate'}
                    </button>
                  </div>
                </div>
              </div>
              
              {/* Bottom bar with checkbox and help */}
              <div className="bg-white/10 border-t border-[#00d4ff]/30 px-6 py-3 flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    id="useItemWord"
                    checked={useItemWord}
                    onChange={(e) => setUseItemWord(e.target.checked)}
                    className="w-4 h-4 text-[#00d4ff] cosmic-card border-[#00d4ff]/30 rounded focus:ring-[#00d4ff] cursor-pointer"
                    disabled={generating}
                  />
                  <span className="text-sm text-white/70">
                    Generate as physical items <span className="text-white/50">(uncheck for textures like skin, backgrounds)</span>
                  </span>
                </label>
                
                {/* Help button */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowGenerateInstructions(!showGenerateInstructions)}
                    className="flex items-center gap-1.5 text-sm text-white/60 hover:text-white transition-colors"
                    aria-label="Show trait generation instructions"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Help</span>
                  </button>
                  
                  {/* Tooltip Content */}
                  <div className={`absolute right-0 bottom-full mb-2 w-80 bg-gray-900 text-white rounded-lg shadow-xl p-4 z-50 transition-all duration-200 ${
                    showGenerateInstructions ? 'opacity-100 visible pointer-events-auto' : 'opacity-0 invisible pointer-events-none'
                  }`}>
                    <div className="absolute -bottom-1.5 right-4 w-3 h-3 bg-gray-900 transform rotate-45"></div>
                    <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                      💡 How to Generate Traits
                    </h3>
                    <ul className="text-xs text-gray-300 space-y-1.5">
                      <li>• <strong className="text-white">Theme:</strong> Enter a style like "halloween" or "cyberpunk"</li>
                      <li>• <strong className="text-white">Quantity:</strong> Generate 1-10 traits per batch</li>
                      <li>• <strong className="text-white">Rarity:</strong> Common traits appear more often, Legendary are rare</li>
                      <li>• <strong className="text-white">Physical items:</strong> Check for holdable items, uncheck for textures</li>
                    </ul>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>

        {/* Success Notification */}
        {showSuccessNotification && (
          <div 
            className="fixed top-4 right-4 z-50 bg-[#e27d0f] text-white px-6 py-4 rounded-lg shadow-lg max-w-md"
            style={{
              animation: 'slideInRight 0.3s ease-out',
            }}
          >
            <div className="flex items-start justify-between">
              <p className="text-sm font-medium">{successMessage}</p>
              <button
                onClick={() => setShowSuccessNotification(false)}
                className="ml-4 text-white hover:text-gray-200"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}

        <h2 className="text-2xl font-bold text-white mb-4">
          All Traits 
          <span className="text-lg font-normal text-white/60 ml-2">
            ({filteredAndSortedTraits.length} {filteredAndSortedTraits.length === 1 ? 'trait' : 'traits'})
          </span>
        </h2>

       

        {/* Instructions for Viewing/Managing Traits - Hover Tooltip */}
        <div className="relative inline-block mb-6 group">
          <button
            type="button"
            onClick={() => setShowManageInstructions(!showManageInstructions)}
            onMouseEnter={() => setShowManageInstructions(true)}
            onMouseLeave={() => setShowManageInstructions(false)}
            className="flex items-center gap-2 text-sm text-white/70 hover:text-white transition-colors"
            aria-label="Show trait management instructions"
          >
            <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="font-medium">Managing Your Traits</span>
          </button>
          
          {/* Tooltip Content */}
          <div className={`absolute left-0 top-full mt-2 w-96 cosmic-card border border-[#00d4ff]/30 rounded-lg shadow-xl p-4 z-50 transition-all duration-200 ${
            showManageInstructions ? 'opacity-100 visible pointer-events-auto' : 'opacity-0 invisible pointer-events-none'
          }`}>
            <div className="absolute -top-2 left-6 w-4 h-4 cosmic-card border-l border-t border-[#00d4ff]/30 transform rotate-45"></div>
            <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <span className="text-lg">💡</span> Managing Your Traits
            </h3>
            <ul className="text-sm text-white/70 space-y-2 ml-6 list-disc max-h-96 overflow-y-auto">
              <li><strong>View Traits:</strong> All traits for the "{layer.name}" layer are shown below. Each trait includes a name, description, and rarity weight.</li>
              <li><strong>Edit Traits:</strong> Click "Edit" on any trait to modify its name, description, or rarity weight. Changes will affect future generations.</li>
              <li><strong>Delete Traits:</strong> Click "Delete" to remove traits you no longer want. Be careful - this cannot be undone!</li>
              <li><strong>Rarity Weight:</strong> Higher numbers = more common. Lower numbers = more rare. The system uses these weights to determine trait rarity in generated images.</li>
              <li><strong>AI Generated vs Manual:</strong> AI-generated traits have a green "AI Generated" tag showing the theme used. Manual traits don't have this tag.</li>
              <li><strong>Need More Traits?</strong> Use the generator above to create more, or click "Add Trait Manually" to create custom traits with full control.</li>
            </ul>
          </div>
        </div>

        <div className="grid gap-4">
          {paginatedTraits.map((trait) => {
            // Determine rarity label based on weight
            let rarityLabel = 'Custom';
            let rarityColor = 'text-white/70';
            if (trait.rarity_weight >= 35) {
              rarityLabel = 'Common';
              rarityColor = 'text-green-400';
            } else if (trait.rarity_weight >= 20 && trait.rarity_weight < 35) {
              rarityLabel = 'Rare';
              rarityColor = 'text-[#00d4ff]';
            } else if (trait.rarity_weight >= 10 && trait.rarity_weight < 20) {
              rarityLabel = 'Epic';
              rarityColor = 'text-purple-400';
            } else if (trait.rarity_weight < 10) {
              rarityLabel = 'Legendary';
              rarityColor = 'text-orange-400';
            }
            
            const isNewlyGenerated = newlyGeneratedIds.has(trait.id)
            
            return (
              <div
                id={`trait-${trait.id}`}
                key={trait.id}
                className={`border rounded-lg p-3 transition-all duration-500 ${
                  isNewlyGenerated
                    ? 'border-green-500 bg-green-500/20 shadow-lg shadow-green-500/30 ring-2 ring-green-500/50 cosmic-card'
                    : trait.is_ignored
                    ? 'border-orange-500/50 bg-orange-500/10 opacity-75 cosmic-card'
                    : 'border-[#00d4ff]/30 cosmic-card hover:border-[#00d4ff] hover:shadow-sm'
                }`}
              >
                <div className="flex justify-between items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-base text-white truncate">{trait.name}</h3>
                      {isNewlyGenerated && (
                        <span className="px-2 py-0.5 text-xs font-semibold bg-green-500 text-white rounded-full animate-pulse">
                          NEW
                        </span>
                      )}
                    </div>
              
                    <div className="flex items-center gap-3 mt-2 text-xs text-white/60">
                      <span>{new Date(trait.created_at).toLocaleDateString()}</span>
                      <span className={`font-medium ${rarityColor}`}>{rarityLabel}</span>
                      <span>Weight: {trait.rarity_weight}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0 items-center">
                    <label className="flex items-center gap-1.5 cursor-pointer" title={trait.is_ignored ? "Click to enable for generation" : "Click to ignore during generation"}>
                      <input
                        type="checkbox"
                        checked={!trait.is_ignored}
                        onChange={() => handleToggleIgnore(trait.id)}
                        className="w-4 h-4 text-[#00d4ff] border-[#00d4ff]/30 rounded focus:ring-[#00d4ff] cosmic-card"
                      />
                      <span className="text-xs text-white/70 whitespace-nowrap">
                        {trait.is_ignored ? 'Ignored' : 'Active'}
                      </span>
                    </label>
                    <Link
                      href={`/collections/${params.id}/layers/${params.layerId}/traits/${trait.id}/edit`}
                      className="px-2.5 py-1.5 text-xs bg-sky-600 text-white rounded hover:bg-sky-700 transition-colors whitespace-nowrap"
                    >
                      Edit
                    </Link>
                    <button
                      onClick={() => handleDeleteTrait(trait.id)}
                      className="px-2.5 py-1.5 text-xs bg-red-600 text-white rounded hover:bg-red-700 whitespace-nowrap"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {filteredAndSortedTraits.length === 0 && traits.length > 0 && (
          <div className="text-center py-8 text-white/70 cosmic-card border border-[#00d4ff]/30 rounded-lg">
            <p className="text-lg font-semibold mb-2 text-white">No traits match your search</p>
            <p className="text-sm text-white/60">Try adjusting your search query or filters</p>
            <button
              onClick={() => setSearchQuery('')}
              className="mt-4 text-[#00d4ff] hover:text-[#00b8e6] underline"
            >
              Clear search
            </button>
          </div>
        )}

        {traits.length === 0 && (
          <div className="text-center py-8 text-white/70 cosmic-card border border-[#00d4ff]/30 rounded-lg">
            No traits created yet. Add your first trait to get started!
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-6 cosmic-card border border-[#00d4ff]/30 rounded-lg p-4">
            <div className="text-sm text-white/70">
              Showing {startIndex + 1} to {Math.min(endIndex, filteredAndSortedTraits.length)} of {filteredAndSortedTraits.length} traits
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="px-4 py-2 border border-[#00d4ff]/30 rounded cosmic-card hover:bg-white/10 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum
                  if (totalPages <= 5) {
                    pageNum = i + 1
                  } else if (currentPage <= 3) {
                    pageNum = i + 1
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i
                  } else {
                    pageNum = currentPage - 2 + i
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`px-3 py-1 rounded ${
                        currentPage === pageNum
                          ? 'bg-[#e27d0f] text-white'
                          : 'border border-[#00d4ff]/30 cosmic-card hover:bg-white/10 text-white'
                      }`}
                    >
                      {pageNum}
                    </button>
                  )
                })}
              </div>
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="px-4 py-2 border border-[#00d4ff]/30 rounded cosmic-card hover:bg-white/10 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Upload Trait Modal */}
        {showUploadModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="cosmic-card border border-[#00d4ff]/30 rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-[#00d4ff]/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#00d4ff]/20 flex items-center justify-center border border-[#00d4ff]/30">
                      <svg className="w-5 h-5 text-[#00d4ff]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white">Upload Existing Trait</h3>
                      <p className="text-sm text-white/60">AI will analyze and describe it</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setShowUploadModal(false)
                      setUploadFile(null)
                      setUploadPreview(null)
                      setUploadName('')
                    }}
                    className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-600 hover:bg-gray-200 transition-colors"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-5">
                {/* Image Upload Area */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Trait Image
                  </label>
                  {uploadPreview ? (
                    <div className="relative">
                      <img
                        src={uploadPreview}
                        alt="Preview"
                        className="w-full h-48 object-contain bg-gray-50 rounded-xl border-2 border-gray-200"
                      />
                      <button
                        onClick={() => {
                          setUploadFile(null)
                          setUploadPreview(null)
                        }}
                        className="absolute top-2 right-2 w-8 h-8 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors shadow-lg"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <label className="block cursor-pointer">
                      <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-purple-400 hover:bg-purple-50/50 transition-all">
                        <svg className="w-12 h-12 mx-auto text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        <p className="text-sm font-medium text-gray-700">Click to upload or drag & drop</p>
                        <p className="text-xs text-gray-500 mt-1">PNG, JPG, WEBP up to 10MB</p>
                      </div>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleFileSelect}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>

                {/* Name Input */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Trait Name
                  </label>
                  <input
                    type="text"
                    value={uploadName}
                    onChange={(e) => setUploadName(e.target.value)}
                    placeholder="e.g., Golden Crown, Red Cape, Laser Eyes"
                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 bg-white text-gray-900 placeholder-gray-400 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 focus:outline-none transition-all"
                  />
                </div>

                {/* Rarity Select */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Rarity
                  </label>
                  <select
                    value={rarityOptions.findIndex(r => r.weight === uploadRarity.weight)}
                    onChange={(e) => setUploadRarity(rarityOptions[parseInt(e.target.value)])}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 bg-white text-gray-900 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 focus:outline-none transition-all"
                  >
                    {rarityOptions.map((r, idx) => (
                      <option key={idx} value={idx}>
                        {r.label} (Weight: {r.weight})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Info Box */}
                <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                  <div className="flex gap-3">
                    <span className="text-xl">🤖</span>
                    <div className="text-sm text-purple-800">
                      <p className="font-semibold mb-1">AI Analysis</p>
                      <p className="text-purple-700">
                        AI will analyze your image to detect the art style and create a detailed description 
                        that can be used to generate matching traits.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Cost Info */}
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                  <span className="text-sm text-gray-600">Analysis Cost</span>
                  <span className="font-bold text-purple-600">0.5 credits</span>
                </div>
              </div>

              {/* Footer */}
              <div className="p-6 border-t border-gray-200 flex gap-3">
                <button
                  onClick={() => {
                    setShowUploadModal(false)
                    setUploadFile(null)
                    setUploadPreview(null)
                    setUploadName('')
                  }}
                  className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUploadTrait}
                  disabled={uploading || !uploadFile || !uploadName.trim()}
                  className="flex-1 px-4 py-2.5 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {uploading ? (
                    <>
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                      Upload & Analyze
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Delete Trait Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-[#FDFCFA] border border-gray-200 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Delete Trait</h2>
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                disabled={deletingTrait}
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p className="text-gray-700 mb-4">
              <strong>"{showDeleteConfirm.traitName}"</strong> will be permanently removed from future ordinal generations.
            </p>

            {showDeleteConfirm.ordinalCount > 0 ? (
              <>
                <p className="text-gray-700 mb-4">
                  <strong>{showDeleteConfirm.ordinalCount} ordinal(s)</strong> currently have this trait.
                </p>
                <div className="space-y-3">
                  <button
                    onClick={() => executeDeleteTrait(false)}
                    disabled={deletingTrait}
                    className="w-full px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {deletingTrait ? 'Deleting...' : 'Delete Trait Only (Preserve Ordinals)'}
                  </button>
                  <button
                    onClick={() => executeDeleteTrait(true)}
                    disabled={deletingTrait}
                    className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {deletingTrait ? 'Deleting...' : `Delete Trait AND ${showDeleteConfirm.ordinalCount} Ordinal(s)`}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-gray-700 mb-6">No ordinals currently have this trait.</p>
                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => setShowDeleteConfirm(null)}
                    disabled={deletingTrait}
                    className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => executeDeleteTrait(false)}
                    disabled={deletingTrait}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {deletingTrait ? 'Deleting...' : 'Delete Trait'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      </div>
    </div>
  )
}

