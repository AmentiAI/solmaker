'use client'

import React, { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSolanaWallet } from '@/lib/wallet/solana-wallet-context'
import { toast } from 'sonner'
import { Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js'
import Link from 'next/link'

interface NftListing {
  id: string
  mint_address: string
  seller_wallet: string
  price_lamports: number
  price_sol: number
  title: string
  description?: string
  image_url: string
  metadata?: any
  status: string
  created_at: string
}

export default function NftDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { isConnected, publicKey, signTransaction } = useSolanaWallet()

  const listingId = params.mintAddress as string // Still using mintAddress param name for backwards compat

  const [listing, setListing] = useState<NftListing | null>(null)
  const [loading, setLoading] = useState(true)
  const [purchasing, setPurchasing] = useState(false)
  const [canceling, setCanceling] = useState(false)

  useEffect(() => {
    loadListing()
  }, [listingId])

  const loadListing = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/marketplace/solana/listings?status=active`)
      const data = await response.json()

      if (response.ok) {
        // First try to find by ID (new way), then fall back to mint_address (old way for backwards compat)
        const found = data.listings.find((l: any) => l.id === listingId || l.mint_address === listingId)
        if (found) {
          setListing(found)
        } else {
          toast.error('Listing not found')
          router.push('/marketplace')
        }
      }
    } catch (error) {
      console.error('Error loading listing:', error)
      toast.error('Failed to load listing')
    } finally {
      setLoading(false)
    }
  }

  const handlePurchase = async () => {
    if (!listing || !publicKey || !signTransaction) {
      toast.error('Please connect your wallet')
      return
    }

    if (listing.seller_wallet.toLowerCase() === publicKey.toBase58().toLowerCase()) {
      toast.error('You cannot purchase your own listing')
      return
    }

    setPurchasing(true)

    try {
      // Step 1: Build purchase transaction
      const response = await fetch('/api/marketplace/solana/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listingId: listing.id,
          buyerWallet: publicKey.toBase58(),
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to build purchase transaction')
      }

      // Step 2: Sign payment transaction
      const transactionBuffer = Buffer.from(data.transaction, 'base64')
      const transaction = Transaction.from(transactionBuffer)

      // Calculate total cost including token account if needed
      const tokenAccountCost = data.needsTokenAccount ? data.tokenAccountRent / LAMPORTS_PER_SOL : 0
      const totalCost = parseFloat(listing.price_sol) + tokenAccountCost
      
      const costMessage = data.needsTokenAccount 
        ? `${listing.price_sol} SOL + ${tokenAccountCost.toFixed(4)} SOL (token account creation)`
        : `${listing.price_sol} SOL`
      
      toast.info(`Please sign to purchase for ${costMessage}`)
      const signedTx = await signTransaction(transaction)

      // Step 3: Broadcast payment
      const { getConnection } = await import('@/lib/solana/connection')
      const connection = getConnection()

      const paymentSignature = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      })

      toast.info('Payment sent, confirming purchase...')

      await connection.confirmTransaction(paymentSignature, 'confirmed')

      // Step 4: Confirm purchase and get NFT
      const confirmResponse = await fetch('/api/marketplace/solana/confirm-purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listingId: listing.id,
          buyerWallet: publicKey.toBase58(),
          paymentTxSignature: paymentSignature,
        }),
      })

      const confirmData = await confirmResponse.json()

      if (!confirmResponse.ok) {
        throw new Error(confirmData.error || 'Failed to confirm purchase')
      }

      toast.success('NFT purchased successfully!')

      // Show explorer link
      if (confirmData.explorerUrl) {
        toast.success(
          <div>
            <p>Transaction confirmed!</p>
            <a
              href={confirmData.explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#14F195] underline"
            >
              View on Explorer
            </a>
          </div>,
          { duration: 10000 }
        )
      }

      // Redirect after delay
      setTimeout(() => router.push('/marketplace'), 2000)
    } catch (error: any) {
      console.error('Error purchasing NFT:', error)
      toast.error(error.message || 'Failed to purchase NFT')
    } finally {
      setPurchasing(false)
    }
  }

  const handleCancel = async () => {
    if (!listing || !publicKey) {
      toast.error('Please connect your wallet')
      return
    }

    if (listing.seller_wallet.toLowerCase() !== publicKey.toBase58().toLowerCase()) {
      toast.error('You are not the seller of this listing')
      return
    }

    setCanceling(true)

    try {
      const response = await fetch('/api/marketplace/solana/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listingId: listing.id,
          sellerWallet: publicKey.toBase58(),
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to cancel listing')
      }

      toast.success('Listing cancelled successfully!')

      if (data.explorerUrl) {
        toast.success(
          <div>
            <p>NFT returned to your wallet</p>
            <a
              href={data.explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#14F195] underline"
            >
              View on Explorer
            </a>
          </div>,
          { duration: 10000 }
        )
      }

      setTimeout(() => router.push('/marketplace'), 2000)
    } catch (error: any) {
      console.error('Error canceling listing:', error)
      toast.error(error.message || 'Failed to cancel listing')
    } finally {
      setCanceling(false)
    }
  }

  const isOwner = listing && publicKey && listing.seller_wallet.toLowerCase() === publicKey.toBase58().toLowerCase()
  const platformFee = listing ? listing.price_lamports * 0.02 / LAMPORTS_PER_SOL : 0

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-[#9945FF] border-t-transparent rounded-full animate-spin cyber-glow" />
      </div>
    )
  }

  if (!listing) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-3xl font-black text-white mb-4">Listing Not Found</h2>
          <Link href="/marketplace" className="text-[#9945FF] hover:text-[#A855F7]">
            Back to Marketplace
          </Link>
        </div>
      </div>
    )
  }

  const attributes = listing.metadata?.attributes || []

  return (
    <div className="min-h-screen py-12">
      <div className="max-w-7xl mx-auto px-4">
        {/* Back Button */}
        <Link
          href="/marketplace"
          className="inline-flex items-center gap-2 text-[#B4B4C8] hover:text-white mb-8 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Marketplace
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Left: NFT Image */}
          <div>
            <div className="glass-card border-2 border-[#9945FF]/30 rounded-3xl overflow-hidden aspect-square">
              {listing.image_url ? (
                <img
                  src={listing.image_url}
                  alt={listing.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#9945FF]/20 to-[#14F195]/20">
                  <span className="text-9xl">💎</span>
                </div>
              )}
            </div>

            {/* Attributes */}
            {attributes.length > 0 && (
              <div className="mt-6 glass-card border-2 border-[#14F195]/30 rounded-2xl p-6">
                <h3 className="text-xl font-black text-white mb-4">Attributes</h3>
                <div className="grid grid-cols-2 gap-3">
                  {attributes.map((attr: any, index: number) => (
                    <div key={index} className="glass-card border border-[#9945FF]/20 rounded-xl p-3">
                      <p className="text-xs text-[#B4B4C8] uppercase mb-1">{attr.trait_type}</p>
                      <p className="text-sm font-bold text-white">{attr.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: NFT Details */}
          <div className="space-y-8">
            {/* Title & Collection */}
            <div>
              {listing.metadata?.collection && (
                <p className="text-sm text-[#9945FF] font-bold mb-2">
                  {listing.metadata.collection.name || listing.metadata.collection.key}
                </p>
              )}
              <h1 className="text-5xl font-black text-white mb-4">{listing.title}</h1>
              {listing.description && (
                <p className="text-lg text-[#B4B4C8]">{listing.description}</p>
              )}
            </div>

            {/* Price Card */}
            <div className="glass-card border-2 border-[#14F195]/40 rounded-3xl p-8">
              <p className="text-sm text-[#B4B4C8] mb-2">Current Price</p>
              <div className="flex items-baseline gap-3 mb-6">
                <span className="text-6xl font-black text-[#14F195] drop-shadow-[0_0_20px_rgba(20,241,149,0.6)]">
                  {parseFloat(listing.price_sol).toFixed(2)}
                </span>
                <span className="text-2xl font-bold text-[#B4B4C8]">SOL</span>
              </div>

              {/* Seller Info */}
              <div className="mb-6 pb-6 border-b border-[#9945FF]/20">
                <p className="text-sm text-[#B4B4C8] mb-2">Seller</p>
                <div className="flex items-center gap-2">
                  <code className="text-sm font-mono text-white bg-[#27272A] px-3 py-1 rounded">
                    {listing.seller_wallet.slice(0, 4)}...{listing.seller_wallet.slice(-4)}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(listing.seller_wallet)
                      toast.success('Address copied!')
                    }}
                    className="text-[#9945FF] hover:text-[#A855F7]"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Fee Breakdown */}
              {!isOwner && (
                <div className="mb-6 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-[#B4B4C8]">Price</span>
                    <span className="text-white font-bold">{parseFloat(listing.price_sol).toFixed(4)} SOL</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#B4B4C8]">Platform Fee (2%)</span>
                    <span className="text-white font-bold">{platformFee.toFixed(4)} SOL</span>
                  </div>
                  <div className="border-t border-[#9945FF]/20 pt-2 flex justify-between">
                    <span className="text-white font-bold">Total</span>
                    <span className="text-[#14F195] font-black text-lg">
                      {parseFloat(listing.price_sol).toFixed(4)} SOL
                    </span>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              {!isConnected ? (
                <div className="glass-card border border-[#9945FF]/20 rounded-xl p-4 text-center">
                  <p className="text-[#B4B4C8]">Connect your wallet to purchase this NFT</p>
                </div>
              ) : isOwner ? (
                <button
                  onClick={handleCancel}
                  disabled={canceling}
                  className="w-full px-8 py-4 bg-gradient-to-r from-[#DC1FFF] to-[#9945FF] hover:from-[#E935FF] hover:to-[#A855F7] text-white font-black rounded-xl transition-all disabled:opacity-50"
                >
                  {canceling ? 'Canceling...' : 'Cancel Listing'}
                </button>
              ) : (
                <div>
                  <button
                    onClick={handlePurchase}
                    disabled={purchasing}
                    className="w-full px-8 py-4 bg-gradient-to-r from-[#9945FF] to-[#14F195] hover:from-[#A855F7] hover:to-[#10B981] text-white font-black rounded-xl transition-all disabled:opacity-50 shadow-2xl shadow-[#9945FF]/50"
                  >
                    {purchasing ? 'Purchasing...' : `Purchase for ${parseFloat(listing.price_sol).toFixed(2)} SOL`}
                  </button>
                  <p className="text-xs text-[#B4B4C8] mt-3 text-center">
                    Plus network fees (~0.00001 SOL). Token account will be created automatically if needed.
                  </p>
                </div>
              )}
            </div>

            {/* NFT Details */}
            <div className="glass-card border-2 border-[#9945FF]/30 rounded-2xl p-6">
              <h3 className="text-xl font-black text-white mb-4">NFT Details</h3>
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-[#B4B4C8]">Mint Address</p>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="text-xs font-mono text-white bg-[#27272A] px-3 py-2 rounded flex-1 truncate">
                      {listing.mint_address}
                    </code>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(listing.mint_address)
                        toast.success('Mint address copied!')
                      }}
                      className="text-[#9945FF] hover:text-[#A855F7]"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-[#B4B4C8]">Listed</p>
                  <p className="text-sm text-white font-bold">
                    {new Date(listing.created_at).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
