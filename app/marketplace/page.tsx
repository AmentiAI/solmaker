'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useWallet } from '@/lib/wallet/compatibility'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
// Solana marketplace imports

interface MarketplaceListing {
  id: string
  collection_id: string
  seller_wallet: string
  price_credits: number
  price_sol?: string | null
  seller_sol_address?: string | null
  payment_type: 'credits' | 'sol' | 'both'
  title: string
  description?: string
  included_promo_urls: string[]
  status: string
  created_at: string
  collection_name: string
  collection_description?: string
  ordinal_count: number
  sample_image?: string
  has_pending_payment?: boolean
  pending_buyer_wallet?: string
}

interface CollectionEligibility {
  id: string
  name: string
  description?: string
  ordinal_count: number
  phase_count: number
  minted_count: number
  is_eligible: boolean
  reasons: string[]
  already_listed: boolean
  sample_image?: string | null
}

export default function MarketplacePage() {
  const router = useRouter()
  const { isConnected, currentAddress, paymentAddress, publicKey, paymentPublicKey, client } = useWallet()

  // Check URL params for tab - DEFAULT TO ORDINALS
  const [activeTab, setActiveTab] = useState<'collections' | 'ordinals'>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const tab = params.get('tab')
      return tab === 'collections' ? 'collections' : 'ordinals'
    }
    return 'ordinals'
  })
  const [listings, setListings] = useState<MarketplaceListing[]>([])
  const [loading, setLoading] = useState(true)
  const [userCredits, setUserCredits] = useState<number>(0)
  const [loadingCredits, setLoadingCredits] = useState(false)
  const [myCollections, setMyCollections] = useState<CollectionEligibility[]>([])
  const [loadingCollections, setLoadingCollections] = useState(false)
  const [showListCollection, setShowListCollection] = useState(false)
  const [showPurchaseConfirm, setShowPurchaseConfirm] = useState<MarketplaceListing | null>(null)

  // Ordinals tab state
  const [ordinalListings, setOrdinalListings] = useState<any[]>([])
  const [loadingOrdinals, setLoadingOrdinals] = useState(false)
  const [collectionGroups, setCollectionGroups] = useState<any[]>([])
  const [ungroupedListings, setUngroupedListings] = useState<any[]>([])
  const [collectionsMap, setCollectionsMap] = useState<Map<string, any>>(new Map())
  const [recentListings, setRecentListings] = useState<any[]>([])
  const [buyingListing, setBuyingListing] = useState<string | null>(null)

  // Determine active wallet (Solana only)
  const activeWalletAddress = useMemo(() => {
    if (currentAddress && isConnected) return currentAddress
    return null
  }, [currentAddress, isConnected])

  // Fetch credits directly from the API (same endpoint the context uses)
  const fetchCredits = useCallback(async (walletAddress: string) => {
    setLoadingCredits(true)
    try {
      const response = await fetch(`/api/credits?wallet_address=${encodeURIComponent(walletAddress)}`)
      if (response.ok) {
        const data = await response.json()
        console.log('[Marketplace] Credits fetched:', data)
        // Ensure credits is a number
        const creditsValue = typeof data.credits === 'number' ? data.credits : parseFloat(data.credits) || 0
        setUserCredits(creditsValue)
      } else {
        console.error('[Marketplace] Failed to fetch credits:', response.status)
        setUserCredits(0)
      }
    } catch (error) {
      console.error('[Marketplace] Error fetching credits:', error)
      setUserCredits(0)
    } finally {
      setLoadingCredits(false)
    }
  }, [])

  // Load credits when wallet is connected
  useEffect(() => {
    if (activeWalletAddress) {
      fetchCredits(activeWalletAddress)
    } else {
      setUserCredits(0)
    }
  }, [activeWalletAddress, fetchCredits])

  useEffect(() => {
    if (activeTab === 'collections') {
      loadListings()
      if (activeWalletAddress) {
        loadMyCollections()
      }
    } else if (activeTab === 'ordinals') {
      loadOrdinalListings()
    }
  }, [activeWalletAddress, activeTab])

  const loadMyCollections = async () => {
    if (!activeWalletAddress) return

    setLoadingCollections(true)
    try {
      const response = await fetch(
        `/api/marketplace/collections-eligibility?wallet_address=${encodeURIComponent(activeWalletAddress)}`
      )
      if (response.ok) {
        const data = await response.json()
        setMyCollections(data.collections || [])
      }
    } catch (error) {
      console.error('Error loading collections eligibility:', error)
    } finally {
      setLoadingCollections(false)
    }
  }

  const loadListings = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/marketplace/listings?status=active')
      const data = await response.json()
      if (response.ok) {
        setListings(data.listings || [])
      }
    } catch (error) {
      console.error('Error loading marketplace listings:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreditPurchase = async (listing: MarketplaceListing) => {
    if (!activeWalletAddress) {
      toast.error('Wallet Required', { description: 'Please connect your wallet first' })
      return
    }

    if (userCredits < listing.price_credits) {
      toast.error('Insufficient Credits', { description: `You need ${listing.price_credits} credits but only have ${userCredits}.` })
      return
    }

    setShowPurchaseConfirm(listing)
  }

  const executeCreditPurchase = async (listing: MarketplaceListing) => {
    setShowPurchaseConfirm(null)
    
    try {
      const response = await fetch('/api/marketplace/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listing_id: listing.id,
          buyer_wallet: activeWalletAddress,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        toast.success('🎉 Collection purchased successfully! Redirecting to your collections...')
        router.push(`/collections/${data.collection_id}`)
      } else {
        toast.error('Purchase Failed', { description: `Error: ${data.error}` })
      }
    } catch (error) {
      console.error('Error purchasing collection:', error)
      toast.error('Purchase Failed', { description: 'Failed to purchase collection' })
    }
  }

  const handleSolPurchase = (listing: MarketplaceListing) => {
    // Redirect to detail page for SOL purchase flow
    router.push(`/marketplace/${listing.id}?payment=sol`)
  }

  const loadOrdinalListings = async () => {
    setLoadingOrdinals(true)
    try {
      // Fetch collections from database
      const collectionsResponse = await fetch('/api/marketplace/ordinals/collections')
      const collectionsData = await collectionsResponse.json()
      const collections = collectionsData.collections || []
      
      console.log(`📦 Loaded ${collections.length} collections from database`)
      
      // Create a map for quick lookup
      const collectionsMap = new Map<string, any>()
      collections.forEach((c: any) => {
        collectionsMap.set(c.symbol.toLowerCase(), c) // Use lowercase for case-insensitive matching
        console.log(`  - ${c.symbol}: ${c.name} (image: ${c.image ? 'yes' : 'no'})`)
      })
      setCollectionsMap(collectionsMap)

      // Fetch listings
      const response = await fetch('/api/marketplace/ordinals/listings?status=active')
      const data = await response.json()
      if (response.ok) {
        const listings = data.listings || []
        setOrdinalListings(listings)

        // Group by collection
        const grouped = new Map<string, any[]>()
        const ungrouped: any[] = []

        listings.forEach((listing: any) => {
          if (listing.collection_symbol) {
            const key = listing.collection_symbol
            if (!grouped.has(key)) {
              grouped.set(key, [])
            }
            grouped.get(key)!.push(listing)
          } else {
            ungrouped.push(listing)
          }
        })

        // Convert to array with collection info
        const groups = Array.from(grouped.entries()).map(([symbol, items]) => {
          // Calculate floor price
          const floorPrice = Math.min(...items.map(i => i.price_sats))
          
          // Get collection info from database (case-insensitive lookup)
          const collectionInfo = collectionsMap.get(symbol.toLowerCase())
          
          if (collectionInfo) {
            console.log(`✅ Found collection info for ${symbol}:`, {
              name: collectionInfo.name,
              hasImage: !!collectionInfo.image,
              supply: collectionInfo.supply
            })
          } else {
            console.log(`⚠️ No collection info found for ${symbol}`)
          }
          
          // Prioritize collection image from database, only fallback to listing image if no collection image
          const collectionImage = collectionInfo?.image || null
          const collectionName = collectionInfo?.name || symbol
          const collectionSupply = collectionInfo?.supply || null

          return {
            collection_symbol: symbol,
            collection_name: collectionName,
            collection_image: collectionImage, // Collection image from database
            collection_supply: collectionSupply,
            listings: items,
            listing_count: items.length,
            floor_price_sats: floorPrice,
            floor_price_sol: (floorPrice / 1000000000).toFixed(4),
            sample_image: collectionImage || items[0]?.image_url || null, // Use collection image first, then fallback
            total_volume_sats: items.reduce((sum, i) => sum + i.price_sats, 0),
          }
        }).sort((a, b) => b.listing_count - a.listing_count) // Sort by most listings

        setCollectionGroups(groups)
        setUngroupedListings(ungrouped)

        // Get recent listings (all listings sorted by created_at, limit to 12 most recent)
        const allListings = [...listings]
        const recent = allListings
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 12)
        setRecentListings(recent)
      }
    } catch (error) {
      console.error('Error loading ordinal listings:', error)
    } finally {
      setLoadingOrdinals(false)
    }
  }

  const handleBuyOrdinal = async (listing: any) => {
    if (!isConnected || !currentAddress || !client) {
      toast.error('Please connect your wallet')
      return
    }

    if (listing.seller_wallet === currentAddress) {
      toast.error('You cannot buy your own listing')
      return
    }

    setBuyingListing(listing.id)

    try {
      // Get purchase transaction
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
        toast.error('Failed to create purchase', { description: purchaseData.error })
        setBuyingListing(null)
        return
      }

      // Check if this is a padding UTXO creation request
      if (purchaseData.requiresPaddingUtxos) {
        toast.info('Creating padding UTXOs...', { description: purchaseData.message })
        
        if (!client) {
          toast.error('Wallet client not available')
          setBuyingListing(null)
          return
        }
        
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
        
        setBuyingListing(null)
        return
      }

      if (!purchaseData.psbt_to_sign) {
        toast.error('No PSBT returned from server')
        setBuyingListing(null)
        return
      }

      // Sign PSBT
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

      // Finalize and extract transaction
      const finalPsbt = bitcoin.Psbt.fromBase64(signedPsbtBase64)

      const requiresFinalization = finalPsbt.data.inputs.some(
        (input: any) => !input.finalScriptSig && !input.finalScriptWitness
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

      console.log('📡 Broadcasting transaction...')

      // Broadcast transaction
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

      // Confirm purchase on backend
      const confirmResponse = await fetch('/api/marketplace/ordinals/confirm-purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listing_id: listing.id,
          buyer_wallet: currentAddress,
          tx_id: finalTxId,
          tx_hex: txHex,
        })
      })

      const confirmData = await confirmResponse.json()

      if (confirmResponse.ok) {
        toast.success('🎉 Purchase successful!', { 
          description: 'The ordinal will be transferred once confirmed',
          action: {
            label: 'View TX',
            onClick: () => window.open(`https://mempool.space/tx/${finalTxId}`, '_blank')
          }
        })
        
        // Remove listing from recent listings
        setRecentListings(prev => prev.filter(l => l.id !== listing.id))
        
        // Reload listings
        loadOrdinalListings()
      } else {
        toast.warning('Transaction broadcast but confirmation failed', { description: confirmData.error })
      }

    } catch (error: any) {
      console.error('Purchase error:', error)

      if (error.message?.includes('cancel') || error.message?.includes('reject')) {
        toast.error('Purchase cancelled')
      } else {
        toast.error('Purchase failed', { description: error.message })
      }
    } finally {
      setBuyingListing(null)
    }
  }


  return (
    <div className="min-h-screen">
      {/* Hero Header */}
      <div className="relative bg-gradient-to-r from-[#0a0e27]/90 via-[#1a1f3a]/90 to-[#0f172a]/90 text-white border-b border-[#00d4ff]/30">
        <div className="container mx-auto px-6 py-8">

          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <h1 className="text-4xl md:text-5xl font-black tracking-tight text-white">Marketplace</h1>
              <p className="text-[#a5b4fc] mt-2 text-lg">
                {activeTab === 'collections'
                  ? 'Purchase complete collections with credits. Get full ownership to generate more, inscribe, or launch.'
                  : 'Buy and sell individual Bitcoin ordinals with PSBT-based trading.'}
              </p>
            </div>
            {activeWalletAddress && activeTab === 'collections' && (
              <button
                onClick={() => setShowListCollection(!showListCollection)}
                className="px-4 py-2 btn-cosmic-orange rounded-lg text-sm font-semibold text-white transition-all"
              >
                {showListCollection ? 'Hide' : 'Sell your Collection'}
              </button>
            )}
            {activeWalletAddress && activeTab === 'ordinals' && (
              <Link
                href="/marketplace/ordinals/list"
                className="px-4 py-2 btn-cosmic-orange rounded-lg text-sm font-semibold text-white transition-all inline-block"
              >
                List your Ordinals
              </Link>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mt-6 border-b border-[#00d4ff]/20">
            <button
              onClick={() => setActiveTab('ordinals')}
              className={`px-6 py-3 font-semibold transition-all ${
                activeTab === 'ordinals'
                  ? 'text-[#00d4ff] border-b-2 border-[#00d4ff]'
                  : 'text-white/60 hover:text-white/80'
              }`}
            >
              💎 Ordinals
            </button>
            <button
              onClick={() => setActiveTab('collections')}
              className={`px-6 py-3 font-semibold transition-all ${
                activeTab === 'collections'
                  ? 'text-[#00d4ff] border-b-2 border-[#00d4ff]'
                  : 'text-white/60 hover:text-white/80'
              }`}
            >
              🎨 Full Collections
            </button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-8">
        <div className="max-w-7xl mx-auto">

        {/* Ordinals Tab - NOW DEFAULT */}
        {activeTab === 'ordinals' && (
          <>
            {loadingOrdinals ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-12 h-12 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : collectionGroups.length === 0 && ungroupedListings.length === 0 ? (
              <div className="cosmic-card border border-[#00d4ff]/30 rounded-xl p-12 text-center">
                <div className="text-6xl mb-4">💎</div>
                <h2 className="text-2xl font-bold text-white mb-2">No Ordinals Listed</h2>
                <p className="text-white/80 mb-6">
                  Be the first to list your ordinals for sale!
                </p>
                {activeWalletAddress && (
                  <Link
                    href="/marketplace/ordinals/list"
                    className="inline-block px-6 py-3 bg-[#00d4ff] hover:bg-[#00b8e6] text-white rounded-lg font-semibold transition-colors shadow-lg shadow-[#00d4ff]/20"
                  >
                    List Your Ordinals
                  </Link>
                )}
              </div>
            ) : (
              <>
                {/* Collection Categories */}
                {collectionGroups.length > 0 && (
                  <>
                    <h2 className="text-2xl font-bold text-white mb-6">Browse by Collection</h2>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-6 mb-12">
                      {collectionGroups.map((group) => (
                        <Link
                          key={group.collection_symbol}
                          href={`/marketplace/ordinals/collection/${encodeURIComponent(group.collection_symbol)}`}
                          className="cosmic-card border border-[#00d4ff]/30 rounded-lg overflow-hidden hover:shadow-lg hover:shadow-[#00d4ff]/20 hover:scale-[1.03] transition-all group"
                        >
                          <div className="relative aspect-square bg-[#0a0e27] overflow-hidden">
                            {group.collection_image || group.sample_image ? (
                              <img
                                src={group.collection_image || group.sample_image}
                                alt={group.collection_name || group.collection_symbol}
                                className="w-full h-full object-cover"
                                loading="lazy"
                                onLoad={(e) => {
                                  const target = e.target as HTMLImageElement
                                  if (target.naturalWidth <= 100 || target.naturalHeight <= 100) {
                                    target.style.imageRendering = 'pixelated'
                                  }
                                }}
                                onError={(e) => {
                                  // Fallback to placeholder if image fails to load
                                  const target = e.target as HTMLImageElement
                                  target.style.display = 'none'
                                  if (target.parentElement) {
                                    target.parentElement.innerHTML = `
                                      <div class="w-full h-full flex items-center justify-center">
                                        <span class="text-4xl">💎</span>
                                      </div>
                                    `
                                  }
                                }}
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <span className="text-4xl">💎</span>
                              </div>
                            )}
                            <div className="absolute top-1 right-1">
                              <span className="px-2 py-0.5 bg-orange-500 text-white rounded text-xs font-bold">
                                {group.listing_count}
                              </span>
                            </div>
                          </div>
                          <div className="p-3">
                            <h3 className="font-bold text-sm text-white mb-0.5 truncate" title={group.collection_name || group.collection_symbol}>
                              {group.collection_name || group.collection_symbol}
                            </h3>
                            {group.collection_name && group.collection_name !== group.collection_symbol && (
                              <p className="text-white/50 text-[10px] mb-1 truncate" title={group.collection_symbol}>
                                {group.collection_symbol}
                              </p>
                            )}
                            {group.collection_supply && (
                              <p className="text-white/60 text-[10px] mb-1">
                                Supply: {group.collection_supply.toLocaleString()}
                              </p>
                            )}
                            <div className="flex items-center justify-between text-xs mt-2">
                              <div>
                                <p className="text-white/50 text-[10px]">Floor</p>
                                <p className="text-[#00d4ff] font-bold text-xs">{group.floor_price_btc} BTC</p>
                              </div>
                              <div className="text-right">
                                <p className="text-white/50 text-[10px]">Listed</p>
                                <p className="text-white font-bold">{group.listing_count}</p>
                              </div>
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </>
                )}

                {/* Recent Listings */}
                {recentListings.length > 0 && (
                  <>
                    <h2 className="text-2xl font-bold text-white mb-6">Recent Listings</h2>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-4 mb-12">
                      {recentListings.map((listing: any) => (
                        <div
                          key={listing.id}
                          className="cosmic-card border border-[#00d4ff]/30 rounded-lg overflow-hidden hover:shadow-lg hover:shadow-[#00d4ff]/20 transition-all group"
                        >
                          <Link
                            href={`/marketplace/ordinals/${listing.id}`}
                            className="block"
                          >
                            <div className="relative aspect-square bg-[#0a0e27] overflow-hidden">
                              {listing.image_url ? (
                                <img
                                  src={listing.image_url}
                                  alt={listing.title || `Ordinal #${listing.inscription_number}`}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                  onError={(e) => {
                                    const target = e.target as HTMLImageElement
                                    if (!target.src.includes('ordinals.com/preview')) {
                                      target.src = `https://ordinals.com/preview/${listing.inscription_id}`
                                    }
                                  }}
                                  onLoad={(e) => {
                                    const target = e.target as HTMLImageElement
                                    if (target.naturalWidth <= 100 || target.naturalHeight <= 100) {
                                      target.style.imageRendering = 'pixelated'
                                    }
                                  }}
                                />
                              ) : (
                                <img
                                  src={`https://ordinals.com/preview/${listing.inscription_id}`}
                                  alt={listing.title || `Ordinal #${listing.inscription_number}`}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                  onError={(e) => {
                                    const target = e.target as HTMLImageElement
                                    target.style.display = 'none'
                                    if (target.parentElement) {
                                      target.parentElement.innerHTML = '<div class="w-full h-full flex items-center justify-center"><span class="text-3xl">💎</span></div>'
                                    }
                                  }}
                                  onLoad={(e) => {
                                    const target = e.target as HTMLImageElement
                                    if (target.naturalWidth <= 100 || target.naturalHeight <= 100) {
                                      target.style.imageRendering = 'pixelated'
                                    }
                                  }}
                                />
                              )}
                              <div className="absolute top-1 right-1 z-20 pointer-events-none">
                                <span className="px-1.5 py-0.5 bg-orange-500 text-white rounded text-[10px] font-bold">
                                  {(listing.price_sats / 100000000).toFixed(4)} BTC
                                </span>
                              </div>
                              {listing.inscription_number && (
                                <div className="absolute bottom-1 left-1 z-20 pointer-events-none">
                                  <span className="px-1.5 py-0.5 bg-[#00d4ff]/90 text-white rounded text-[10px] font-bold">
                                    #{listing.inscription_number.toLocaleString()}
                                  </span>
                                </div>
                              )}
                            </div>
                          </Link>
                          <div className="p-2">
                            <Link
                              href={`/marketplace/ordinals/${listing.id}`}
                              className="block mb-2"
                            >
                              <h3 className="font-bold text-white text-xs truncate hover:text-[#00d4ff] transition-colors">
                                #{listing.inscription_number?.toLocaleString() || listing.inscription_id.substring(0, 8)}
                              </h3>
                            </Link>
                            {listing.seller_wallet === currentAddress ? (
                              <div className="w-full px-2 py-1.5 bg-white/10 text-white/50 rounded text-[10px] font-medium text-center">
                                Your Listing
                              </div>
                            ) : !isConnected ? (
                              <div className="w-full px-2 py-1.5 bg-white/10 text-white/50 rounded text-[10px] font-medium text-center">
                                Connect Wallet
                              </div>
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  handleBuyOrdinal(listing)
                                }}
                                disabled={buyingListing === listing.id}
                                className={`w-full px-2 py-1.5 rounded text-[10px] font-bold transition-all ${
                                  buyingListing === listing.id
                                    ? 'bg-orange-500/50 text-white animate-pulse'
                                    : 'bg-orange-500 hover:bg-orange-600 text-white hover:scale-[1.02]'
                                }`}
                              >
                                {buyingListing === listing.id ? 'Buying...' : `Buy ${(listing.price_sats / 100000000).toFixed(6)} BTC`}
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* Ungrouped Ordinals */}
                {ungroupedListings.length > 0 && (
                  <>
                    <h2 className="text-2xl font-bold text-white mb-6">Individual Ordinals</h2>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                      {ungroupedListings.map((listing: any) => (
                        <Link
                          key={listing.id}
                          href={`/marketplace/ordinals/${listing.id}`}
                          className="cosmic-card border border-[#00d4ff]/30 rounded-lg overflow-hidden hover:shadow-lg hover:shadow-[#00d4ff]/20 hover:scale-[1.03] transition-all group"
                        >
                          <div className="relative aspect-square bg-[#0a0e27] overflow-hidden">
                            {listing.image_url ? (
                              <img
                                src={listing.image_url}
                                alt={listing.title || `Ordinal #${listing.inscription_number}`}
                                className="w-full h-full object-cover"
                                loading="lazy"
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement
                                  if (!target.src.includes('ordinals.com/preview')) {
                                    target.src = `https://ordinals.com/preview/${listing.inscription_id}`
                                  }
                                }}
                                onLoad={(e) => {
                                  const target = e.target as HTMLImageElement
                                  if (target.naturalWidth <= 100 || target.naturalHeight <= 100) {
                                    target.style.imageRendering = 'pixelated'
                                  }
                                }}
                              />
                            ) : (
                              <img
                                src={`https://ordinals.com/preview/${listing.inscription_id}`}
                                alt={listing.title || `Ordinal #${listing.inscription_number}`}
                                className="w-full h-full object-cover"
                                loading="lazy"
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement
                                  target.style.display = 'none'
                                  if (target.parentElement) {
                                    target.parentElement.innerHTML = '<div class="w-full h-full flex items-center justify-center"><span class="text-3xl">💎</span></div>'
                                  }
                                }}
                                onLoad={(e) => {
                                  const target = e.target as HTMLImageElement
                                  if (target.naturalWidth <= 100 || target.naturalHeight <= 100) {
                                    target.style.imageRendering = 'pixelated'
                                  }
                                }}
                              />
                            )}
                            {/* Click overlay */}
                            <div className="absolute inset-0 z-10" />
                            <div className="absolute top-1 right-1 z-20 pointer-events-none">
                              <span className="px-1.5 py-0.5 bg-orange-500 text-white rounded text-[10px] font-bold">
                                {(listing.price_sats / 100000000).toFixed(4)} BTC
                              </span>
                            </div>
                            {listing.inscription_number && (
                              <div className="absolute bottom-1 left-1 z-20 pointer-events-none">
                                <span className="px-1.5 py-0.5 bg-[#00d4ff]/90 text-white rounded text-[10px] font-bold">
                                  #{listing.inscription_number.toLocaleString()}
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="p-2">
                            <h3 className="font-bold text-white text-xs truncate">
                              #{listing.inscription_number?.toLocaleString() || listing.inscription_id.substring(0, 8)}
                            </h3>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </>
        )}

        {/* Collections Tab - NOW SECONDARY */}
        {activeTab === 'collections' && (
          <>
        {/* List Your Collection Section */}
        {activeWalletAddress && showListCollection && (
          <div className="mb-8 cosmic-card border border-[#00d4ff]/30 rounded-xl p-6">
            <h2 className="text-2xl font-bold text-white mb-4">Your Collections</h2>
            {loadingCollections ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : myCollections.length === 0 ? (
              <div className="text-center py-8 text-white/70">
                <p>No collections found. Create a collection first!</p>
                <Link
                  href="/collections"
                  className="mt-4 inline-block px-4 py-2 bg-[#00d4ff] hover:bg-[#00b8e6] text-white rounded-lg text-sm font-semibold shadow-lg shadow-[#00d4ff]/20"
                >
                  Go to Collections
                </Link>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Eligible Collections */}
                {myCollections.filter(c => c.is_eligible).length > 0 && (
                  <div>
                    <h3 className="text-lg font-bold text-[#00d4ff] mb-3 flex items-center gap-2">
                      <span className="text-2xl">✓</span>
                      Ready to List ({myCollections.filter(c => c.is_eligible).length})
                    </h3>
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {myCollections.filter(c => c.is_eligible).map((collection) => (
                  <div
                    key={collection.id}
                    className={`border-2 rounded-xl overflow-hidden transition-all ${
                      collection.is_eligible
                        ? 'border-[#00d4ff]/50 cosmic-card hover:shadow-xl hover:scale-[1.02]'
                        : 'border-[#00d4ff]/30 cosmic-card opacity-75'
                    }`}
                  >
                    {/* Sample Image */}
                    {collection.sample_image && (
                      <div className="h-32 bg-[#0a0e27] overflow-hidden">
                        <img
                          src={collection.sample_image}
                          alt={collection.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}

                    <div className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <h3 className="font-bold text-lg text-white flex-1 pr-2">{collection.name}</h3>
                        {collection.is_eligible ? (
                          <span className="px-2.5 py-1 bg-green-600 text-white text-xs font-bold rounded-full whitespace-nowrap flex-shrink-0">
                            ✓ Ready
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 bg-red-500 text-white text-xs font-bold rounded-full whitespace-nowrap flex-shrink-0">
                            ✗ Not Eligible
                          </span>
                        )}
                      </div>

                      <div className="space-y-2 mb-4">
                        <div className="text-sm text-gray-600">
                          <span className="font-medium">{collection.ordinal_count}</span> ordinals
                        </div>

                        {collection.is_eligible ? (
                          <div className="px-3 py-2 bg-green-100 border border-green-300 rounded-lg">
                            <div className="text-xs text-green-800 font-semibold">
                              ✓ Ready to list on marketplace
                            </div>
                          </div>
                        ) : (
                          <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg space-y-1">
                            {collection.reasons.map((reason, idx) => (
                              <div key={idx} className="text-xs text-red-700 flex items-start gap-1.5">
                                <span className="text-red-500 mt-0.5">•</span>
                                <span className="flex-1">{reason}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {collection.is_eligible ? (
                        <button
                          onClick={() => router.push(`/collections/${collection.id}/finalize-marketplace`)}
                          className="w-full px-4 py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-lg font-semibold transition-all shadow-md hover:shadow-lg"
                        >
                          List on Marketplace →
                        </button>
                      ) : (
                        <div className="text-xs text-gray-500 text-center py-2 bg-gray-100 rounded-lg">
                          Fix issues above to list
                        </div>
                      )}
                    </div>
                  </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Not Eligible Collections */}
                {myCollections.filter(c => !c.is_eligible).length > 0 && (
                  <div>
                    <h3 className="text-lg font-bold text-[#ff4757] mb-3 flex items-center gap-2">
                      <span className="text-2xl">✗</span>
                      Not Eligible ({myCollections.filter(c => !c.is_eligible).length})
                    </h3>
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {myCollections.filter(c => !c.is_eligible).map((collection) => (
                        <div
                          key={collection.id}
                          className="border-2 rounded-xl overflow-hidden transition-all border-[#00d4ff]/30 cosmic-card opacity-75"
                        >
                          {/* Sample Image */}
                          {collection.sample_image && (
                            <div className="h-32 bg-[#0a0e27] overflow-hidden">
                              <img
                                src={collection.sample_image}
                                alt={collection.name}
                                className="w-full h-full object-cover"
                              />
                            </div>
                          )}

                          <div className="p-4">
                            <div className="flex items-start justify-between mb-3">
                              <h3 className="font-bold text-lg text-white flex-1 pr-2">{collection.name}</h3>
                              <span className="px-2.5 py-1 bg-[#ff4757] text-white text-xs font-bold rounded-full whitespace-nowrap flex-shrink-0">
                                ✗ Not Eligible
                              </span>
                            </div>

                            <div className="space-y-2 mb-4">
                              <div className="text-sm text-white/70">
                                <span className="font-medium">{collection.ordinal_count}</span> ordinals
                              </div>

                              <div className="px-3 py-2 cosmic-card border border-[#ff4757]/30 rounded-lg space-y-1">
                                {collection.reasons.map((reason, idx) => (
                                  <div key={idx} className="text-xs text-[#ff4757] flex items-start gap-1.5">
                                    <span className="text-[#ff4757] mt-0.5">•</span>
                                    <span className="flex-1">{reason}</span>
                                  </div>
                                ))}
                              </div>
                            </div>

                            <div className="text-xs text-white/60 text-center py-2 cosmic-card border border-[#00d4ff]/20 rounded-lg">
                              Fix issues above to list
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="w-12 h-12 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Empty State */}
        {!loading && listings.length === 0 && (
          <div className="cosmic-card border border-[#00d4ff]/30 rounded-xl p-12 text-center">
            <div className="text-6xl mb-4">🏪</div>
            <h2 className="text-2xl font-bold text-white mb-2">No Listings Available</h2>
            <p className="text-white/80 mb-6">
              Be the first to list a collection on the marketplace!
            </p>
            <Link
              href="/collections"
              className="inline-block px-6 py-3 bg-[#00d4ff] hover:bg-[#00b8e6] text-white rounded-lg font-semibold transition-colors shadow-lg shadow-[#00d4ff]/20"
            >
              View Your Collections
            </Link>
          </div>
        )}

        {/* Listings Grid */}
        {!loading && listings.length > 0 && (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {listings.map((listing) => (
              <div
                key={listing.id}
                className="cosmic-card border border-[#00d4ff]/30 rounded-xl overflow-hidden hover:shadow-lg transition-all"
              >
                {/* Image Preview */}
                <div className="relative h-48 bg-[#0a0e27]">
                  {listing.sample_image ? (
                    <img
                      src={listing.sample_image}
                      alt={listing.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-4xl">🎨</span>
                    </div>
                  )}
                  <div className="absolute top-2 right-2 flex flex-col gap-1">
                    {(listing.payment_type === 'credits' || listing.payment_type === 'both') && (
                      <span className="px-3 py-1 bg-green-600 text-white rounded-full text-sm font-bold">
                        {listing.price_credits} Credits
                      </span>
                    )}
                    {(listing.payment_type === 'btc' || listing.payment_type === 'both') && listing.price_btc && (
                      <span className="px-3 py-1 bg-orange-500 text-white rounded-full text-sm font-bold">
                        {parseFloat(listing.price_btc).toFixed(6)} BTC
                      </span>
                    )}
                  </div>
                </div>

                {/* Content */}
                <div className="p-6">
                  <h3 className="font-bold text-lg text-white mb-2">
                    {listing.title}
                  </h3>

                  <div className="flex items-center gap-2 text-sm text-white/70 mb-3">
                    <span className="px-2 py-1 bg-[#00d4ff]/20 text-[#00d4ff] border border-[#00d4ff]/30 rounded">
                      {listing.ordinal_count} images
                    </span>
                  </div>

                  {listing.description && (
                    <p className="text-sm text-white/80 mb-4 line-clamp-3">
                      {listing.description}
                    </p>
                  )}

                  {listing.included_promo_urls && listing.included_promo_urls.length > 0 && (
                    <div className="mb-4">
                      <p className="text-xs text-white/60 mb-2">
                        ✨ Includes {listing.included_promo_urls.length} promotional {listing.included_promo_urls.length === 1 ? 'image' : 'images'}
                      </p>
                      <div className="flex gap-2 overflow-x-auto">
                        {listing.included_promo_urls.slice(0, 3).map((url, idx) => (
                          <img
                            key={idx}
                            src={url}
                            alt={`Promo ${idx + 1}`}
                            className="w-16 h-16 object-cover rounded border border-[#00d4ff]/30"
                          />
                        ))}
                        {listing.included_promo_urls.length > 3 && (
                          <div className="w-16 h-16 cosmic-card border border-[#00d4ff]/30 rounded flex items-center justify-center text-xs text-white/60 font-medium">
                            +{listing.included_promo_urls.length - 3}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="text-xs text-white/60 mb-4">
                    Listed {new Date(listing.created_at).toLocaleDateString()}
                  </div>

                  {/* Pending Payment Badge */}
                  {listing.has_pending_payment && (
                    <div className="mb-3 px-3 py-2 cosmic-card border border-[#ff6b35]/30 rounded-lg">
                      <p className="text-xs text-[#ff6b35] font-medium">
                        ⏳ Pending BTC Payment
                        {listing.pending_buyer_wallet === activeWalletAddress && ' (You)'}
                      </p>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="space-y-2">
                    <Link
                      href={`/marketplace/${listing.id}`}
                      className="block w-full px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-semibold text-center transition-colors"
                    >
                      View Details
                    </Link>
                    
                    {listing.seller_wallet === activeWalletAddress ? (
                      <Link
                        href={`/collections/${listing.collection_id}/list-marketplace`}
                        className="block w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold text-center transition-colors"
                      >
                        Sell Settings
                      </Link>
                    ) : !activeWalletAddress ? (
                      <div className="px-4 py-2 bg-gray-100 text-gray-500 rounded-lg text-sm font-semibold text-center">
                        Connect Wallet to Purchase
                      </div>
                    ) : listing.has_pending_payment && listing.pending_buyer_wallet !== activeWalletAddress ? (
                      <div className="px-4 py-2 bg-yellow-100 text-yellow-700 rounded-lg text-xs font-semibold text-center">
                        Pending Payment
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        {/* Credits Purchase Button */}
                        {(listing.payment_type === 'credits' || listing.payment_type === 'both') && (
                          <button
                            onClick={() => handleCreditPurchase(listing)}
                            disabled={userCredits < listing.price_credits || (listing.has_pending_payment && listing.pending_buyer_wallet !== activeWalletAddress)}
                            className="flex-1 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title={userCredits < listing.price_credits ? `Need ${listing.price_credits} credits` : ''}
                          >
                            💳 Credits
                          </button>
                        )}
                        
                        {/* BTC Purchase Button */}
                        {(listing.payment_type === 'btc' || listing.payment_type === 'both') && listing.price_btc && (
                          <button
                            onClick={() => handleBtcPurchase(listing)}
                            disabled={listing.has_pending_payment && listing.pending_buyer_wallet !== activeWalletAddress}
                            className="flex-1 px-3 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            ₿ Bitcoin
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
          </>
        )}
        </div>
      </div>

      {/* Purchase Confirmation Dialog */}
      {showPurchaseConfirm && (
        <ConfirmDialog
          isOpen={!!showPurchaseConfirm}
          onClose={() => setShowPurchaseConfirm(null)}
          onConfirm={() => executeCreditPurchase(showPurchaseConfirm)}
          title="Confirm Purchase"
          message={`Purchase "${showPurchaseConfirm.title}" for ${showPurchaseConfirm.price_credits} credits?\n\nThis will transfer full ownership of the collection to you.`}
          confirmText="Purchase"
          cancelText="Cancel"
          confirmButtonClass="bg-green-600 hover:bg-green-700"
        />
      )}
    </div>
  )
}
