'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSolanaWallet } from '@/lib/wallet/solana-wallet-context'
import { toast } from 'sonner'
import { Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { SolanaNft } from '@/lib/solana/nft-fetcher'

export default function ListNftPage() {
  const router = useRouter()
  const { isConnected, publicKey, signTransaction } = useSolanaWallet()

  const [step, setStep] = useState<1 | 2>(1)
  const [loading, setLoading] = useState(false)
  const [nfts, setNfts] = useState<SolanaNft[]>([])
  const [selectedNft, setSelectedNft] = useState<SolanaNft | null>(null)
  const [price, setPrice] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [listing, setListing] = useState(false)

  useEffect(() => {
    if (!isConnected) {
      toast.error('Please connect your wallet to list NFTs')
      router.push('/marketplace')
      return
    }
    loadUserNfts()
  }, [isConnected, publicKey])

  const loadUserNfts = async () => {
    if (!publicKey) return

    setLoading(true)
    try {
      const response = await fetch(`/api/marketplace/solana/my-nfts?wallet=${publicKey.toBase58()}`)
      const data = await response.json()

      if (response.ok) {
        setNfts(data.nfts || [])
      } else {
        toast.error('Failed to load your NFTs')
      }
    } catch (error) {
      console.error('Error loading NFTs:', error)
      toast.error('Failed to load NFTs')
    } finally {
      setLoading(false)
    }
  }

  const handleSelectNft = (nft: SolanaNft) => {
    setSelectedNft(nft)
    setTitle(nft.name)
    setStep(2)
  }

  const handleCreateListing = async () => {
    // Specific validation checks with helpful messages
    if (!selectedNft) {
      toast.error('Please select an NFT to list')
      return
    }

    if (!publicKey) {
      toast.error('Wallet not connected. Please connect your wallet.')
      return
    }

    if (!signTransaction) {
      toast.error('Wallet does not support transaction signing')
      return
    }

    const priceNum = parseFloat(price)
    if (!price || isNaN(priceNum) || priceNum <= 0) {
      toast.error('Please enter a valid price greater than 0')
      return
    }

    setListing(true)

    try {
      // Step 1: Create listing
      const response = await fetch('/api/marketplace/solana/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mintAddress: selectedNft.mintAddress,
          price: priceNum,
          sellerWallet: publicKey.toBase58(),
          title: title || selectedNft.name,
          description,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create listing')
      }

      // Step 2: Sign transaction
      const transactionBuffer = Buffer.from(data.transaction, 'base64')
      const transaction = Transaction.from(transactionBuffer)

      toast.info('Please sign the transaction to transfer your NFT to escrow')
      const signedTx = await signTransaction(transaction)

      // Step 3: Broadcast transaction
      const { Connection } = await import('@solana/web3.js')
      const { getConnection } = await import('@/lib/solana/connection')
      const connection = getConnection()

      const signature = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      })

      toast.info('Transaction sent, waiting for confirmation...')

      await connection.confirmTransaction(signature, 'confirmed')

      // Step 4: Confirm listing
      const confirmResponse = await fetch('/api/marketplace/solana/confirm-listing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listingId: data.listingId,
          txSignature: signature,
        }),
      })

      const confirmData = await confirmResponse.json()

      if (!confirmResponse.ok) {
        throw new Error(confirmData.error || 'Failed to confirm listing')
      }

      toast.success('NFT listed successfully!')
      router.push('/marketplace')
    } catch (error: any) {
      console.error('Error creating listing:', error)
      toast.error(error.message || 'Failed to create listing')
    } finally {
      setListing(false)
    }
  }

  const platformFee = parseFloat(price) * 0.02 || 0
  const sellerReceives = parseFloat(price) - platformFee || 0

  return (
    <div className="min-h-screen py-12">
      <div className="max-w-7xl mx-auto px-4">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-5xl font-black text-white mb-4">
            List <span className="gradient-text-neon">NFT</span>
          </h1>
          <p className="text-xl text-[#B4B4C8]">
            {step === 1 ? 'Select an NFT to list' : 'Set your price and list'}
          </p>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center gap-4 mb-12">
          <div className={`flex items-center gap-3 ${step >= 1 ? 'opacity-100' : 'opacity-50'}`}>
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black ${
              step >= 1 ? 'bg-[#9945FF] text-white' : 'bg-[#27272A] text-[#71717A]'
            }`}>
              1
            </div>
            <span className="text-white font-bold">Select NFT</span>
          </div>
          <div className="flex-1 h-0.5 bg-[#27272A]" />
          <div className={`flex items-center gap-3 ${step >= 2 ? 'opacity-100' : 'opacity-50'}`}>
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black ${
              step >= 2 ? 'bg-[#9945FF] text-white' : 'bg-[#27272A] text-[#71717A]'
            }`}>
              2
            </div>
            <span className="text-white font-bold">Set Price</span>
          </div>
        </div>

        {/* Step 1: Select NFT */}
        {step === 1 && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-black text-white">Your NFTs</h2>
              <button
                onClick={loadUserNfts}
                disabled={loading}
                className="px-4 py-2 bg-[#27272A] hover:bg-[#3F3F46] text-white rounded-lg transition-colors"
              >
                {loading ? 'Loading...' : 'Refresh'}
              </button>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-32">
                <div className="w-16 h-16 border-4 border-[#9945FF] border-t-transparent rounded-full animate-spin cyber-glow mb-6" />
                <p className="text-xl font-bold text-[#B4B4C8]">Loading your NFTs...</p>
              </div>
            ) : nfts.length === 0 ? (
              <div className="glass-card border-2 border-[#9945FF]/40 rounded-3xl p-16 text-center">
                <div className="text-8xl mb-6">🎨</div>
                <h3 className="text-3xl font-black text-white mb-4">No NFTs Available</h3>
                <p className="text-lg text-[#B4B4C8]">
                  You don't have any NFTs available to list
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {nfts.map((nft) => (
                  <button
                    key={nft.mintAddress}
                    onClick={() => handleSelectNft(nft)}
                    className="group text-left"
                  >
                    <div className="glass-card-hover border-2 border-[#9945FF]/30 rounded-2xl overflow-hidden hover:border-[#9945FF] transition-all duration-300">
                      <div className="aspect-square bg-gradient-to-br from-[#9945FF]/20 to-[#14F195]/20 relative overflow-hidden">
                        {nft.image ? (
                          <img
                            src={nft.image}
                            alt={nft.name}
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <span className="text-6xl">💎</span>
                          </div>
                        )}
                      </div>
                      <div className="p-4">
                        <h3 className="text-lg font-black text-white truncate">{nft.name}</h3>
                        {nft.collectionName && (
                          <p className="text-sm text-[#B4B4C8] truncate">{nft.collectionName}</p>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Set Price */}
        {step === 2 && selectedNft && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left: NFT Preview */}
            <div className="glass-card border-2 border-[#9945FF]/30 rounded-3xl p-8">
              <h3 className="text-xl font-black text-white mb-6">NFT Preview</h3>
              <div className="aspect-square bg-gradient-to-br from-[#9945FF]/20 to-[#14F195]/20 rounded-2xl overflow-hidden mb-6">
                {selectedNft.image ? (
                  <img
                    src={selectedNft.image}
                    alt={selectedNft.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-8xl">💎</span>
                  </div>
                )}
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-[#B4B4C8]">Name</p>
                  <p className="text-lg font-bold text-white">{selectedNft.name}</p>
                </div>
                {selectedNft.collectionName && (
                  <div>
                    <p className="text-sm text-[#B4B4C8]">Collection</p>
                    <p className="text-lg font-bold text-white">{selectedNft.collectionName}</p>
                  </div>
                )}
                <div>
                  <p className="text-sm text-[#B4B4C8]">Mint Address</p>
                  <p className="text-sm font-mono text-white truncate">{selectedNft.mintAddress}</p>
                </div>
              </div>
            </div>

            {/* Right: Listing Form */}
            <div className="glass-card border-2 border-[#14F195]/30 rounded-3xl p-8">
              <h3 className="text-xl font-black text-white mb-6">Listing Details</h3>

              <div className="space-y-6">
                {/* Price Input */}
                <div>
                  <label className="block text-sm font-bold text-[#B4B4C8] mb-2">
                    Price (SOL) *
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-4 py-3 glass-card border-2 border-[#14F195]/20 focus:border-[#14F195] text-white rounded-xl outline-none font-bold text-lg"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[#B4B4C8] font-bold">
                      SOL
                    </span>
                  </div>
                  {price && (
                    <p className="text-sm text-[#B4B4C8] mt-2">
                      ≈ {(parseFloat(price) * LAMPORTS_PER_SOL).toLocaleString()} lamports
                    </p>
                  )}
                </div>

                {/* Title Input */}
                <div>
                  <label className="block text-sm font-bold text-[#B4B4C8] mb-2">
                    Title (Optional)
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={selectedNft.name}
                    className="w-full px-4 py-3 glass-card border-2 border-[#9945FF]/20 focus:border-[#9945FF] text-white rounded-xl outline-none"
                  />
                </div>

                {/* Description Input */}
                <div>
                  <label className="block text-sm font-bold text-[#B4B4C8] mb-2">
                    Description (Optional)
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe your NFT..."
                    rows={4}
                    className="w-full px-4 py-3 glass-card border-2 border-[#9945FF]/20 focus:border-[#9945FF] text-white rounded-xl outline-none resize-none"
                  />
                </div>

                {/* Fee Breakdown */}
                {price && parseFloat(price) > 0 && (
                  <div className="glass-card border border-[#9945FF]/20 rounded-xl p-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-[#B4B4C8]">Platform Fee (2%)</span>
                      <span className="text-white font-bold">{platformFee.toFixed(4)} SOL</span>
                    </div>
                    <div className="border-t border-[#9945FF]/20 pt-2 flex justify-between">
                      <span className="text-[#14F195] font-bold">You'll Receive</span>
                      <span className="text-[#14F195] font-black text-lg">
                        {sellerReceives.toFixed(4)} SOL
                      </span>
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-4 pt-4">
                  <button
                    onClick={() => setStep(1)}
                    disabled={listing}
                    className="flex-1 px-6 py-4 bg-[#27272A] hover:bg-[#3F3F46] text-white font-bold rounded-xl transition-colors"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleCreateListing}
                    disabled={listing || !price || parseFloat(price) <= 0}
                    className="flex-1 px-6 py-4 bg-gradient-to-r from-[#9945FF] to-[#DC1FFF] hover:from-[#A855F7] hover:to-[#E935FF] text-white font-black rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {listing ? 'Listing...' : 'Create Listing'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
