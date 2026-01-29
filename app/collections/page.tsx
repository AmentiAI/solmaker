'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { useWallet } from '@/lib/wallet/compatibility'
import { isAuthorized } from '@/lib/auth/access-control'
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
  
  // Determine active wallet (Bitcoin only)
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
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'launchpad' | 'self_inscribe' | 'marketplace' | 'deleted'>('all')
  const [loading, setLoading] = useState(true)
  const [showQuickGuide, setShowQuickGuide] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; collectionId: string | null; collectionName: string }>({
    isOpen: false,
    collectionId: null,
    collectionName: '',
  })
  const [deleting, setDeleting] = useState(false)
  
  // Use shared credits context - no duplicate API call
  const { credits, loading: loadingCredits } = useCredits()

  const authorized = isAuthorized(activeWalletAddress)

  useEffect(() => {
    if (activeWalletConnected && activeWalletAddress) {
      loadCollections()
    } else {
      setCollections([])
      setOwnedCollections([])
      setCollabCollections([])
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      const walletAddress = currentAddress?.trim()
      if (!walletAddress) {
        console.error('No wallet address available')
        setCollections([])
        setLoading(false)
        return
      }
      
      console.log('[Collections Page] Loading collections for wallet:', walletAddress)
      console.log('[Collections Page] Wallet address length:', walletAddress.length)
      const apiUrl = `/api/collections?wallet_address=${encodeURIComponent(walletAddress)}`
      console.log('[Collections Page] API URL:', apiUrl)
      
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-store'
      })
      
      console.log('[Collections Page] Response status:', response.status)
      console.log('[Collections Page] Response ok:', response.ok)
      
      if (response.ok) {
        const data = await response.json()
        console.log('[Collections Page] Full API response:', JSON.stringify(data, null, 2))
        
        // Get owned and collaborator collections separately
        const ownedList = data.owned_collections || []
        const collabList = data.collaborator_collections || []
        const allCollectionsList = data.collections || []
        
        console.log('[Collections Page] Owned collections:', ownedList.length)
        console.log('[Collections Page] Collaborator collections:', collabList.length)
        console.log('[Collections Page] All collections:', allCollectionsList.length)
        
        // Ensure all collections have required fields
        const filterValid = (list: any[]) => list.filter((col: any) => {
          const isValid = col && col.id && col.name
          if (!isValid) {
            console.warn('[Collections Page] Invalid collection found:', col)
          }
          return isValid
        })
        
        const validOwned = filterValid(ownedList)
        const validCollabs = filterValid(collabList)
        const validAll = filterValid(allCollectionsList)
        
        console.log('[Collections Page] Valid owned:', validOwned.length)
        console.log('[Collections Page] Valid collabs:', validCollabs.length)
        console.log('[Collections Page] Valid all:', validAll.length)
        
        setOwnedCollections(validOwned)
        setCollabCollections(validCollabs)
        setCollections(validAll)
      } else {
        const errorText = await response.text()
        console.error('[Collections Page] Error response status:', response.status)
        console.error('[Collections Page] Error response text:', errorText)
        let errorData
        try {
          errorData = JSON.parse(errorText)
        } catch {
          errorData = { error: errorText || 'Unknown error' }
        }
        console.error('[Collections Page] Error data:', errorData)
        setCollections([])
        setOwnedCollections([])
        setCollabCollections([])
      }
    } catch (error) {
      console.error('Error loading collections:', error)
      setCollections([])
      setOwnedCollections([])
      setCollabCollections([])
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteClick = (id: string, name: string) => {
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

  if (loading || loadingCredits) {
    return (
      <div className="container mx-auto px-3 sm:px-4 py-6 sm:py-8">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-3xl font-bold mb-8 text-white">Collection Management</h1>
          <div className="text-center py-8">
            <div className="text-gray-400">Loading...</div>
          </div>
        </div>
      </div>
    )
  }

  // Check if user has credits - block access if they don't
  if (isConnected && currentAddress && (credits === null || credits === 0)) {
    return (
      <div className="container mx-auto px-6 py-12">
        <div className="max-w-4xl mx-auto">
          <div className="cosmic-card border border-[#ff6b35]/40 rounded-xl p-8 shadow-2xl">
            <div className="text-center">
              <div className="mb-6">
                <svg className="w-20 h-20 mx-auto text-[#ff6b35]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h2 className="text-3xl font-bold text-[#ff6b35] mb-4">No Credits Available</h2>
              <p className="text-gray-300 text-lg mb-2">
                You need credits to access the collection management page.
              </p>
              <p className="text-gray-400 mb-8">
                1 credit = 1 image generation AND 1 credit = 20 traits generated
              </p>
              <Link
                href="/"
                className="inline-block px-8 py-3 btn-cosmic text-white rounded-lg font-semibold text-lg transition-all duration-200"
              >
                Purchase Credits
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      {/* Hero Header */}
      <div className="relative bg-gradient-to-r from-[#0a0e27]/90 via-[#1a1f3a]/90 to-[#0f172a]/90 text-white border-b border-[#00d4ff]/30">
        <div className="container mx-auto px-6 py-8">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <h1 className="text-4xl md:text-5xl font-black tracking-tight text-white">Collections</h1>
              <p className="text-[#a5b4fc] mt-2 text-lg">
                Manage and organize your ordinal collections
              </p>
            </div>
          </div>
        </div>
      </div>
      
      <div className="container mx-auto px-6 py-12">
        <div className="max-w-7xl mx-auto">

        {/* Big Create Collection Card */}
        <Link
          href="/collections/create"
          className="block w-full btn-cosmic text-white rounded-2xl shadow-2xl transition-all duration-300 hover:scale-[1.02] mb-8"
        >
          <div className="p-8 text-center">
            <div className="text-6xl mb-4">✨</div>
            <h2 className="text-3xl font-bold mb-2">Create New Collection</h2>
            <p className="text-xl text-gray-300">Click here to start creating your ordinal collection</p>
          </div>
        </Link>

        {/* Instructions Banner - Collapsible */}
        <div className="cosmic-card border border-[#00d4ff]/30 rounded-xl mb-6 overflow-hidden">
          <button
            onClick={() => setShowQuickGuide(!showQuickGuide)}
            className="w-full flex items-center justify-between p-4 hover:bg-[#00d4ff]/10 transition-colors"
          >
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <span>📚</span> Quick Guide
            </h3>
            <svg
              className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${showQuickGuide ? 'transform rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showQuickGuide && (
            <div className="px-6 pb-6 pt-2">
              <div className="grid md:grid-cols-2 gap-4 text-sm text-gray-300">
                <div>
                  <p className="font-semibold text-cosmic-blue mb-2">Creating a Collection:</p>
                  <ol className="list-decimal list-inside space-y-1 ml-2">
                    <li>Click "Create Collection" button above</li>
                    <li>Enter a name and description</li>
                    <li>Add layers and traits to start generating</li>
                  </ol>
                </div>
                <div>
                  <p className="font-semibold text-[#4561ad] mb-2">Using Collections:</p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li><strong>View</strong> = See all NFTs in this collection</li>
                    <li><strong>Edit</strong> = Modify collection settings, compression, and more</li>
                    <li><strong>Collaborate</strong> = Invite others by username or wallet address</li>
                  </ul>
                </div>
                <div>
                  <p className="font-semibold text-[#4561ad] mb-2">Collaboration:</p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>Invite team members to help build your collection</li>
                    <li>Use username (if they have a profile) or wallet address</li>
                    <li>Assign "Editor" or "Viewer" roles</li>
                    <li>Collaborators see the collection in their list</li>
                  </ul>
                </div>
                <div>
                  <p className="font-semibold text-[#ff6b35] mb-2">Image Compression:</p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>Set compression settings in Edit page</li>
                    <li>Choose quality, dimensions, or target file size (KB)</li>
                    <li>Compressed images shown automatically during generation</li>
                    <li>Download original or compressed versions</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>

        {!activeWalletConnected && (
          <div className="cosmic-card border border-[#ff6b35]/30 rounded-lg p-4 mb-6">
            <p className="text-[#ff6b35]">
              ⚠️ Please connect your wallet to view and manage your collections.
            </p>
          </div>
        )}

        {activeWalletConnected && !activeWalletAddress && (
          <div className="cosmic-card border border-[#ff6b35]/30 rounded-lg p-4 mb-6">
            <p className="text-[#ff6b35]">
              ⚠️ Wallet address not available. Please reconnect your wallet.
            </p>
          </div>
        )}

        {/* Tabs */}
        <div className="cosmic-card border border-[#00d4ff]/30 rounded-lg mb-6">
          <div className="flex border-b border-[#00d4ff]/20">
            <button
              onClick={() => setActiveTab('collections')}
              className={`flex-1 px-6 py-3 text-center font-semibold transition-colors ${
                activeTab === 'collections'
                  ? 'text-cosmic-blue border-b-2 border-[#00d4ff] bg-[#00d4ff]/10'
                  : 'text-gray-400 hover:text-white hover:bg-[#1a1f3a]'
              }`}
            >
              My Collections ({ownedCollections.length})
            </button>
            <button
              onClick={() => setActiveTab('collabs')}
              className={`flex-1 px-6 py-3 text-center font-semibold transition-colors ${
                activeTab === 'collabs'
                  ? 'text-cosmic-blue border-b-2 border-[#00d4ff] bg-[#00d4ff]/10'
                  : 'text-gray-400 hover:text-white hover:bg-[#1a1f3a]'
              }`}
            >
              My Collabs ({collabCollections.length})
            </button>
          </div>
          
          {/* Status Filter Tabs - Only show for My Collections */}
          {activeTab === 'collections' && (
            <div className="flex border-b border-[#00d4ff]/20 bg-[#0a0e27]/60">
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-2 md:px-4 py-1.5 md:py-2 text-xs md:text-sm font-medium transition-colors ${
                  statusFilter === 'all'
                    ? 'text-cosmic-blue border-b-2 border-[#00d4ff] bg-[#0a0e27]'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                All ({ownedCollections.length})
              </button>
              <button
                onClick={() => setStatusFilter('draft')}
                className={`px-2 md:px-4 py-1.5 md:py-2 text-xs md:text-sm font-medium transition-colors ${
                  statusFilter === 'draft'
                    ? 'text-cosmic-blue border-b-2 border-[#00d4ff] bg-[#0a0e27]'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Draft ({ownedCollections.filter(c => c.status === 'draft').length})
              </button>
              <button
                onClick={() => setStatusFilter('launchpad')}
                className={`px-2 md:px-4 py-1.5 md:py-2 text-xs md:text-sm font-medium transition-colors ${
                  statusFilter === 'launchpad'
                    ? 'text-cosmic-blue border-b-2 border-[#00d4ff] bg-[#0a0e27]'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                Launch ({ownedCollections.filter(c => c.status === 'launchpad' || c.status === 'launchpad_live').length})
              </button>
              <button
                onClick={() => setStatusFilter('self_inscribe')}
                className={`px-2 md:px-4 py-1.5 md:py-2 text-xs md:text-sm font-medium transition-colors ${
                  statusFilter === 'self_inscribe'
                    ? 'text-cosmic-blue border-b-2 border-[#00d4ff] bg-[#0a0e27]'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                Inscribe ({ownedCollections.filter(c => c.status === 'self_inscribe').length})
              </button>
              <button
                onClick={() => setStatusFilter('marketplace')}
                className={`px-2 md:px-4 py-1.5 md:py-2 text-xs md:text-sm font-medium transition-colors ${
                  statusFilter === 'marketplace'
                    ? 'text-cosmic-blue border-b-2 border-[#00d4ff] bg-[#0a0e27]'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                Market ({ownedCollections.filter(c => c.status === 'marketplace').length})
              </button>
              <button
                onClick={() => setStatusFilter('deleted')}
                className={`px-2 md:px-4 py-1.5 md:py-2 text-xs md:text-sm font-medium transition-colors ${
                  statusFilter === 'deleted'
                    ? 'text-cosmic-blue border-b-2 border-[#00d4ff] bg-[#0a0e27]'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                Deleted ({ownedCollections.filter(c => c.status === 'deleted').length})
              </button>
            </div>
          )}
          
          {/* Tab Content */}
          <div className="p-4">
            {activeTab === 'collections' && (() => {
              // Filter collections by status
              // Exclude deleted collections from 'all' view, show them only in 'deleted' tab
              // Treat launchpad_live as launchpad for filtering
              const filteredCollections = statusFilter === 'all' 
                ? ownedCollections.filter(c => c.status !== 'deleted')
                : statusFilter === 'launchpad'
                ? ownedCollections.filter(c => c.status === 'launchpad' || c.status === 'launchpad_live')
                : ownedCollections.filter(c => c.status === statusFilter)
              
              return (
                <>
                  {filteredCollections.length > 0 && (
                    <div className="mb-4 p-2 bg-green-500/20 border border-green-500/30 rounded">
                      <p className="text-xs text-green-400">
                        ✓ Found {filteredCollections.length} collection{filteredCollections.length !== 1 ? 's' : ''}
                        {statusFilter !== 'all' && ` with status "${statusFilter}"`}
                      </p>
                    </div>
                  )}
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-b border-[#00d4ff]/20 bg-[#0a0e27]/60">
                          <th className="text-left py-3 px-4 text-sm font-semibold text-white">Name</th>
                          <th className="text-left py-3 px-4 text-sm font-semibold text-white">Status</th>
                          <th className="text-left py-3 px-4 text-sm font-semibold text-white">Created</th>
                          <th className="text-right py-3 px-4 text-sm font-semibold text-white">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredCollections.map((collection) => {
                          const rawStatus = collection.status || 'draft'
                          // Normalize launchpad_live to launchpad for display
                          const displayStatus = rawStatus === 'launchpad_live' ? 'launchpad' : rawStatus
                          const statusColors = {
                            draft: 'bg-gray-700/50 text-gray-300 border-gray-600/30',
                            launchpad: 'bg-[#ff6b35]/20 text-[#ff6b35] border-[#ff6b35]/30',
                            launchpad_live: 'bg-[#ff6b35]/20 text-[#ff6b35] border-[#ff6b35]/30',
                            self_inscribe: 'bg-[#00d4ff]/20 text-cosmic-blue border-[#00d4ff]/30',
                            marketplace: 'bg-green-500/20 text-green-400 border-green-500/30',
                            deleted: 'bg-red-500/20 text-red-400 border-red-500/30',
                          }
                          
                          return (
                            <tr
                              key={collection.id}
                              className="border-b border-[#00d4ff]/10 hover:bg-[#1a1f3a] transition-colors"
                            >
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-2">
                                  {rawStatus !== 'deleted' && (
                                    <Link
                                      href={`/collections/${collection.id}/edit`}
                                      className="p-1.5 bg-[#00d4ff]/20 hover:bg-[#00d4ff]/30 border border-[#00d4ff]/30 text-white rounded transition-colors flex items-center justify-center flex-shrink-0"
                                      title="Edit Collection Settings"
                                    >
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                      </svg>
                                    </Link>
                                  )}
                                  <span className="font-medium text-base text-white">{collection.name}</span>
                                </div>
                              </td>
                              <td className="py-3 px-4">
                                <span className={`px-2 py-0.5 text-xs font-medium rounded border ${statusColors[rawStatus] || statusColors[displayStatus]}`}>
                                  {displayStatus === 'draft' && '📝 Draft'}
                                  {(displayStatus === 'launchpad' || rawStatus === 'launchpad_live') && '🚀 Launchpad'}
                                  {displayStatus === 'self_inscribe' && '⚡ Self Inscribe'}
                                  {displayStatus === 'marketplace' && '💰 Marketplace'}
                                  {displayStatus === 'deleted' && '🗑️ Deleted'}
                                </span>
                              </td>
                              <td className="py-3 px-4">
                                <span className="text-sm text-white/70">
                                  {new Date(collection.created_at).toLocaleDateString()}
                                </span>
                              </td>
                              <td className="py-3 px-4">
                                <div className="flex items-center justify-end gap-2 flex-wrap">
                                  {rawStatus === 'deleted' ? (
                                    <>
                                      <Link
                                        href={`/collections/${collection.id}`}
                                        className="px-3 py-1.5 text-xs font-medium bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors"
                                      >
                                        View
                                      </Link>
                                    </>
                                  ) : rawStatus === 'draft' ? (
                                    <>
                                      <Link
                                        href={`/collections/${collection.id}`}
                                        className="px-3 py-1.5 text-xs font-medium bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors"
                                      >
                                        Generations
                                      </Link>
                                      <Link
                                        href={`/collections/${collection.id}/launch`}
                                        className="px-3 py-1.5 text-xs font-medium bg-[#e27d0f] hover:bg-[#c96a0a] text-white rounded transition-colors"
                                      >
                                        Launchpad
                                      </Link>
                                      <Link
                                        href={`/collections/${collection.id}/self-inscribe`}
                                        className="px-3 py-1.5 text-xs font-medium bg-[#4561ad] hover:bg-[#3a5294] text-white rounded transition-colors"
                                      >
                                        Inscribe
                                      </Link>
                                      <Link
                                        href={`/collections/${collection.id}/finalize-marketplace`}
                                        className="px-3 py-1.5 text-xs font-medium bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
                                      >
                                        Sell
                                      </Link>
                                    </>
                                  ) : (
                                    <>
                                      {(rawStatus === 'launchpad' || rawStatus === 'launchpad_live') && (
                                        <>
                                          <Link
                                            href={`/collections/${collection.id}/launch`}
                                            className="px-3 py-1.5 text-xs font-medium bg-[#e27d0f] hover:bg-[#c96a0a] text-white rounded transition-colors"
                                          >
                                            Launch Settings
                                          </Link>
                                          <Link
                                            href={`/collections/${collection.id}/self-inscribe`}
                                            className="px-3 py-1.5 text-xs font-medium bg-[#4561ad] hover:bg-[#3a5294] text-white rounded transition-colors"
                                          >
                                            Inscribe
                                          </Link>
                                        </>
                                      )}
                                      {rawStatus === 'self_inscribe' && (
                                        <Link
                                          href={`/collections/${collection.id}/self-inscribe`}
                                          className="px-3 py-1.5 text-xs font-medium bg-[#4561ad] hover:bg-[#3a5294] text-white rounded transition-colors"
                                        >
                                          Inscribe Settings
                                        </Link>
                                      )}
                                      {rawStatus === 'marketplace' && (
                                        <Link
                                          href={`/collections/${collection.id}/list-marketplace`}
                                          className="px-3 py-1.5 text-xs font-medium bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
                                        >
                                          Sell Settings
                                        </Link>
                                      )}
                                    </>
                                  )}
                                  {rawStatus !== 'deleted' && (
                                    <button
                                      onClick={() => handleDeleteClick(collection.id, collection.name)}
                                      className="p-2 bg-red-600 hover:bg-red-700 text-white rounded transition-colors flex items-center justify-center"
                                      title="Delete"
                                    >
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                      </svg>
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  {!loading && filteredCollections.length === 0 && (
                    <div className="cosmic-card border border-[#00d4ff]/30 rounded-xl p-12 text-center">
                      <div className="text-6xl mb-4">🎨</div>
                      <h3 className="text-2xl font-bold text-white mb-3">
                        {statusFilter === 'all' ? 'No Collections Yet' : `No ${statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)} Collections`}
                      </h3>
                      <p className="text-gray-300 mb-6 max-w-md mx-auto">
                        {statusFilter === 'all' 
                          ? 'Create your first collection to start generating NFTs! Collections organize your generated images and traits.'
                          : `You don't have any collections with status "${statusFilter}" yet.`}
                      </p>
                      {statusFilter === 'all' && (
                        <>
                          <div className="bg-[#00d4ff]/20 border border-[#00d4ff]/30 rounded-lg p-4 mb-6 max-w-md mx-auto text-left">
                            <p className="text-sm text-cosmic-blue mb-2 font-semibold">💡 What is a Collection?</p>
                            <p className="text-sm text-gray-300">
                              A collection is like a folder for your NFTs. You can create multiple collections for different projects, 
                              themes, or purposes.
                            </p>
                          </div>
                          <Link
                            href="/collections/create"
                            className="inline-block px-6 py-3 btn-cosmic text-white rounded-lg font-semibold transition-all duration-200"
                          >
                            ✨ Create Your First Collection
                          </Link>
                        </>
                      )}
                    </div>
                  )}
                </>
              )
            })()}
            
            {activeTab === 'collabs' && (
              <>
                {collabCollections.length > 0 && (
                  <div className="mb-4 p-2 bg-green-500/20 border border-green-500/30 rounded">
                    <p className="text-xs text-green-400">
                      ✓ Found {collabCollections.length} collaboration{collabCollections.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-[#00d4ff]/20 bg-[#0a0e27]/60">
                        <th className="text-left py-3 px-4 text-sm font-semibold text-white">Name</th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-white">Role</th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-white">Joined</th>
                        <th className="text-right py-3 px-4 text-sm font-semibold text-white">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {collabCollections.map((collection) => (
                        <tr
                          key={collection.id}
                          className="border-b border-[#00d4ff]/10 hover:bg-[#1a1f3a] transition-colors"
                        >
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-base text-white">{collection.name}</span>
                              <span className="px-2 py-0.5 text-xs font-medium rounded bg-[#ff6b35]/20 text-[#ff6b35] border border-[#ff6b35]/30">
                                👥 Collab
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                              collection.collaborator_role === 'editor' 
                                ? 'bg-[#00d4ff]/20 text-cosmic-blue border border-[#00d4ff]/30' 
                                : 'bg-gray-700/50 text-gray-300 border border-gray-600/30'
                            }`}>
                              {collection.collaborator_role === 'editor' ? '✏️ Editor' : '👁️ Viewer'}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-sm text-gray-600">
                              {new Date(collection.created_at).toLocaleDateString()}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center justify-end gap-2 flex-wrap">
                              {collection.status === 'deleted' ? (
                                <>
                                  <Link
                                    href={`/collections/${collection.id}`}
                                    className="px-3 py-1.5 text-xs font-medium bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors"
                                  >
                                    View
                                  </Link>
                                </>
                              ) : collection.status === 'draft' ? (
                                <>
                                  {collection.collaborator_role === 'editor' && (
                                    <>
                                      <Link
                                        href={`/collections/${collection.id}`}
                                        className="px-3 py-1.5 text-xs font-medium bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors"
                                      >
                                        Generations
                                      </Link>
                                      <Link
                                        href={`/collections/${collection.id}/launch`}
                                        className="px-3 py-1.5 text-xs font-medium bg-[#e27d0f] hover:bg-[#c96a0a] text-white rounded transition-colors"
                                      >
                                        Launchpad
                                      </Link>
                                      <Link
                                        href={`/collections/${collection.id}/self-inscribe`}
                                        className="px-3 py-1.5 text-xs font-medium bg-[#4561ad] hover:bg-[#3a5294] text-white rounded transition-colors"
                                      >
                                        Inscribe
                                      </Link>
                                      <Link
                                        href={`/collections/${collection.id}/finalize-marketplace`}
                                        className="px-3 py-1.5 text-xs font-medium bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
                                      >
                                        Sell
                                      </Link>
                                    </>
                                  )}
                                  {collection.collaborator_role === 'viewer' && (
                                    <Link
                                      href={`/collections/${collection.id}`}
                                      className="px-3 py-1.5 text-xs font-medium bg-[#4561ad] hover:bg-[#3a5294] text-white rounded transition-colors"
                                    >
                                      View
                                    </Link>
                                  )}
                                </>
                              ) : (
                                <>
                                  {collection.collaborator_role === 'editor' && (
                                    <>
                                      {(collection.status === 'launchpad' || collection.status === 'launchpad_live') && (
                                        <>
                                          <Link
                                            href={`/collections/${collection.id}/launch`}
                                            className="px-3 py-1.5 text-xs font-medium bg-[#e27d0f] hover:bg-[#c96a0a] text-white rounded transition-colors"
                                          >
                                            Launch Settings
                                          </Link>
                                          <Link
                                            href={`/collections/${collection.id}/self-inscribe`}
                                            className="px-3 py-1.5 text-xs font-medium bg-[#4561ad] hover:bg-[#3a5294] text-white rounded transition-colors"
                                          >
                                            Inscribe
                                          </Link>
                                        </>
                                      )}
                                      {collection.status === 'self_inscribe' && (
                                        <Link
                                          href={`/collections/${collection.id}/self-inscribe`}
                                          className="px-3 py-1.5 text-xs font-medium bg-[#4561ad] hover:bg-[#3a5294] text-white rounded transition-colors"
                                        >
                                          Inscribe Settings
                                        </Link>
                                      )}
                                      {collection.status === 'marketplace' && (
                                        <Link
                                          href={`/collections/${collection.id}/list-marketplace`}
                                          className="px-3 py-1.5 text-xs font-medium bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
                                        >
                                          Sell Settings
                                        </Link>
                                      )}
                                    </>
                                  )}
                                  {collection.collaborator_role === 'viewer' && (
                                    <Link
                                      href={`/collections/${collection.id}`}
                                      className="px-3 py-1.5 text-xs font-medium bg-[#4561ad] hover:bg-[#3a5294] text-white rounded transition-colors"
                                    >
                                      View
                                    </Link>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!loading && collabCollections.length === 0 && (
                  <div className="cosmic-card border border-[#00d4ff]/30 rounded-xl p-12 text-center">
                    <div className="text-6xl mb-4">👥</div>
                    <h3 className="text-2xl font-bold text-white mb-3">No Collaborations Yet</h3>
                    <p className="text-gray-300 mb-6 max-w-md mx-auto">
                      You'll see collections you're collaborating on here once you accept collaboration invitations.
                    </p>
                    <p className="text-sm text-gray-400">
                      Check your profile page for pending collaboration invitations.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
          
        {/* Footer dead space */}
        <div className="h-[200px]"></div>
      </div>
      </div>

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
