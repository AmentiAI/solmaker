'use client'

import { useState, useEffect, useMemo } from 'react'
import { useWallet } from '@/lib/wallet/compatibility'
import { WalletConnect } from '@/components/wallet-connect'
import Link from 'next/link'

interface Transaction {
  id: string
  walletAddress: string
  amount: number
  transactionType: 'purchase' | 'usage' | 'refund'
  description: string | null
  paymentTxId: string | null
  createdAt: string
  status?: 'completed' | 'pending' | 'confirming'
  paymentType?: string
  confirmations?: number
  expiresAt?: string
}

export default function TransactionsPage() {
  const { isConnected: isBtcConnected, currentAddress: btcAddress } = useWallet()
  // Determine active wallet (Bitcoin only)
  const { activeWalletAddress, activeWalletConnected } = useMemo(() => {
    if (btcAddress && isBtcConnected) {
      return { activeWalletAddress: btcAddress, activeWalletConnected: true }
    }
    // Fallback: use address even if isConnected is false
    if (btcAddress) {
      return { activeWalletAddress: btcAddress, activeWalletConnected: true }
    }
    return { activeWalletAddress: null, activeWalletConnected: false }
  }, [btcAddress, isBtcConnected])
  
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterType, setFilterType] = useState<string>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const limit = 20

  const fetchTransactions = async (page: number = 1, type: string = 'all') => {
    if (!activeWalletConnected || !activeWalletAddress) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      const params = new URLSearchParams({
        wallet_address: activeWalletAddress,
        page: page.toString(),
        limit: limit.toString(),
      })
      
      if (type !== 'all') {
        params.append('transaction_type', type)
      }
      
      // Add cache-busting timestamp to ensure fresh data
      params.append('_t', Date.now().toString())
      
      const response = await fetch(
        `/api/transactions?${params.toString()}`,
        { cache: 'no-store' }
      )
      
      if (response.ok) {
        const data = await response.json()
        setTransactions(data.transactions || [])
        setTotalPages(data.totalPages || 1)
        setTotal(data.total || 0)
        setCurrentPage(data.page || 1)
      } else {
        const errorData = await response.json()
        setError(errorData.error || 'Failed to fetch transactions')
      }
    } catch (err: any) {
      console.error('Error fetching transactions:', err)
      setError(err.message || 'Failed to fetch transactions')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (activeWalletConnected && activeWalletAddress) {
      fetchTransactions(1, filterType)
      setCurrentPage(1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWalletConnected, activeWalletAddress, filterType])

  const handleTypeFilterChange = (type: string) => {
    setFilterType(type)
    setCurrentPage(1)
  }

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
    fetchTransactions(page, filterType)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Refresh transactions when page becomes visible (user navigated back)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && activeWalletConnected && activeWalletAddress) {
        fetchTransactions(currentPage, filterType)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [activeWalletConnected, activeWalletAddress, currentPage, filterType])

  const getTypeBadge = (type: string) => {
    const baseClasses = "px-2 py-1 rounded-full text-xs font-semibold border"
    switch (type) {
      case 'purchase':
        return `${baseClasses} bg-[#9945FF]/20 text-[#9945FF] border-[#9945FF]/30`
      case 'usage':
        return `${baseClasses} bg-red-500/20 text-[#EF4444] border-red-500/30`
      case 'refund':
        return `${baseClasses} bg-[#9945FF]/20 text-[#9945FF] border-[#9945FF]/30`
      default:
        return `${baseClasses} bg-white/10 text-white/70 border-white/20`
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  if (!activeWalletConnected) {
    return (
      <div className="min-h-screen">
        {/* Hero Header */}
        <div className="bg-gradient-to-r from-[#0a0e27]/90 via-[#1a1f3a]/90 to-[#0f172a]/90 text-white border-b border-[#9945FF]/30">
          <div className="container mx-auto px-6 py-8">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
              <div>
                <h1 className="text-4xl md:text-5xl font-black tracking-tight text-white">Credit Usage</h1>
                <p className="text-[#a5b4fc] mt-2 text-lg">
                  View all your credit transactions (purchases, usage, and refunds)
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="w-full max-w-[1200px] mx-auto px-6 py-12">
          <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border-2 border-[#9945FF]/30 rounded-xl p-8 text-center shadow-xl">
            <div className="text-6xl mb-4">🔐</div>
            <h2 className="text-2xl font-bold text-white mb-4">Connect Your Wallet</h2>
            <p className="text-white/70 mb-6">Please connect your wallet to view transactions.</p>
            <div className="flex justify-center gap-4 mb-4">
              <WalletConnect />
            </div>
            <Link
              href="/"
              className="inline-block px-6 py-3 bg-gradient-to-r from-[#00E5FF] to-[#FFD60A] hover:from-[#00B8D4] hover:to-[#12D87A] text-white rounded-lg font-semibold transition-colors"
            >
              Go Home
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      {/* Hero Header */}
      <div className="bg-gradient-to-r from-[#0a0e27]/90 via-[#1a1f3a]/90 to-[#0f172a]/90 text-white border-b border-[#9945FF]/30">
        <div className="container mx-auto px-6 py-8">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <h1 className="text-4xl md:text-5xl font-black tracking-tight text-white">Credit Usage</h1>
              <p className="text-[#a5b4fc] mt-2 text-lg">
                View all your credit transactions (purchases, usage, and refunds)
              </p>
            </div>
            <button
              onClick={() => fetchTransactions(currentPage, filterType)}
              disabled={loading}
              className="px-4 py-2 btn-cosmic rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-50"
            >
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>
      </div>

      <div className="w-full max-w-[1200px] mx-auto px-6 py-12">
        <div className="mb-8">
          {/* Filter and Pagination Info */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
            <div className="flex items-center gap-3">
              <label className="text-sm text-white/70">Filter by type:</label>
              <select
                value={filterType}
                onChange={(e) => handleTypeFilterChange(e.target.value)}
                className="px-3 py-2 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border-2 border-[#9945FF]/30 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#9945FF]/20 focus:border-[#9945FF]"
              >
                <option value="all">All Types</option>
                <option value="purchase">Purchase</option>
                <option value="usage">Usage</option>
                <option value="refund">Refund</option>
              </select>
            </div>
            {!loading && total > 0 && (
              <div className="text-sm text-[#a8a8b8]/80">
                Showing {((currentPage - 1) * limit) + 1} - {Math.min(currentPage * limit, total)} of {total} transactions
              </div>
            )}
          </div>
        </div>

        {loading ? (
          <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border-2 border-[#9945FF]/30 rounded-xl p-8 text-center shadow-lg">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-[#9945FF] border-t-transparent"></div>
            <p className="text-white/70 mt-4">Loading transactions...</p>
          </div>
        ) : error ? (
          <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border-2 border-red-500/50 rounded-xl p-4 text-[#EF4444]">
            {error}
          </div>
        ) : transactions.length === 0 ? (
          <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border-2 border-[#9945FF]/30 rounded-xl p-8 text-center shadow-lg">
            <div className="text-6xl mb-4">📋</div>
            <p className="text-white mb-4">No transactions found.</p>
            <Link
              href="/"
              className="inline-block px-6 py-3 bg-gradient-to-r from-[#00E5FF] to-[#FFD60A] hover:from-[#00B8D4] hover:to-[#12D87A] text-white rounded-lg font-semibold transition-colors"
            >
              Purchase Credits
            </Link>
          </div>
        ) : (
          <>
            <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border-2 border-[#9945FF]/30 rounded-xl overflow-hidden shadow-lg">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border-b-2 border-[#9945FF]/30">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-white/70 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-white/70 uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-white/70 uppercase tracking-wider">
                        Amount
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-white/70 uppercase tracking-wider">
                        Description
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-white/70 uppercase tracking-wider">
                        Payment TXID
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#9945FF]/20">
                    {transactions.map((tx) => {
                      const isPending = tx.status === 'pending' || tx.status === 'confirming'
                      return (
                        <tr key={tx.id} className={`hover:bg-[#1a1f3a] ${isPending ? 'bg-[#DC1FFF]/10' : ''}`}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                            {formatDate(tx.createdAt)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex flex-col gap-1">
                              <span className={getTypeBadge(tx.transactionType)}>
                                {tx.transactionType}
                              </span>
                              {isPending && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-[#DC1FFF]/20 text-[#DC1FFF] border border-[#DC1FFF]/30">
                                  <span className="animate-pulse">●</span>
                                  {tx.status === 'confirming' ? `Confirming (${tx.confirmations || 0}/1)` : 'Pending Payment'}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className={`px-6 py-4 whitespace-nowrap text-sm font-semibold ${
                            isPending ? 'text-[#DC1FFF]' : tx.amount > 0 ? 'text-[#9945FF]' : 'text-[#EF4444]'
                          }`}>
                            {isPending ? '⏳ ' : tx.amount > 0 ? '+' : ''}{tx.amount} credits
                          </td>
                          <td className="px-6 py-4 text-sm text-white max-w-md truncate" title={tx.description || ''}>
                            <div className="flex flex-col">
                              <span>{tx.description || '-'}</span>
                              {isPending && tx.paymentType && (
                                <span className="text-xs text-[#a8a8b8]/80">
                                  via {tx.paymentType.toUpperCase()}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-[#a8a8b8]/80 font-mono">
                            {tx.paymentTxId ? (
                              <a
                                href={tx.paymentType === 'sol' 
                                  ? `https://solscan.io/tx/${tx.paymentTxId}`
                                  : `https://mempool.space/tx/${tx.paymentTxId}`
                                }
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[#9945FF] hover:text-[#14F195] hover:underline"
                              >
                                {tx.paymentTxId.substring(0, 16)}...
                              </a>
                            ) : isPending ? (
                              <span className="text-[#DC1FFF] italic">Awaiting payment...</span>
                            ) : (
                              <span className="text-white/40">-</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            
            {/* Pagination */}
            {!loading && totalPages > 1 && (
              <div className="mt-6 flex justify-center items-center gap-2">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="px-4 py-2 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md hover:bg-[#1a1f3a] text-white rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-[#9945FF]/30"
                >
                  Previous
                </button>
                
                <div className="flex gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }
                    
                    return (
                      <button
                        key={pageNum}
                        onClick={() => handlePageChange(pageNum)}
                        className={`px-3 py-2 rounded-lg font-semibold transition-colors ${
                          currentPage === pageNum
                            ? 'bg-gradient-to-r from-[#00E5FF] to-[#FFD60A] text-white'
                            : 'bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md hover:bg-[#0f0f1e] text-white border border-[#00E5FF]/30'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>
                
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="px-4 py-2 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md hover:bg-[#1a1f3a] text-white rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-[#9945FF]/30"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
