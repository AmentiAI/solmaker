'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { PageHeader } from '@/components/page-header'
import { useWallet } from '@/lib/wallet/compatibility'
import { useCredits } from '@/lib/credits-context'
import { ConfirmDialog } from '@/components/confirm-dialog'

interface Collection {
  id: string
  name: string
  description?: string
  is_active: boolean
  created_at: string
  updated_at: string
  wallet_address?: string
  is_owner?: boolean
  collaborator_role?: string
  status?: 'draft' | 'launchpad' | 'launchpad_live' | 'self_inscribe' | 'marketplace' | 'deleted'
  banner_image_url?: string
  mobile_image_url?: string
  total_ordinals?: number
  thumbnail_url?: string
}
 
export default function CollectionsPage() {
  const { isConnected, currentAddress } = useWallet()
  const { credits, loading: loadingCredits } = useCredits()
  
  const { activeWalletAddress, activeWalletConnected } = useMemo(() => {
    if (currentAddress && isConnected) {
      return { activeWalletAddress: currentAddress, activeWalletConnected: true }
    }
    return { activeWalletAddress: null, activeWalletConnected: false }
  }, [currentAddress, isConnected])
  
  const [collections, setCollections] = useState<Collection[]>([])
  const [ownedCollections, setOwnedCollections] = useState<Collection[]>([])
  const [collabCollections, setCollabCollections] = useState<Collection[]>([])
  const [activeTab, setActiveTab] = useState<'collections' | 'collabs'>('collections')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'launchpad' | 'self_inscribe' | 'marketplace' | 'deleted'>('all')
  const [loading, setLoading] = useState(true)
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; collectionId: string | null; collectionName: string }>({
    isOpen: false,
    collectionId: null,
    collectionName: '',
  })
  const [deleting, setDeleting] = useState(false)
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({})

  useEffect(() => {
    if (activeWalletConnected && activeWalletAddress) {
      loadCollections()
    } else {
      setCollections([])
      setOwnedCollections([])
      setCollabCollections([])
      setLoading(false)
    }
  }, [activeWalletConnected, activeWalletAddress])

  const loadCollections = async () => {
    if (!currentAddress) {
      setCollections([])
      setOwnedCollections([])
      setCollabCollections([])
      setLoading(false)
      return
    }

    const walletRequested = currentAddress
    setLoading(true)
    try {
      const response = await fetch(`/api/collections?wallet_address=${encodeURIComponent(walletRequested)}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store'
      })

      // Only apply response if wallet is still connected and same as requested (owned + collaborator only)
      if (activeWalletAddress === walletRequested && response.ok) {
        const data = await response.json()
        const ownedList = data.owned_collections || []
        const collabList = data.collaborator_collections || []
        const allCollectionsList = data.collections || []
        setOwnedCollections(ownedList)
        setCollabCollections(collabList)
        setCollections(allCollectionsList)

        // Load thumbnails for all collections
        loadThumbnails([...ownedList, ...collabList])
      } else if (activeWalletAddress !== walletRequested) {
        setCollections([])
        setOwnedCollections([])
        setCollabCollections([])
      }
    } catch (error) {
      console.error('Error loading collections:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadThumbnails = async (collections: Collection[]) => {
    const thumbnailData: Record<string, string> = {}

    // Fetch latest ordinal for each collection
    await Promise.all(
      collections.map(async (collection) => {
        try {
          const response = await fetch(`/api/collections/${collection.id}/ordinals?limit=1`)
          if (response.ok) {
            const data = await response.json()
            const ordinals = data.ordinals || []
            if (ordinals.length > 0 && ordinals[0].image_url) {
              thumbnailData[collection.id] = ordinals[0].image_url
            }
          }
        } catch (error) {
          console.error(`Error loading thumbnail for collection ${collection.id}:`, error)
        }
      })
    )

    setThumbnails(thumbnailData)
  }

  const handleDeleteClick = (id: string, name: string) => {
    setDeleteConfirm({ isOpen: true, collectionId: id, collectionName: name })
  }

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm.collectionId) return

    setDeleting(true)
    try {
      const response = await fetch(`/api/collections/${deleteConfirm.collectionId}`, { method: 'DELETE' })
      if (response.ok) {
        await loadCollections()
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

  // Filter collections
  const filteredCollections = useMemo(() => {
    let filtered = activeTab === 'collections' ? ownedCollections : collabCollections
    
    // Status filter
    if (activeTab === 'collections' && statusFilter !== 'all') {
      if (statusFilter === 'launchpad') {
        filtered = filtered.filter(c => c.status === 'launchpad' || c.status === 'launchpad_live')
      } else {
        filtered = filtered.filter(c => c.status === statusFilter)
      }
    } else if (activeTab === 'collections' && statusFilter === 'all') {
      filtered = filtered.filter(c => c.status !== 'deleted')
    }
    
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(c => 
        c.name.toLowerCase().includes(query) || 
        c.description?.toLowerCase().includes(query)
      )
    }
    
    return filtered
  }, [activeTab, ownedCollections, collabCollections, statusFilter, searchQuery])

  if (loading || loadingCredits) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-[#D4AF37] border-t-transparent animate-spin" />
      </div>
    )
  }

  if (isConnected && currentAddress && (credits === null || credits === 0)) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-6">
        <div className="max-w-md bg-[#1a1a1a] border-2 border-[#D4AF37] p-8 text-center">
          <div className="w-20 h-20 mx-auto mb-6 bg-[#0a0a0a] border-2 border-[#D4AF37] flex items-center justify-center">
            <svg className="w-10 h-10 text-[#D4AF37]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-3xl font-bold text-white mb-4 uppercase tracking-wide">NO CREDITS AVAILABLE</h2>
          <p className="text-[#808080] mb-6">
            You need credits to access the collection management page.
          </p>
          <Link
            href="/"
            className="inline-block px-8 py-3 bg-[#0a0a0a] border-2 border-[#D4AF37] text-[#D4AF37] font-semibold uppercase tracking-wide hover:bg-[#D4AF37] hover:text-black transition-all duration-300"
          >
            Purchase Credits
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <PageHeader
        title="Collections"
        subtitle="Manage and organize your NFT collections"
      />

      <div className="container mx-auto px-6 lg:px-12 py-12">
        <div className="max-w-7xl mx-auto">
          {/* Create Collection CTA - NEW Professional Card */}
          <Link
            href="/collections/create"
            className="block mb-12 group"
          >
            <div className="relative overflow-hidden bg-[#0a0a0a] border-2 border-[#D4AF37] p-12 text-center transition-all duration-300 group-hover:bg-[#D4AF37]">
              <div className="relative z-10">
                <div className="text-6xl mb-4">✨</div>
                <h2 className="text-3xl font-bold text-white mb-2 uppercase tracking-wide group-hover:text-black transition-colors duration-300">Create New Collection</h2>
                <p className="text-xl text-[#808080] group-hover:text-black transition-colors duration-300">Start building your NFT collection today</p>
              </div>
            </div>
          </Link>

          {/* Search and Filter Bar - NEW Professional */}
          <div className="bg-[#1a1a1a] border border-[#404040] p-6 mb-8">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#808080]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search collections..."
                  className="w-full pl-12 pr-4 py-3 bg-[#0a0a0a] border-2 border-[#404040] focus:border-[#D4AF37] text-white placeholder:text-[#808080] transition-all duration-300 outline-none"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setActiveTab('collections')}
                  className={`px-6 py-3 font-semibold uppercase tracking-wide transition-all duration-300 ${
                    activeTab === 'collections'
                      ? 'bg-[#D4AF37] text-black'
                      : 'bg-[#0a0a0a] border-2 border-[#404040] text-[#808080] hover:text-white hover:border-[#D4AF37]'
                  }`}
                >
                  My Collections ({ownedCollections.length})
                </button>
                <button
                  onClick={() => setActiveTab('collabs')}
                  className={`px-6 py-3 font-semibold uppercase tracking-wide transition-all duration-300 ${
                    activeTab === 'collabs'
                      ? 'bg-[#D4AF37] text-black'
                      : 'bg-[#0a0a0a] border-2 border-[#404040] text-[#808080] hover:text-white hover:border-[#D4AF37]'
                  }`}
                >
                  Collaborations ({collabCollections.length})
                </button>
              </div>
            </div>

            {/* Status Filters */}
            {activeTab === 'collections' && (
              <div className="flex gap-2 mt-4 overflow-x-auto pb-2">
                {[
                  { value: 'all', label: 'All' },
                  { value: 'draft', label: 'Draft' },
                  { value: 'launchpad', label: 'Launchpad' },
                  { value: 'self_inscribe', label: 'Inscribe' },
                  { value: 'marketplace', label: 'Marketplace' },
                  { value: 'deleted', label: 'Deleted' }
                ].map(filter => (
                  <button
                    key={filter.value}
                    onClick={() => setStatusFilter(filter.value as any)}
                    className={`px-4 py-2 font-medium whitespace-nowrap uppercase tracking-wide transition-all duration-300 ${
                      statusFilter === filter.value
                        ? 'bg-[#0a0a0a] border-2 border-[#D4AF37] text-[#D4AF37]'
                        : 'bg-[#0a0a0a] border border-[#404040] text-[#808080] hover:text-white hover:border-[#D4AF37]'
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Collections Grid - NEW Professional Cards */}
          {filteredCollections.length === 0 ? (
            <div className="bg-[#1a1a1a] border-2 border-[#404040] p-12 text-center">
              <div className="text-6xl mb-4">🎨</div>
              <h2 className="text-2xl font-bold text-white mb-2 uppercase tracking-wide">NO COLLECTIONS FOUND</h2>
              <p className="text-[#808080] mb-6">
                {searchQuery ? 'Try adjusting your search' : 'Create your first collection to get started'}
              </p>
              {!searchQuery && (
                <Link
                  href="/collections/create"
                  className="inline-block px-8 py-3 bg-[#0a0a0a] border-2 border-[#D4AF37] text-[#D4AF37] font-semibold uppercase tracking-wide hover:bg-[#D4AF37] hover:text-black transition-all duration-300"
                >
                  Create Collection
                </Link>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredCollections.map((collection) => (
                <div
                  key={collection.id}
                  className="bg-[#1a1a1a] border-2 border-[#404040] overflow-hidden hover:border-[#D4AF37] transition-all duration-300 group"
                >
                  {/* Collection Image */}
                  <div className="relative aspect-video bg-[#0a0a0a] overflow-hidden">
                    {thumbnails[collection.id] || collection.banner_image_url || collection.mobile_image_url ? (
                      <img
                        src={thumbnails[collection.id] || collection.banner_image_url || collection.mobile_image_url}
                        alt={collection.name}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <div className="text-center">
                          <div className="text-6xl mb-2 opacity-50">🎨</div>
                          <p className="text-[#808080] text-sm font-semibold uppercase tracking-wide">No Preview</p>
                        </div>
                      </div>
                    )}
                    {/* Status Badge Overlay */}
                    <div className="absolute top-4 right-4">
                      <span className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wide backdrop-blur-sm ${
                        collection.status === 'draft' ? 'bg-[#808080]/80 text-white border border-white/20' :
                        collection.status === 'launchpad' || collection.status === 'launchpad_live' ? 'bg-[#D4AF37]/80 text-black border border-black/20' :
                        collection.status === 'marketplace' ? 'bg-[#D4AF37]/80 text-black border border-black/20' :
                        'bg-[#D4AF37]/80 text-black border border-black/20'
                      }`}>
                        {collection.status === 'draft' && '📝 Draft'}
                        {(collection.status === 'launchpad' || collection.status === 'launchpad_live') && '🚀 Launchpad'}
                        {collection.status === 'self_inscribe' && '⚡ Inscribe'}
                        {collection.status === 'marketplace' && '💰 Market'}
                        {collection.status === 'deleted' && '🗑️ Deleted'}
                      </span>
                    </div>
                  </div>

                  {/* Collection Header */}
                  <div className="p-6 border-b border-[#404040]">
                    <div className="mb-3">
                      <h3 className="text-xl font-bold text-white mb-2 uppercase tracking-wide">{collection.name}</h3>
                      {collection.total_ordinals !== undefined && (
                        <p className="text-sm text-[#D4AF37] font-semibold uppercase tracking-wide">
                          {collection.total_ordinals} {collection.total_ordinals === 1 ? 'Item' : 'Items'}
                        </p>
                      )}
                    </div>
                    {collection.description && (
                      <p className="text-sm text-[#808080] line-clamp-2">{collection.description}</p>
                    )}
                  </div>

                  {/* Collection Actions */}
                  <div className="p-6 space-y-2">
                    <Link
                      href={`/collections/${collection.id}`}
                      className="block w-full px-4 py-3 bg-[#D4AF37] text-black font-semibold uppercase tracking-wide text-center transition-all duration-300 hover:bg-[#0a0a0a] hover:text-[#D4AF37] border-2 border-[#D4AF37]"
                    >
                      View Collection
                    </Link>
                    {collection.status !== 'deleted' && (
                      <>
                        <Link
                          href={`/collections/${collection.id}/edit`}
                          className="block w-full px-4 py-3 bg-[#0a0a0a] border-2 border-[#404040] hover:border-[#D4AF37] text-white font-semibold uppercase tracking-wide text-center transition-all duration-300"
                        >
                          Edit Settings
                        </Link>
                        <button
                          onClick={() => handleDeleteClick(collection.id, collection.name)}
                          className="w-full px-4 py-3 bg-[#0a0a0a] border-2 border-red-500/40 hover:border-red-500 text-[#EF4444] font-semibold uppercase tracking-wide transition-all duration-300"
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        onClose={handleDeleteCancel}
        onConfirm={handleDeleteConfirm}
        title="Delete Collection"
        message={`Are you sure you want to delete "${deleteConfirm.collectionName}"?`}
        confirmText="Delete"
        cancelText="Cancel"
        confirmButtonClass="bg-red-500 hover:bg-red-600"
        loading={deleting}
      />
    </div>
  )
}
