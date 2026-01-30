'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { useWallet } from '@/lib/wallet/compatibility'
import { ConfirmDialog } from '@/components/confirm-dialog'
// Collection type definitions
interface Collection {
  id: string
  name: string
  description?: string
  createdAt: string
  updatedAt: string
  isActive: boolean
  traitSelections: TraitSelections
}

interface TraitSelections {
  characterType: { enabled: boolean; selected: string[] }
  background: { enabled: boolean; selected: string[] }
  accessories: { enabled: boolean; selected: string[] }
  eyes: { enabled: boolean; selected: string[] }
  mouth: { enabled: boolean; selected: string[] }
  headwear: { enabled: boolean; selected: string[] }
  outfits: { enabled: boolean; selected: string[] }
  props: { enabled: boolean; selected: string[] }
}

interface CollectionManagerProps {
  onCollectionChange?: (collection: Collection | null) => void
}

// Local validation function
function validateTraitSelections(traitSelections: TraitSelections): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  
  Object.entries(traitSelections).forEach(([category, selection]) => {
    if (selection.enabled && selection.selected.length === 0) {
      errors.push(`${category} is enabled but no traits are selected`)
    }
  })
  
  return { valid: errors.length === 0, errors }
}

export function CollectionManager({ onCollectionChange }: CollectionManagerProps) {
  const { isConnected, currentAddress } = useWallet()
  // Determine active wallet (Bitcoin only)
  const { activeWalletAddress, activeWalletConnected } = useMemo(() => {
    if (currentAddress && isConnected) {
      return { activeWalletAddress: currentAddress, activeWalletConnected: true }
    }
    return { activeWalletAddress: null, activeWalletConnected: false }
  }, [currentAddress, isConnected])
  
  const [collections, setCollections] = useState<Collection[]>([])
  const [activeCollection, setActiveCollectionState] = useState<Collection | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingCollection, setEditingCollection] = useState<Collection | null>(null)
  const [availableTraits, setAvailableTraits] = useState<Record<string, string[]>>({})
  const [traitDescriptions, setTraitDescriptions] = useState<Record<string, Record<string, string>>>({})
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; collectionId: string | null; collectionName: string }>({
    isOpen: false,
    collectionId: null,
    collectionName: '',
  })
  const [deleting, setDeleting] = useState(false)
  useEffect(() => {
    const loadCollections = async () => {
      // Use active wallet address
      const walletAddress = activeWalletAddress
      
      // Validate wallet address before making API call
      if (!walletAddress || typeof walletAddress !== 'string' || walletAddress.trim() === '') {
        setCollections([])
        setActiveCollectionState(null)
        onCollectionChange?.(null)
        return
      }

      try {
        const url = `/api/collections?wallet_address=${encodeURIComponent(walletAddress.trim())}`
        const response = await fetch(url)
        
        if (response.ok) {
          const data = await response.json()
          setCollections(data.collections || [])
          
          const active = (data.collections || []).find((c: Collection) => c.isActive)
          setActiveCollectionState(active || null)
          onCollectionChange?.(active || null)
        } else {
          // Handle error response
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
          console.error('Error loading collections:', errorData)
          if (response.status === 400 && errorData.error?.includes('Wallet address')) {
            // Wallet address issue - clear collections but don't spam console
            setCollections([])
            setActiveCollectionState(null)
            onCollectionChange?.(null)
          }
        }
      } catch (error) {
        console.error('Error loading collections:', error)
        // Don't set empty collections on network errors - might be temporary
      }
    }
    
    // Only attempt to load if we have a wallet address or are connected
    if (activeWalletConnected && activeWalletAddress) {
      // Small delay to allow wallet state to sync
      const timeoutId = setTimeout(loadCollections, 100)
      return () => clearTimeout(timeoutId)
    } else {
      // No wallet connection, clear collections
      setCollections([])
      setActiveCollectionState(null)
      onCollectionChange?.(null)
    }
  }, [onCollectionChange, activeWalletConnected, activeWalletAddress])

  // Load available traits from API
  useEffect(() => {
    const loadTraits = async () => {
      try {
        const response = await fetch('/api/traits')
        if (response.ok) {
          const data = await response.json()
          const traitsByCategory: Record<string, string[]> = {}
          const descriptionsByCategory: Record<string, Record<string, string>> = {}
          
          data.traits.forEach((trait: { category: string; name: string; description: string }) => {
            if (!traitsByCategory[trait.category]) {
              traitsByCategory[trait.category] = []
              descriptionsByCategory[trait.category] = {}
            }
            traitsByCategory[trait.category].push(trait.name)
            descriptionsByCategory[trait.category][trait.name] =
              trait.description || `${trait.name} trait`
          })
          
          setAvailableTraits(traitsByCategory)
          setTraitDescriptions(descriptionsByCategory)
        }
      } catch (error) {
        console.error('Error loading traits from API:', error)
      }
    }
    
    loadTraits()
  }, [])

  const handleCreateCollection = async (name: string, description: string, traitSelections: TraitSelections) => {
    // Validate wallet connection with detailed logging
    console.log('Creating collection - Wallet state:', { activeWalletConnected, activeWalletAddress })
    
    // Use active wallet address
    const walletAddress = activeWalletAddress
    
    if (!activeWalletConnected || !walletAddress) {
      toast.error('Please connect your wallet to create a collection')
      return
    }
    
    if (!walletAddress || typeof walletAddress !== 'string' || walletAddress.trim() === '') {
      console.error('Invalid wallet address:', walletAddress)
      toast.error('Wallet address is invalid. Please reconnect your wallet.')
      return
    }

    // Validate trait selections locally
    const validation = validateTraitSelections(traitSelections)
    if (!validation.valid) {
      toast.error('Validation errors', { description: validation.errors.join(', ') })
      return
    }

    const finalWalletAddress = walletAddress.trim()
    console.log('Sending collection creation request with wallet:', finalWalletAddress)

    try {
      const response = await fetch('/api/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name, 
          description, 
          traitSelections, 
          wallet_address: finalWalletAddress
        })
      })

      if (response.ok) {
        const data = await response.json()
        setCollections([...collections, data.collection])
        setShowCreateForm(false)
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        console.error('Error creating collection:', errorData)
        toast.error('Error creating collection', { description: errorData.error || 'Unknown error' })
      }
    } catch (error) {
      console.error('Error creating collection:', error)
      toast.error('Failed to create collection', { description: error instanceof Error ? error.message : 'Unknown error' })
    }
  }

  const handleUpdateCollection = async (id: string, updates: Partial<Collection>) => {
    try {
      const response = await fetch(`/api/collections/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      })

      if (response.ok) {
        const data = await response.json()
        setCollections(collections.map(c => c.id === id ? data.collection : c))
        if (activeCollection?.id === id) {
          setActiveCollectionState(data.collection)
          onCollectionChange?.(data.collection)
        }
      } else {
        const error = await response.json()
        toast.error('Error updating collection', { description: error.error })
      }
    } catch (error) {
      console.error('Error updating collection:', error)
      toast.error('Failed to update collection')
    }
  }

  const handleDeleteCollection = (id: string, name: string) => {
    setDeleteConfirm({
      isOpen: true,
      collectionId: id,
      collectionName: name,
    })
  }

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm.collectionId) return

    setDeleting(true)
    try {
      const response = await fetch(`/api/collections/${deleteConfirm.collectionId}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        setCollections(collections.filter(c => c.id !== deleteConfirm.collectionId))
        if (activeCollection?.id === deleteConfirm.collectionId) {
          setActiveCollectionState(null)
          onCollectionChange?.(null)
        }
        setDeleteConfirm({ isOpen: false, collectionId: null, collectionName: '' })
      } else {
        const error = await response.json()
        toast.error('Error deleting collection', { description: error.error || 'Unknown error' })
      }
    } catch (error) {
      console.error('Error deleting collection:', error)
      toast.error('Failed to delete collection. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  const handleDeleteCancel = () => {
    setDeleteConfirm({ isOpen: false, collectionId: null, collectionName: '' })
  }

  const handleSetActive = async (id: string) => {
    try {
      const response = await fetch(`/api/collections/${id}/activate`, {
        method: 'POST'
      })

      if (response.ok) {
        // Reload collections to get updated active state
        const walletAddress = currentAddress || (typeof window !== 'undefined' ? localStorage.getItem('wallet_address') : null)
        if (walletAddress) {
          const collectionsResponse = await fetch(`/api/collections?wallet_address=${encodeURIComponent(walletAddress.trim())}`)
          if (collectionsResponse.ok) {
            const data = await collectionsResponse.json()
            setCollections(data.collections || [])
            
            const active = (data.collections || []).find((c: Collection) => c.isActive)
            setActiveCollectionState(active || null)
            onCollectionChange?.(active || null)
          }
        }
      } else {
        const error = await response.json()
        toast.error('Error activating collection', { description: error.error })
      }
    } catch (error) {
      console.error('Error activating collection:', error)
      toast.error('Failed to activate collection')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-white">Collections</h2>
        <div className="flex gap-2">
          <Link
            href="/collections/advanced"
            className="bg-[#00d4ff] text-white px-4 py-2 rounded hover:bg-[#14F195] text-sm shadow-lg shadow-[#00d4ff]/20 transition-colors"
          >
            Advanced Management
          </Link>
          <button
            onClick={() => setShowCreateForm(true)}
            className="bg-[#00d4ff] text-white px-4 py-2 rounded hover:bg-[#14F195] shadow-lg shadow-[#00d4ff]/20 transition-colors"
          >
            Create Collection
          </button>
        </div>
      </div>

      {showCreateForm && (
        <CollectionForm
          availableTraits={availableTraits}
          traitDescriptions={traitDescriptions}
          onSave={handleCreateCollection}
          onCancel={() => setShowCreateForm(false)}
        />
      )}

      {editingCollection && (
        <CollectionForm
          availableTraits={availableTraits}
          traitDescriptions={traitDescriptions}
          collection={editingCollection}
          onSave={(name, description, traitSelections) => {
            handleUpdateCollection(editingCollection.id, {
              name,
              description,
              traitSelections,
            })
            setEditingCollection(null)
          }}
          onCancel={() => setEditingCollection(null)}
        />
      )}

      <div className="grid gap-4">
        {collections.map((collection) => (
          <div
            key={collection.id}
            className={`border rounded-lg p-4 ${
              collection.isActive 
                ? 'border-[#00d4ff] bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md' 
                : 'border-[#00d4ff]/30 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md'
            }`}
          >
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-semibold text-lg text-white">{collection.name}</h3>
                {collection.description && (
                  <p className="text-white/70 text-sm mt-1">{collection.description}</p>
                )}
                <p className="text-xs text-[#a8a8b8]/80 mt-2">
                  Created: {new Date(collection.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleSetActive(collection.id)}
                  className={`px-3 py-1 text-sm rounded transition-colors ${
                    collection.isActive
                      ? 'bg-[#00d4ff] text-white shadow-lg shadow-[#00d4ff]/20'
                      : 'bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#00d4ff]/30 text-white/70 hover:border-[#00d4ff]/50 hover:text-white'
                  }`}
                >
                  {collection.isActive ? 'Active' : 'Set Active'}
                </button>
                <button
                  onClick={() => setEditingCollection(collection)}
                  className="px-3 py-1 text-sm bg-[#DC1FFF] text-white rounded hover:bg-[#9945FF] shadow-lg shadow-[#DC1FFF]/20 transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDeleteCollection(collection.id, collection.name)}
                  className="px-3 py-1 text-sm bg-[#EF4444] text-white rounded hover:bg-[#ff3838] shadow-lg shadow-[#EF4444]/20 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {collections.length === 0 && (
        <div className="text-center py-8 text-white/70">
          No collections created yet. Create your first collection to get started!
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        onClose={handleDeleteCancel}
        onConfirm={handleDeleteConfirm}
        title="Delete Collection"
        message={`Are you sure you want to delete "${deleteConfirm.collectionName}"? The collection will be moved to your deleted collections and can be viewed later. This action does not delete your layers or traits.`}
        confirmText="Delete"
        cancelText="Cancel"
        confirmButtonClass="bg-red-600 hover:bg-red-700"
        loading={deleting}
      />
    </div>
  )
}

interface CollectionFormProps {
  availableTraits: Record<string, string[]>
  traitDescriptions: Record<string, Record<string, string>>
  collection?: Collection
  onSave: (name: string, description: string, traitSelections: TraitSelections) => void
  onCancel: () => void
}

function CollectionForm({ availableTraits, traitDescriptions, collection, onSave, onCancel }: CollectionFormProps) {
  const [name, setName] = useState(collection?.name || '')
  const [description, setDescription] = useState(collection?.description || '')
  const [traitSelections, setTraitSelections] = useState<TraitSelections>(
    collection?.traitSelections || {
      characterType: { enabled: true, selected: ['skull', 'zombie', 'ghoul', 'werewolf', 'skeleton', 'vampire', 'witch', 'demon', 'mummy', 'reaper'] },
      background: { enabled: true, selected: [] },
      accessories: { enabled: true, selected: [] },
      eyes: { enabled: true, selected: [] },
      mouth: { enabled: true, selected: [] },
      headwear: { enabled: true, selected: [] },
      outfits: { enabled: true, selected: [] },
      props: { enabled: true, selected: [] }
    }
  )

  const handleSave = () => {
    if (!name.trim()) {
      toast.error('Please enter a collection name')
      return
    }

    onSave(name, description, traitSelections)
  }

  const toggleCategory = (category: keyof TraitSelections) => {
    setTraitSelections(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        enabled: !prev[category].enabled
      }
    }))
  }

  const toggleTrait = (category: keyof TraitSelections, trait: string) => {
    setTraitSelections(prev => {
      const selection = prev[category]
      const isSelected = selection.selected.includes(trait)
      
      return {
        ...prev,
        [category]: {
          ...selection,
          selected: isSelected
            ? selection.selected.filter(t => t !== trait)
            : [...selection.selected, trait]
        }
      }
    })
  }

  const selectAllTraits = (category: keyof TraitSelections) => {
    // Get current availableTraits from state to ensure we have the latest value
    const currentAvailableTraits = availableTraits || {}
    const categoryTraits = currentAvailableTraits[category] || []
    
    if (categoryTraits.length === 0) {
      console.warn(`No traits available for category: ${category}`)
      return
    }
    
    setTraitSelections(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        selected: categoryTraits
      }
    }))
  }

  const clearAllTraits = (category: keyof TraitSelections) => {
    setTraitSelections(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        selected: []
      }
    }))
  }

  return (
            <div className="border rounded-lg p-6 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border-[#00d4ff]/30">
              <h3 className="text-lg font-semibold mb-4 text-white">
                {collection ? 'Edit Collection' : 'Create New Collection'}
              </h3>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-white mb-1">
            Collection Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-[#00d4ff]/30 rounded px-3 py-2 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md text-white placeholder-white/50 focus:border-[#00d4ff] focus:ring-2 focus:ring-[#00d4ff]/20 focus:outline-none"
            placeholder="Enter collection name"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-white mb-1">
            Description (Optional)
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full border border-[#00d4ff]/30 rounded px-3 py-2 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md text-white placeholder-white/50 focus:border-[#00d4ff] focus:ring-2 focus:ring-[#00d4ff]/20 focus:outline-none"
            placeholder="Enter collection description"
            rows={3}
          />
        </div>

        <div className="space-y-4">
          <h4 className="font-medium text-white">Trait Categories</h4>
          
          {availableTraits && Object.keys(availableTraits).length > 0 ? (
            Object.entries(traitSelections).map(([category, selection]) => (
              <TraitCategorySelector
                key={category}
                category={category as keyof TraitSelections}
                selection={selection}
                availableTraits={availableTraits}
                traitDescriptions={traitDescriptions}
                onToggleCategory={() => toggleCategory(category as keyof TraitSelections)}
                onToggleTrait={(trait) => toggleTrait(category as keyof TraitSelections, trait)}
                onSelectAll={() => selectAllTraits(category as keyof TraitSelections)}
                onClearAll={() => clearAllTraits(category as keyof TraitSelections)}
              />
            ))
          ) : (
            <div className="text-center py-4 text-white/70">
              Loading traits...
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-4">
          <button
            onClick={handleSave}
            className="bg-[#00d4ff] text-white px-4 py-2 rounded hover:bg-[#14F195] shadow-lg shadow-[#00d4ff]/20 transition-colors"
          >
            {collection ? 'Update Collection' : 'Create Collection'}
          </button>
          <button
            onClick={onCancel}
            className="bg-gradient-to-r from-[#00d4ff] to-[#DC1FFF] hover:from-[#14F195] hover:to-[#9945FF] text-white px-4 py-2 rounded shadow-lg shadow-[#00d4ff]/20 transition-all duration-200"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

interface TraitCategorySelectorProps {
  category: keyof TraitSelections
  selection: { enabled: boolean; selected: string[] }
  availableTraits: Record<string, string[]>
  traitDescriptions: Record<string, Record<string, string>>
  onToggleCategory: () => void
  onToggleTrait: (trait: string) => void
  onSelectAll: () => void
  onClearAll: () => void
}

function TraitCategorySelector({ 
  category, 
  selection, 
  availableTraits,
  traitDescriptions,
  onToggleCategory, 
  onToggleTrait, 
  onSelectAll, 
  onClearAll 
}: TraitCategorySelectorProps) {
  // Ensure availableTraits is defined and has the category
  const safeAvailableTraits = availableTraits || {}
  const categoryTraits = safeAvailableTraits[category] || []
  
  return (
    <div className="border rounded-lg p-4 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border-[#00d4ff]/30">
      <div className="flex items-center justify-between mb-3">
        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={selection.enabled}
            onChange={onToggleCategory}
            className="rounded bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border-[#00d4ff]/30 text-[#00d4ff] focus:ring-[#00d4ff]"
          />
          <span className="font-medium capitalize text-white">
            {category.replace(/([A-Z])/g, ' $1').trim()}
          </span>
        </label>
        
        {selection.enabled && (
          <div className="flex gap-2">
            <button
              onClick={onSelectAll}
              className="text-xs bg-[#00d4ff] text-white px-2 py-1 rounded hover:bg-[#14F195] shadow-lg shadow-[#00d4ff]/20 transition-colors"
            >
              Select All
            </button>
            <button
              onClick={onClearAll}
              className="text-xs bg-[#EF4444] text-white px-2 py-1 rounded hover:bg-[#ff3838] shadow-lg shadow-[#EF4444]/20 transition-colors"
            >
              Clear All
            </button>
          </div>
        )}
      </div>

      {selection.enabled && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-60 overflow-y-auto">
          {categoryTraits.map((trait) => {
            const description = traitDescriptions?.[category]?.[trait] || `${trait} trait`
            return (
              <label key={trait} className="flex items-start space-x-3 p-2 rounded border border-[#00d4ff]/30 hover:bg-[#00d4ff]/10 cursor-pointer bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md">
                <input
                  type="checkbox"
                  checked={selection.selected.includes(trait)}
                  onChange={() => onToggleTrait(trait)}
                  className="rounded mt-1 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border-[#00d4ff]/30 text-[#00d4ff] focus:ring-[#00d4ff]"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white">{trait}</div>
                  <div className="text-xs text-white/70 mt-1 overflow-hidden" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{description}</div>
                </div>
              </label>
            )
          })}
        </div>
      )}

      {selection.enabled && (
        <div className="mt-2 text-xs text-[#a8a8b8]/80">
          {selection.selected.length} of {categoryTraits.length} traits selected
        </div>
      )}
    </div>
  )
}
