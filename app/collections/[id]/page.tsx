'use client'

import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { useWallet } from '@/lib/wallet/compatibility'
import { isAdmin } from '@/lib/auth/access-control'
import { DownloadProgressModal } from '@/components/download-progress-modal'
import { CollectionCollaborators } from '@/components/collection-collaborators'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { CompressionModal } from '@/components/compression-modal'
import { CollectionHeader } from './components/CollectionHeader'
import { CollectionStats } from './components/CollectionStats'
import { LayersSection } from './components/LayersSection'
import { GenerationSection } from './components/GenerationSection'
import { NftsGrid } from './components/OrdinalsGrid'
import { useCollectionPageLogic } from './hooks/useCollectionPageLogic'
import { useState, useEffect } from 'react'
import { GeneratedOrdinal } from './types'

interface Collection {
  id: string
  name: string
  is_active: boolean
  collection_status?: 'draft' | 'launchpad' | 'self_inscribe' | 'marketplace' | 'deleted'
  wallet_address?: string
  art_style?: string | null
  compression_quality?: number | null
  compression_dimensions?: number | null
  compression_format?: string | null
  compression_target_kb?: number | null
}

interface Layer {
  id: string
  name: string
  display_order: number
  trait_count: number
}

export default function CollectionDetailsPage() {
  const params = useParams()
  const router = useRouter()
  const { currentAddress, isConnected } = useWallet()
  const [mounted, setMounted] = useState(false)
  const [activeTab, setActiveTab] = useState<'generated' | 'compression'>('generated')
  const [compressionQuality, setCompressionQuality] = useState(100)
  const [compressionDimensions, setCompressionDimensions] = useState<number | ''>(1024)
  const [compressionFormat, setCompressionFormat] = useState<'jpg' | 'png' | 'webp'>('webp')
  const [compressionTargetKB, setCompressionTargetKB] = useState<number | null>(null)
  const [originalCompressionSettings, setOriginalCompressionSettings] = useState<{
    quality: number
    dimensions: number
    format: string
  } | null>(null)
  const [savingCompression, setSavingCompression] = useState(false)
  const [wipingCompressions, setWipingCompressions] = useState(false)
  const {
    collection, layers, ordinals, loading, currentPage, setCurrentPage, totalPages, totalOrdinals,
    queuedJobs, processingJobs, traitFilters, layerTraits, userRole, collectionOwner, collaboratorCount,
    generating, generateQuantity, setGenerateQuantity, useClassicMode, setUseClassicMode,
    imageSliders, setImageSliders, expandedTraits, setExpandedTraits, showPromptId, setShowPromptId,
    flippingOrdinal, showDeleteConfirm, setShowDeleteConfirm, deleting, showCollaboratorsModal,
    setShowCollaboratorsModal, showCompressionModal, setShowCompressionModal, compressionModalOrdinal,
    setCompressionModalOrdinal, compressionModalSlider, setCompressionModalSlider, downloadProgress,
    showDeleteOrdinalConfirm, setShowDeleteOrdinalConfirm, showWipeCompressionsConfirm,
    setShowWipeCompressionsConfirm, showFilterConfirm, setShowFilterConfirm, showCreditsConfirm,
    setShowCreditsConfirm, credits, loadingCredits, pendingGeneration,
    setPendingGeneration, showOrphanedTraits, setShowOrphanedTraits, handleGenerate, handleDelete, handleDeleteConfirm, handleDeleteCancel,
    handleDeleteOrdinal, executeDeleteOrdinal, handleFlipOrdinal, handleDownloadOrdinal,
    handleWipeCompressions, executeWipeCompressions, executeGeneration, clearFilters,
    handleCreditsConfirmAccept, handleCreditsConfirmCancel,
    handleFilterChange, loadAllData
  } = useCollectionPageLogic(params.id, currentAddress)

  // Security check: user role determines access (set by useCollectionPageLogic after API auth check)
  const isUserAdmin = isAdmin(currentAddress || null)
  const hasAccess = userRole === 'owner' || userRole === 'editor' || userRole === 'viewer' || isUserAdmin

  // Handle hydration - only show client-specific content after mount
  useEffect(() => {
    setMounted(true)
  }, [])

  // Initialize compression settings from collection
  useEffect(() => {
    if (collection) {
      const collectionWithCompression = collection as Collection
      setCompressionQuality(collectionWithCompression.compression_quality ?? 100)
      setCompressionDimensions(collectionWithCompression.compression_dimensions ?? 1024)
      setCompressionFormat((collectionWithCompression.compression_format as 'jpg' | 'png' | 'webp') || 'webp')
      setCompressionTargetKB(collectionWithCompression.compression_target_kb ?? null)
      setOriginalCompressionSettings({
        quality: collectionWithCompression.compression_quality ?? 100,
        dimensions: collectionWithCompression.compression_dimensions ?? 1024,
        format: collectionWithCompression.compression_format || 'webp'
      })
    }
  }, [collection])

  // Check if compression settings have changed
  const compressionSettingsChanged = originalCompressionSettings && (
    compressionQuality !== originalCompressionSettings.quality ||
    (compressionDimensions !== '' && compressionDimensions !== null && compressionDimensions !== originalCompressionSettings.dimensions) ||
    compressionFormat !== originalCompressionSettings.format
  )
  
  // Check if dimensions are blank (for disabling save button)
  const dimensionsBlank = compressionDimensions === '' || compressionDimensions === null || compressionDimensions === undefined

  const handleSaveCompressionSettings = async () => {
    if (!params.id || !currentAddress || dimensionsBlank) return
    
    setSavingCompression(true)
    try {
      const response = await fetch(`/api/collections/${params.id}/compression-settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address: currentAddress,
          compression_quality: compressionQuality,
          compression_dimensions: (typeof compressionDimensions === 'string' && compressionDimensions === '') || compressionDimensions === null || compressionDimensions === undefined ? null : (typeof compressionDimensions === 'number' ? compressionDimensions : parseInt(String(compressionDimensions))),
          compression_format: compressionFormat,
          compression_target_kb: compressionTargetKB,
        }),
      })
      
      if (response.ok) {
        const data = await response.json()
        setOriginalCompressionSettings({
          quality: compressionQuality,
          dimensions: (typeof compressionDimensions === 'string' && compressionDimensions === '') || compressionDimensions === null || compressionDimensions === undefined ? 1024 : (typeof compressionDimensions === 'number' ? compressionDimensions : parseInt(String(compressionDimensions))),
          format: compressionFormat
        })
        toast.success('Compression settings saved successfully!')
        loadAllData() // Reload to get updated collection data
      } else {
        const error = await response.json()
        toast.error('Error saving compression settings', { description: error.error || 'Unknown error' })
      }
    } catch (error) {
      console.error('Error saving compression settings:', error)
      toast.error('Failed to save compression settings')
    } finally {
      setSavingCompression(false)
    }
  }

  // Show loading state during SSR and initial hydration
  if (!mounted || loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto text-center py-8">
            <div className="text-white">Loading collection...</div>
        </div>
      </div>
    )
  }

  // Not connected - show connect prompt (only after hydration)
  if (!isConnected || !currentAddress) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto text-center py-12">
          <div className="bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl border-2 border-[#D4AF37]/50 rounded-xl p-8 max-w-2xl mx-auto">
            <div className="text-6xl mb-4">🔐</div>
            <h2 className="text-2xl font-bold text-white mb-4">Wallet Connection Required</h2>
            <p className="text-[#808080] mb-6">
              Please connect your wallet to access collection management.
            </p>
            <Link href="/collections" className="px-6 py-3 bg-[#D4AF37] hover:bg-[#D4AF37]/80 text-white rounded-lg font-bold transition-colors inline-block shadow-lg shadow-[#D4AF37]/20 drop-shadow-lg">
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
        <div className="max-w-6xl mx-auto text-center py-8">
            <div className="text-white">Collection not found or access denied</div>
            <Link href="/collections" className="text-[#D4AF37] hover:text-[#D4AF37] mt-4 inline-block">
              ← Back to Collections
            </Link>
        </div>
      </div>
    )
  }

  // Check if user has access (from API response via userRole)
  if (!hasAccess) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto text-center py-12">
          <div className="bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl border-2 border-[#EF4444]/50 rounded-xl p-8 max-w-2xl mx-auto">
            <div className="text-6xl mb-4">🚫</div>
            <h2 className="text-2xl font-bold text-white mb-4">Access Denied</h2>
            <p className="text-[#808080] mb-6">
              You don't have permission to access this collection. Only the collection owner or authorized collaborators can view and edit collections.
            </p>
            <Link href="/collections" className="px-6 py-3 bg-[#D4AF37] hover:bg-[#D4AF37]/80 text-white rounded-lg font-bold transition-colors inline-block shadow-lg shadow-[#D4AF37]/20 drop-shadow-lg">
              Go to Collections
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const isBlocked = (collection.collection_status === 'launchpad' || collection.collection_status === 'marketplace') && !isUserAdmin && !hasAccess
  
  if (isBlocked) {
    const statusText = collection.collection_status === 'launchpad' ? 'launchpad' : 'marketplace'
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto text-center py-12">
            <div className="bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl border-2 border-[#D4AF37]/50 rounded-xl p-8 max-w-2xl mx-auto">
              <div className="text-6xl mb-4">🔒</div>
            <h2 className="text-2xl font-bold text-white mb-4">Collection Access Restricted</h2>
              <p className="text-[#808080] mb-6">
                This collection is currently on <strong>{statusText}</strong> and cannot be accessed for editing or generation.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/collections" className="px-6 py-3 bg-[#D4AF37] hover:bg-[#D4AF37]/80 text-white rounded-lg font-bold transition-colors shadow-lg shadow-[#D4AF37]/20 drop-shadow-lg">
                  Go to Collections
                </Link>
                {collection.collection_status === 'launchpad' && (
                <Link href={`/${collection.id}`} className="px-6 py-3 bg-[#D4AF37] hover:bg-[#D4AF37] text-white rounded-lg font-semibold transition-colors shadow-lg shadow-[#D4AF37]/20">
                    View on Launchpad
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
    )
  }

  return (
    <>
  <div className="w-full px-8 py-8 pb-[500px]">
      <div className="w-full max-w-[1800px] mx-auto">
          <CollectionHeader
            collection={collection}
            collaboratorCount={collaboratorCount}
            userRole={userRole}
            onShowCollaborators={() => setShowCollaboratorsModal(true)}
            onDelete={() => setShowDeleteConfirm(true)}
          />
          <CollectionStats layers={layers} totalOrdinals={totalOrdinals} isActive={collection.is_active} />
        {showCollaboratorsModal && collection && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[80vh] overflow-y-auto border-2 border-[#D4AF37]/50">
              <div className="flex items-center justify-between p-4 border-b border-[#D4AF37]/30">
                <h2 className="text-lg font-semibold text-white">Manage Collaborators</h2>
                  <button onClick={() => { setShowCollaboratorsModal(false); loadAllData() }} className="text-white/70 hover:text-white transition-colors">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="p-4">
                  <CollectionCollaborators collectionId={collection.id} collectionOwner={collectionOwner || collection.wallet_address || ''} currentUserRole={userRole} />
              </div>
            </div>
          </div>
        )}
          <LayersSection collectionId={collection.id} layers={layers} onLayerDeleted={loadAllData} />
          
          {/* Tabs */}
          <div className="mt-8">
            <nav className="flex space-x-4" aria-label="Tabs">
              <button
                onClick={() => setActiveTab('generated')}
                className={`px-6 py-3 rounded-t-lg font-semibold text-base transition-all duration-200 ${
                  activeTab === 'generated'
                    ? 'bg-[#D4AF37] text-white shadow-lg shadow-[#D4AF37]/30 border-2 border-b-0 border-[#D4AF37]/50'
                    : 'bg-[#1a1a1a] text-white/70 hover:text-white hover:bg-[#1a1a1a] border-2 border-b-0 border-transparent'
                }`}
              >
                🎨 Generated NFTs
              </button>
              <button
                onClick={() => setActiveTab('compression')}
                className={`px-6 py-3 rounded-t-lg font-semibold text-base transition-all duration-200 ${
                  activeTab === 'compression'
                    ? 'bg-[#D4AF37] text-white shadow-lg shadow-[#D4AF37]/30 border-2 border-b-0 border-[#D4AF37]/50'
                    : 'bg-[#1a1a1a] text-white/70 hover:text-white hover:bg-[#1a1a1a] border-2 border-b-0 border-transparent'
                }`}
              >
                📦 Compression
              </button>
            </nav>
          </div>

          {/* Tab Content */}
          {activeTab === 'generated' && (
            <div className="border border-t-0 border-[#D4AF37]/30 rounded-b-lg rounded-tl-lg bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl p-6">
              <GenerationSection
                collection={collection}
                layers={layers}
                queuedJobs={queuedJobs}
                processingJobs={processingJobs}
                traitFilters={traitFilters}
                layerTraits={layerTraits}
                generateQuantity={generateQuantity}
                setGenerateQuantity={setGenerateQuantity}
                useClassicMode={useClassicMode}
                setUseClassicMode={setUseClassicMode}
                generating={generating}
                currentAddress={currentAddress}
                onGenerate={handleGenerate}
                onClearFilters={clearFilters}
                onFilterChange={handleFilterChange}
              />
              <div className="mt-6 mb-6 flex flex-wrap gap-3">
                <button
                  onClick={() => setShowOrphanedTraits(!showOrphanedTraits)}
                  className={`px-4 py-2 rounded-lg font-semibold text-sm transition-colors ${
                    showOrphanedTraits
                      ? 'bg-[#D4AF37] hover:bg-[#D4AF37]/80 text-white shadow-lg shadow-[#D4AF37]/20'
                      : 'bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl border border-[#D4AF37]/30 hover:border-[#D4AF37]/50 text-[#808080] hover:text-white'
                  }`}
                >
                  {showOrphanedTraits ? '✓ Showing Orphaned Traits' : '👁️ Show Orphaned Traits'}
                </button>
              </div>
              <NftsGrid
                nfts={ordinals}
                totalNfts={totalOrdinals}
                currentPage={currentPage}
                imageSliders={imageSliders}
                setImageSliders={setImageSliders}
                expandedTraits={expandedTraits}
                setExpandedTraits={setExpandedTraits}
                showPromptId={showPromptId}
                setShowPromptId={setShowPromptId}
                flippingNft={flippingOrdinal}
                onDownload={handleDownloadOrdinal}
                onDelete={handleDeleteOrdinal}
                onFlip={handleFlipOrdinal}
                onShowCompression={(nft) => { setCompressionModalOrdinal(nft); setCompressionModalSlider(50); setShowCompressionModal(true) }}
                collectionArtStyle={(collection as Collection)?.art_style}
              />
              {ordinals.length === 0 && (
                <div className="text-center py-8 text-[#808080]">No NFTs generated yet. Click the button above to generate your first one!</div>
              )}
              {totalPages > 1 && (
                <div className="flex justify-center items-center gap-2 mt-6">
                  <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-1 bg-[#D4AF37] hover:bg-[#D4AF37]/80 disabled:from-gray-600 disabled:to-gray-600 disabled:cursor-not-allowed text-white rounded shadow-lg shadow-[#D4AF37]/20 transition-all duration-200 font-bold drop-shadow-lg">
                    Previous
                  </button>
                  <span className="text-white">Page {currentPage} of {totalPages}</span>
                  <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-3 py-1 bg-[#D4AF37] hover:bg-[#D4AF37]/80 disabled:from-gray-600 disabled:to-gray-600 disabled:cursor-not-allowed text-white rounded shadow-lg shadow-[#D4AF37]/20 transition-all duration-200 font-bold drop-shadow-lg">
                    Next
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'compression' && (
            <div className="border border-t-0 border-[#D4AF37]/30 rounded-b-lg rounded-tr-lg bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl p-6">
              {/* Compression Settings Section */}
              <div className="mb-6 border-b border-[#D4AF37]/30 pb-6">
                <h3 className="text-lg font-semibold text-white mb-4">Image Compression Settings</h3>
                
                {/* Compression Settings Changed Warning */}
                {compressionSettingsChanged && (
                  <div className="mb-4 bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl border border-[#D4AF37]/50 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-[#D4AF37] flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-[#D4AF37]">
                          Compression settings have changed
                        </p>
                        <p className="text-xs text-white/70 mt-1">
                          Existing compressed images won't be affected. Would you like to wipe all existing compressions so they can be re-compressed with the new settings?
                        </p>
                        <button
                          type="button"
                          onClick={handleWipeCompressions}
                          disabled={wipingCompressions}
                          className="mt-3 px-3 py-1.5 bg-[#D4AF37] hover:bg-[#D4AF37] disabled:bg-[#D4AF37]/50 text-white text-xs font-medium rounded transition-colors flex items-center gap-2 shadow-lg shadow-[#D4AF37]/20"
                        >
                          {wipingCompressions ? (
                            <>
                              <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              Wiping...
                            </>
                          ) : (
                            <>
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                              Wipe Compressions
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">
                      File Format
                    </label>
                    <select
                      value={compressionFormat}
                      onChange={(e) => setCompressionFormat(e.target.value as 'jpg' | 'png' | 'webp')}
                      className="w-full border border-[#D4AF37]/30 rounded px-3 py-2 bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl text-white focus:border-[#D4AF37] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/20"
                    >
                      <option value="webp" className="bg-[#0a0e27]">WebP (Recommended - Best compression)</option>
                      <option value="jpg" className="bg-[#0a0e27]">JPEG (Good compression, widely supported)</option>
                      <option value="png" className="bg-[#0a0e27]">PNG (Lossless, larger file size)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white mb-2">
                      Compression Quality: {compressionQuality}%
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={compressionQuality}
                      onChange={(e) => setCompressionQuality(parseInt(e.target.value))}
                      className="w-full"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white mb-2">
                      Image Dimensions (Width × Height)
                    </label>
                    <div className="flex gap-2 items-center">
                      <input
                        type="number"
                        min="1"
                        max="1024"
                        value={compressionDimensions}
                        onChange={(e) => {
                          const val = e.target.value
                          if (val === '') {
                            setCompressionDimensions('')
                          } else {
                            const numVal = parseInt(val)
                            if (!isNaN(numVal)) {
                              const clamped = Math.max(1, Math.min(1024, numVal))
                              setCompressionDimensions(clamped)
                            }
                          }
                        }}
                        className="w-24 border border-[#D4AF37]/30 rounded px-3 py-2 bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl text-white focus:border-[#D4AF37] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/20"
                        placeholder="Width"
                      />
                      <span className="text-white">×</span>
                      <input
                        type="number"
                        min="1"
                        max="1024"
                        value={compressionDimensions}
                        onChange={(e) => {
                          const val = e.target.value
                          if (val === '') {
                            setCompressionDimensions('')
                          } else {
                            const numVal = parseInt(val)
                            if (!isNaN(numVal)) {
                              const clamped = Math.max(1, Math.min(1024, numVal))
                              setCompressionDimensions(clamped)
                            }
                          }
                        }}
                        className="w-24 border border-[#D4AF37]/30 rounded px-3 py-2 bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl text-white focus:border-[#D4AF37] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/20"
                        placeholder="Height"
                      />
                      <span className="text-white/70 text-sm">px (square, max 1024×1024)</span>
                    </div>
                  </div>

                  {/* Estimated File Size */}
                  {(() => {
                    if (compressionDimensions === '' || compressionDimensions === null) {
                      return null
                    }
                    const pixels = compressionDimensions * compressionDimensions
                    const quality = compressionQuality
                    
                    let baseEstimatedKB = 0
                    
                    if (compressionFormat === 'webp') {
                      const baseBitsPerPixel = 1.4
                      const qualityFactor = 0.4 + (quality / 100) * 0.6
                      const bitsPerPixel = baseBitsPerPixel * qualityFactor
                      baseEstimatedKB = (pixels * bitsPerPixel) / 8 / 1024
                    } else if (compressionFormat === 'jpg') {
                      const baseBitsPerPixel = 1.75
                      const qualityFactor = 0.4 + (quality / 100) * 0.6
                      const bitsPerPixel = baseBitsPerPixel * qualityFactor
                      baseEstimatedKB = (pixels * bitsPerPixel) / 8 / 1024
                    } else if (compressionFormat === 'png') {
                      const bitsPerPixel = 4.5
                      baseEstimatedKB = (pixels * bitsPerPixel) / 8 / 1024
                    }
                    
                    // Increase baseline by 10% to account for underestimation, then another 15%
                    const adjustedBase = baseEstimatedKB * 1.1 * 1.15
                    
                    // Lower bound: adjusted base (typical images)
                    // Upper bound: adjusted base * 1.5 (bright/colorful images compress less efficiently)
                    const lowerKB = Math.max(10, Math.round(adjustedBase))
                    const upperKB = Math.max(10, Math.round(adjustedBase * 1.5))
                    
                    const formatName = compressionFormat === 'jpg' ? 'JPEG' : compressionFormat.toUpperCase()
                    
                    return (
                      <div className="bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl border border-[#D4AF37]/30 rounded-lg p-3">
                        <p className="text-sm font-medium text-[#D4AF37]">
                          Estimated File Size: <span className="font-bold text-white">{lowerKB}-{upperKB} KB</span> ({formatName})
                        </p>
                        <p className="text-xs text-white/70 mt-1">
                          Range accounts for typical images (lower) to bright/colorful images (upper)
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

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={handleSaveCompressionSettings}
                    disabled={savingCompression || dimensionsBlank}
                    className="bg-[#D4AF37] text-white px-4 py-2 rounded hover:bg-[#D4AF37]/80 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#D4AF37]/20 transition-all font-bold drop-shadow-lg"
                  >
                    {savingCompression ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>

              <div className="mb-6">
                <button
                  onClick={handleWipeCompressions}
                  className="px-4 py-2 bg-[#EF4444] hover:bg-[#ff3838] text-white rounded-lg font-semibold text-sm transition-colors shadow-lg shadow-[#EF4444]/20"
                >
                  🗑️ Wipe Compressions
                </button>
              </div>
              <CompressionTable ordinals={ordinals} totalOrdinals={totalOrdinals} currentPage={currentPage} />
            </div>
          )}
        </div>
              </div>
      <CompressionModal isOpen={showCompressionModal} ordinal={compressionModalOrdinal} sliderValue={compressionModalSlider} onClose={() => setShowCompressionModal(false)} onSliderChange={setCompressionModalSlider} />
      <DownloadProgressModal isOpen={downloadProgress.isOpen} current={downloadProgress.current} total={downloadProgress.total} status={downloadProgress.status} message={downloadProgress.message} failedCount={downloadProgress.failedCount} />
      <ConfirmDialog isOpen={showDeleteConfirm} onClose={handleDeleteCancel} onConfirm={handleDeleteConfirm} title="Delete Collection" message={`Are you sure you want to delete "${collection?.name || 'this collection'}"?`} confirmText="Delete" cancelText="Cancel" confirmButtonClass="bg-red-600 hover:bg-red-700" loading={deleting} />
      {showDeleteOrdinalConfirm && <ConfirmDialog isOpen={!!showDeleteOrdinalConfirm} onClose={() => setShowDeleteOrdinalConfirm(null)} onConfirm={() => executeDeleteOrdinal(showDeleteOrdinalConfirm)} title="Delete NFT" message="Are you sure you want to delete this NFT?" confirmText="Delete" cancelText="Cancel" confirmButtonClass="bg-red-600 hover:bg-red-700" />}
      <ConfirmDialog isOpen={showWipeCompressionsConfirm} onClose={() => setShowWipeCompressionsConfirm(false)} onConfirm={executeWipeCompressions} title="Delete All Compressed Images" message="Are you sure you want to delete all compressed images?" confirmText="Delete All" cancelText="Cancel" confirmButtonClass="bg-red-600 hover:bg-red-700" />
      {pendingGeneration && <ConfirmDialog isOpen={showFilterConfirm} onClose={() => { setShowFilterConfirm(false); setPendingGeneration(false) }} onConfirm={() => { setShowFilterConfirm(false); setShowCreditsConfirm(true) }} title="⚠️ FILTERED GENERATION" message={`You are about to generate NFTs with trait filters applied. These traits will be used in ALL ${generateQuantity} generated NFT${generateQuantity > 1 ? 's' : ''}.`} confirmText="Proceed" cancelText="Cancel" confirmButtonClass="bg-[#FBBF24] hover:bg-[#F59E0B]" />}
      
      {/* Credits Confirmation Modal */}
      {showCreditsConfirm && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={handleCreditsConfirmCancel}>
          <div className="bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden border-2 border-[#D4AF37]/50" onClick={(e) => e.stopPropagation()}>
            <div className="bg-[#D4AF37] p-6">
              <h2 className="text-2xl font-bold text-white">Confirm Generation</h2>
              <p className="text-white/90 mt-1">Review your credits before generating</p>
            </div>
            
            <div className="p-6">
              {loadingCredits ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#D4AF37] mx-auto"></div>
                  <p className="mt-4 text-[#808080]">Loading credits...</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl border border-[#D4AF37]/30 rounded-lg p-4 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-[#808080] font-medium">Current Credits:</span>
                      <span className="text-2xl font-bold text-white">{credits ?? 0}</span>
                    </div>
                    
                    <div className="border-t border-[#D4AF37]/30 pt-3">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-[#808080]">Generating {generateQuantity} NFT{generateQuantity > 1 ? 's' : ''}:</span>
                        <span className="text-lg font-semibold text-[#D4AF37]">-{generateQuantity}</span>
                      </div>
                      <div className="text-xs text-[#808080]/80">
                        (1 credit per generation)
                      </div>
                    </div>
                    
                    <div className="border-t border-[#D4AF37]/30 pt-3 mt-3">
                      <div className="flex justify-between items-center">
                        <span className="text-white font-semibold">Total After:</span>
                        <span className={`text-2xl font-bold ${(credits ?? 0) - generateQuantity >= 0 ? 'text-[#D4AF37]' : 'text-[#EF4444]'}`}>
                          {(credits ?? 0) - generateQuantity}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  {(credits ?? 0) - generateQuantity < 0 && (
                    <div className="bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl border border-[#EF4444]/50 rounded-lg p-3">
                      <p className="text-sm text-[#EF4444]">
                        ⚠️ Insufficient credits! You need {generateQuantity - (credits ?? 0)} more credit{generateQuantity - (credits ?? 0) > 1 ? 's' : ''} to generate {generateQuantity} NFT{generateQuantity > 1 ? 's' : ''}.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
            
            <div className="bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl border-t border-[#D4AF37]/30 px-6 py-4 flex gap-3 justify-end">
              <button
                onClick={handleCreditsConfirmCancel}
                className="px-6 py-2 bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl border border-[#D4AF37]/30 hover:border-[#D4AF37]/50 text-[#808080] hover:text-white rounded-lg font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreditsConfirmAccept}
                disabled={loadingCredits || (credits ?? 0) - generateQuantity < 0}
                className="px-6 py-2 bg-[#D4AF37] hover:bg-[#D4AF37]/80 text-white rounded-lg font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#D4AF37]/20 drop-shadow-lg"
              >
                Accept & Generate
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  ) 
}

// Compression Table Component
function CompressionTable({ ordinals, totalOrdinals, currentPage }: { ordinals: GeneratedOrdinal[]; totalOrdinals: number; currentPage: number }) {
  const [imageDimensions, setImageDimensions] = useState<Record<string, { width: number; height: number }>>({})

  useEffect(() => {
    // Load image dimensions for ordinals with compressed images
    const loadDimensions = async () => {
      const dimensions: Record<string, { width: number; height: number }> = {}
      
      for (const ordinal of ordinals) {
        if (ordinal.compressed_image_url) {
          try {
            const img = new Image()
            await new Promise((resolve, reject) => {
              img.onload = () => {
                dimensions[ordinal.id] = { width: img.naturalWidth, height: img.naturalHeight }
                resolve(null)
              }
              img.onerror = reject
              img.src = ordinal.compressed_image_url || ''
            })
          } catch (error) {
            console.error(`Failed to load dimensions for ordinal ${ordinal.id}:`, error)
          }
        }
      }
      
      setImageDimensions(dimensions)
    }

    loadDimensions()
  }, [ordinals])

  // Filter ordinals that have compression data - same logic as OrdinalCard
  const compressedOrdinals = ordinals.filter(o => {
    const hasCompressed = o.compressed_image_url && 
      o.compressed_image_url !== null && 
      o.compressed_image_url.trim() !== '' &&
      o.compressed_image_url !== o.image_url
    return hasCompressed || o.compressed_size_kb != null
  })

  if (compressedOrdinals.length === 0) {
    return (
      <div className="text-center py-8 text-[#808080]">
        No compressed ordinals found. Compress some ordinals first to see them here.
      </div>
    )
  }

  return (
    <div className="border border-[#D4AF37]/30 rounded-lg overflow-hidden bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl">
      <table className="w-full">
        <thead className="bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-xl border-b border-[#D4AF37]/30">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold text-white">Ordinal #</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-white">Width</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-white">Height</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-white">Size (KB)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#D4AF37]/20">
          {compressedOrdinals.map((ordinal, index) => {
            const dimensions = imageDimensions[ordinal.id]
            // Use same display number calculation as OrdinalsGrid
            const displayNumber = ordinal.ordinal_number !== null && ordinal.ordinal_number !== undefined
              ? ordinal.ordinal_number
              : totalOrdinals - (currentPage - 1) * 15 - index
            
            // Use same null check pattern as OrdinalCard
            const compressedSizeKb = ordinal.compressed_size_kb != null 
              ? `${Number(ordinal.compressed_size_kb).toFixed(1)} KB`
              : '—'
            
            return (
              <tr key={ordinal.id} className="hover:bg-[#D4AF37]/10 transition-colors">
                <td className="px-4 py-3 text-sm font-medium text-white">
                  #{displayNumber}
                </td>
                <td className="px-4 py-3 text-sm text-[#808080]">
                  {dimensions ? `${dimensions.width}px` : 'Loading...'}
                </td>
                <td className="px-4 py-3 text-sm text-[#808080]">
                  {dimensions ? `${dimensions.height}px` : 'Loading...'}
                </td>
                <td className="px-4 py-3 text-sm text-[#808080]">
                  {compressedSizeKb}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
                         