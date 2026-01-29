'use client'

import { useState } from 'react'
import { AdminSidebar } from '@/components/admin-sidebar'
import { useWallet } from '@/lib/wallet/compatibility'
import { isAdmin } from '@/lib/auth/access-control'
import Link from 'next/link'

interface OrdinalToken {
  id: string
  contentURI: string
  contentType: string
  contentPreviewURI: string
  inscriptionNumber: number
  chain: string
  collectionSymbol: string
  owner: string
  listed: boolean
  listedPrice?: number
  satName?: string
  meta?: {
    name?: string
    attributes?: Array<{ trait_type: string; value: string }>
  }
}

export default function MagicEdenCheckerPage() {
  const { isConnected, currentAddress } = useWallet()
  const authorized = isAdmin(currentAddress || null)

  const [walletAddress, setWalletAddress] = useState('')
  const [collectionSlug, setCollectionSlug] = useState('ordmaker')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [allTokens, setAllTokens] = useState<OrdinalToken[]>([])
  const [matchingTokens, setMatchingTokens] = useState<OrdinalToken[]>([])
  const [rawResponse, setRawResponse] = useState<any>(null)
  const [showRaw, setShowRaw] = useState(false)
  const [totalCount, setTotalCount] = useState<number>(0)

  const checkWalletHoldings = async () => {
    if (!walletAddress.trim()) {
      setError('Please enter a wallet address')
      return
    }

    setLoading(true)
    setError(null)
    setAllTokens([])
    setMatchingTokens([])
    setRawResponse(null)
    setTotalCount(0)

    try {
      // Use our server-side proxy to keep API key secure
      const params = new URLSearchParams({
        wallet_address: currentAddress || '', // For admin auth
        ownerAddress: walletAddress,
        showAll: 'true',
        limit: '100', // Magic Eden max is 100
      })
      
      // Add collection filter if provided
      if (collectionSlug.trim()) {
        params.set('collectionSymbol', collectionSlug.trim())
      }
      
      const url = `/api/admin/magic-eden?${params.toString()}`
      console.log('Fetching via proxy:', url)
      
      const response = await fetch(url)

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`API Error ${response.status}: ${errorText}`)
      }

      const data = await response.json()
      setRawResponse(data)

      // Response format: { tokens: [...], total: number }
      const tokens: OrdinalToken[] = data.tokens || (Array.isArray(data) ? data : [])
      const total = data.total ?? tokens.length
      
      console.log(`Found ${total} ordinals (${tokens.length} in response)`)
      setTotalCount(total)
      
      // If we filtered by collection, these are all matching
      if (collectionSlug.trim()) {
        setMatchingTokens(tokens)
        setAllTokens(tokens)
      } else {
        setAllTokens(tokens)
        setMatchingTokens([])
      }
    } catch (err: any) {
      console.error('Magic Eden API Error:', err)
      setError(err.message || 'Failed to fetch wallet holdings')
    } finally {
      setLoading(false)
    }
  }

  const useMyWallet = () => {
    if (currentAddress) {
      setWalletAddress(currentAddress)
    }
  }

  if (!isConnected) {
    return (
      <div className="flex min-h-screen bg-slate-900">
        <div className="flex-1 p-8">
          <div className="max-w-7xl mx-auto">
            <div className="bg-slate-800 border border-gray-700 rounded-xl p-8 text-center shadow">
              <h1 className="text-3xl font-bold text-white mb-4">Magic Eden Wallet Checker</h1>
              <p className="text-gray-400 mb-6">Please connect your wallet to access admin tools.</p>
              <Link href="/" className="text-blue-400 hover:text-blue-300">
                ← Back to Home
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!authorized) {
    return (
      <div className="flex min-h-screen bg-slate-900">
        <div className="flex-1 p-8">
          <div className="max-w-7xl mx-auto">
            <div className="bg-red-900/20 border border-red-700 rounded-xl p-8 text-center shadow">
              <h1 className="text-3xl font-bold text-red-400 mb-4">Access Denied</h1>
              <p className="text-gray-300 mb-4">This page is restricted to admin accounts only.</p>
              <Link href="/" className="text-blue-400 hover:text-blue-300">
                ← Back to Home
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-slate-900">
      <AdminSidebar />
      <div className="flex-1 ml-64 p-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold text-white mb-2">Magic Eden Wallet Checker</h1>
          <p className="text-gray-400 mb-8">Check if a wallet holds ordinals from a specific collection</p>

          {/* Input Form */}
          <div className="bg-slate-800 border border-gray-700 rounded-xl p-6 mb-8 shadow">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label htmlFor="wallet-address" className="block text-sm font-medium text-gray-400 mb-2">
                  Wallet Address
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    id="wallet-address"
                    className="flex-1 px-4 py-2 bg-slate-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter Bitcoin wallet address (bc1p...)"
                    value={walletAddress}
                    onChange={(e) => setWalletAddress(e.target.value)}
                  />
                  <button
                    onClick={useMyWallet}
                    className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    Use Mine
                  </button>
                </div>
              </div>
              <div>
                <label htmlFor="collection-slug" className="block text-sm font-medium text-gray-400 mb-2">
                  Collection Slug (optional filter)
                </label>
                <input
                  type="text"
                  id="collection-slug"
                  className="w-full px-4 py-2 bg-slate-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g., the-damned"
                  value={collectionSlug}
                  onChange={(e) => setCollectionSlug(e.target.value)}
                />
              </div>
            </div>
            <button
              onClick={checkWalletHoldings}
              disabled={loading}
              className="w-full md:w-auto px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Checking...' : 'Check Holdings'}
            </button>
            {error && (
              <p className="mt-4 text-red-400 text-sm">{error}</p>
            )}
          </div>

          {/* Results */}
          {(totalCount > 0 || allTokens.length > 0 || rawResponse) && (
            <div className="bg-slate-800 border border-gray-700 rounded-xl p-6 shadow">
              {/* Summary */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-slate-700 rounded-lg p-4">
                  <div className="text-gray-400 text-sm">
                    {collectionSlug ? `"${collectionSlug}" Owned` : 'Total Ordinals'}
                  </div>
                  <div className="text-3xl font-bold text-white">{totalCount}</div>
                </div>
                <div className="bg-slate-700 rounded-lg p-4">
                  <div className="text-gray-400 text-sm">Holder Status</div>
                  <div className={`text-3xl font-bold ${totalCount > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {totalCount > 0 ? '✅ YES' : '❌ NO'}
                  </div>
                </div>
                <div className="bg-slate-700 rounded-lg p-4">
                  <div className="text-gray-400 text-sm">In Response</div>
                  <div className="text-3xl font-bold text-blue-400">{allTokens.length}</div>
                </div>
              </div>

              {/* Ordinals Display */}
              {allTokens.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-bold text-white mb-4">
                    {collectionSlug ? `🎉 ${totalCount} Ordinals from "${collectionSlug}"` : `📦 ${totalCount} Total Ordinals`}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {allTokens.slice(0, 20).map((token) => (
                      <div key={token.id} className="bg-slate-700 rounded-lg p-3 border border-slate-600 hover:border-purple-500/50 transition-colors">
                        {token.contentPreviewURI && (
                          <img 
                            src={token.contentPreviewURI} 
                            alt={token.meta?.name || `Inscription #${token.inscriptionNumber}`}
                            className="w-full h-28 object-cover rounded-lg mb-2"
                          />
                        )}
                        <div className="text-white font-medium truncate text-sm">
                          {token.meta?.name || `Inscription #${token.inscriptionNumber}`}
                        </div>
                        <div className="text-gray-400 text-xs">#{token.inscriptionNumber}</div>
                        <div className="flex items-center justify-between mt-2">
                          <span className={`text-xs px-2 py-0.5 rounded ${token.listed ? 'bg-yellow-500/20 text-yellow-400' : 'bg-green-500/20 text-green-400'}`}>
                            {token.listed ? 'Listed' : 'Unlisted'}
                          </span>
                          <a 
                            href={`https://magiceden.io/ordinals/item-details/${token.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-purple-400 hover:text-purple-300 text-xs"
                          >
                            View →
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                  {allTokens.length > 20 && (
                    <p className="text-gray-400 text-sm mt-4">Showing first 20 of {allTokens.length} ordinals</p>
                  )}
                </div>
              )}

              {/* Collection Info */}
              {collectionSlug && allTokens.length > 0 && (
                <div className="mb-6 p-4 bg-slate-700/50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400">Collection:</span>
                    <span className="px-3 py-1 bg-purple-500/20 text-purple-400 rounded-full text-sm font-medium">
                      {collectionSlug}
                    </span>
                    <span className="text-gray-400">•</span>
                    <span className="text-white font-medium">{totalCount} owned</span>
                  </div>
                </div>
              )}

              {/* Raw Response Toggle */}
              <div className="mt-6">
                <button
                  onClick={() => setShowRaw(!showRaw)}
                  className="text-blue-400 hover:text-blue-300 text-sm font-medium"
                >
                  {showRaw ? 'Hide Raw Response' : 'Show Raw Response'}
                </button>
                {showRaw && (
                  <pre className="mt-4 p-4 bg-slate-700 rounded-lg text-gray-200 text-xs overflow-x-auto max-h-96">
                    {JSON.stringify(rawResponse, null, 2)}
                  </pre>
                )}
              </div>
            </div>
          )}

          {/* No Results */}
          {!loading && allTokens.length === 0 && rawResponse && (
            <div className="bg-slate-800 border border-gray-700 rounded-xl p-6 text-center shadow">
              <p className="text-gray-400">No ordinals found for this wallet address.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

