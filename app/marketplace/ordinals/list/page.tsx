'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useWallet } from '@/lib/wallet/compatibility'
import { toast } from 'sonner'
import * as bitcoin from 'bitcoinjs-lib'

interface Ordinal {
  inscription_id: string
  inscription_number?: number
  collection_symbol?: string
  content_url?: string
  image_url?: string
  content_type?: string
  owner: string
  utxo: {
    txid: string | null
    vout: number | null
    value: number
  }
}

const ITEMS_PER_PAGE = 40

// Helper to determine content display type from content_type
function getDisplayType(contentType?: string): 'image' | 'text' | 'html' | 'video' | 'audio' | 'model' | 'unknown' {
  if (!contentType) return 'unknown'
  const ct = contentType.toLowerCase()
  
  if (ct.startsWith('image/')) return 'image'
  if (ct.startsWith('video/')) return 'video'
  if (ct.startsWith('audio/')) return 'audio'
  if (ct.startsWith('text/html')) return 'html'
  if (ct.startsWith('text/')) return 'text'
  if (ct.includes('json')) return 'text'
  if (ct.includes('model') || ct.includes('gltf')) return 'model'
  
  return 'unknown'
}

// Content renderer component for ordinals
function OrdinalContent({ ordinal }: { ordinal: Ordinal }) {
  const displayType = getDisplayType(ordinal.content_type)
  const contentUrl = ordinal.image_url || ordinal.content_url
  
  // Check if likely pixel art (common pixel art formats or small dimensions hinted in content type)
  const isPixelArt = ordinal.content_type?.includes('gif') || 
                     ordinal.content_type?.includes('png') ||
                     ordinal.content_type?.includes('webp')
  
  // For images - display directly with full coverage
  if (displayType === 'image' || (!ordinal.content_type && contentUrl)) {
    return (
      <img
        src={contentUrl}
        alt={`Ordinal #${ordinal.inscription_number || ordinal.inscription_id.substring(0, 8)}`}
        className="w-full h-full object-cover"
        style={{ imageRendering: isPixelArt ? 'pixelated' : 'auto' }}
        loading="lazy"
        onError={(e) => {
          // Fallback chain: try preview first (faster), then full content
          const target = e.target as HTMLImageElement
          if (!target.src.includes('ordinals.com/preview')) {
            target.src = `https://ordinals.com/preview/${ordinal.inscription_id}`
          } else if (!target.src.includes('ordinals.com/content')) {
            target.src = `https://ordinals.com/content/${ordinal.inscription_id}`
          }
        }}
        onLoad={(e) => {
          // Auto-detect pixel art by checking if image is small (likely pixel art)
          const target = e.target as HTMLImageElement
          if (target.naturalWidth <= 100 || target.naturalHeight <= 100) {
            target.style.imageRendering = 'pixelated'
          }
        }}
      />
    )
  }
  
  // For HTML content - render actual iframe with lazy loading
  if (displayType === 'html') {
    return (
      <iframe
        src={`https://ordinals.com/preview/${ordinal.inscription_id}`}
        title={`Ordinal #${ordinal.inscription_number || ordinal.inscription_id.substring(0, 8)}`}
        className="w-full h-full border-0"
        loading="lazy"
        sandbox="allow-scripts allow-same-origin"
        scrolling="no"
      />
    )
  }
  
  // For video content - render actual video with lazy loading
  if (displayType === 'video') {
    return (
      <video
        src={`https://ordinals.com/content/${ordinal.inscription_id}`}
        className="w-full h-full object-cover"
        autoPlay
        loop
        muted
        playsInline
        preload="none"
      />
    )
  }
  
  // For text/json content - show preview with icon
  if (displayType === 'text') {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#1a1f3a] to-[#0a0e27] p-2">
        <span className="text-3xl mb-1">📜</span>
        <span className="text-[10px] text-white/60 uppercase tracking-wider">Text</span>
      </div>
    )
  }
  
  // For audio content - show visual with audio element
  if (displayType === 'audio') {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#1a1f3a] to-[#0a0e27] p-2">
        <span className="text-3xl mb-2">🎵</span>
        <audio
          src={`https://ordinals.com/content/${ordinal.inscription_id}`}
          controls
          preload="none"
          className="w-full max-w-[90%] h-8"
        />
      </div>
    )
  }
  
  // For 3D models
  if (displayType === 'model') {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#1a1f3a] to-[#0a0e27]">
        <span className="text-3xl mb-1">🎮</span>
        <span className="text-[10px] text-white/60 uppercase tracking-wider">3D Model</span>
      </div>
    )
  }
  
  // Unknown/fallback - use preview endpoint (faster than full content)
  return (
    <img
      src={`https://ordinals.com/preview/${ordinal.inscription_id}`}
      alt={`Ordinal #${ordinal.inscription_number || ordinal.inscription_id.substring(0, 8)}`}
      className="w-full h-full object-cover"
      loading="lazy"
      onError={(e) => {
        // Try full content as second fallback
        const target = e.target as HTMLImageElement
        if (target.src.includes('/preview/')) {
          target.src = `https://ordinals.com/content/${ordinal.inscription_id}`
        } else {
          // On final error, show placeholder
          target.style.display = 'none'
          if (target.parentElement) {
            target.parentElement.innerHTML = '<div class="w-full h-full flex items-center justify-center"><span class="text-3xl">💎</span></div>'
          }
        }
      }}
      onLoad={(e) => {
        // Auto-detect pixel art by checking if image is small
        const target = e.target as HTMLImageElement
        if (target.naturalWidth <= 100 || target.naturalHeight <= 100) {
          target.style.imageRendering = 'pixelated'
        }
      }}
    />
  )
}

export default function ListOrdinalPage() {
  const router = useRouter()
  const { isConnected, currentAddress, paymentAddress, publicKey, client } = useWallet()

  const [loading, setLoading] = useState(false)
  const [fetchingOrdinals, setFetchingOrdinals] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [ordinals, setOrdinals] = useState<Ordinal[]>([])
  const [selectedOrdinal, setSelectedOrdinal] = useState<Ordinal | null>(null)
  const [priceSats, setPriceSats] = useState<string>('')
  const [title, setTitle] = useState<string>('')
  const [description, setDescription] = useState<string>('')
  const [step, setStep] = useState<'select' | 'details'>('select')
  const [hasMore, setHasMore] = useState(true)
  const [offset, setOffset] = useState(0)
  
  // Ref for infinite scroll observer
  const loadMoreRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isConnected && currentAddress) {
      // Reset state when wallet changes
      setOrdinals([])
      setOffset(0)
      setHasMore(true)
      fetchUserOrdinals(0, true)
    }
  }, [isConnected, currentAddress])

  const fetchUserOrdinals = useCallback(async (currentOffset: number = 0, isInitial: boolean = false) => {
    if (!currentAddress) return

    if (isInitial) {
      setFetchingOrdinals(true)
    } else {
      setLoadingMore(true)
    }

    try {
      const params = new URLSearchParams({
        wallet: currentAddress,
        limit: ITEMS_PER_PAGE.toString(),
        offset: currentOffset.toString(),
        sortBy: 'inscriptionNumberDesc',
      })
      
      const response = await fetch(`/api/marketplace/ordinals/my-ordinals?${params.toString()}`)
      const data = await response.json()

      if (response.ok) {
        // Filter out ordinals without valid UTXO data
        const validOrdinals = data.ordinals.filter((o: Ordinal) =>
          o.utxo && o.utxo.txid && o.utxo.vout !== null && o.utxo.value
        )
        
        if (isInitial) {
          setOrdinals(validOrdinals)
        } else {
          setOrdinals(prev => [...prev, ...validOrdinals])
        }
        
        // Update pagination state
        setHasMore(data.pagination?.hasMore ?? false)
        setOffset(currentOffset + validOrdinals.length)

        if (isInitial && validOrdinals.length === 0) {
          toast.info('No ordinals found', { description: 'Make sure you have ordinals in your wallet' })
        }
      } else {
        toast.error('Failed to fetch ordinals', { description: data.error || 'Unknown error' })
      }
    } catch (error: any) {
      console.error('Error fetching ordinals:', error)
      toast.error('Error', { description: 'Failed to fetch your ordinals' })
    } finally {
      setFetchingOrdinals(false)
      setLoadingMore(false)
    }
  }, [currentAddress])

  // Infinite scroll observer
  useEffect(() => {
    if (!loadMoreRef.current || !hasMore || fetchingOrdinals || loadingMore || step !== 'select') return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !fetchingOrdinals) {
          fetchUserOrdinals(offset, false)
        }
      },
      { threshold: 0.1 }
    )

    observer.observe(loadMoreRef.current)

    return () => observer.disconnect()
  }, [hasMore, loadingMore, fetchingOrdinals, offset, step, fetchUserOrdinals])

  const handleSelectOrdinal = (ordinal: Ordinal) => {
    setSelectedOrdinal(ordinal)
    setTitle(`Ordinal #${ordinal.inscription_number || ordinal.inscription_id.substring(0, 8)}`)
    setStep('details')
  }

  // Combined create + sign flow in one step
  const handleCreateAndSign = async () => {
    // paymentAddress might be null, but we can use currentAddress as fallback
    const hasPaymentAddress = paymentAddress || currentAddress
    
    if (!selectedOrdinal || !priceSats || !currentAddress || !hasPaymentAddress || !client) {
      console.error('Missing required fields:', {
        selectedOrdinal: !!selectedOrdinal,
        priceSats: !!priceSats,
        currentAddress: !!currentAddress,
        paymentAddress: !!paymentAddress,
        hasPaymentAddress: !!hasPaymentAddress,
        client: !!client
      })
      toast.error('Missing information', { 
        description: currentAddress 
          ? 'Please fill in all required fields and ensure wallet is connected'
          : 'Wallet not connected. Please connect your wallet.'
      })
      return
    }

    const priceNum = parseInt(priceSats, 10)
    if (isNaN(priceNum) || priceNum <= 0) {
      toast.error('Invalid price', { description: 'Price must be a positive number' })
      return
    }

    if (!selectedOrdinal.utxo.txid || selectedOrdinal.utxo.vout === null) {
      toast.error('Invalid UTXO', { description: 'This ordinal has invalid UTXO data' })
      return
    }

    setLoading(true)
    try {
      // Step 1: Create the listing and get PSBT
      toast.info('Creating listing...', { description: 'Please wait' })
      
      // Use paymentAddress if available, otherwise fallback to currentAddress
      // Some wallets might not provide a separate payment address
      const sellerPaymentAddress = paymentAddress || currentAddress
      
      if (!sellerPaymentAddress) {
        toast.error('Payment address missing', { description: 'Please reconnect your wallet to get payment address' })
        return
      }
      
      const payload = {
        inscription_id: selectedOrdinal.inscription_id,
        inscription_number: selectedOrdinal.inscription_number,
        collection_symbol: selectedOrdinal.collection_symbol,
        utxo_txid: selectedOrdinal.utxo.txid,
        utxo_vout: selectedOrdinal.utxo.vout,
        utxo_value: selectedOrdinal.utxo.value,
        price_sats: priceNum,
        seller_wallet: currentAddress,
        seller_payment_address: sellerPaymentAddress, // Use payment address or fallback to current address
        seller_pubkey: publicKey || undefined,
        title,
        description,
        image_url: selectedOrdinal.image_url || selectedOrdinal.content_url,
        content_type: selectedOrdinal.content_type, // Include content type for proper display
      }
      
      console.log('Creating listing with payload:', { ...payload, seller_pubkey: payload.seller_pubkey ? 'present' : 'missing' })
      
      const response = await fetch('/api/marketplace/ordinals/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const data = await response.json()

      if (!response.ok) {
        toast.error('Failed to create listing', { description: data.error || 'Unknown error' })
        return
      }

      const psbtToSign = data.psbt_to_sign
      const listingId = data.listing_id

      // Step 2: Immediately prompt for signature
      toast.info('Please sign in your wallet...', { description: 'This authorizes the sale when purchased' })
      console.log('🔐 Signing listing PSBT...')

      // Sign with autoFinalize=false so buyer can complete the PSBT
      // autoFinalize=true would finalize the input, preventing buyer from adding their inputs
      const signedResult = await client.signPsbt(psbtToSign, false, false)

      let signedPsbtBase64: string
      if (signedResult.psbt) {
        signedPsbtBase64 = signedResult.psbt
      } else if (signedResult.psbtHex) {
        signedPsbtBase64 = Buffer.from(signedResult.psbtHex, 'hex').toString('base64')
      } else if (signedResult.signedPsbtBase64) {
        signedPsbtBase64 = signedResult.signedPsbtBase64
      } else {
        throw new Error('No signed PSBT returned from wallet')
      }

      console.log('✅ PSBT signed, confirming listing...')

      // Step 3: Confirm the listing
      const confirmResponse = await fetch('/api/marketplace/ordinals/confirm-listing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listing_id: listingId,
          seller_wallet: currentAddress,
          signed_psbt_base64: signedPsbtBase64,
        })
      })

      const confirmData = await confirmResponse.json()

      if (confirmResponse.ok) {
        toast.success('🎉 Listed!', { description: 'Your ordinal is now live on the marketplace' })
        
        // Redirect to marketplace after a short delay
        setTimeout(() => {
          router.push('/marketplace')
        }, 1500)
      } else {
        toast.error('Failed to confirm listing', { description: confirmData.error || 'Unknown error' })
      }
    } catch (error: any) {
      console.error('Error creating/signing listing:', error)

      if (error.message?.includes('cancel') || error.message?.includes('reject')) {
        toast.error('Cancelled', { description: 'You cancelled the signature request' })
      } else {
        toast.error('Error', { description: error.message || 'Failed to create listing' })
      }
    } finally {
      setLoading(false)
    }
  }

  if (!isConnected) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="cosmic-card border border-[#00d4ff]/30 rounded-xl p-12 text-center max-w-md">
          <div className="text-6xl mb-4">🔒</div>
          <h2 className="text-2xl font-bold text-white mb-2">Wallet Not Connected</h2>
          <p className="text-white/80 mb-6">
            Please connect your Bitcoin wallet to list ordinals
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="relative bg-gradient-to-r from-[#0a0e27]/90 via-[#1a1f3a]/90 to-[#0f172a]/90 text-white border-b border-[#00d4ff]/30">
        <div className="container mx-auto px-6 py-8">
          <button
            onClick={() => router.back()}
            className="text-[#00d4ff] hover:text-[#00b8e6] mb-4 flex items-center gap-2"
          >
            ← Back to Marketplace
          </button>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight text-white">List Your Ordinal</h1>
          <p className="text-[#a5b4fc] mt-2 text-lg">
            Sell your Bitcoin ordinals with trustless PSBT-based trading
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        <div className="max-w-[1800px] mx-auto">

          {/* Step 1: Select Ordinal */}
          {step === 'select' && (
            <>
              {fetchingOrdinals && ordinals.length === 0 ? (
                <div className="flex items-center justify-center py-20">
                  <div className="w-12 h-12 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : ordinals.length === 0 && !fetchingOrdinals ? (
                <div className="cosmic-card border border-[#00d4ff]/30 rounded-xl p-12 text-center">
                  <div className="text-6xl mb-4">💎</div>
                  <h2 className="text-2xl font-bold text-white mb-2">No Ordinals Found</h2>
                  <p className="text-white/80 mb-6">
                    We couldn't find any ordinals in your wallet. Make sure you have ordinals and try again.
                  </p>
                  <button
                    onClick={() => {
                      setOffset(0)
                      setHasMore(true)
                      fetchUserOrdinals(0, true)
                    }}
                    className="px-6 py-3 bg-[#00d4ff] hover:bg-[#00b8e6] text-white rounded-lg font-semibold transition-colors"
                  >
                    Refresh
                  </button>
                </div>
              ) : ordinals.length > 0 ? (
                <>
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl font-bold text-white">Select an Ordinal to List</h2>
                    <div className="flex items-center gap-4">
                      <span className="text-white/60 text-sm">{ordinals.length} ordinals loaded</span>
                      <button
                        onClick={() => {
                          setOrdinals([])
                          setOffset(0)
                          setHasMore(true)
                          fetchUserOrdinals(0, true)
                        }}
                        disabled={fetchingOrdinals}
                        className="px-3 py-1.5 bg-[#00d4ff]/20 hover:bg-[#00d4ff]/30 text-[#00d4ff] rounded-lg text-sm font-medium transition-colors border border-[#00d4ff]/30 disabled:opacity-50"
                      >
                        {fetchingOrdinals ? 'Refreshing...' : '🔄 Refresh'}
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-3">
                    {ordinals.map((ordinal) => (
                      <div
                        key={ordinal.inscription_id}
                        onClick={() => handleSelectOrdinal(ordinal)}
                        className="cosmic-card border border-[#00d4ff]/30 rounded-lg overflow-hidden hover:shadow-lg hover:shadow-[#00d4ff]/20 hover:border-[#00d4ff]/60 hover:scale-[1.03] transition-all cursor-pointer group"
                      >
                        <div className="relative aspect-square bg-[#0a0e27] overflow-hidden">
                          <OrdinalContent ordinal={ordinal} />
                          {/* Click overlay - captures clicks even on iframes/interactive content */}
                          <div className="absolute inset-0 z-10" />
                          {ordinal.collection_symbol && (
                            <div className="absolute bottom-1 left-1 opacity-90 group-hover:opacity-100 transition-opacity z-20 pointer-events-none">
                              <span className="px-1.5 py-0.5 bg-black/70 text-white rounded text-[10px] font-medium backdrop-blur-sm">
                                {ordinal.collection_symbol}
                              </span>
                            </div>
                          )}
                          {ordinal.inscription_number && (
                            <div className="absolute top-1 right-1 z-20 pointer-events-none">
                              <span className="px-1.5 py-0.5 bg-[#00d4ff]/90 text-white rounded text-[10px] font-bold">
                                #{ordinal.inscription_number.toLocaleString()}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="p-2">
                          <h3 className="font-bold text-white text-xs truncate">
                            #{ordinal.inscription_number?.toLocaleString() || ordinal.inscription_id.substring(0, 8)}
                          </h3>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {/* Load More Trigger - Infinite Scroll */}
                  {hasMore && (
                    <div 
                      ref={loadMoreRef} 
                      className="flex items-center justify-center py-8 mt-6"
                    >
                      {loadingMore ? (
                        <div className="flex items-center gap-3">
                          <div className="w-6 h-6 border-3 border-[#00d4ff] border-t-transparent rounded-full animate-spin" />
                          <span className="text-white/70">Loading more ordinals...</span>
                        </div>
                      ) : (
                        <button
                          onClick={() => fetchUserOrdinals(offset, false)}
                          className="px-6 py-3 bg-[#00d4ff]/20 hover:bg-[#00d4ff]/30 text-[#00d4ff] rounded-lg font-semibold transition-colors border border-[#00d4ff]/30"
                        >
                          Load More
                        </button>
                      )}
                    </div>
                  )}
                  
                  {!hasMore && ordinals.length > 0 && (
                    <div className="text-center py-6 text-white/50 text-sm">
                      All {ordinals.length} ordinals loaded
                    </div>
                  )}
                </>
              ) : null}
            </>
          )}

          {/* Step 2: Enter Details */}
          {step === 'details' && selectedOrdinal && (
            <div className="cosmic-card border border-[#00d4ff]/30 rounded-xl p-8">
              <button
                onClick={() => setStep('select')}
                className="text-[#00d4ff] hover:text-[#00b8e6] mb-6 flex items-center gap-2"
              >
                ← Choose Different Ordinal
              </button>

              <div className="grid md:grid-cols-2 gap-8">
                {/* Preview */}
                <div>
                  <h3 className="text-lg font-bold text-white mb-4">Preview</h3>
                  <div className="border border-[#00d4ff]/30 rounded-xl overflow-hidden">
                    <div className="aspect-square bg-[#0a0e27] relative">
                      <OrdinalContent ordinal={selectedOrdinal} />
                    </div>
                    <div className="p-4 cosmic-card space-y-3">
                      <div>
                        <p className="text-sm text-white/60 mb-1">Inscription ID:</p>
                        <p className="text-xs text-white font-mono break-all">
                          {selectedOrdinal.inscription_id}
                        </p>
                      </div>
                      {selectedOrdinal.inscription_number && (
                        <div>
                          <p className="text-sm text-white/60 mb-1">Inscription #:</p>
                          <p className="text-white font-bold">
                            #{selectedOrdinal.inscription_number.toLocaleString()}
                          </p>
                        </div>
                      )}
                      {selectedOrdinal.collection_symbol && (
                        <div>
                          <p className="text-sm text-white/60 mb-1">Collection:</p>
                          <p className="text-white font-medium">
                            {selectedOrdinal.collection_symbol}
                          </p>
                        </div>
                      )}
                      {selectedOrdinal.content_type && (
                        <div>
                          <p className="text-sm text-white/60 mb-1">Content Type:</p>
                          <p className="text-white/80 text-sm font-mono">
                            {selectedOrdinal.content_type}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Form */}
                <div>
                  <h3 className="text-lg font-bold text-white mb-4">Listing Details</h3>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-white mb-2">
                        Title
                      </label>
                      <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="w-full px-4 py-2 bg-[#0a0e27] border border-[#00d4ff]/30 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-[#00d4ff]"
                        placeholder="My Awesome Ordinal"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-white mb-2">
                        Price (sats) *
                      </label>
                      <input
                        type="number"
                        value={priceSats}
                        onChange={(e) => setPriceSats(e.target.value)}
                        className="w-full px-4 py-2 bg-[#0a0e27] border border-[#00d4ff]/30 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-[#00d4ff]"
                        placeholder="1000000"
                        min="1"
                        required
                      />
                      {priceSats && (
                        <p className="text-sm text-white/60 mt-1">
                          ≈ {(parseInt(priceSats) / 100000000).toFixed(8)} BTC
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-white mb-2">
                        Description (optional)
                      </label>
                      <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="w-full px-4 py-2 bg-[#0a0e27] border border-[#00d4ff]/30 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-[#00d4ff] resize-none"
                        placeholder="Describe your ordinal..."
                        rows={4}
                      />
                    </div>

                    {/* Fee info */}
                    {priceSats && parseInt(priceSats) > 0 && (
                      <div className="bg-[#0a0e27] border border-[#00d4ff]/20 rounded-lg p-3">
                        <div className="flex justify-between text-sm">
                          <span className="text-white/60">Platform Fee (2%)</span>
                          <span className="text-white">
                            {Math.max(330, Math.floor(parseInt(priceSats) * 0.02)).toLocaleString()} sats
                          </span>
                        </div>
                        <div className="flex justify-between text-sm mt-1">
                          <span className="text-white/60">You Receive</span>
                          <span className="text-[#00d4ff] font-bold">
                            {parseInt(priceSats).toLocaleString()} sats
                          </span>
                        </div>
                      </div>
                    )}

                    <div className="pt-4">
                      <button
                        onClick={handleCreateAndSign}
                        disabled={loading || !priceSats || !client}
                        className="w-full px-6 py-3 bg-gradient-to-r from-[#00d4ff] to-[#00b8e6] hover:from-[#00b8e6] hover:to-[#0099cc] text-white rounded-lg font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#00d4ff]/20"
                      >
                        {loading ? (
                          <span className="flex items-center justify-center gap-2">
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Processing...
                          </span>
                        ) : (
                          '🚀 List & Sign'
                        )}
                      </button>
                      <p className="text-xs text-white/50 text-center mt-2">
                        Your wallet will prompt you to sign
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}


        </div>
      </div>
    </div>
  )
}
