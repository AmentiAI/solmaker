'use client'

import { useState, useEffect } from 'react'
import { useWallet } from '@/lib/wallet/compatibility'
import { isAdmin } from '@/lib/auth/access-control'
import { WalletConnect } from '@/components/wallet-connect'
import Link from 'next/link'

interface PendingPayment {
  id: string
  wallet_address: string
  credits_amount: number
  bitcoin_amount: string
  payment_address: string
  status: 'pending' | 'completed' | 'expired'
  payment_txid: string | null
  confirmations: number
  created_at: string
  expires_at: string
  credited: boolean
  credit_transaction_id: string | null
  credit_transaction_date: string | null
  payment_type: string | null
}

interface TransactionSummary {
  total_pending: number
  total_completed: number
  total_expired: number
  total_credited: number
  total_not_credited: number
}

export default function BitcoinTransactionsPage() {
  const { isConnected, currentAddress } = useWallet()
  const [loading, setLoading] = useState(true)
  const [transactions, setTransactions] = useState<PendingPayment[]>([])
  const [summary, setSummary] = useState<TransactionSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const authorized = isAdmin(currentAddress || null)

  useEffect(() => {
    if (isConnected && authorized) {
      loadTransactions()
    }
  }, [isConnected, authorized, currentAddress])

  const loadTransactions = async () => {
    if (!currentAddress) return

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/admin/transactions?wallet_address=${encodeURIComponent(currentAddress)}&payment_type=btc`)

      if (!response.ok) {
        if (response.status === 403) {
          setError('Unauthorized. Admin access only.')
        } else {
          const errorData = await response.json()
          setError(errorData.error || 'Failed to load transactions')
        }
        setLoading(false)
        return
      }

      const data = await response.json()
      setTransactions(data.pending_payments || [])
      setSummary(data.summary || null)
    } catch (err) {
      console.error('Error loading transactions:', err)
      setError('Failed to load transactions')
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await loadTransactions()
    setRefreshing(false)
  }

  const formatBTC = (amount: string | number) => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount
    return num.toFixed(8)
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-900/30 border-green-700 text-green-300'
      case 'pending':
        return 'bg-yellow-900/30 border-[#FBBF24]/20 text-yellow-300'
      case 'expired':
        return 'bg-red-900/30 border-[#EF4444]/20 text-red-300'
      default:
        return 'bg-[#14141e]/30 border-[#9945FF]/20 text-white'
    }
  }

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#050510] via-[#0f0f1e] to-[#15152a]">
      <div className="container mx-auto px-6 py-12">
        <div className="max-w-7xl mx-auto">
            <div className="bg-gradient-to-br from-[#0f0f1e]/90 to-[#15152a]/90 border border-[#00E5FF]/20 rounded-2xl p-8 text-center shadow-xl backdrop-blur-sm">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-[#00E5FF] to-[#FFD60A] bg-clip-text text-transparent mb-4">Bitcoin Transactions</h1>
            <p className="text-[#b4b4c8] mb-6">Please connect your wallet to access the admin dashboard.</p>
            <div className="flex justify-center mb-4">
              <WalletConnect />
            </div>
            <Link href="/admin" className="text-[#00E5FF] hover:text-[#FFD60A] transition-colors">
              ← Back to Admin
            </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!authorized) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#050510] via-[#0f0f1e] to-[#15152a]">
      <div className="container mx-auto px-6 py-12">
        <div className="max-w-7xl mx-auto">
            <div className="bg-gradient-to-br from-red-900/20 to-red-800/10 border border-[#EF4444]/20/50 rounded-2xl p-8 text-center shadow-xl backdrop-blur-sm">
            <h1 className="text-3xl font-bold text-[#EF4444] mb-4">Access Denied</h1>
            <p className="text-white mb-4">This page is restricted to admin accounts only.</p>
            <Link href="/admin" className="text-[#00E5FF] hover:text-[#FFD60A] transition-colors">
              ← Back to Admin
            </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-6 py-8">
          <div className="max-w-7xl mx-auto">
          {/* Header */}
        <div className="mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-[#00E5FF] via-[#FFD60A] to-[#00E5FF] bg-clip-text text-transparent mb-2">
                Bitcoin Transactions
              </h1>
                <p className="text-[#b4b4c8] text-lg">Track all Bitcoin payment transactions</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link href="/admin/transactions/btc" className="px-4 py-2 bg-gradient-to-r from-[#00E5FF] to-[#FFD60A] hover:from-[#7a35cc] hover:to-[#11c97a] text-white rounded-xl font-semibold text-sm transition-all duration-200 border border-[#00E5FF]/30 shadow-lg shadow-[#00E5FF]/20">
                  ₿ Bitcoin
                </Link>
                  <Link href="/admin/transactions/sol" className="px-4 py-2 bg-gradient-to-br from-[#0f0f1e]/90 to-[#15152a]/90 hover:from-[#15152a] hover:to-[#0f0f1e] text-white rounded-xl font-semibold text-sm transition-all duration-200 border border-[#00E5FF]/20">
                  ◎ Solana
                </Link>
                </div>
            </div>
            <div className="flex gap-2">
              <Link
                href="/admin"
                  className="px-4 py-2 bg-gradient-to-br from-[#0f0f1e]/90 to-[#15152a]/90 hover:from-[#15152a] hover:to-[#0f0f1e] text-white rounded-xl font-semibold transition-all duration-200 border border-[#00E5FF]/20 flex items-center gap-2"
              >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                  Admin Dashboard
              </Link>
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                  className="px-6 py-2 bg-gradient-to-r from-[#00E5FF] to-[#FFD60A] hover:from-[#7a35cc] hover:to-[#11c97a] text-white rounded-xl font-semibold shadow-lg shadow-[#00E5FF]/20 transition-all duration-200 disabled:opacity-50 flex items-center gap-2"
              >
                  {refreshing ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>Refreshing...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      <span>Refresh</span>
                    </>
                  )}
              </button>
            </div>
          </div>

          {/* Summary Cards */}
          {summary && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-6 mb-8">
                <div className="bg-gradient-to-br from-yellow-900/30 to-yellow-800/20 border border-[#FBBF24]/20/50 rounded-2xl p-6 shadow-lg shadow-yellow-500/10">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-medium text-yellow-300 uppercase tracking-wide">Pending</div>
                    <svg className="w-6 h-6 text-[#FBBF24]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="text-3xl font-bold text-white">{summary.total_pending}</div>
                </div>
                <div className="bg-gradient-to-br from-green-900/30 to-green-800/20 border border-green-700/50 rounded-2xl p-6 shadow-lg shadow-green-500/10">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-medium text-green-300 uppercase tracking-wide">Completed</div>
                    <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="text-3xl font-bold text-white">{summary.total_completed}</div>
                </div>
                <div className="bg-gradient-to-br from-red-900/30 to-red-800/20 border border-[#EF4444]/20/50 rounded-2xl p-6 shadow-lg shadow-red-500/10">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-medium text-red-300 uppercase tracking-wide">Expired</div>
                    <svg className="w-6 h-6 text-[#EF4444]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                  <div className="text-3xl font-bold text-white">{summary.total_expired}</div>
              </div>
                <div className="bg-gradient-to-br from-green-900/30 to-green-800/20 border border-green-700/50 rounded-2xl p-6 shadow-lg shadow-green-500/10">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-medium text-green-300 uppercase tracking-wide">Credited</div>
                    <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
              </div>
                  <div className="text-3xl font-bold text-white">{summary.total_credited}</div>
              </div>
                <div className="bg-gradient-to-br from-orange-900/30 to-orange-800/20 border border-orange-700/50 rounded-2xl p-6 shadow-lg shadow-orange-500/10">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-medium text-orange-300 uppercase tracking-wide">Not Credited</div>
                    <svg className="w-6 h-6 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
              </div>
                  <div className="text-3xl font-bold text-white">{summary.total_not_credited}</div>
              </div>
            </div>
          )}
        </div>

        {error && (
            <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 border border-[#EF4444]/20/50 rounded-2xl p-4 mb-6 text-red-300">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
            <p className="text-[#a8a8b8] mt-4">Loading Bitcoin transactions...</p>
          </div>
        ) : (
            <div className="bg-gradient-to-br from-[#0f0f1e]/90 to-[#15152a]/90 border border-[#00E5FF]/20 rounded-2xl p-6 shadow-2xl backdrop-blur-sm">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold bg-gradient-to-r from-[#00E5FF] to-[#FFD60A] bg-clip-text text-transparent">Bitcoin Payment Transactions</h2>
                <div className="text-sm text-[#b4b4c8]">
                  {transactions.length} {transactions.length === 1 ? 'transaction' : 'transactions'}
                </div>
              </div>
            <div className="overflow-x-auto">
                <table className="w-full">
                <thead>
                  <tr className="border-b border-[#00E5FF]/20">
                      <th className="text-left py-4 px-4 text-[#b4b4c8] font-semibold">Date</th>
                      <th className="text-left py-4 px-4 text-[#b4b4c8] font-semibold">Wallet</th>
                      <th className="text-left py-4 px-4 text-[#b4b4c8] font-semibold">Credits</th>
                      <th className="text-left py-4 px-4 text-[#b4b4c8] font-semibold">BTC Amount</th>
                      <th className="text-left py-4 px-4 text-[#b4b4c8] font-semibold">Status</th>
                      <th className="text-left py-4 px-4 text-[#b4b4c8] font-semibold">TXID</th>
                      <th className="text-left py-4 px-4 text-[#b4b4c8] font-semibold">Confirmations</th>
                      <th className="text-left py-4 px-4 text-[#b4b4c8] font-semibold">Credited</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.length === 0 ? (
                    <tr>
                        <td colSpan={8} className="text-center py-12 text-[#b4b4c8]">
                          <div className="flex flex-col items-center gap-2">
                            <svg className="w-12 h-12 text-[#00E5FF]/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                            </svg>
                            <p className="text-lg">No Bitcoin transactions found</p>
                          </div>
                      </td>
                    </tr>
                  ) : (
                    transactions.map((tx) => (
                        <tr key={tx.id} className="border-b border-[#00E5FF]/20 hover:bg-[#0f0f1e]/50 transition-colors">
                          <td className="py-4 px-4">
                            <div className="text-white text-sm">
                              {new Date(tx.created_at).toLocaleDateString('en-US', { 
                                month: 'short', 
                                day: 'numeric', 
                                year: 'numeric' 
                              })}
                              <div className="text-[#b4b4c8] text-xs mt-0.5">
                                {new Date(tx.created_at).toLocaleTimeString('en-US', { 
                                  hour: 'numeric', 
                                  minute: '2-digit' 
                                })}
                              </div>
                            </div>
                          </td>
                          <td className="py-4 px-4">
                            <span className="font-mono text-xs text-[#b4b4c8] bg-[#050510] px-2 py-1 rounded border border-[#00E5FF]/20">
                              {tx.wallet_address.substring(0, 6)}...{tx.wallet_address.substring(tx.wallet_address.length - 6)}
                          </span>
                        </td>
                          <td className="py-4 px-4">
                            <span className="text-white font-bold text-lg">{tx.credits_amount}</span>
                          </td>
                          <td className="py-4 px-4">
                            <span className="text-white font-mono">₿ {formatBTC(tx.bitcoin_amount)}</span>
                          </td>
                          <td className="py-4 px-4">
                            <span className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${getStatusBadge(tx.status)}`}>
                            {tx.status}
                          </span>
                        </td>
                          <td className="py-4 px-4">
                          {tx.payment_txid ? (
                            <a
                              href={`https://mempool.space/tx/${tx.payment_txid}`}
                              target="_blank"
                              rel="noopener noreferrer"
                                className="text-blue-400 hover:text-blue-300 font-mono text-xs hover:underline flex items-center gap-1"
                              title="View on blockchain"
                            >
                                {tx.payment_txid.substring(0, 12)}...
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                            </a>
                          ) : (
                              <span className="text-[#a8a8b8]/80 text-xs" title="No blockchain transaction yet">-</span>
                          )}
                        </td>
                          <td className="py-4 px-4">
                          {tx.payment_txid ? (
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                <span className="text-white text-sm" title="Blockchain confirmations">{tx.confirmations || 0}</span>
                              </div>
                          ) : (
                              <span className="text-[#a8a8b8]/80 text-xs">-</span>
                          )}
                        </td>
                          <td className="py-4 px-4">
                          {tx.credited ? (
                              <div className="flex items-center gap-2">
                                <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <span className="text-green-400 font-semibold" title="Credits awarded">Yes</span>
                              </div>
                          ) : tx.status === 'completed' && tx.payment_txid ? (
                              <div className="flex items-center gap-2">
                                <svg className="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                                <span className="text-orange-400 font-semibold" title="Payment confirmed but credits not awarded yet">No</span>
                              </div>
                          ) : tx.status === 'completed' ? (
                              <span className="text-[#FBBF24] font-semibold text-xs" title="Marked complete but no TXID">No TXID</span>
                          ) : (
                              <span className="text-[#a8a8b8]/80 text-xs">-</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
          </div>
    </div>
  )
}
