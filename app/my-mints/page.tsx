'use client'

import { useState, useEffect, useMemo } from 'react'
import { useWallet } from '@/lib/wallet/compatibility'
import { getSolscanUrl } from '@/lib/solscan'
import Link from 'next/link'

interface MintTransaction {
  id: string
  ordinal_id: string
  session_id: string
  collection_id: string
  mint_address: string | null
  tx_signature: string | null
  metadata_uri: string | null
  mint_status: string
  error_message: string | null
  created_at: string
  confirmed_at: string | null
  collection_name: string
  ordinal_number: number | null
}

export default function MyMintsPage() {
  const { isConnected, currentAddress } = useWallet()
  const { activeWalletAddress, activeWalletConnected } = useMemo(() => {
    if (currentAddress && isConnected) return { activeWalletAddress: currentAddress, activeWalletConnected: true }
    return { activeWalletAddress: null, activeWalletConnected: false }
  }, [currentAddress, isConnected])

  const [transactions, setTransactions] = useState<MintTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [collectionFilter, setCollectionFilter] = useState<string>('')
  const [collections, setCollections] = useState<Array<{ id: string; name: string }>>([])

  useEffect(() => {
    if (activeWalletConnected && activeWalletAddress) {
      loadTransactions()
    }
  }, [activeWalletConnected, activeWalletAddress, collectionFilter])

  useEffect(() => {
    const uniqueCollections = new Map<string, { id: string; name: string }>()
    transactions.forEach(tx => {
      if (tx.collection_id && tx.collection_name) {
        if (!uniqueCollections.has(tx.collection_id)) {
          uniqueCollections.set(tx.collection_id, {
            id: tx.collection_id,
            name: tx.collection_name
          })
        }
      }
    })
    setCollections(Array.from(uniqueCollections.values()))
  }, [transactions])

  const loadTransactions = async () => {
    if (!activeWalletAddress) return

    setLoading(true)
    setError(null)

    try {
      const url = `/api/mint/my-transactions?wallet_address=${encodeURIComponent(activeWalletAddress)}${collectionFilter ? `&collection_id=${collectionFilter}` : ''}`
      const response = await fetch(url)

      if (!response.ok) {
        const errorData = await response.json()
        setError(errorData.error || 'Failed to load mint transactions')
        setLoading(false)
        return
      }

      const data = await response.json()
      setTransactions(data.mints || [])
    } catch (err: any) {
      console.error('Error loading mint transactions:', err)
      setError(err.message || 'Failed to load mint transactions')
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '—'
    return new Date(dateString).toLocaleString()
  }

  const getStatusBadge = (status: string) => {
    const statusColors: Record<string, string> = {
      confirmed: 'bg-green-500/20 text-green-400 border border-green-500/30',
      minting: 'bg-yellow-500/20 text-[#FBBF24] border border-yellow-500/30',
      uploading: 'bg-[#00E5FF]/20 text-[#00E5FF] border border-[#00E5FF]/30',
      failed: 'bg-red-500/20 text-[#EF4444] border border-red-500/30',
      pending: 'bg-white/10 text-white/70 border border-white/20',
      expired: 'bg-white/10 text-white/50 border border-white/10',
    }
    return statusColors[status] || 'bg-white/10 text-white/70 border border-white/20'
  }

  if (!activeWalletConnected) {
    return (
      <div className="min-h-screen p-8 bg-gradient-to-br from-[#050510] via-[#0f0f1e] to-[#15152a]">
        <div className="max-w-7xl mx-auto">
          <div className="bg-gradient-to-br from-[#0f0f1e]/90 to-[#15152a]/90 rounded-lg shadow p-6 text-center border border-[#00E5FF]/30">
            <p className="text-[#b4b4c8]">Please connect your wallet</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-8 bg-gradient-to-br from-[#050510] via-[#0f0f1e] to-[#15152a]">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-[#00E5FF] to-[#FFD60A] bg-clip-text text-transparent">My Mints</h1>
              <p className="text-[#b4b4c8] mt-1">View your NFT mint history</p>
            </div>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-4 mb-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-[#b4b4c8] mb-1">Filter by Collection</label>
              <select
                value={collectionFilter}
                onChange={(e) => setCollectionFilter(e.target.value)}
                className="w-full px-3 py-2 border border-[#00E5FF]/30 bg-gradient-to-br from-[#0f0f1e]/90 to-[#15152a]/90 text-white rounded-lg"
              >
                <option value="">All Collections</option>
                {collections.map((col) => (
                  <option key={col.id} value={col.id}>
                    {col.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={loadTransactions}
                className="px-4 py-2 bg-gradient-to-r from-[#00E5FF] to-[#FFD60A] hover:from-[#00B8D4] hover:to-[#12D87A] text-white rounded-lg font-medium"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-gradient-to-br from-[#0f0f1e]/90 to-[#15152a]/90 border border-red-500/50 rounded-lg">
            <p className="text-[#EF4444]">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="bg-gradient-to-br from-[#0f0f1e]/90 to-[#15152a]/90 rounded-lg shadow p-12 text-center border border-[#00E5FF]/30">
            <div className="w-16 h-16 border-4 border-[#00E5FF] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-[#b4b4c8]">Loading mint transactions...</p>
          </div>
        ) : transactions.length === 0 ? (
          <div className="bg-gradient-to-br from-[#0f0f1e]/90 to-[#15152a]/90 rounded-lg shadow p-12 text-center border border-[#00E5FF]/30">
            <p className="text-white text-lg">No mint transactions found</p>
            <p className="text-[#b4b4c8] text-sm mt-2">Your mint history will appear here.</p>
          </div>
        ) : (
          <div className="bg-gradient-to-br from-[#0f0f1e]/90 to-[#15152a]/90 rounded-lg shadow overflow-hidden border border-[#00E5FF]/30">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-[#00E5FF]/30">
                <thead className="bg-gradient-to-br from-[#050510] via-[#0f0f1e] to-[#15152a]">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-white/70 uppercase tracking-wider">Collection</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-white/70 uppercase tracking-wider">NFT #</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-white/70 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-white/70 uppercase tracking-wider">Transaction</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-white/70 uppercase tracking-wider">Mint Address</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-white/70 uppercase tracking-wider">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#00E5FF]/30">
                  {transactions.map((transaction) => (
                    <tr key={transaction.id} className="hover:bg-[#00E5FF]/10">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-white">{transaction.collection_name}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-white">
                          {transaction.ordinal_number !== null ? `#${transaction.ordinal_number}` : '—'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusBadge(transaction.mint_status)}`}>
                          {transaction.mint_status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {transaction.tx_signature ? (
                          <a
                            href={getSolscanUrl(transaction.tx_signature, 'tx')}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-[#00E5FF] hover:text-[#FFD60A] font-mono"
                          >
                            {transaction.tx_signature.slice(0, 16)}...
                          </a>
                        ) : (
                          <span className="text-sm text-white/50">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {transaction.mint_address ? (
                          <a
                            href={getSolscanUrl(transaction.mint_address, 'token')}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-[#00E5FF] hover:text-[#FFD60A] font-mono"
                          >
                            {transaction.mint_address.slice(0, 12)}...
                          </a>
                        ) : (
                          <span className="text-sm text-white/50">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[#a8a8b8]/80">
                        {formatDate(transaction.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
