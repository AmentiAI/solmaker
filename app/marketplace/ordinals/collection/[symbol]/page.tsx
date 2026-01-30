'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, useParams } from 'next/navigation'
import { useWallet } from '@/lib/wallet/compatibility'
import { toast } from 'sonner'
import * as bitcoin from 'bitcoinjs-lib'

interface BuyingState {
  listingId: string
  status: 'idle' | 'preparing' | 'signing' | 'broadcasting' | 'complete'
  txId?: string
}

interface CancellingState {
  listingId: string
  status: 'confirming' | 'cancelling' | 'complete'
}

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
  
  return 'unknown'
}

// Content renderer component for ordinals
function OrdinalContentDisplay({ listing }: { listing: any }) {
  const displayType = getDisplayType(listing.content_type)
  const contentUrl = listing.image_url
  
  // For images - display directly
  if (displayType === 'image' || (!listing.content_type && contentUrl)) {
    return (
      <img
        src={contentUrl || `https://ordinals.com/preview/${listing.inscription_id}`}
        alt={listing.title || `Ordinal #${listing.inscription_number}`}
        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        loading="lazy"
        onError={(e) => {
          const target = e.target as HTMLImageElement
          if (!target.src.includes('ordinals.com/preview')) {
            target.src = `https://ordinals.com/preview/${listing.inscription_id}`
          } else if (!target.src.includes('ordinals.com/content')) {
            target.src = `https://ordinals.com/content/${listing.inscription_id}`
          }
        }}
        onLoad={(e) => {
          const target = e.target as HTMLImageElement
          if (target.naturalWidth <= 100 || target.naturalHeight <= 100) {
            target.style.imageRendering = 'pixelated'
          }
        }}
      />
    )
  }
  
  // For HTML content - render iframe
  if (displayType === 'html') {
    return (
      <iframe
        src={`https://ordinals.com/preview/${listing.inscription_id}`}
        title={`Ordinal #${listing.inscription_number || listing.inscription_id.substring(0, 8)}`}
        className="w-full h-full border-0"
        sandbox="allow-scripts allow-same-origin"
        scrolling="no"
      />
    )
  }
  
  // For video content
  if (displayType === 'video') {
    return (
      <video
        src={`https://ordinals.com/content/${listing.inscription_id}`}
        className="w-full h-full object-cover"
        autoPlay
        loop
        muted
        playsInline
        preload="none"
      />
    )
  }
  
  // For audio content
  if (displayType === 'audio') {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#1a1f3a] to-[#0a0e27] p-2">
        <span className="text-3xl mb-2">🎵</span>
        <audio
          src={`https://ordinals.com/content/${listing.inscription_id}`}
          controls
          preload="none"
          className="w-full max-w-[90%] h-8"
        />
      </div>
    )
  }
  
  // For text/json content
  if (displayType === 'text') {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#1a1f3a] to-[#0a0e27] p-2">
        <span className="text-3xl mb-1">📜</span>
        <span className="text-[10px] text-[#a8a8b8]/80 uppercase tracking-wider">Text</span>
      </div>
    )
  }
  
  // Unknown/fallback
  return (
    <img
      src={`https://ordinals.com/preview/${listing.inscription_id}`}
      alt={listing.title || `Ordinal #${listing.inscription_number}`}
      className="w-full h-full object-cover"
      loading="lazy"
      onError={(e) => {
        const target = e.target as HTMLImageElement
        if (target.src.includes('/preview/')) {
          target.src = `https://ordinals.com/content/${listing.inscription_id}`
        } else {
          target.style.display = 'none'
          if (target.parentElement) {
            target.parentElement.innerHTML = '<div class="w-full h-full flex items-center justify-center"><span class="text-3xl">💎</span></div>'
          }
        }
      }}
    />
  )
}

export default function CollectionOrdinalsPage() {
  const router = useRouter()
  const params = useParams()
  const collectionSymbol = decodeURIComponent(params.symbol as string)
  const { isConnected, currentAddress, paymentAddress, publicKey, paymentPublicKey, client } = useWallet()

  const [listings, setListings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState<'price_asc' | 'price_desc' | 'recent' | 'inscription_asc'>('price_asc')
  const [buying, setBuying] = useState<BuyingState | null>(null)
  const [cancelling, setCancelling] = useState<CancellingState | null>(null)
  const [collectionStats, setCollectionStats] = useState<any>(null)
  const [loadingStats, setLoadingStats] = useState(true)

  useEffect(() => {
    fetchListings()
    fetchCollectionStats()
  }, [collectionSymbol])

  const fetchCollectionStats = async () => {
    setLoadingStats(true)
    try {
      const response = await fetch(`/api/marketplace/ordinals/collection-stats?symbol=${encodeURIComponent(collectionSymbol)}`)
      const data = await response.json()

      if (response.ok) {
        // Merge stats and metadata
        setCollectionStats({
          ...data.stats,
          metadata: data.metadata,
        })
      }
    } catch (error) {
      console.error('Error fetching collection stats:', error)
    } finally {
      setLoadingStats(false)
    }
  }

  const fetchListings = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/marketplace/ordinals/listings?status=active&collection=${encodeURIComponent(collectionSymbol)}`)
      const data = await response.json()

      if (response.ok) {
        setListings(data.listings || [])
      } else {
        toast.error('Failed to load listings')
      }
    } catch (error) {
      console.error('Error fetching listings:', error)
      toast.error('Error loading collection')
    } finally {
      setLoading(false)
    }
  }

  const handleBuyClick = async (listing: any) => {
    if (!isConnected || !currentAddress || !client) {
      toast.error('Please connect your wallet')
      return
    }

    if (listing.seller_wallet === currentAddress) {
      toast.error('You cannot buy your own listing')
      return
    }

    setBuying({ listingId: listing.id, status: 'preparing' })

    try {
      // Step 1: Get purchase PSBT
      toast.info('Preparing purchase...', { duration: 2000 })
      
      const purchaseResponse = await fetch('/api/marketplace/ordinals/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listing_id: listing.id,
          buyer_wallet: currentAddress,
          buyer_payment_address: paymentAddress || currentAddress,
          buyer_pubkey: publicKey,
          payment_pubkey: paymentPublicKey,
        })
      })

      const purchaseData = await purchaseResponse.json()

      if (!purchaseResponse.ok) {
        toast.error('Failed to prepare purchase', { description: purchaseData.error })
        setBuying(null)
        return
      }

      // Check if this is a padding UTXO creation request
      if (purchaseData.requiresPaddingUtxos) {
        toast.info('Creating padding UTXOs...', { description: purchaseData.message })
        setBuying({ listingId: listing.id, status: 'signing' })
        
        if (!client) {
          toast.error('Wallet client not available')
          setBuying(null)
          return
        }
        
        // Sign and broadcast the padding UTXO creation transaction
        console.log('🔐 Signing padding UTXO creation PSBT...')
        const signedResult = await client.signPsbt(purchaseData.psbt, true, false)
        
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
        
        // Finalize and broadcast
        // Always use the finalize API endpoint to ensure proper finalization
        const finalizeResponse = await fetch('/api/finalize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ txBase64: signedPsbtBase64 }),
        })
        
        if (!finalizeResponse.ok) {
          const errorData = await finalizeResponse.json()
          throw new Error(errorData.error || 'Failed to finalize padding UTXO transaction')
        }
        
        const finalizeData = await finalizeResponse.json()
        const txHex = finalizeData.hex
        
        // Broadcast
        const broadcastResponse = await fetch('/api/broadcast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ txHex }),
        })
        
        if (!broadcastResponse.ok) {
          const errorData = await broadcastResponse.json()
          throw new Error(errorData.error || 'Failed to broadcast padding UTXO transaction')
        }
        
        const broadcastData = await broadcastResponse.json()
        toast.success('Padding UTXOs created!', { 
          description: `Transaction: ${broadcastData.txId?.substring(0, 16)}... Please wait a moment for UTXOs to be available, then try purchasing again.`,
          duration: 8000
        })
        
        // Reset buying state - user needs to manually retry after UTXOs are available
        setBuying(null)
        return
      }

      // Step 2: Sign PSBT
      if (!client) {
        toast.error('Wallet client not available')
        setBuying(null)
        return
      }
      
      if (!purchaseData.psbt_to_sign) {
        toast.error('No PSBT returned from server')
        setBuying(null)
        return
      }
      
      setBuying({ listingId: listing.id, status: 'signing' })
      toast.info('Please sign in your wallet...', { duration: 5000 })
      
      console.log('🔐 Signing purchase PSBT...')
      const signedResult = await client.signPsbt(purchaseData.psbt_to_sign, true, false)

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

      // Step 3: Finalize and extract transaction
      setBuying({ listingId: listing.id, status: 'broadcasting' })
      
      const finalPsbt = bitcoin.Psbt.fromBase64(signedPsbtBase64)
      const requiresFinalization = finalPsbt.data.inputs.some(
        (input) => !input.finalScriptSig && !input.finalScriptWitness
      )

      let txHex: string
      let finalTxId: string

      if (requiresFinalization) {
        console.log('⚠️ PSBT requires finalization...')
        const finalizeResponse = await fetch('/api/finalize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ txBase64: signedPsbtBase64 }),
        })

        if (!finalizeResponse.ok) {
          throw new Error('Failed to finalize transaction')
        }

        const finalizeData = await finalizeResponse.json()
        txHex = finalizeData.hex
        const tx = bitcoin.Transaction.fromHex(txHex)
        finalTxId = tx.getId()
      } else {
        const tx = finalPsbt.extractTransaction()
        txHex = tx.toHex()
        finalTxId = tx.getId()
      }

      if (signedResult.txId || signedResult.txid) {
        finalTxId = signedResult.txId || signedResult.txid
      }

      // Step 4: Broadcast transaction
      console.log('📡 Broadcasting transaction...')
      const broadcastResponse = await fetch('https://mempool.space/api/tx', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: txHex,
      })

      if (!broadcastResponse.ok) {
        const errorText = await broadcastResponse.text()
        throw new Error(`Failed to broadcast: ${errorText}`)
      }

      console.log('✅ Transaction broadcast:', finalTxId)

      // Step 5: Confirm purchase on backend
      await fetch('/api/marketplace/ordinals/confirm-purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listing_id: listing.id,
          buyer_wallet: currentAddress,
          tx_id: finalTxId,
          tx_hex: txHex,
        })
      })

      setBuying({ listingId: listing.id, status: 'complete', txId: finalTxId })
      toast.success('🎉 Purchase successful!', { 
        description: 'The ordinal will be transferred once confirmed',
        action: {
          label: 'View TX',
          onClick: () => window.open(`https://mempool.space/tx/${finalTxId}`, '_blank')
        }
      })

      // Remove listing from local state
      setListings(prev => prev.filter(l => l.id !== listing.id))
      
      // Reset after delay
      setTimeout(() => setBuying(null), 3000)

    } catch (error: any) {
      console.error('Purchase error:', error)
      
      if (error.message?.includes('cancel') || error.message?.includes('reject')) {
        toast.error('Purchase cancelled')
      } else {
        toast.error('Purchase failed', { description: error.message })
      }
      setBuying(null)
    }
  }

  const handleCancelClick = (listing: any) => {
    if (!isConnected || !currentAddress) {
      toast.error('Please connect your wallet')
      return
    }

    if (listing.seller_wallet !== currentAddress) {
      toast.error('You can only cancel your own listings')
      return
    }

    setCancelling({ listingId: listing.id, status: 'confirming' })
  }

  const confirmCancel = async (listing: any) => {
    if (!currentAddress) return

    setCancelling({ listingId: listing.id, status: 'cancelling' })

    try {
      const response = await fetch('/api/marketplace/ordinals/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listing_id: listing.id,
          seller_wallet: currentAddress,
        })
      })

      const data = await response.json()

      if (response.ok) {
        setCancelling({ listingId: listing.id, status: 'complete' })
        toast.success('Listing cancelled', { description: 'Your ordinal is no longer for sale' })
        
        // Remove listing from local state
        setListings(prev => prev.filter(l => l.id !== listing.id))
        
        setTimeout(() => setCancelling(null), 1500)
      } else {
        toast.error('Failed to cancel', { description: data.error })
        setCancelling(null)
      }
    } catch (error: any) {
      console.error('Cancel error:', error)
      toast.error('Failed to cancel listing', { description: error.message })
      setCancelling(null)
    }
  }

  const sortedListings = React.useMemo(() => {
    const sorted = [...listings]

    switch (sortBy) {
      case 'price_asc':
        return sorted.sort((a, b) => a.price_sats - b.price_sats)
      case 'price_desc':
        return sorted.sort((a, b) => b.price_sats - a.price_sats)
      case 'recent':
        return sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      case 'inscription_asc':
        return sorted.sort((a, b) => (a.inscription_number || 0) - (b.inscription_number || 0))
      default:
        return sorted
    }
  }, [listings, sortBy])

  const floorPrice = listings.length > 0 ? Math.min(...listings.map(l => l.price_sats)) : 0

  const getBuyButtonText = (listing: any) => {
    if (buying?.listingId === listing.id && buying) {
      switch (buying.status) {
        case 'preparing': return 'Preparing...'
        case 'signing': return 'Sign in Wallet...'
        case 'broadcasting': return 'Broadcasting...'
        case 'complete': return '✓ Purchased!'
        default: return 'Buy'
      }
    }
    return `Buy ${(listing.price_sats / 100000000).toFixed(8)} BTC`
  }

  return (
    <div className="min-h-screen">
      {/* Header with Collection Image */}
      <div className="relative bg-gradient-to-r from-[#0a0e27]/90 via-[#1a1f3a]/90 to-[#0f172a]/90 text-white border-b border-[#9945FF]/30">
        <div className="container mx-auto px-6 py-8">
          <Link
            href="/marketplace"
            className="text-[#9945FF] hover:text-[#14F195] mb-4 flex items-center gap-2"
          >
            ← Back to Marketplace
          </Link>
          
          <div className="flex flex-col md:flex-row gap-6 items-start md:items-center">
            {/* Collection Image */}
            <div className="w-32 h-32 md:w-40 md:h-40 rounded-xl overflow-hidden border-2 border-[#9945FF]/30 flex-shrink-0 bg-gradient-to-br from-[#1a1f3a] to-[#0a0e27]">
              {collectionStats?.collection_image ? (
                <img
                  src={collectionStats.collection_image}
                  alt={collectionSymbol}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement
                    target.style.display = 'none'
                    if (target.parentElement) {
                      target.parentElement.innerHTML = '<div class="w-full h-full flex items-center justify-center"><span class="text-4xl">💎</span></div>'
                    }
                  }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="text-5xl">💎</span>
                </div>
              )}
            </div>
            
            {/* Collection Info */}
            <div className="flex-1">
              <h1 className="text-4xl md:text-5xl font-black tracking-tight text-white mb-2">
                {collectionStats?.metadata?.name || collectionSymbol}
              </h1>
              
              {/* Description */}
              {collectionStats?.metadata?.description && (
                <p className="text-[#a8a8b8] text-sm mb-3 max-w-2xl line-clamp-2">
                  {collectionStats.metadata.description}
                </p>
              )}
              
              {/* Social Links */}
              {(collectionStats?.metadata?.twitter || collectionStats?.metadata?.discord || collectionStats?.metadata?.website || collectionStats?.metadata?.telegram) && (
                <div className="flex items-center gap-3 mb-3">
                  {collectionStats.metadata.website && (
                    <a
                      href={collectionStats.metadata.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#a8a8b8]/80 hover:text-[#9945FF] transition-colors text-sm"
                    >
                      🌐 Website
                    </a>
                  )}
                  {collectionStats.metadata.twitter && (
                    <a
                      href={collectionStats.metadata.twitter.startsWith('http') ? collectionStats.metadata.twitter : `https://twitter.com/${collectionStats.metadata.twitter.replace('@', '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#a8a8b8]/80 hover:text-[#9945FF] transition-colors text-sm"
                    >
                      🐦 Twitter
                    </a>
                  )}
                  {collectionStats.metadata.discord && (
                    <a
                      href={collectionStats.metadata.discord.startsWith('http') ? collectionStats.metadata.discord : `https://discord.gg/${collectionStats.metadata.discord}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#a8a8b8]/80 hover:text-[#9945FF] transition-colors text-sm"
                    >
                      💬 Discord
                    </a>
                  )}
                  {collectionStats.metadata.telegram && (
                    <a
                      href={collectionStats.metadata.telegram.startsWith('http') ? collectionStats.metadata.telegram : `https://t.me/${collectionStats.metadata.telegram.replace('@', '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#a8a8b8]/80 hover:text-[#9945FF] transition-colors text-sm"
                    >
                      📱 Telegram
                    </a>
                  )}
                </div>
              )}
              
              <div className="flex flex-wrap items-center gap-6">
                <div>
                  <p className="text-[#a8a8b8]/80 text-sm">Floor Price</p>
                  <p className="text-[#9945FF] font-bold text-xl">
                    {collectionStats ? parseFloat(collectionStats.floor_price_btc).toFixed(6) : (floorPrice / 100000000).toFixed(6)} BTC
                  </p>
                </div>
                <div>
                  <p className="text-[#a8a8b8]/80 text-sm">Listed</p>
                  <p className="text-white font-bold text-xl">{listings.length}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      {loadingStats ? (
        <div className="container mx-auto px-6 py-6">
          <div className="max-w-[1800px] mx-auto">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-8">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#9945FF]/30 rounded-lg p-4 animate-pulse">
                  <div className="h-4 bg-white/10 rounded mb-2"></div>
                  <div className="h-6 bg-white/10 rounded"></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : collectionStats && (
        <div className="container mx-auto px-6 py-6">
          <div className="max-w-[1800px] mx-auto">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-8">
              {/* Total Sales */}
              <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#9945FF]/30 rounded-lg p-4">
                <p className="text-[#a8a8b8]/80 text-xs mb-1">Total Sales</p>
                <p className="text-white font-bold text-xl">{collectionStats.total_sales}</p>
              </div>

              {/* Total Volume */}
              <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#9945FF]/30 rounded-lg p-4">
                <p className="text-[#a8a8b8]/80 text-xs mb-1">Total Volume</p>
                <p className="text-[#9945FF] font-bold text-lg">{parseFloat(collectionStats.total_volume_btc).toFixed(8)} BTC</p>
                <p className="text-white/50 text-[10px] mt-0.5">{collectionStats.total_volume_sats.toLocaleString()} sats</p>
              </div>

              {/* Recent Sales (30d) */}
              <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#9945FF]/30 rounded-lg p-4">
                <p className="text-[#a8a8b8]/80 text-xs mb-1">Sales (30d)</p>
                <p className="text-white font-bold text-xl">{collectionStats.recent_sales_30d}</p>
              </div>

              {/* Recent Volume (30d) */}
              <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#9945FF]/30 rounded-lg p-4">
                <p className="text-[#a8a8b8]/80 text-xs mb-1">Volume (30d)</p>
                <p className="text-[#9945FF] font-bold text-lg">{parseFloat(collectionStats.recent_volume_btc_30d).toFixed(8)} BTC</p>
              </div>

              {/* Average Sale Price */}
              <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#9945FF]/30 rounded-lg p-4">
                <p className="text-[#a8a8b8]/80 text-xs mb-1">Avg Sale Price</p>
                <p className="text-[#9945FF] font-bold text-lg">{parseFloat(collectionStats.avg_sale_price_btc).toFixed(8)} BTC</p>
              </div>

              {/* Active Listings */}
              <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#9945FF]/30 rounded-lg p-4">
                <p className="text-[#a8a8b8]/80 text-xs mb-1">Active Listings</p>
                <p className="text-white font-bold text-xl">{collectionStats.active_listings}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="container mx-auto px-6 py-8">
        <div className="max-w-[1800px] mx-auto">

          {/* Sort Controls */}
          {listings.length > 0 && (
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">{listings.length} {listings.length === 1 ? 'Listing' : 'Listings'}</h2>
              <div className="flex items-center gap-3">
                <label className="text-sm text-[#a8a8b8]/80">Sort by:</label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="px-4 py-2 bg-[#0a0e27] border border-[#9945FF]/30 rounded-lg text-white text-sm focus:outline-none focus:border-[#9945FF]"
                >
                  <option value="price_asc">Price: Low to High</option>
                  <option value="price_desc">Price: High to Low</option>
                  <option value="recent">Recently Listed</option>
                  <option value="inscription_asc">Inscription #</option>
                </select>
              </div>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-20">
              <div className="w-12 h-12 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* Empty */}
          {!loading && listings.length === 0 && (
            <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#9945FF]/30 rounded-xl p-12 text-center">
              <div className="text-6xl mb-4">💎</div>
              <h2 className="text-2xl font-bold text-white mb-2">No Listings Found</h2>
              <p className="text-[#a8a8b8] mb-6">
                There are no ordinals from {collectionSymbol} currently listed for sale.
              </p>
              <Link
                href="/marketplace"
                className="px-6 py-3 bg-[#9945FF] hover:bg-[#14F195] text-white rounded-lg font-semibold transition-colors inline-block"
              >
                Browse Other Collections
              </Link>
            </div>
          )}

          {/* Listings Grid */}
          {!loading && sortedListings.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {sortedListings.map((listing: any) => (
                <div
                  key={listing.id}
                  className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#9945FF]/30 rounded-lg overflow-hidden hover:shadow-lg hover:shadow-[#9945FF]/20 transition-all group"
                >
                  {/* Clickable Image/Title Area - navigates to detail page */}
                  <Link
                    href={`/marketplace/ordinals/${listing.id}`}
                    className="block"
                  >
                    <div className="relative aspect-square bg-[#0a0e27] overflow-hidden">
                      <OrdinalContentDisplay listing={listing} />
                      <div className="absolute top-1 right-1 pointer-events-none">
                        <span className="px-1.5 py-0.5 bg-orange-500 text-white rounded text-[10px] font-bold">
                          {(listing.price_sats / 100000000).toFixed(8)}
                        </span>
                      </div>
                      {listing.inscription_number && (
                        <div className="absolute bottom-1 left-1 pointer-events-none">
                          <span className="px-1.5 py-0.5 bg-black/70 text-white rounded text-[10px] font-medium backdrop-blur-sm">
                            #{listing.inscription_number.toLocaleString()}
                          </span>
                        </div>
                      )}
                    </div>
                  </Link>
                  
                  {/* Bottom area with buy button */}
                  <div className="p-2">
                    <Link 
                      href={`/marketplace/ordinals/${listing.id}`}
                      className="block"
                    >
                      <h3 className="font-bold text-white text-xs truncate hover:text-[#9945FF] transition-colors">
                        #{listing.inscription_number?.toLocaleString() || listing.inscription_id.substring(0, 8)}
                      </h3>
                    </Link>
                    
                    <div className="mt-2">
                      {listing.seller_wallet === currentAddress ? (
                        cancelling?.listingId === listing.id && cancelling ? (
                          cancelling.status === 'confirming' ? (
                            <div className="flex gap-1">
                              <button
                                onClick={() => confirmCancel(listing)}
                                className="flex-1 px-2 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded text-[10px] font-bold transition-colors"
                              >
                                Confirm
                              </button>
                              <button
                                onClick={() => setCancelling(null)}
                                className="flex-1 px-2 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded text-[10px] font-medium transition-colors"
                              >
                                Keep
                              </button>
                            </div>
                          ) : cancelling?.status === 'cancelling' ? (
                            <div className="w-full px-2 py-1.5 bg-red-500/50 text-white rounded text-[10px] font-medium text-center animate-pulse">
                              Cancelling...
                            </div>
                          ) : (
                            <div className="w-full px-2 py-1.5 bg-green-500 text-white rounded text-[10px] font-medium text-center">
                              ✓ Cancelled
                            </div>
                          )
                        ) : (
                          <button
                            onClick={() => handleCancelClick(listing)}
                            className="w-full px-2 py-1.5 bg-red-500/20 hover:bg-red-500 text-[#EF4444] hover:text-white border border-red-500/50 rounded text-[10px] font-medium text-center transition-all"
                          >
                            Cancel Listing
                          </button>
                        )
                      ) : !isConnected ? (
                        <div className="w-full px-2 py-1.5 bg-white/10 text-white/50 rounded text-[10px] font-medium text-center">
                          Connect Wallet
                        </div>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            handleBuyClick(listing)
                          }}
                          disabled={buying?.listingId === listing.id}
                          className={`w-full px-2 py-1.5 rounded text-[10px] font-bold transition-all ${
                            buying?.listingId === listing.id
                              ? buying?.status === 'complete'
                                ? 'bg-green-500 text-white'
                                : 'bg-orange-500/50 text-white animate-pulse'
                              : 'bg-orange-500 hover:bg-orange-600 text-white hover:scale-[1.02]'
                          }`}
                        >
                          {getBuyButtonText(listing)}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
