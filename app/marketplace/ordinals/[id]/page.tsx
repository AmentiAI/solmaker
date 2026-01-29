'use client'

import React, { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useWallet } from '@/lib/wallet/compatibility'
import { toast } from 'sonner'
import * as bitcoin from 'bitcoinjs-lib'

interface OrdinalListing {
  id: string
  inscription_id: string
  inscription_number?: number
  collection_symbol?: string
  utxo_txid: string
  utxo_vout: number
  utxo_value: number
  seller_wallet: string
  price_sats: number
  price_btc: string
  title?: string
  description?: string
  image_url?: string
  content_type?: string
  status: string
  created_at: string
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
function OrdinalContentDisplay({ listing }: { listing: OrdinalListing }) {
  const displayType = getDisplayType(listing.content_type)
  const contentUrl = listing.image_url
  
  // For images - display directly
  if (displayType === 'image' || (!listing.content_type && contentUrl)) {
    return (
      <img 
        src={contentUrl || `https://ordinals.com/preview/${listing.inscription_id}`} 
        alt="Ordinal" 
        className="w-full h-full object-contain" 
        onError={(e) => {
          const target = e.target as HTMLImageElement
          if (!target.src.includes('ordinals.com/preview')) {
            target.src = `https://ordinals.com/preview/${listing.inscription_id}`
          } else if (!target.src.includes('ordinals.com/content')) {
            target.src = `https://ordinals.com/content/${listing.inscription_id}`
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
        className="w-full h-full object-contain"
        controls
        autoPlay
        loop
        muted
        playsInline
      />
    )
  }
  
  // For audio content
  if (displayType === 'audio') {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#1a1f3a] to-[#0a0e27] p-4">
        <span className="text-6xl mb-4">🎵</span>
        <audio
          src={`https://ordinals.com/content/${listing.inscription_id}`}
          controls
          className="w-full max-w-md"
        />
      </div>
    )
  }
  
  // For text/json content
  if (displayType === 'text') {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#1a1f3a] to-[#0a0e27] p-4">
        <span className="text-6xl mb-2">📜</span>
        <span className="text-white/60 text-sm uppercase tracking-wider">Text Content</span>
      </div>
    )
  }
  
  // Unknown/fallback
  return (
    <img 
      src={`https://ordinals.com/preview/${listing.inscription_id}`} 
      alt="Ordinal" 
      className="w-full h-full object-contain"
      onError={(e) => {
        const target = e.target as HTMLImageElement
        if (target.src.includes('/preview/')) {
          target.src = `https://ordinals.com/content/${listing.inscription_id}`
        } else {
          target.style.display = 'none'
          if (target.parentElement) {
            target.parentElement.innerHTML = '<div class="w-full h-full flex items-center justify-center"><span class="text-8xl">💎</span></div>'
          }
        }
      }}
    />
  )
}

export default function OrdinalDetailPage() {
  const router = useRouter()
  const params = useParams()
  const listingId = params.id as string
  const { isConnected, currentAddress, paymentAddress, publicKey, paymentPublicKey, client } = useWallet()

  const [listing, setListing] = useState<OrdinalListing | null>(null)
  const [loading, setLoading] = useState(true)
  const [purchasing, setPurchasing] = useState(false)
  const [step, setStep] = useState<'view' | 'confirm' | 'sign' | 'complete'>('view')
  const [psbtToSign, setPsbtToSign] = useState<string | null>(null)
  const [costs, setCosts] = useState<any>(null)
  const [txId, setTxId] = useState<string | null>(null)

  useEffect(() => {
    fetchListing()
  }, [listingId])

  const fetchListing = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/marketplace/ordinals/listings?status=active`)
      const data = await response.json()

      if (response.ok) {
        const found = data.listings.find((l: any) => l.id === listingId)
        if (found) {
          setListing(found)
        } else {
          toast.error('Listing not found')
          router.push('/marketplace')
        }
      } else {
        toast.error('Failed to fetch listing')
      }
    } catch (error) {
      console.error('Error fetching listing:', error)
      toast.error('Error loading listing')
    } finally {
      setLoading(false)
    }
  }

  const handlePurchaseClick = async () => {
    if (!isConnected) {
      toast.error('Please connect your wallet')
      return
    }

    if (listing?.seller_wallet === currentAddress) {
      toast.error('You cannot buy your own listing')
      return
    }

    if (!listing || !currentAddress || !client) {
      toast.error('Missing required information')
      return
    }

    // Skip confirm step - go directly to purchase (1-click sign)
    setPurchasing(true)
    setStep('sign')
    await handleConfirmPurchase()
  }

  const handleConfirmPurchase = async () => {
    if (!listing || !currentAddress || !client) {
      setPurchasing(false)
      setStep('view')
      return
    }

    setPurchasing(true)
    try {
      // Step 1: Get purchase PSBT
      // Use paymentAddress for fetching UTXOs (native segwit for payments)
      // Use currentAddress (taproot) for receiving the ordinal
      const purchaseResponse = await fetch('/api/marketplace/ordinals/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listing_id: listing.id,
          buyer_wallet: currentAddress, // Taproot address to receive ordinal
          buyer_payment_address: paymentAddress || currentAddress, // Payment address for UTXOs
          buyer_pubkey: publicKey,
          payment_pubkey: paymentPublicKey,
        })
      })

      const purchaseData = await purchaseResponse.json()

      if (!purchaseResponse.ok) {
        toast.error('Failed to create purchase', { description: purchaseData.error })
        setPurchasing(false)
        setStep('view')
        return
      }

      // Check if this is a padding UTXO creation request
      if (purchaseData.requiresPaddingUtxos) {
        toast.info('Creating padding UTXOs...', { description: purchaseData.message })
        
        if (!client) {
          toast.error('Wallet client not available')
          setPurchasing(false)
          setStep('view')
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
        
        // Reset purchasing state - user needs to manually retry after UTXOs are available
        setPurchasing(false)
        setStep('confirm')
        return
      }

      if (!purchaseData.psbt_to_sign) {
        toast.error('No PSBT returned from server')
        setPurchasing(false)
        setStep('view')
        return
      }

      setPsbtToSign(purchaseData.psbt_to_sign)
      setCosts(purchaseData.costs)
      setStep('sign')

      // Step 2: Sign PSBT
      console.log('🔐 Signing purchase PSBT...')

      if (!client) {
        toast.error('Wallet client not available')
        setPurchasing(false)
        setStep('view')
        return
      }

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
      const finalPsbt = bitcoin.Psbt.fromBase64(signedPsbtBase64)

      // Check if needs finalization
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

      // Use txId from wallet if available
      if (signedResult.txId || signedResult.txid) {
        finalTxId = signedResult.txId || signedResult.txid
      }

      console.log('📡 Broadcasting transaction...')

      // Step 4: Broadcast transaction
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
      setTxId(finalTxId)

      // Step 5: Confirm purchase on backend
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
        setStep('complete')
        toast.success('🎉 Purchase successful!', { description: 'The ordinal will be transferred once confirmed' })
      } else {
        toast.warning('Transaction broadcast but confirmation failed', { description: confirmData.error })
        setStep('complete')
      }

    } catch (error: any) {
      console.error('Purchase error:', error)

      if (error.message?.includes('cancel') || error.message?.includes('reject')) {
        toast.error('Purchase cancelled')
        setStep('view')
      } else {
        toast.error('Purchase failed', { description: error.message })
      }
    } finally {
      setPurchasing(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!listing) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="cosmic-card border border-[#00d4ff]/30 rounded-xl p-12 text-center">
          <h2 className="text-2xl font-bold text-white mb-4">Listing Not Found</h2>
          <button
            onClick={() => router.push('/marketplace')}
            className="px-6 py-3 bg-[#00d4ff] hover:bg-[#00b8e6] text-white rounded-lg font-semibold"
          >
            Back to Marketplace
          </button>
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
            onClick={() => router.push('/marketplace')}
            className="text-[#00d4ff] hover:text-[#00b8e6] mb-4 flex items-center gap-2"
          >
            ← Back to Marketplace
          </button>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight text-white">
            {listing.title || `Ordinal #${listing.inscription_number || listing.inscription_id.substring(0, 8)}`}
          </h1>
        </div>
      </div>

      <div className="container mx-auto px-6 py-8">
        <div className="max-w-6xl mx-auto">

          {step === 'view' && (
            <div className="grid md:grid-cols-2 gap-8">
              {/* Image */}
              <div className="cosmic-card border border-[#00d4ff]/30 rounded-xl overflow-hidden">
                <div className="aspect-square bg-[#0a0e27] flex items-center justify-center">
                  <OrdinalContentDisplay listing={listing} />
                </div>
              </div>

              {/* Details */}
              <div>
                <div className="cosmic-card border border-[#00d4ff]/30 rounded-xl p-6 mb-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-white">Price</h3>
                    <div className="text-right">
                      <p className="text-3xl font-black text-[#00d4ff]">
                        {(listing.price_sats / 100000000).toFixed(6)} BTC
                      </p>
                      <p className="text-sm text-white/60">{listing.price_sats.toLocaleString()} sats</p>
                    </div>
                  </div>

                  {listing.description && (
                    <div className="mb-4">
                      <h4 className="text-sm font-medium text-white mb-2">Description</h4>
                      <p className="text-white/80">{listing.description}</p>
                    </div>
                  )}

                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-white/60">Inscription ID:</span>
                      <span className="text-white font-mono text-xs">{listing.inscription_id.substring(0, 16)}...</span>
                    </div>
                    {listing.inscription_number && (
                      <div className="flex justify-between">
                        <span className="text-white/60">Inscription #:</span>
                        <span className="text-white font-bold">#{listing.inscription_number.toLocaleString()}</span>
                      </div>
                    )}
                    {listing.collection_symbol && (
                      <div className="flex justify-between">
                        <span className="text-white/60">Collection:</span>
                        <span className="text-white font-medium">{listing.collection_symbol}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-white/60">Listed:</span>
                      <span className="text-white">{new Date(listing.created_at).toLocaleDateString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/60">Seller:</span>
                      <span className="text-white font-mono text-xs">
                        {listing.seller_wallet.substring(0, 8)}...{listing.seller_wallet.substring(listing.seller_wallet.length - 6)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Action Button */}
                {listing.seller_wallet === currentAddress ? (
                  <div className="cosmic-card border border-yellow-500/30 rounded-xl p-4 text-center">
                    <p className="text-yellow-400 font-medium">This is your listing</p>
                  </div>
                ) : !isConnected ? (
                  <div className="cosmic-card border border-[#00d4ff]/30 rounded-xl p-4 text-center">
                    <p className="text-white/60 mb-3">Connect your wallet to purchase</p>
                  </div>
                ) : (
                  <button
                    onClick={handlePurchaseClick}
                    className="w-full px-6 py-4 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold text-lg transition-colors"
                  >
                    Buy for {(listing.price_sats / 100000000).toFixed(6)} BTC
                  </button>
                )}
              </div>
            </div>
          )}

          {step === 'confirm' && (
            <div className="cosmic-card border border-[#00d4ff]/30 rounded-xl p-8 max-w-2xl mx-auto">
              <h2 className="text-2xl font-bold text-white mb-6">Confirm Purchase</h2>

              <div className="cosmic-card border border-[#ff6b35]/30 rounded-xl p-6 mb-6">
                <p className="text-white/90 mb-4">
                  <strong>You are about to purchase:</strong>
                </p>
                <ul className="text-sm text-white/80 space-y-2">
                  <li>• Inscription ID: {listing.inscription_id.substring(0, 20)}...</li>
                  {listing.inscription_number && <li>• Inscription #{listing.inscription_number.toLocaleString()}</li>}
                  <li>• Price: {(listing.price_sats / 100000000).toFixed(6)} BTC ({listing.price_sats.toLocaleString()} sats)</li>
                  <li>• Platform Fee (2%): {Math.max(330, Math.floor(listing.price_sats * 0.02)).toLocaleString()} sats</li>
                </ul>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => setStep('view')}
                  disabled={purchasing}
                  className="flex-1 px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmPurchase}
                  disabled={purchasing}
                  className="flex-1 px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-semibold transition-colors disabled:opacity-50"
                >
                  {purchasing ? 'Processing...' : 'Confirm Purchase'}
                </button>
              </div>
            </div>
          )}

          {step === 'sign' && (
            <div className="cosmic-card border border-[#00d4ff]/30 rounded-xl p-8 max-w-2xl mx-auto">
              <div className="flex items-center justify-center mb-6">
                <div className="w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
              </div>
              <h2 className="text-2xl font-bold text-white text-center mb-4">Signing Transaction...</h2>
              <p className="text-white/70 text-center">
                Please sign the transaction in your wallet
              </p>
            </div>
          )}

          {step === 'complete' && txId && (
            <div className="cosmic-card border border-green-500/30 rounded-xl p-8 max-w-2xl mx-auto">
              <div className="text-center mb-6">
                <div className="text-6xl mb-4">✅</div>
                <h2 className="text-2xl font-bold text-white mb-2">Purchase Successful!</h2>
                <p className="text-white/80">
                  Your transaction has been broadcast to the Bitcoin network
                </p>
              </div>

              <div className="cosmic-card border border-[#00d4ff]/30 rounded-xl p-4 mb-6">
                <p className="text-sm text-white/60 mb-2">Transaction ID:</p>
                <p className="text-white font-mono text-sm break-all">{txId}</p>
              </div>

              <a
                href={`https://mempool.space/tx/${txId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white text-center rounded-lg font-semibold transition-colors mb-3"
              >
                View on Mempool.space →
              </a>

              <button
                onClick={() => router.push('/marketplace')}
                className="w-full px-6 py-3 bg-[#00d4ff] hover:bg-[#00b8e6] text-white rounded-lg font-semibold transition-colors"
              >
                Back to Marketplace
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
