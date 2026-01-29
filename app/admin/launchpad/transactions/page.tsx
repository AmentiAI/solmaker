'use client'

import { useState, useEffect } from 'react'
import { useWallet } from '@/lib/wallet/compatibility'
import { isAdmin } from '@/lib/auth/access-control'
import { AdminSidebar } from '@/components/admin-sidebar'
import Link from 'next/link'

interface Transaction {
  id: string
  ordinal_id: string
  session_id: string
  collection_id: string
  commit_tx_id: string | null
  commit_output_index: number | null
  commit_output_value: number | null
  commit_confirmations: number | null
  commit_confirmed_at: string | null
  commit_last_checked_at: string | null
  reveal_tx_id: string | null
  reveal_confirmations: number | null
  reveal_confirmed_at: string | null
  reveal_last_checked_at: string | null
  inscription_id: string | null
  mint_status: string
  error_message: string | null
  error_code: string | null
  commit_broadcast_at: string | null
  reveal_broadcast_at: string | null
  completed_at: string | null
  created_at: string
  minter_wallet: string
  receiving_wallet: string
  fee_rate: number
  mint_price_paid: number
  collection_name: string
  ordinal_number: number | null
  phase_name: string | null
  mint_quantity: number | null
  creator_payment_verified: boolean | null
  creator_payment_amount: number | null
  creator_payment_wallet: string | null
}

export default function AdminLaunchpadTransactionsPage() {
  const { isConnected, currentAddress } = useWallet()
  const isAdminUser = isAdmin(currentAddress)

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

  // Master check
  const [masterCheckRunning, setMasterCheckRunning] = useState(false)
  const [masterCheckProgress, setMasterCheckProgress] = useState({ current: 0, total: 0 })
  const [masterCheckCancel, setMasterCheckCancel] = useState(false)

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

  const handleCheckTransaction = async (transaction: Transaction, checkType?: 'commit' | 'reveal') => {
    if (!currentAddress) return

    try {
      setProcessing(`check-${transaction.id}`)
      
      const response = await fetch('/api/admin/launchpad/transactions/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address: currentAddress,
          transaction_id: transaction.id,
          check_type: checkType,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to check transaction')
      }

      // Reload transactions to show updated payment status
      await loadTransactions()
    } catch (error: any) {
      console.error('Check error:', error)
      alert(`❌ Check failed: ${error.message}`)
    } finally {
      setProcessing(null)
    }
  }

  const handleEdit = (transaction: Transaction) => {
    setEditingTransaction(transaction)
    setEditForm({
      mint_status: transaction.mint_status,
      commit_confirmations: transaction.commit_confirmations || '',
      reveal_confirmations: transaction.reveal_confirmations || '',
      commit_confirmed_at: transaction.commit_confirmed_at ? new Date(transaction.commit_confirmed_at).toISOString().slice(0, 16) : '',
      reveal_confirmed_at: transaction.reveal_confirmed_at ? new Date(transaction.reveal_confirmed_at).toISOString().slice(0, 16) : '',
      completed_at: transaction.completed_at ? new Date(transaction.completed_at).toISOString().slice(0, 16) : '',
      error_message: transaction.error_message || '',
      error_code: transaction.error_code || '',
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
      if (editForm.commit_confirmations !== '' && editForm.commit_confirmations !== editingTransaction.commit_confirmations) {
        updates.commit_confirmations = parseInt(editForm.commit_confirmations) || null
      }
      if (editForm.reveal_confirmations !== '' && editForm.reveal_confirmations !== editingTransaction.reveal_confirmations) {
        updates.reveal_confirmations = parseInt(editForm.reveal_confirmations) || null
      }
      if (editForm.error_message !== editingTransaction.error_message) {
        updates.error_message = editForm.error_message || null
      }
      if (editForm.error_code !== editingTransaction.error_code) {
        updates.error_code = editForm.error_code || null
      }
      if (editForm.commit_confirmed_at !== (editingTransaction.commit_confirmed_at ? new Date(editingTransaction.commit_confirmed_at).toISOString().slice(0, 16) : '')) {
        updates.commit_confirmed_at = editForm.commit_confirmed_at || null
      }
      if (editForm.reveal_confirmed_at !== (editingTransaction.reveal_confirmed_at ? new Date(editingTransaction.reveal_confirmed_at).toISOString().slice(0, 16) : '')) {
        updates.reveal_confirmed_at = editForm.reveal_confirmed_at || null
      }
      if (editForm.completed_at !== (editingTransaction.completed_at ? new Date(editingTransaction.completed_at).toISOString().slice(0, 16) : '')) {
        updates.completed_at = editForm.completed_at || null
      }

      if (Object.keys(updates).length === 0) {
        alert('No changes to save')
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

      alert('✅ Transaction updated successfully')
      setEditingTransaction(null)
      await loadTransactions()
    } catch (error: any) {
      console.error('Update error:', error)
      alert(`❌ Update failed: ${error.message}`)
    } finally {
      setProcessing(null)
    }
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '—'
    return new Date(dateString).toLocaleString()
  }

  const getStatusBadge = (status: string) => {
    const statusColors: Record<string, string> = {
      completed: 'bg-green-500/20 text-green-400 border border-green-500/30',
      commit_broadcast: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
      commit_confirmed: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
      reveal_broadcast: 'bg-purple-500/20 text-purple-400 border border-purple-500/30',
      reveal_confirmed: 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30',
      failed: 'bg-red-500/20 text-red-400 border border-red-500/30',
      pending: 'bg-gray-500/20 text-gray-400 border border-gray-500/30',
    }
    return statusColors[status] || 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
  }

  const handleBroadcastReveal = async (transaction: Transaction) => {
    if (!currentAddress) return

    if (!transaction.commit_tx_id) {
      alert('❌ Commit transaction is required to broadcast reveal')
      return
    }

    if (!confirm(`Broadcast reveal transaction for ${transaction.collection_name}?\n\nCommit TX: ${transaction.commit_tx_id.slice(0, 16)}...`)) {
      return
    }

    try {
      setProcessing(`reveal-${transaction.id}`)
      
      const response = await fetch('/api/mint/reveal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mint_inscription_id: transaction.id,
          commit_tx_id: transaction.commit_tx_id,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || error.details || 'Failed to broadcast reveal')
      }

      const data = await response.json()
      alert(`✅ Reveal broadcasted successfully!\n\nReveal TX: ${data.reveal_tx_id}\nInscription: ${data.inscription_id}`)
      await loadTransactions()
    } catch (error: any) {
      console.error('Broadcast reveal error:', error)
      alert(`❌ Failed to broadcast reveal: ${error.message}`)
    } finally {
      setProcessing(null)
    }
  }

  const handleFixCommitValue = async (transaction: Transaction) => {
    if (!currentAddress) return

    if (!confirm(`Fix commit_output_value for this transaction?\n\nThis will attempt to recover the value from reveal_data.`)) {
      return
    }

    try {
      setProcessing(`fix-${transaction.id}`)
      
      const response = await fetch('/api/admin/launchpad/transactions/fix-commit-value', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address: currentAddress,
          transaction_id: transaction.id,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to fix commit output value')
      }

      const data = await response.json()
      alert(`✅ Commit output value fixed!\n\nNew value: ${data.commit_output_value} sats`)
      await loadTransactions()
    } catch (error: any) {
      console.error('Fix commit value error:', error)
      alert(`❌ Failed to fix: ${error.message}`)
    } finally {
      setProcessing(null)
    }
  }

  const handleFinalize = async (transaction: Transaction) => {
    if (!currentAddress) return

    if (!transaction.reveal_tx_id) {
      alert('❌ Reveal transaction is required to finalize')
      return
    }

    if (!confirm(`Mark transaction as completed?\n\nReveal TX: ${transaction.reveal_tx_id.slice(0, 16)}...`)) {
      return
    }

    try {
      setProcessing(`finalize-${transaction.id}`)
      
      const response = await fetch('/api/admin/launchpad/transactions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address: currentAddress,
          transaction_id: transaction.id,
          updates: {
            mint_status: 'completed',
            completed_at: new Date().toISOString(),
          },
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to finalize transaction')
      }

      alert('✅ Transaction finalized successfully')
      await loadTransactions()
    } catch (error: any) {
      console.error('Finalize error:', error)
      alert(`❌ Failed to finalize: ${error.message}`)
    } finally {
      setProcessing(null)
    }
  }

  const handleDelete = async (transactionId: string) => {
    if (!currentAddress) return

    if (!confirm('Are you sure you want to delete this transaction? This action cannot be undone.')) {
      return
    }

    try {
      setProcessing(`delete-${transactionId}`)
      const response = await fetch(
        `/api/admin/launchpad/transactions?wallet_address=${encodeURIComponent(currentAddress)}&transaction_id=${transactionId}`,
        {
          method: 'DELETE',
        }
      )

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete transaction')
      }

      alert('✅ Transaction deleted successfully')
      await loadTransactions()
    } catch (error: any) {
      console.error('Delete error:', error)
      alert(`❌ Delete failed: ${error.message}`)
    } finally {
      setProcessing(null)
    }
  }

  const handleBulkOperation = async (operation: 'check' | 'update_status' | 'mark_completed') => {
    if (!currentAddress || selectedTransactions.size === 0) return

    if (operation === 'update_status') {
      const newStatus = prompt('Enter new status (completed, failed, pending, etc.):')
      if (!newStatus) return

      try {
        setBulkProcessing(true)
        const response = await fetch('/api/admin/launchpad/bulk-operations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            wallet_address: currentAddress,
            operation: 'update_status',
            transaction_ids: Array.from(selectedTransactions),
            updates: { mint_status: newStatus },
          }),
        })

        if (!response.ok) throw new Error('Bulk operation failed')
        const data = await response.json()
        alert(`✅ Updated ${data.results.succeeded} transaction(s)`)
        setSelectedTransactions(new Set())
        await loadTransactions()
      } catch (error: any) {
        alert(`❌ Bulk operation failed: ${error.message}`)
      } finally {
        setBulkProcessing(false)
      }
    } else if (operation === 'check') {
      if (!confirm(`Check ${selectedTransactions.size} transaction(s)? This may take a while.`)) return

      try {
        setBulkProcessing(true)
        const response = await fetch('/api/admin/launchpad/bulk-operations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            wallet_address: currentAddress,
            operation: 'check',
            transaction_ids: Array.from(selectedTransactions),
          }),
        })

        if (!response.ok) throw new Error('Bulk check failed')
        const data = await response.json()
        alert(`✅ Checked ${data.results.succeeded} transaction(s)`)
        setSelectedTransactions(new Set())
        await loadTransactions()
      } catch (error: any) {
        alert(`❌ Bulk check failed: ${error.message}`)
      } finally {
        setBulkProcessing(false)
      }
    } else if (operation === 'mark_completed') {
      if (!confirm(`Mark ${selectedTransactions.size} transaction(s) as completed?`)) return

      try {
        setBulkProcessing(true)
        const response = await fetch('/api/admin/launchpad/bulk-operations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            wallet_address: currentAddress,
            operation: 'mark_completed',
            transaction_ids: Array.from(selectedTransactions),
          }),
        })

        if (!response.ok) throw new Error('Bulk operation failed')
        const data = await response.json()
        alert(`✅ Marked ${data.results.succeeded} transaction(s) as completed`)
        setSelectedTransactions(new Set())
        await loadTransactions()
      } catch (error: any) {
        alert(`❌ Bulk operation failed: ${error.message}`)
      } finally {
        setBulkProcessing(false)
      }
    }
  }

  const toggleSelectTransaction = (id: string) => {
    const newSet = new Set(selectedTransactions)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    setSelectedTransactions(newSet)
  }

  const selectAll = () => {
    if (selectedTransactions.size === transactions.length) {
      setSelectedTransactions(new Set())
    } else {
      setSelectedTransactions(new Set(transactions.map(t => t.id)))
    }
  }

  const handleMasterCheck = async () => {
    if (!currentAddress) return

    if (masterCheckRunning) {
      // Cancel if already running
      setMasterCheckCancel(true)
      return
    }

    // First, get the total count to show user
    const countParams = new URLSearchParams({
      wallet_address: currentAddress,
      limit: '1',
      offset: '0',
    })
    
    if (collectionFilter) countParams.append('collection_id', collectionFilter)
    if (statusFilter) countParams.append('status', statusFilter)
    if (walletFilter) countParams.append('minter_wallet', walletFilter)

    const countResponse = await fetch(`/api/admin/launchpad/transactions?${countParams}`)
    if (!countResponse.ok) {
      alert('Failed to fetch transaction count')
      return
    }

    const countData = await countResponse.json()
    const totalCount = countData.total || 0

    if (totalCount === 0) {
      alert('No transactions to check')
      return
    }

    const estimatedTime = Math.ceil(totalCount / 60) // Rough estimate: 1 per second = 60 per minute
    if (!confirm(`This will check ${totalCount} transaction(s) (respecting current filters).\n\nEstimated time: ~${estimatedTime} minute(s).\n\nContinue?`)) {
      return
    }

    setMasterCheckRunning(true)
    setMasterCheckCancel(false)
    setMasterCheckProgress({ current: 0, total: totalCount })

    try {
      // Fetch all transactions in batches
      const batchSize = 1000
      const allTransactions: Transaction[] = []
      let offset = 0

      while (offset < totalCount && !masterCheckCancel) {
        const params = new URLSearchParams({
          wallet_address: currentAddress,
          limit: batchSize.toString(),
          offset: offset.toString(),
        })
        
        if (collectionFilter) params.append('collection_id', collectionFilter)
        if (statusFilter) params.append('status', statusFilter)
        if (walletFilter) params.append('minter_wallet', walletFilter)

        const response = await fetch(`/api/admin/launchpad/transactions?${params}`)
        
        if (!response.ok) {
          throw new Error('Failed to fetch transactions')
        }

        const data = await response.json()
        const batch = data.transactions || []
        allTransactions.push(...batch)

        offset += batchSize

        // If we got fewer than batchSize, we're done
        if (batch.length < batchSize) {
          break
        }
      }

      if (allTransactions.length === 0) {
        alert('No transactions to check')
        setMasterCheckRunning(false)
        return
      }

      setMasterCheckProgress({ current: 0, total: allTransactions.length })

      // Process each transaction with 1 second delay
      for (let i = 0; i < allTransactions.length; i++) {
        if (masterCheckCancel) {
          console.log('Master check cancelled by user')
          break
        }

        const transaction = allTransactions[i]
        
        try {
          await fetch('/api/admin/launchpad/transactions/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              wallet_address: currentAddress,
              transaction_id: transaction.id,
            }),
          })

          setMasterCheckProgress({ current: i + 1, total: allTransactions.length })

          // Wait 1 second before next check (except for the last one)
          if (i < allTransactions.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000))
          }
        } catch (error: any) {
          console.error(`Error checking transaction ${transaction.id}:`, error)
          // Continue with next transaction even if one fails
          setMasterCheckProgress({ current: i + 1, total: allTransactions.length })
          if (i < allTransactions.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000))
          }
        }
      }

      if (!masterCheckCancel) {
        alert(`✅ Master check completed! Checked ${allTransactions.length} transaction(s).`)
        // Reload transactions to show updated status
        await loadTransactions()
      } else {
        alert(`⚠️ Master check cancelled. Checked ${masterCheckProgress.current} of ${allTransactions.length} transaction(s).`)
      }
    } catch (error: any) {
      console.error('Master check error:', error)
      alert(`❌ Master check failed: ${error.message}`)
    } finally {
      setMasterCheckRunning(false)
      setMasterCheckCancel(false)
      setMasterCheckProgress({ current: 0, total: 0 })
    }
  }

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-white rounded-lg shadow p-6 text-center">
            <p className="text-gray-600">Please connect your wallet</p>
          </div>
        </div>
      </div>
    )
  }

  if (!isAdminUser) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-white rounded-lg shadow p-6 text-center">
            <p className="text-red-600 font-semibold">Unauthorized. Admin access only.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-[#0a0e27]">
      <AdminSidebar />
      
      <div className="flex-1 ml-64 p-8">
        <div className="max-w-[1800px] mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-white">Launchpad Transaction Management</h1>
              <p className="text-white/70 mt-1">Manage all launchpad mint transactions - view, check, and edit</p>
            </div>
          </div>

          {/* Master Check Button */}
          <div className="mb-4 cosmic-card border border-[#00d4ff]/30 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-white mb-1">Master Check All Transactions</h3>
                <p className="text-sm text-white/70">
                  Check and update payment status for all transactions (respecting current filters). Processes 1 transaction per second.
                </p>
                {masterCheckRunning && (
                  <div className="mt-3">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-full bg-blue-200 rounded-full h-2.5">
                        <div
                          className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                          style={{
                            width: `${masterCheckProgress.total > 0 ? (masterCheckProgress.current / masterCheckProgress.total) * 100 : 0}%`
                          }}
                        />
                      </div>
                      <span className="text-sm font-medium text-white whitespace-nowrap">
                        {masterCheckProgress.current} / {masterCheckProgress.total}
                      </span>
                    </div>
                    <p className="text-xs text-white/60">
                      Checking transactions... This may take a while.
                    </p>
                  </div>
                )}
              </div>
              <button
                onClick={handleMasterCheck}
                disabled={loading}
                className={`ml-4 px-6 py-3 rounded-lg font-semibold transition-colors ${
                  masterCheckRunning
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {masterCheckRunning ? (
                  <>
                    <span className="mr-2">⏹</span>
                    Cancel Check
                  </>
                ) : (
                  <>
                    <span className="mr-2">🔍</span>
                    Master Check All
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-4 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-white/70 mb-1">Collection</label>
              <select
                value={collectionFilter}
                onChange={(e) => {
                  setCollectionFilter(e.target.value)
                  setPage(0)
                }}
                className="w-full px-3 py-2 cosmic-card border border-[#00d4ff]/30 text-white rounded-lg focus:ring-2 focus:ring-[#00d4ff] focus:border-[#00d4ff]/50"
              >
                <option value="">All Collections</option>
                {collections.map((col) => (
                  <option key={col.id} value={col.id}>
                    {col.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-white/70 mb-1">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value)
                  setPage(0)
                }}
                className="w-full px-3 py-2 cosmic-card border border-[#00d4ff]/30 text-white rounded-lg focus:ring-2 focus:ring-[#00d4ff] focus:border-[#00d4ff]/50"
              >
                <option value="">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="commit_broadcast">Commit Broadcast</option>
                <option value="commit_confirmed">Commit Confirmed</option>
                <option value="reveal_broadcast">Reveal Broadcast</option>
                <option value="reveal_confirmed">Reveal Confirmed</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-white/70 mb-1">Minter Wallet</label>
              <input
                type="text"
                value={walletFilter}
                onChange={(e) => {
                  setWalletFilter(e.target.value)
                  setPage(0)
                }}
                placeholder="Filter by wallet..."
                className="w-full px-3 py-2 cosmic-card border border-[#00d4ff]/30 text-white rounded-lg font-mono text-sm focus:ring-2 focus:ring-[#00d4ff] focus:border-[#00d4ff]/50 placeholder:text-white/40"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={loadTransactions}
                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
              >
                🔄 Refresh
              </button>
            </div>
          </div>

          {/* Stats and Bulk Actions */}
          <div className="cosmic-card border border-[#00d4ff]/30 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm text-white/70">
                Showing {transactions.length} of {totalCount} transactions
                {selectedTransactions.size > 0 && (
                  <span className="ml-2 text-[#00d4ff] font-medium">
                    ({selectedTransactions.size} selected)
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                  className="px-3 py-1 cosmic-card border border-[#00d4ff]/30 hover:border-[#00d4ff]/50 text-white rounded text-sm disabled:opacity-50"
                >
                  ← Previous
                </button>
                <button
                  onClick={() => setPage(page + 1)}
                  disabled={(page + 1) * limit >= totalCount}
                  className="px-3 py-1 cosmic-card border border-[#00d4ff]/30 hover:border-[#00d4ff]/50 text-white rounded text-sm disabled:opacity-50"
                >
                  Next →
                </button>
              </div>
            </div>
            {selectedTransactions.size > 0 && (
              <div className="flex items-center gap-2 pt-3 border-t border-[#00d4ff]/20">
                <span className="text-sm text-white/70">Bulk Actions:</span>
                <button
                  onClick={() => handleBulkOperation('check')}
                  disabled={bulkProcessing}
                  className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm disabled:opacity-50"
                >
                  🔍 Check Selected
                </button>
                <button
                  onClick={() => handleBulkOperation('update_status')}
                  disabled={bulkProcessing}
                  className="px-3 py-1 bg-gray-600 hover:bg-gray-700 text-white rounded text-sm disabled:opacity-50"
                >
                  ✏️ Update Status
                </button>
                <button
                  onClick={() => handleBulkOperation('mark_completed')}
                  disabled={bulkProcessing}
                  className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-sm disabled:opacity-50"
                >
                  ✅ Mark Completed
                </button>
                <button
                  onClick={() => setSelectedTransactions(new Set())}
                  className="px-3 py-1 cosmic-card border border-[#00d4ff]/30 hover:border-[#00d4ff]/50 text-white rounded text-sm"
                >
                  Clear Selection
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-4 cosmic-card border border-red-500/50 rounded-lg">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {/* Loading State */}
        {loading ? (
          <div className="cosmic-card border border-[#00d4ff]/30 rounded-lg shadow p-12 text-center">
            <div className="w-16 h-16 border-4 border-[#00d4ff] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-white/70">Loading transactions...</p>
          </div>
        ) : transactions.length === 0 ? (
          <div className="cosmic-card border border-[#00d4ff]/30 rounded-lg shadow p-12 text-center">
            <p className="text-white/60 text-lg">No transactions found</p>
          </div>
        ) : (
          <div className="cosmic-card border border-[#00d4ff]/30 rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-[#00d4ff]/20 text-sm">
                <thead className="bg-[#0a0e27]/80">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-white/70 uppercase">
                      <input
                        type="checkbox"
                        checked={selectedTransactions.size === transactions.length && transactions.length > 0}
                        onChange={selectAll}
                        className="rounded"
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-white/70 uppercase">Collection</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-white/70 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-white/70 uppercase">Mint Phase</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-white/70 uppercase">Mint Quantity</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-white/70 uppercase">Commit TX</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-white/70 uppercase">Reveal TX</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-white/70 uppercase">Inscription</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-white/70 uppercase">Minter</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-white/70 uppercase">Created</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-white/70 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#00d4ff]/20">
                  {transactions.map((transaction) => (
                    <tr key={transaction.id} className="hover:bg-[#00d4ff]/5">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={selectedTransactions.has(transaction.id)}
                          onChange={() => toggleSelectTransaction(transaction.id)}
                          className="rounded"
                        />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-xs font-medium text-white">{transaction.collection_name}</div>
                        <div className="text-xs text-white/60">{transaction.collection_id.slice(0, 8)}...</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusBadge(transaction.mint_status)}`}>
                          {transaction.mint_status}
                        </span>
                        {transaction.error_message && (
                          <div className="text-xs text-red-400 mt-1" title={transaction.error_message}>
                            ⚠️ {transaction.error_code || 'Error'}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-xs text-white">
                          {transaction.phase_name || <span className="text-white/40">—</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-xs text-white">
                          {transaction.mint_quantity ? `${transaction.mint_quantity}` : <span className="text-white/40">—</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {transaction.commit_tx_id ? (
                          <a
                            href={`https://mempool.space/tx/${transaction.commit_tx_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 hover:text-blue-800 font-mono"
                          >
                            {transaction.commit_tx_id.slice(0, 12)}...
                          </a>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {transaction.reveal_tx_id ? (
                          <a
                            href={`https://mempool.space/tx/${transaction.reveal_tx_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 hover:text-blue-800 font-mono"
                          >
                            {transaction.reveal_tx_id.slice(0, 12)}...
                          </a>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {transaction.inscription_id ? (
                          <a
                            href={`https://ordinals.com/inscription/${transaction.inscription_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 hover:text-blue-800 font-mono"
                          >
                            {transaction.inscription_id.slice(0, 12)}...
                          </a>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-xs font-mono text-white/80">
                          {transaction.minter_wallet.slice(0, 8)}...{transaction.minter_wallet.slice(-6)}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-white/60">
                        {formatDate(transaction.created_at)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {transaction.creator_payment_verified === null ? (
                          <span className="text-xs text-white/40">Not Checked</span>
                        ) : transaction.creator_payment_verified ? (
                          <div className="text-xs">
                            <div className="text-green-400 font-medium">✅ Paid</div>
                            {transaction.creator_payment_amount && (
                              <div className="text-white/60">
                                {(transaction.creator_payment_amount / 100000000).toFixed(8)} BTC
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-xs">
                            <div className="text-red-400 font-medium">❌ Not Paid</div>
                            {transaction.creator_payment_wallet && (
                              <div className="text-white/60 text-xs font-mono">
                                Expected: {transaction.creator_payment_wallet.slice(0, 8)}...
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          <button
                            onClick={() => handleCheckTransaction(transaction)}
                            disabled={processing === `check-${transaction.id}` || !!processing}
                            className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium disabled:opacity-50"
                            title="Check both commit and reveal"
                          >
                            {processing === `check-${transaction.id}` ? '...' : '🔍 Check'}
                          </button>
                          {/* Fix Commit Value button - show when commit_output_value is null */}
                          {transaction.commit_tx_id && (transaction.commit_output_value == null || transaction.commit_output_value === 0) && (
                            <button
                              onClick={() => handleFixCommitValue(transaction)}
                              disabled={processing === `fix-${transaction.id}` || !!processing}
                              className="px-2 py-1 bg-yellow-600 hover:bg-yellow-700 text-white rounded text-xs font-medium disabled:opacity-50"
                              title="Fix missing commit output value from reveal_data"
                            >
                              {processing === `fix-${transaction.id}` ? '...' : '🔧 Fix Value'}
                            </button>
                          )}
                          {/* Broadcast Reveal button - show when commit is broadcast but reveal is not */}
                          {transaction.commit_tx_id && !transaction.reveal_tx_id && (transaction.mint_status === 'commit_broadcast' || transaction.mint_status === 'commit_confirmed') && (
                            <button
                              onClick={() => handleBroadcastReveal(transaction)}
                              disabled={processing === `reveal-${transaction.id}` || !!processing}
                              className="px-2 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs font-medium disabled:opacity-50"
                              title="Broadcast reveal transaction"
                            >
                              {processing === `reveal-${transaction.id}` ? '...' : '📜 Broadcast Reveal'}
                            </button>
                          )}
                          {/* Finalize button - show when reveal is broadcast but not completed */}
                          {transaction.reveal_tx_id && transaction.mint_status === 'reveal_broadcast' && (
                            <button
                              onClick={() => handleFinalize(transaction)}
                              disabled={processing === `finalize-${transaction.id}` || !!processing}
                              className="px-2 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded text-xs font-medium disabled:opacity-50"
                              title="Mark transaction as completed"
                            >
                              {processing === `finalize-${transaction.id}` ? '...' : '✅ Finalize'}
                            </button>
                          )}
                          <button
                            onClick={() => handleEdit(transaction)}
                            className="px-2 py-1 bg-gray-600 hover:bg-gray-700 text-white rounded text-xs font-medium"
                          >
                            ✏️ Edit
                          </button>
                          <button
                            onClick={() => handleDelete(transaction.id)}
                            disabled={processing === `delete-${transaction.id}` || !!processing}
                            className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-medium disabled:opacity-50"
                            title="Delete transaction"
                          >
                            {processing === `delete-${transaction.id}` ? '...' : '🗑️ Delete'}
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
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="cosmic-card border border-[#00d4ff]/30 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <h2 className="text-xl font-bold text-white mb-4">Edit Transaction</h2>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-1">Status</label>
                    <select
                      value={editForm.mint_status}
                      onChange={(e) => setEditForm({ ...editForm, mint_status: e.target.value })}
                      className="w-full px-3 py-2 cosmic-card border border-[#00d4ff]/30 text-white rounded-lg focus:ring-2 focus:ring-[#00d4ff] focus:border-[#00d4ff]/50"
                    >
                      <option value="pending">Pending</option>
                      <option value="commit_broadcast">Commit Broadcast</option>
                      <option value="commit_confirmed">Commit Confirmed</option>
                      <option value="reveal_broadcast">Reveal Broadcast</option>
                      <option value="reveal_confirmed">Reveal Confirmed</option>
                      <option value="completed">Completed</option>
                      <option value="failed">Failed</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-white/70 mb-1">Commit Confirmations</label>
                      <input
                        type="number"
                        value={editForm.commit_confirmations}
                        onChange={(e) => setEditForm({ ...editForm, commit_confirmations: e.target.value })}
                        className="w-full px-3 py-2 cosmic-card border border-[#00d4ff]/30 text-white rounded-lg focus:ring-2 focus:ring-[#00d4ff] focus:border-[#00d4ff]/50 placeholder:text-white/40"
                        placeholder="Leave empty for null"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-white/70 mb-1">Reveal Confirmations</label>
                      <input
                        type="number"
                        value={editForm.reveal_confirmations}
                        onChange={(e) => setEditForm({ ...editForm, reveal_confirmations: e.target.value })}
                        className="w-full px-3 py-2 cosmic-card border border-[#00d4ff]/30 text-white rounded-lg focus:ring-2 focus:ring-[#00d4ff] focus:border-[#00d4ff]/50 placeholder:text-white/40"
                        placeholder="Leave empty for null"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-1">Error Message</label>
                    <input
                      type="text"
                      value={editForm.error_message}
                      onChange={(e) => setEditForm({ ...editForm, error_message: e.target.value })}
                      className="w-full px-3 py-2 cosmic-card border border-[#00d4ff]/30 text-white rounded-lg focus:ring-2 focus:ring-[#00d4ff] focus:border-[#00d4ff]/50 placeholder:text-white/40"
                      placeholder="Error message"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-1">Error Code</label>
                    <input
                      type="text"
                      value={editForm.error_code}
                      onChange={(e) => setEditForm({ ...editForm, error_code: e.target.value })}
                      className="w-full px-3 py-2 cosmic-card border border-[#00d4ff]/30 text-white rounded-lg focus:ring-2 focus:ring-[#00d4ff] focus:border-[#00d4ff]/50 placeholder:text-white/40"
                      placeholder="Error code"
                    />
                  </div>

                  <div className="border-t border-[#00d4ff]/20 pt-4 mt-4">
                    <h3 className="text-sm font-semibold text-white/70 mb-3">Timestamp Fields</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-white/70 mb-1">Commit Confirmed At</label>
                        <input
                          type="datetime-local"
                          value={editForm.commit_confirmed_at}
                          onChange={(e) => setEditForm({ ...editForm, commit_confirmed_at: e.target.value })}
                          className="w-full px-3 py-2 cosmic-card border border-[#00d4ff]/30 text-white rounded-lg focus:ring-2 focus:ring-[#00d4ff] focus:border-[#00d4ff]/50"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-white/70 mb-1">Reveal Confirmed At</label>
                        <input
                          type="datetime-local"
                          value={editForm.reveal_confirmed_at}
                          onChange={(e) => setEditForm({ ...editForm, reveal_confirmed_at: e.target.value })}
                          className="w-full px-3 py-2 cosmic-card border border-[#00d4ff]/30 text-white rounded-lg focus:ring-2 focus:ring-[#00d4ff] focus:border-[#00d4ff]/50"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-white/70 mb-1">Completed At</label>
                        <input
                          type="datetime-local"
                          value={editForm.completed_at}
                          onChange={(e) => setEditForm({ ...editForm, completed_at: e.target.value })}
                          className="w-full px-3 py-2 cosmic-card border border-[#00d4ff]/30 text-white rounded-lg focus:ring-2 focus:ring-[#00d4ff] focus:border-[#00d4ff]/50"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-white/50 mt-2">Leave empty to set to NULL</p>
                  </div>
                </div>

                <div className="flex gap-3 mt-6 pt-4 border-t border-[#00d4ff]/20">
                  <button
                    onClick={handleSaveEdit}
                    disabled={processing === `edit-${editingTransaction.id}`}
                    className="px-4 py-2 btn-cosmic text-white rounded-lg font-medium disabled:opacity-50"
                  >
                    {processing === `edit-${editingTransaction.id}` ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button
                    onClick={() => setEditingTransaction(null)}
                    className="px-4 py-2 cosmic-card border border-[#00d4ff]/30 hover:border-[#00d4ff]/50 text-white rounded-lg font-medium"
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
    </div>
  )
}

