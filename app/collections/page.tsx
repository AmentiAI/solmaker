'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
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

    setLoading(true)
    try {
      const response = await fetch(`/api/collections?wallet_address=${encodeURIComponent(currentAddress)}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store'
      })
      
      if (response.ok) {
        const data = await response.json()
        const ownedList = data.owned_collections || []
        const collabList = data.collaborator_collections || []
        const allCollectionsList = data.collections || []
        
        setOwnedCollections(ownedList)
        setCollabCollections(collabList)
        setCollections(allCollectionsList)
      }
    } catch (error) {
      console.error('Error loading collections:', error)
    } finally {
      setLoading(false)
    }
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
      <div className="min-h-screen bg-[#0D0D11] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-[#9945FF] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (isConnected && currentAddress && (credits === null || credits === 0)) {
    return (
      <div className="min-h-screen bg-[#0D0D11] flex items-center justify-center p-6">
        <div className="max-w-md bg-[#121218] border-2 border-[#9945FF]/30 rounded-2xl p-8 text-center">
          <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-[#9945FF] to-[#DC1FFF] rounded-2xl flex items-center justify-center">
            <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-3xl font-bold text-white mb-4">No Credits Available</h2>
          <p className="text-[#A1A1AA] mb-6">
            You need credits to access the collection management page.
          </p>
          <Link
            href="/"
            className="inline-block px-8 py-3 bg-gradient-to-r from-[#9945FF] to-[#A855F7] text-white font-semibold rounded-xl hover:scale-105 transition-all duration-300"
          >
            Purchase Credits
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0D0D11]">
      {/* Hero Header - NEW Professional */}
      <div className="relative bg-gradient-to-br from-[#121218] to-[#1A1A22] border-b border-[#9945FF]/20">
        <div className="container mx-auto px-6 py-12">
          <div className="max-w-4xl">
            <h1 className="text-5xl md:text-6xl font-extrabold text-white mb-4">
              My Collections
            </h1>
            <p className="text-xl text-[#A1A1AA]">
              Manage and organize your NFT collections
            </p>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-12">
        <div className="max-w-7xl mx-auto">
          {/* Create Collection CTA - NEW Professional Card */}
          <Link
            href="/collections/create"
            className="block mb-12 group"
          >
            <div className="relative overflow-hidden bg-gradient-to-r from-[#9945FF] to-[#14F195] rounded-2xl p-12 text-center transition-all duration-300 group-hover:scale-105 shadow-2xl shadow-[#9945FF]/30">
              <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />
              <div className="relative z-10">
                <div className="text-6xl mb-4">✨</div>
                <h2 className="text-3xl font-bold text-white mb-2">Create New Collection</h2>
                <p className="text-xl text-white/90">Start building your NFT collection today</p>
              </div>
            </div>
          </Link>

          {/* Search and Filter Bar - NEW Professional */}
          <div className="bg-[#121218] border border-[#9945FF]/20 rounded-xl p-6 mb-8">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#A1A1AA]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search collections..."
                  className="w-full pl-12 pr-4 py-3 bg-[#1A1A22] border-2 border-[#9945FF]/20 focus:border-[#9945FF] focus:ring-4 focus:ring-[#9945FF]/20 text-white placeholder:text-[#71717A] rounded-xl transition-all duration-300 outline-none"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setActiveTab('collections')}
                  className={`px-6 py-3 font-semibold rounded-xl transition-all duration-300 ${
                    activeTab === 'collections'
                      ? 'bg-gradient-to-r from-[#9945FF] to-[#A855F7] text-white shadow-lg shadow-[#9945FF]/30'
                      : 'bg-[#1A1A22] text-[#A1A1AA] hover:text-white'
                  }`}
                >
                  My Collections ({ownedCollections.length})
                </button>
                <button
                  onClick={() => setActiveTab('collabs')}
                  className={`px-6 py-3 font-semibold rounded-xl transition-all duration-300 ${
                    activeTab === 'collabs'
                      ? 'bg-gradient-to-r from-[#9945FF] to-[#A855F7] text-white shadow-lg shadow-[#9945FF]/30'
                      : 'bg-[#1A1A22] text-[#A1A1AA] hover:text-white'
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
                    className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-all duration-300 ${
                      statusFilter === filter.value
                        ? 'bg-gradient-to-r from-[#9945FF]/20 to-[#14F195]/20 border border-[#9945FF]/30 text-white'
                        : 'bg-[#1A1A22] text-[#A1A1AA] hover:text-white'
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
            <div className="bg-[#121218] border border-[#9945FF]/20 rounded-2xl p-12 text-center">
              <div className="text-6xl mb-4">🎨</div>
              <h2 className="text-2xl font-bold text-white mb-2">No Collections Found</h2>
              <p className="text-[#A1A1AA] mb-6">
                {searchQuery ? 'Try adjusting your search' : 'Create your first collection to get started'}
              </p>
              {!searchQuery && (
                <Link
                  href="/collections/create"
                  className="inline-block px-8 py-3 bg-gradient-to-r from-[#9945FF] to-[#A855F7] text-white font-semibold rounded-xl hover:scale-105 transition-all duration-300"
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
                  className="bg-[#121218] border-2 border-[#9945FF]/20 rounded-2xl overflow-hidden hover:border-[#9945FF]/40 transition-all duration-300 hover:scale-105 group"
                >
                  {/* Collection Header */}
                  <div className="p-6 border-b border-[#9945FF]/20">
                    <div className="flex items-start justify-between mb-3">
                      <h3 className="text-xl font-bold text-white flex-1 pr-2">{collection.name}</h3>
                      <span className={`px-3 py-1 text-xs font-bold rounded-full ${
                        collection.status === 'draft' ? 'bg-[#71717A]/20 text-[#A1A1AA]' :
                        collection.status === 'launchpad' || collection.status === 'launchpad_live' ? 'bg-[#9945FF]/20 text-[#9945FF]' :
                        collection.status === 'marketplace' ? 'bg-[#14F195]/20 text-[#14F195]' :
                        'bg-[#00D4FF]/20 text-[#00D4FF]'
                      }`}>
                        {collection.status === 'draft' && '📝 Draft'}
                        {(collection.status === 'launchpad' || collection.status === 'launchpad_live') && '🚀 Launchpad'}
                        {collection.status === 'self_inscribe' && '⚡ Inscribe'}
                        {collection.status === 'marketplace' && '💰 Market'}
                        {collection.status === 'deleted' && '🗑️ Deleted'}
                      </span>
                    </div>
                    {collection.description && (
                      <p className="text-sm text-[#A1A1AA] line-clamp-2">{collection.description}</p>
                    )}
                  </div>

                  {/* Collection Actions */}
                  <div className="p-6 space-y-2">
                    <Link
                      href={`/collections/${collection.id}`}
                      className="block w-full px-4 py-3 bg-gradient-to-r from-[#9945FF] to-[#A855F7] hover:from-[#7C3AED] hover:to-[#9945FF] text-white font-semibold rounded-xl text-center transition-all duration-300 hover:scale-105"
                    >
                      View Collection
                    </Link>
                    {collection.status !== 'deleted' && (
                      <>
                        <Link
                          href={`/collections/${collection.id}/edit`}
                          className="block w-full px-4 py-3 bg-[#1A1A22] border border-[#9945FF]/20 hover:border-[#9945FF]/40 text-white font-semibold rounded-xl text-center transition-all duration-300"
                        >
                          Edit Settings
                        </Link>
                        <button
                          onClick={() => handleDeleteClick(collection.id, collection.name)}
                          className="w-full px-4 py-3 bg-[#1A1A22] border border-red-500/20 hover:border-red-500/40 text-[#EF4444] font-semibold rounded-xl transition-all duration-300"
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
