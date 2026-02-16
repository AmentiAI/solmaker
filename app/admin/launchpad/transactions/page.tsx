'use client'

import { useState, useEffect } from 'react'
import { useWallet } from '@/lib/wallet/compatibility'
import { useAdminCheck } from '@/lib/auth/use-admin-check'
import Link from 'next/link'

interface Transaction {
  id: string
  collection_id: string
  candy_machine_address: string
  session_id: string | null
  phase_id: string | null
  ordinal_id: string | null
  nft_mint_address: string | null
  metadata_uri: string | null
  minter_wallet: string
  mint_tx_signature: string | null
  mint_price_lamports: number
  platform_fee_lamports: number
  total_paid_lamports: number | null
  mint_status: string
  error_message: string | null
  retry_count: number
  created_at: string
  confirmed_at: string | null
  updated_at: string
  collection_name: string
  phase_name: string | null
}

export default function AdminLaunchpadTransactionsPage() {
  const { isConnected, currentAddress } = useWallet()
  const { isAdmin: isAdminUser } = useAdminCheck(currentAddress || null)

  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(0)
  const [limit] = useState(50)

  // Filters
  const [collectionFilter, setCollectionFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [walletFilter, setWalletFilter] = useState<string>('')
  const [collections, setCollections] = useState<Array<{ id: string; name: string }>>([])

  // Edit modal
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)
  const [editForm, setEditForm] = useState<any>({})

  // Bulk operations
  const [selectedTransactions, setSelectedTransactions] = useState<Set<string>>(new Set())
  const [bulkProcessing, setBulkProcessing] = useState(false)

  useEffect(() => {
    if (isConnected && isAdminUser && currentAddress) {
      loadTransactions()
      loadCollections()
    }
  }, [isConnected, isAdminUser, currentAddress, collectionFilter, statusFilter, walletFilter, page])

  const loadCollections = async () => {
    if (!currentAddress) return
    try {
      const response = await fetch(`/api/admin/mints/launchable-collections?wallet_address=${encodeURIComponent(currentAddress)}`)
      if (response.ok) {
        const data = await response.json()
        setCollections(data.all || [])
      }
    } catch (error) {
      console.error('Error loading collections:', error)
    }
  }

  const loadTransactions = async () => {
    if (!currentAddress) return

    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        wallet_address: currentAddress,
        limit: limit.toString(),
        offset: (page * limit).toString(),
      })

      if (collectionFilter) params.append('collection_id', collectionFilter)
      if (statusFilter) params.append('status', statusFilter)
      if (walletFilter) params.append('minter_wallet', walletFilter)

      const response = await fetch(`/api/admin/launchpad/transactions?${params}`)

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
      setTransactions(data.transactions || [])
      setTotalCount(data.total || 0)
    } catch (err: any) {
      console.error('Error loading transactions:', err)
      setError(err.message || 'Failed to load transactions')
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = (transaction: Transaction) => {
    setEditingTransaction(transaction)
    setEditForm({
      mint_status: transaction.mint_status,
      error_message: transaction.error_message || '',
      confirmed_at: transaction.confirmed_at ? new Date(transaction.confirmed_at).toISOString().slice(0, 16) : '',
    })
  }

  const handleSaveEdit = async () => {
    if (!currentAddress || !editingTransaction) return

    try {
      setProcessing(`edit-${editingTransaction.id}`)

      const updates: any = {}
      if (editForm.mint_status !== editingTransaction.mint_status) {
        updates.mint_status = editForm.mint_status
      }
      if (editForm.error_message !== (editingTransaction.error_message || '')) {
        updates.error_message = editForm.error_message || null
      }
      if (editForm.confirmed_at !== (editingTransaction.confirmed_at ? new Date(editingTransaction.confirmed_at).toISOString().slice(0, 16) : '')) {
        updates.confirmed_at = editForm.confirmed_at || null
      }

      if (Object.keys(updates).length === 0) {
        setEditingTransaction(null)
        return
      }

      const response = await fetch('/api/admin/launchpad/transactions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address: currentAddress,
          transaction_id: editingTransaction.id,
          updates,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update transaction')
      }

      setEditingTransaction(null)
      await loadTransactions()
    } catch (error: any) {
      console.error('Update error:', error)
      alert(`Update failed: ${error.message}`)
    } finally {
      setProcessing(null)
    }
  }

  const handleDelete = async (transactionId: string) => {
    if (!currentAddress) return
    if (!confirm('Are you sure you want to delete this transaction? This cannot be undone.')) return

    try {
      setProcessing(`delete-${transactionId}`)
      const response = await fetch(
        `/api/admin/launchpad/transactions?wallet_address=${encodeURIComponent(currentAddress)}&transaction_id=${transactionId}`,
        { method: 'DELETE' }
      )

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete transaction')
      }

      await loadTransactions()
    } catch (error: any) {
      console.error('Delete error:', error)
      alert(`Delete failed: ${error.message}`)
    } finally {
      setProcessing(null)
    }
  }

  const handleBulkUpdateStatus = async () => {
    if (!currentAddress || selectedTransactions.size === 0) return
    const newStatus = prompt('Enter new status (confirmed, failed, cancelled, pending):')
    if (!newStatus) return

    try {
      setBulkProcessing(true)
      let succeeded = 0
      for (const txId of selectedTransactions) {
        const response = await fetch('/api/admin/launchpad/transactions', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            wallet_address: currentAddress,
            transaction_id: txId,
            updates: { mint_status: newStatus },
          }),
        })
        if (response.ok) succeeded++
      }
      alert(`Updated ${succeeded} of ${selectedTransactions.size} transaction(s)`)
      setSelectedTransactions(new Set())
      await loadTransactions()
    } catch (error: any) {
      alert(`Bulk operation failed: ${error.message}`)
    } finally {
      setBulkProcessing(false)
    }
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '\u2014'
    return new Date(dateString).toLocaleString()
  }

  const formatSol = (lamports: number) => {
    const sol = lamports / 1_000_000_000
    if (sol === 0) return '0'
    return `${sol.toFixed(4)}`
  }

  const explorerUrl = (signature: string) =>
    `https://explorer.solana.com/tx/${signature}?cluster=devnet`

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      confirmed: 'bg-green-500/20 text-green-400 border-green-500/30',
      pending: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
      building: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      awaiting_signature: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      broadcasting: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      confirming: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
      failed: 'bg-red-500/20 text-red-400 border-red-500/30',
      cancelled: 'bg-gray-500/20 text-gray-500 border-gray-500/30',
    }
    return colors[status] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'
  }

  const toggleSelectTransaction = (id: string) => {
    const newSet = new Set(selectedTransactions)
    if (newSet.has(id)) newSet.delete(id)
    else newSet.add(id)
    setSelectedTransactions(newSet)
  }

  const selectAll = () => {
    if (selectedTransactions.size === transactions.length) {
      setSelectedTransactions(new Set())
    } else {
      setSelectedTransactions(new Set(transactions.map(t => t.id)))
    }
  }

  if (!isConnected || !isAdminUser) {
    return (
      <div className="min-h-screen bg-[#050510] p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-[#0f0f1e] border border-[#00E5FF]/20 rounded-lg p-6 text-center">
            <p className="text-[#b4b4c8]">{!isConnected ? 'Please connect your wallet' : 'Admin access only'}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="max-w-[1800px] mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-[#00E5FF] via-[#FFD60A] to-[#00E5FF] bg-clip-text text-transparent">
                Solana Mint Transactions
              </h1>
              <p className="text-[#b4b4c8] mt-1">View and manage all Solana NFT mint transactions</p>
            </div>
            <Link
              href="/admin/launchpad"
              className="px-4 py-2 bg-[#9945FF] hover:bg-[#7C3AED] text-white rounded-lg text-sm font-medium"
            >
              Back to Launchpad Hub
            </Link>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-4 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-[#b4b4c8] mb-1">Collection</label>
              <select
                value={collectionFilter}
                onChange={(e) => { setCollectionFilter(e.target.value); setPage(0) }}
                className="w-full px-3 py-2 bg-[#0f0f1e] border border-[#9945FF]/30 text-white rounded-lg focus:ring-2 focus:ring-[#9945FF] focus:border-[#9945FF]/50"
              >
                <option value="">All Collections</option>
                {collections.map((col) => (
                  <option key={col.id} value={col.id}>{col.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#b4b4c8] mb-1">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setPage(0) }}
                className="w-full px-3 py-2 bg-[#0f0f1e] border border-[#9945FF]/30 text-white rounded-lg focus:ring-2 focus:ring-[#9945FF] focus:border-[#9945FF]/50"
              >
                <option value="">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="building">Building</option>
                <option value="awaiting_signature">Awaiting Signature</option>
                <option value="broadcasting">Broadcasting</option>
                <option value="confirming">Confirming</option>
                <option value="confirmed">Confirmed</option>
                <option value="failed">Failed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#b4b4c8] mb-1">Minter Wallet</label>
              <input
                type="text"
                value={walletFilter}
                onChange={(e) => { setWalletFilter(e.target.value); setPage(0) }}
                placeholder="Filter by wallet..."
                className="w-full px-3 py-2 bg-[#0f0f1e] border border-[#9945FF]/30 text-white rounded-lg font-mono text-sm focus:ring-2 focus:ring-[#9945FF] focus:border-[#9945FF]/50 placeholder:text-white/40"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={loadTransactions}
                className="w-full px-4 py-2 bg-[#9945FF] hover:bg-[#7C3AED] text-white rounded-lg font-medium"
              >
                Refresh
              </button>
            </div>
          </div>

          {/* Stats + Pagination + Bulk */}
          <div className="bg-[#0f0f1e] border border-[#00E5FF]/20 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm text-[#b4b4c8]">
                Showing {transactions.length} of {totalCount} transactions
                {selectedTransactions.size > 0 && (
                  <span className="ml-2 text-[#9945FF] font-medium">
                    ({selectedTransactions.size} selected)
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                  className="px-3 py-1 bg-[#1a1a2e] border border-[#9945FF]/30 hover:border-[#9945FF]/50 text-white rounded text-sm disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="px-3 py-1 text-[#b4b4c8] text-sm">
                  Page {page + 1} of {Math.max(1, Math.ceil(totalCount / limit))}
                </span>
                <button
                  onClick={() => setPage(page + 1)}
                  disabled={(page + 1) * limit >= totalCount}
                  className="px-3 py-1 bg-[#1a1a2e] border border-[#9945FF]/30 hover:border-[#9945FF]/50 text-white rounded text-sm disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
            {selectedTransactions.size > 0 && (
              <div className="flex items-center gap-2 pt-3 border-t border-[#9945FF]/20">
                <span className="text-sm text-[#b4b4c8]">Bulk:</span>
                <button
                  onClick={handleBulkUpdateStatus}
                  disabled={bulkProcessing}
                  className="px-3 py-1 bg-[#9945FF] hover:bg-[#7C3AED] text-white rounded text-sm disabled:opacity-50"
                >
                  Update Status
                </button>
                <button
                  onClick={() => setSelectedTransactions(new Set())}
                  className="px-3 py-1 bg-[#1a1a2e] border border-[#9945FF]/30 text-white rounded text-sm"
                >
                  Clear
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-4 bg-red-900/20 border border-red-500/50 rounded-lg">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div className="bg-[#0f0f1e] border border-[#00E5FF]/20 rounded-lg p-12 text-center">
            <div className="w-16 h-16 border-4 border-[#9945FF] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-[#b4b4c8]">Loading transactions...</p>
          </div>
        ) : transactions.length === 0 ? (
          <div className="bg-[#0f0f1e] border border-[#00E5FF]/20 rounded-lg p-12 text-center">
            <p className="text-[#b4b4c8] text-lg">No transactions found</p>
          </div>
        ) : (
          <div className="bg-[#0f0f1e] border border-[#00E5FF]/20 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-[#0a0a14] border-b border-[#00E5FF]/20">
                  <tr>
                    <th className="px-3 py-3 text-left text-xs font-medium text-[#b4b4c8] uppercase">
                      <input
                        type="checkbox"
                        checked={selectedTransactions.size === transactions.length && transactions.length > 0}
                        onChange={selectAll}
                        className="rounded"
                      />
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-[#b4b4c8] uppercase">Collection</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-[#b4b4c8] uppercase">Status</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-[#b4b4c8] uppercase">Phase</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-[#b4b4c8] uppercase">Minter</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-[#b4b4c8] uppercase">NFT Mint</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-[#b4b4c8] uppercase">Tx Signature</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-[#b4b4c8] uppercase">Price (SOL)</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-[#b4b4c8] uppercase">Fee (SOL)</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-[#b4b4c8] uppercase">Created</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-[#b4b4c8] uppercase">Confirmed</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-[#b4b4c8] uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#00E5FF]/10">
                  {transactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-[#00E5FF]/5">
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          checked={selectedTransactions.has(tx.id)}
                          onChange={() => toggleSelectTransaction(tx.id)}
                          className="rounded"
                        />
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div className="text-xs font-medium text-white">{tx.collection_name}</div>
                        <div className="text-xs text-[#b4b4c8] font-mono">{tx.collection_id.slice(0, 8)}...</div>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full border ${getStatusBadge(tx.mint_status)}`}>
                          {tx.mint_status}
                        </span>
                        {tx.error_message && (
                          <div className="text-xs text-red-400 mt-1 max-w-[150px] truncate" title={tx.error_message}>
                            {tx.error_message}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-xs text-white">
                        {tx.phase_name || <span className="text-[#b4b4c8]">{'\u2014'}</span>}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div className="text-xs font-mono text-[#b4b4c8]">
                          {tx.minter_wallet.slice(0, 6)}...{tx.minter_wallet.slice(-4)}
                        </div>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {tx.nft_mint_address ? (
                          <span className="text-xs font-mono text-[#9945FF]" title={tx.nft_mint_address}>
                            {tx.nft_mint_address.slice(0, 8)}...
                          </span>
                        ) : (
                          <span className="text-xs text-[#b4b4c8]">{'\u2014'}</span>
                        )}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {tx.mint_tx_signature ? (
                          <a
                            href={explorerUrl(tx.mint_tx_signature)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-[#9945FF] hover:text-[#7C3AED] font-mono"
                          >
                            {tx.mint_tx_signature.slice(0, 10)}...
                          </a>
                        ) : (
                          <span className="text-xs text-[#b4b4c8]">{'\u2014'}</span>
                        )}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-xs text-green-400">
                        {formatSol(tx.mint_price_lamports || 0)}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-xs text-[#D4AF37]">
                        {formatSol(tx.platform_fee_lamports || 0)}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-xs text-[#b4b4c8]">
                        {formatDate(tx.created_at)}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-xs text-[#b4b4c8]">
                        {formatDate(tx.confirmed_at)}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          <button
                            onClick={() => handleEdit(tx)}
                            className="px-2 py-1 bg-[#1a1a2e] hover:bg-[#252540] border border-[#9945FF]/30 text-white rounded text-xs"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(tx.id)}
                            disabled={processing === `delete-${tx.id}` || !!processing}
                            className="px-2 py-1 bg-red-600/20 hover:bg-red-600/40 border border-red-500/30 text-red-400 rounded text-xs disabled:opacity-50"
                          >
                            {processing === `delete-${tx.id}` ? '...' : 'Delete'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Edit Modal */}
        {editingTransaction && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-[#0f0f1e] border border-[#9945FF]/30 rounded-lg shadow-xl max-w-lg w-full">
              <div className="p-6">
                <h2 className="text-xl font-bold text-white mb-4">Edit Transaction</h2>
                <div className="text-xs text-[#b4b4c8] font-mono mb-4">{editingTransaction.id}</div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-[#b4b4c8] mb-1">Status</label>
                    <select
                      value={editForm.mint_status}
                      onChange={(e) => setEditForm({ ...editForm, mint_status: e.target.value })}
                      className="w-full px-3 py-2 bg-[#0a0a14] border border-[#9945FF]/30 text-white rounded-lg"
                    >
                      <option value="pending">Pending</option>
                      <option value="building">Building</option>
                      <option value="awaiting_signature">Awaiting Signature</option>
                      <option value="broadcasting">Broadcasting</option>
                      <option value="confirming">Confirming</option>
                      <option value="confirmed">Confirmed</option>
                      <option value="failed">Failed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#b4b4c8] mb-1">Error Message</label>
                    <input
                      type="text"
                      value={editForm.error_message}
                      onChange={(e) => setEditForm({ ...editForm, error_message: e.target.value })}
                      className="w-full px-3 py-2 bg-[#0a0a14] border border-[#9945FF]/30 text-white rounded-lg placeholder:text-white/40"
                      placeholder="Error message (empty to clear)"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#b4b4c8] mb-1">Confirmed At</label>
                    <input
                      type="datetime-local"
                      value={editForm.confirmed_at}
                      onChange={(e) => setEditForm({ ...editForm, confirmed_at: e.target.value })}
                      className="w-full px-3 py-2 bg-[#0a0a14] border border-[#9945FF]/30 text-white rounded-lg"
                    />
                    <p className="text-xs text-[#b4b4c8] mt-1">Leave empty to set NULL</p>
                  </div>
                </div>

                <div className="flex gap-3 mt-6 pt-4 border-t border-[#9945FF]/20">
                  <button
                    onClick={handleSaveEdit}
                    disabled={processing === `edit-${editingTransaction.id}`}
                    className="px-4 py-2 bg-[#9945FF] hover:bg-[#7C3AED] text-white rounded-lg font-medium disabled:opacity-50"
                  >
                    {processing === `edit-${editingTransaction.id}` ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button
                    onClick={() => setEditingTransaction(null)}
                    className="px-4 py-2 bg-[#1a1a2e] border border-[#9945FF]/30 hover:border-[#9945FF]/50 text-white rounded-lg font-medium"
                  >
                    Cancel
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
