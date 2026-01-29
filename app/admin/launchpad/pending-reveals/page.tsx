'use client'

import { useState, useEffect } from 'react'
import { useWallet } from '@/lib/wallet/compatibility'
import { isAdmin } from '@/lib/auth/access-control'
import { AdminSidebar } from '@/components/admin-sidebar'
import Link from 'next/link'

interface PendingInscription {
  id: string
  ordinal_id: string
  session_id: string
  collection_id: string
  commit_tx_id: string
  commit_output_index: number
  commit_output_value: number
  reveal_tx_id: string | null
  inscription_id: string | null
  mint_status: string
  error_message: string | null
  commit_broadcast_at: string | null
  reveal_broadcast_at: string | null
  completed_at: string | null
  created_at: string
  minter_wallet: string
  receiving_wallet: string
  collection_name: string
  ordinal_number: number | null
}

export default function AdminLaunchpadPendingRevealsPage() {
  const { isConnected, currentAddress } = useWallet()
  const isAdminUser = isAdmin(currentAddress)

  const [inscriptions, setInscriptions] = useState<PendingInscription[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [collectionFilter, setCollectionFilter] = useState<string>('')
  const [collections, setCollections] = useState<Array<{ id: string; name: string }>>([])

  useEffect(() => {
    if (isConnected && isAdminUser && currentAddress) {
      loadPendingReveals()
      loadCollections()
    }
  }, [isConnected, isAdminUser, currentAddress, collectionFilter])

  const loadCollections = async () => {
    if (!currentAddress) return
    try {
      const response = await fetch(`/api/admin/mints/launchable-collections?wallet_address=${encodeURIComponent(currentAddress)}`)
      if (response.ok) {
        const data = await response.json()
        setCollections(data.collections || [])
      }
    } catch (error) {
      console.error('Error loading collections:', error)
    }
  }

  const loadPendingReveals = async () => {
    if (!currentAddress) return

    setLoading(true)
    setError(null)

    try {
      const url = `/api/admin/launchpad/pending-reveals?wallet_address=${encodeURIComponent(currentAddress)}${collectionFilter ? `&collection_id=${collectionFilter}` : ''}`
      const response = await fetch(url)

      if (!response.ok) {
        if (response.status === 403) {
          setError('Unauthorized. Admin access only.')
        } else {
          const errorData = await response.json()
          setError(errorData.error || 'Failed to load pending reveals')
        }
        setLoading(false)
        return
      }

      const data = await response.json()
      setInscriptions(data.inscriptions || [])
    } catch (err: any) {
      console.error('Error loading pending reveals:', err)
      setError(err.message || 'Failed to load pending reveals')
    } finally {
      setLoading(false)
    }
  }

  const handleReveal = async (inscription: PendingInscription) => {
    if (!inscription.commit_tx_id || !inscription.id) {
      alert('Missing commit transaction or inscription ID')
      return
    }

    if (!currentAddress) {
      alert('Please connect your wallet')
      return
    }

    try {
      setProcessing(inscription.id)
      console.log(`Revealing inscription ${inscription.id}...`)

      const revealResponse = await fetch('/api/mint/reveal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mint_inscription_id: inscription.id,
          commit_tx_id: inscription.commit_tx_id,
        }),
      })

      if (!revealResponse.ok) {
        const error = await revealResponse.json()
        throw new Error(error.error || error.details || 'Failed to reveal')
      }

      const revealData = await revealResponse.json()
      alert(`✅ Successfully revealed!\n\nInscription ID: ${revealData.inscription_id}\nReveal TX: ${revealData.reveal_tx_id}`)

      // Reload data
      await loadPendingReveals()
    } catch (error: any) {
      console.error('Reveal error:', error)
      alert(`❌ Reveal failed: ${error.message}`)
    } finally {
      setProcessing(null)
    }
  }

  const handleBatchReveal = async () => {
    if (!currentAddress) {
      alert('Please connect your wallet')
      return
    }

    const pending = inscriptions.filter(insc => !insc.reveal_tx_id)
    if (pending.length === 0) {
      alert('No pending reveals to process')
      return
    }

    if (!confirm(`Reveal ${pending.length} pending inscription(s)?`)) {
      return
    }

    try {
      setProcessing('batch')
      let successCount = 0
      let failCount = 0

      for (const inscription of pending) {
        try {
          console.log(`Revealing ${inscription.id}...`)

          const revealResponse = await fetch('/api/mint/reveal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              mint_inscription_id: inscription.id,
              commit_tx_id: inscription.commit_tx_id,
            }),
          })

          if (revealResponse.ok) {
            successCount++
            console.log(`  ✅ Revealed successfully`)
          } else {
            failCount++
            const error = await revealResponse.json()
            console.error(`  ❌ Failed:`, error)
          }

          // Rate limiting - wait 2 seconds between reveals
          await new Promise(resolve => setTimeout(resolve, 2000))
        } catch (err: any) {
          failCount++
          console.error(`  ❌ Error:`, err)
        }
      }

      alert(`✅ Revealed ${successCount}/${pending.length} inscription(s)${failCount > 0 ? `\n❌ ${failCount} failed` : ''}`)
      await loadPendingReveals()
    } catch (error: any) {
      console.error('Batch reveal error:', error)
      alert(`❌ Batch reveal failed: ${error.message}`)
    } finally {
      setProcessing(null)
    }
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '—'
    return new Date(dateString).toLocaleString()
  }

  const formatSats = (sats: number) => {
    return sats.toLocaleString()
  }

  if (!isConnected) {
    return (
      <div className="flex min-h-screen bg-slate-900">
        <AdminSidebar />
        <div className="flex-1 ml-64 p-8">
          <div className="max-w-7xl mx-auto">
            <div className="bg-slate-800 rounded-lg shadow p-6 text-center">
              <p className="text-gray-300">Please connect your wallet</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!isAdminUser) {
    return (
      <div className="flex min-h-screen bg-slate-900">
        <AdminSidebar />
        <div className="flex-1 ml-64 p-8">
          <div className="max-w-7xl mx-auto">
            <div className="bg-slate-800 rounded-lg shadow p-6 text-center">
              <p className="text-red-400 font-semibold">Unauthorized. Admin access only.</p>
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
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-white">Launchpad Pending Reveals</h1>
              <p className="text-gray-400 mt-1">Manage pending reveal transactions for launchpad mints</p>
            </div>
            <Link
              href="/admin"
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-gray-300 rounded-lg font-medium"
            >
              ← Back to Admin
            </Link>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-4 mb-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-300 mb-1">Filter by Collection</label>
              <select
                value={collectionFilter}
                onChange={(e) => setCollectionFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-700 bg-slate-800 text-white rounded-lg"
              >
                <option value="">All Collections</option>
                {collections.map((col) => (
                  <option key={col.id} value={col.id}>
                    {col.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end gap-2">
              <button
                onClick={loadPendingReveals}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
              >
                🔄 Refresh
              </button>
              {inscriptions.length > 0 && (
                <button
                  onClick={handleBatchReveal}
                  disabled={processing === 'batch'}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium disabled:opacity-50"
                >
                  {processing === 'batch' ? 'Processing...' : `🚀 Reveal All (${inscriptions.length})`}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-4 bg-red-900/20 border border-red-700 rounded-lg">
            <p className="text-red-300">{error}</p>
          </div>
        )}

        {/* Loading State */}
        {loading ? (
          <div className="bg-slate-800 rounded-lg shadow p-12 text-center">
            <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-300">Loading pending reveals...</p>
          </div>
        ) : inscriptions.length === 0 ? (
          <div className="bg-slate-800 rounded-lg shadow p-12 text-center">
            <p className="text-gray-300 text-lg">✅ No pending reveals!</p>
            <p className="text-gray-400 text-sm mt-2">All launchpad mints have been revealed.</p>
          </div>
        ) : (
          <div className="bg-slate-800 rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-700">
                <thead className="bg-slate-900">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Collection</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Ordinal #</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Minter</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Commit TX</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Commit Time</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody className="bg-slate-800 divide-y divide-gray-700">
                  {inscriptions.map((inscription) => (
                    <tr key={inscription.id} className="hover:bg-slate-700/50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-white">{inscription.collection_name}</div>
                        <div className="text-xs text-gray-400">{inscription.collection_id.slice(0, 8)}...</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-white">
                          {inscription.ordinal_number !== null ? `#${inscription.ordinal_number}` : '—'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-white font-mono">
                          {inscription.minter_wallet.slice(0, 8)}...{inscription.minter_wallet.slice(-6)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <a
                          href={`https://mempool.space/tx/${inscription.commit_tx_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-600 hover:text-blue-800 font-mono"
                        >
                          {inscription.commit_tx_id.slice(0, 12)}...
                        </a>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                          inscription.mint_status === 'commit_broadcast' ? 'bg-yellow-100 text-yellow-800' :
                          inscription.mint_status === 'failed' ? 'bg-red-100 text-red-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {inscription.mint_status}
                        </span>
                        {inscription.error_message && (
                          <div className="text-xs text-red-600 mt-1" title={inscription.error_message}>
                            {inscription.error_message.slice(0, 50)}...
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                        {formatDate(inscription.commit_broadcast_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <button
                          onClick={() => handleReveal(inscription)}
                          disabled={processing === inscription.id || !!processing}
                          className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {processing === inscription.id ? 'Processing...' : '🚀 Reveal'}
                        </button>
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
    </div>
  )
}

