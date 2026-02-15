'use client'

import { useState, useEffect } from 'react'
import { useWallet } from '@/lib/wallet/compatibility'
import { useAdminCheck } from '@/lib/auth/use-admin-check'
import Link from 'next/link'
import { toast } from 'sonner'

interface MarketplaceTransaction {
  id: string
  listing_id: string
  collection_id: string
  seller_wallet: string
  buyer_wallet: string
  price_credits: number
  payment_type: 'credits' | 'btc' | 'both'
  btc_amount: string | null
  btc_txid: string | null
  status: string
  created_at: string
  completed_at: string | null
  // Joined data
  collection_name: string
  collection_description: string | null
  art_style: string | null
  ordinal_count: number
  sample_images: string[]
  promo_images: string[]
  listing_title: string
  listing_description: string | null
}

interface PendingPayment {
  id: string
  listing_id: string
  buyer_wallet: string
  seller_wallet: string
  btc_amount: string
  btc_amount_sats: number
  payment_address: string
  payment_txid: string | null
  confirmations: number
  status: string
  created_at: string
  expires_at: string
  // Joined
  collection_name: string
  listing_title: string
}

interface ActiveListing {
  id: string
  collection_id: string
  seller_wallet: string
  price_credits: number
  price_btc: string | null
  payment_type: string
  title: string
  description: string | null
  status: string
  created_at: string
  // Joined
  collection_name: string
  ordinal_count: number
  sample_image: string | null
}

interface MarketplaceSummary {
  total_sales: number
  total_credits_volume: number
  total_btc_volume: number
  active_listings: number
  pending_payments: number
  unique_sellers: number
  unique_buyers: number
}

export default function MarketplaceAdminPage() {
  const { isConnected, currentAddress } = useWallet()
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'sales' | 'pending' | 'listings'>('sales')
  const [transactions, setTransactions] = useState<MarketplaceTransaction[]>([])
  const [pendingPayments, setPendingPayments] = useState<PendingPayment[]>([])
  const [listings, setListings] = useState<ActiveListing[]>([])
  const [summary, setSummary] = useState<MarketplaceSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedTransaction, setSelectedTransaction] = useState<MarketplaceTransaction | null>(null)
  const [cronRunning, setCronRunning] = useState(false)
  const [cronMessage, setCronMessage] = useState<string | null>(null)
  const [editingTxid, setEditingTxid] = useState<string | null>(null)
  const [txidInput, setTxidInput] = useState('')
  const [updatingTxid, setUpdatingTxid] = useState(false)
  const [editingListing, setEditingListing] = useState<ActiveListing | null>(null)
  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    price_credits: 0,
    price_btc: '',
    payment_type: 'btc' as 'credits' | 'btc' | 'both',
    seller_btc_address: '',
  })
  const [savingListing, setSavingListing] = useState(false)
  const [cancellingListing, setCancellingListing] = useState<string | null>(null)

  const { isAdmin: authorized } = useAdminCheck(currentAddress || null)

  useEffect(() => {
    if (authorized && currentAddress) {
      loadData()
    }
  }, [authorized, currentAddress])

  const loadData = async () => {
    if (!currentAddress) return
    
    setLoading(true)
    setError(null)
    try {
      const walletParam = `wallet_address=${encodeURIComponent(currentAddress)}`
      const [salesRes, pendingRes, listingsRes, summaryRes] = await Promise.all([
        fetch(`/api/admin/marketplace/sales?${walletParam}`),
        fetch(`/api/admin/marketplace/pending?${walletParam}`),
        fetch(`/api/admin/marketplace/listings?${walletParam}`),
        fetch(`/api/admin/marketplace/summary?${walletParam}`),
      ])

      if (salesRes.ok) {
        const data = await salesRes.json()
        setTransactions(data.transactions || [])
      }
      if (pendingRes.ok) {
        const data = await pendingRes.json()
        setPendingPayments(data.payments || [])
      }
      if (listingsRes.ok) {
        const data = await listingsRes.json()
        setListings(data.listings || [])
      }
      if (summaryRes.ok) {
        const data = await summaryRes.json()
        setSummary(data)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  const triggerCronJob = async () => {
    setCronRunning(true)
    setCronMessage(null)
    try {
      const response = await fetch('/api/cron/check-marketplace-payments', {
        method: 'POST',
      })
      const data = await response.json()
      
      if (response.ok) {
        setCronMessage(`✅ Cron completed: ${data.completed} payments confirmed, ${data.processed} checked`)
        // Reload data after cron runs
        await loadData()
      } else {
        setCronMessage(`❌ Error: ${data.error || 'Failed to run cron job'}`)
      }
    } catch (err: any) {
      setCronMessage(`❌ Error: ${err.message}`)
    } finally {
      setCronRunning(false)
    }
  }

  const updateTxid = async (paymentId: string) => {
    if (!txidInput.trim() || !currentAddress) return
    
    setUpdatingTxid(true)
    try {
      const response = await fetch(`/api/admin/marketplace/update-txid?wallet_address=${encodeURIComponent(currentAddress)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_id: paymentId, txid: txidInput.trim() }),
      })
      
      const data = await response.json()
      
      if (response.ok) {
        setCronMessage(`✅ Transaction ID updated successfully`)
        setEditingTxid(null)
        setTxidInput('')
        await loadData()
      } else {
        setCronMessage(`❌ Error: ${data.error || 'Failed to update txid'}`)
      }
    } catch (err: any) {
      setCronMessage(`❌ Error: ${err.message}`)
    } finally {
      setUpdatingTxid(false)
    }
  }

  const truncateWallet = (wallet: string) => {
    return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`
  }

  const openEditModal = async (listing: ActiveListing) => {
    setEditingListing(listing)
    
    // Fetch full listing details to get seller_btc_address
    try {
      const response = await fetch(`/api/marketplace/listings/${listing.id}`)
      if (response.ok) {
        const data = await response.json()
        const fullListing = data.listing
        setEditForm({
          title: fullListing.title || listing.title,
          description: fullListing.description || listing.description || '',
          price_credits: fullListing.price_credits || listing.price_credits,
          price_btc: fullListing.price_btc || listing.price_btc || '',
          payment_type: fullListing.payment_type || listing.payment_type as 'credits' | 'btc' | 'both',
          seller_btc_address: fullListing.seller_btc_address || '',
        })
      } else {
        // Fallback to basic listing data
        setEditForm({
          title: listing.title,
          description: listing.description || '',
          price_credits: listing.price_credits,
          price_btc: listing.price_btc || '',
          payment_type: listing.payment_type as 'credits' | 'btc' | 'both',
          seller_btc_address: '',
        })
      }
    } catch (error) {
      console.error('Error fetching listing details:', error)
      // Fallback to basic listing data
      setEditForm({
        title: listing.title,
        description: listing.description || '',
        price_credits: listing.price_credits,
        price_btc: listing.price_btc || '',
        payment_type: listing.payment_type as 'credits' | 'btc' | 'both',
        seller_btc_address: '',
      })
    }
  }

  const closeEditModal = () => {
    setEditingListing(null)
    setEditForm({
      title: '',
      description: '',
      price_credits: 0,
      price_btc: '',
      payment_type: 'btc',
      seller_btc_address: '',
    })
  }

  const handleSaveListing = async () => {
    if (!editingListing || !currentAddress) return

    setSavingListing(true)
    try {
      const response = await fetch(`/api/marketplace/listings/${editingListing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seller_wallet: currentAddress,
          admin_override: true,
          title: editForm.title,
          description: editForm.description || null,
          price_credits: editForm.price_credits,
          price_btc: editForm.price_btc || null,
          payment_type: editForm.payment_type,
          seller_btc_address: editForm.seller_btc_address || null,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        toast.success('Listing updated successfully!')
        closeEditModal()
        await loadData()
      } else {
        toast.error(`Error: ${data.error}`)
      }
    } catch (error) {
      console.error('Error updating listing:', error)
      toast.error('Failed to update listing')
    } finally {
      setSavingListing(false)
    }
  }

  const handleCancelListing = async (listingId: string) => {
    if (!currentAddress) return

    setCancellingListing(listingId)
    try {
      const response = await fetch(`/api/marketplace/listings/${listingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seller_wallet: currentAddress,
          admin_override: true,
          action: 'cancel',
        }),
      })

      const data = await response.json()

      if (response.ok) {
        toast.success('Listing cancelled successfully!')
        await loadData()
      } else {
        toast.error(`Error: ${data.error}`)
      }
    } catch (error) {
      console.error('Error cancelling listing:', error)
      toast.error('Failed to cancel listing')
    } finally {
      setCancellingListing(null)
    }
  }

  const handleRemoveListing = async (listingId: string) => {
    if (!currentAddress) return

    if (!window.confirm('Are you sure you want to remove this listing? This will set the collection status back to draft.')) {
      return
    }

    setCancellingListing(listingId)
    try {
      const response = await fetch(`/api/marketplace/listings/${listingId}?wallet_address=${encodeURIComponent(currentAddress)}`, {
        method: 'DELETE',
      })

      const data = await response.json()

      if (response.ok) {
        toast.success('Listing removed successfully!')
        await loadData()
      } else {
        toast.error(`Error: ${data.error}`)
      }
    } catch (error) {
      console.error('Error removing listing:', error)
      toast.error('Failed to remove listing')
    } finally {
      setCancellingListing(null)
    }
  }

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#050510] via-[#0f0f1e] to-[#15152a] flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-[#00E5FF] to-[#FFD60A] bg-clip-text text-transparent mb-4">Connect Wallet</h1>
          <p className="text-[#b4b4c8] mb-6">Connect your wallet to access admin</p>
        </div>
      </div>
    )
  }

  if (!authorized) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#050510] via-[#0f0f1e] to-[#15152a] flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-[#EF4444] mb-4">Unauthorized</h1>
          <p className="text-[#b4b4c8]">You don't have permission to view this page</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 text-white">
          <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-[#00E5FF] via-[#FFD60A] to-[#00E5FF] bg-clip-text text-transparent">🏪 Marketplace Admin</h1>
            <p className="text-[#b4b4c8] mt-1">View all marketplace sales, pending payments, and listings</p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/admin"
              className="px-4 py-2 bg-gradient-to-br from-[#0f0f1e]/90 to-[#15152a]/90 hover:from-[#15152a] hover:to-[#0f0f1e] rounded-lg text-sm font-medium transition-all border border-[#00E5FF]/20"
            >
              ← Back to Admin
            </Link>
            <button
              onClick={triggerCronJob}
              disabled={cronRunning || loading}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              title="Manually check and confirm pending BTC payments"
            >
              {cronRunning ? '⏳ Checking...' : '⚡ Check Payments Now'}
            </button>
            <button
              onClick={loadData}
              disabled={loading}
              className="px-4 py-2 bg-[#9945FF] hover:bg-[#7C3AED] rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {loading ? 'Loading...' : '🔄 Refresh'}
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-8">
            <div className="bg-[#1a1a24] rounded-lg p-4">
              <div className="text-2xl font-bold text-green-400">{summary.total_sales}</div>
              <div className="text-sm text-[#a8a8b8]">Total Sales</div>
            </div>
            <div className="bg-[#1a1a24] rounded-lg p-4">
              <div className="text-2xl font-bold text-green-400">{summary.total_credits_volume.toFixed(2)}</div>
              <div className="text-sm text-[#a8a8b8]">Credits Volume</div>
            </div>
            <div className="bg-[#1a1a24] rounded-lg p-4">
              <div className="text-2xl font-bold text-orange-400">{summary.total_btc_volume.toFixed(8)}</div>
              <div className="text-sm text-[#a8a8b8]">BTC Volume</div>
            </div>
            <div className="bg-[#1a1a24] rounded-lg p-4">
              <div className="text-2xl font-bold text-blue-400">{summary.active_listings}</div>
              <div className="text-sm text-[#a8a8b8]">Active Listings</div>
            </div>
            <div className="bg-[#1a1a24] rounded-lg p-4">
              <div className="text-2xl font-bold text-[#FBBF24]">{summary.pending_payments}</div>
              <div className="text-sm text-[#a8a8b8]">Pending Payments</div>
            </div>
            <div className="bg-[#1a1a24] rounded-lg p-4">
              <div className="text-2xl font-bold text-purple-400">{summary.unique_sellers}</div>
              <div className="text-sm text-[#a8a8b8]">Unique Sellers</div>
            </div>
            <div className="bg-[#1a1a24] rounded-lg p-4">
              <div className="text-2xl font-bold text-pink-400">{summary.unique_buyers}</div>
              <div className="text-sm text-[#a8a8b8]">Unique Buyers</div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-[#9945FF]/20 pb-4">
          <button
            onClick={() => setActiveTab('sales')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'sales' ? 'bg-gradient-to-r from-[#FFD60A] to-[#00E5FF] text-white shadow-lg shadow-[#FFD60A]/20' : 'bg-gradient-to-br from-[#0f0f1e]/90 to-[#15152a]/90 text-[#b4b4c8] hover:text-white border border-[#00E5FF]/20'
            }`}
          >
            💰 Completed Sales ({transactions.length})
          </button>
          <button
            onClick={() => setActiveTab('pending')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'pending' ? 'bg-gradient-to-r from-[#00E5FF] to-[#FFD60A] text-white shadow-lg shadow-[#00E5FF]/20' : 'bg-gradient-to-br from-[#0f0f1e]/90 to-[#15152a]/90 text-[#b4b4c8] hover:text-white border border-[#00E5FF]/20'
            }`}
          >
            ⏳ Pending Payments ({pendingPayments.length})
          </button>
          <button
            onClick={() => setActiveTab('listings')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'listings' ? 'bg-gradient-to-r from-[#00E5FF] to-[#FFD60A] text-white shadow-lg shadow-[#00E5FF]/20' : 'bg-gradient-to-br from-[#0f0f1e]/90 to-[#15152a]/90 text-[#b4b4c8] hover:text-white border border-[#00E5FF]/20'
            }`}
          >
            📋 Active Listings ({listings.length})
          </button>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-900/50 border border-red-500 rounded-lg text-red-300">
            {error}
          </div>
        )}

        {cronMessage && (
          <div className={`mb-6 p-4 rounded-lg border ${
            cronMessage.startsWith('✅') 
              ? 'bg-green-900/50 border-green-500 text-green-300' 
              : 'bg-red-900/50 border-red-500 text-red-300'
          }`}>
            {cronMessage}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Completed Sales Tab */}
            {activeTab === 'sales' && (
              <div className="space-y-4">
                {transactions.length === 0 ? (
                  <div className="bg-gradient-to-br from-[#0f0f1e]/90 to-[#15152a]/90 border border-[#00E5FF]/20 rounded-lg p-8 text-center">
                    <p className="text-[#a8a8b8]">No completed sales yet</p>
                  </div>
                ) : (
                  transactions.map((tx) => (
                    <div key={tx.id} className="bg-gradient-to-br from-[#0f0f1e]/90 to-[#15152a]/90 border border-[#00E5FF]/20 rounded-lg p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <h3 className="text-lg font-bold text-white">{tx.listing_title || tx.collection_name}</h3>
                          <p className="text-sm text-[#a8a8b8]">{tx.collection_description || 'No description'}</p>
                        </div>
                        <div className="text-right">
                          {tx.payment_type === 'btc' || tx.btc_amount ? (
                            <div className="text-xl font-bold text-orange-400">
                              {parseFloat(tx.btc_amount || '0').toFixed(8)} BTC
                            </div>
                          ) : (
                            <div className="text-xl font-bold text-green-400">
                              {tx.price_credits} Credits
                            </div>
                          )}
                          <span className={`text-xs px-2 py-1 rounded ${
                            tx.status === 'completed' ? 'bg-green-900 text-green-300' :
                            tx.status === 'pending' ? 'bg-yellow-900 text-yellow-300' :
                            'bg-red-900 text-red-300'
                          }`}>
                            {tx.status}
                          </span>
                        </div>
                      </div>

                      {/* Seller → Buyer Flow */}
                      <div className="flex items-center gap-4 mb-4 p-3 bg-[#050510] border border-[#00E5FF]/20 rounded-lg">
                        <div className="flex-1">
                          <div className="text-xs text-[#a8a8b8]/80 mb-1">Seller</div>
                          <div className="font-mono text-sm text-purple-400">{truncateWallet(tx.seller_wallet)}</div>
                        </div>
                        <div className="text-2xl">→</div>
                        <div className="flex-1">
                          <div className="text-xs text-[#a8a8b8]/80 mb-1">Buyer</div>
                          <div className="font-mono text-sm text-pink-400">{truncateWallet(tx.buyer_wallet)}</div>
                        </div>
                      </div>

                      {/* Collection Info */}
                      <div className="grid md:grid-cols-2 gap-4 mb-4">
                        <div>
                          <div className="text-xs text-[#a8a8b8]/80 mb-2">Collection</div>
                          <div className="text-sm text-white">{tx.collection_name}</div>
                          <div className="text-xs text-[#a8a8b8]">{tx.ordinal_count} images • {tx.art_style || 'Unknown style'}</div>
                        </div>
                        <div>
                          <div className="text-xs text-[#a8a8b8]/80 mb-2">Completed</div>
                          <div className="text-sm text-white">
                            {tx.completed_at ? new Date(tx.completed_at).toLocaleString() : 'N/A'}
                          </div>
                        </div>
                      </div>

                      {/* Sample Images */}
                      {tx.sample_images && tx.sample_images.length > 0 && (
                        <div className="mb-4">
                          <div className="text-xs text-[#a8a8b8]/80 mb-2">Sample Images</div>
                          <div className="flex gap-2 overflow-x-auto pb-2">
                            {tx.sample_images.slice(0, 6).map((img, idx) => (
                              <img
                                key={idx}
                                src={img}
                                alt={`Sample ${idx + 1}`}
                                className="w-20 h-20 object-cover rounded-lg border border-[#9945FF]/20"
                              />
                            ))}
                            {tx.sample_images.length > 6 && (
                              <div className="w-20 h-20 bg-[#050510] border border-[#00E5FF]/30 rounded-lg flex items-center justify-center text-sm text-[#b4b4c8]">
                                +{tx.sample_images.length - 6}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Promo Images */}
                      {tx.promo_images && tx.promo_images.length > 0 && (
                        <div className="mb-4">
                          <div className="text-xs text-[#a8a8b8]/80 mb-2">✨ Promotional Images</div>
                          <div className="flex gap-2 overflow-x-auto pb-2">
                            {tx.promo_images.map((img, idx) => (
                              <img
                                key={idx}
                                src={img}
                                alt={`Promo ${idx + 1}`}
                                className="w-24 h-24 object-cover rounded-lg border-2 border-purple-500"
                              />
                            ))}
                          </div>
                        </div>
                      )}

                      {/* BTC Transaction */}
                      {tx.btc_txid && (
                        <div className="p-3 bg-orange-900/30 border border-orange-700 rounded-lg">
                          <div className="text-xs text-orange-400 mb-1">BTC Transaction</div>
                          <a
                            href={`https://mempool.space/tx/${tx.btc_txid}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-xs text-orange-300 hover:text-orange-200 break-all"
                          >
                            {tx.btc_txid}
                          </a>
                        </div>
                      )}

                      {/* View Collection Link */}
                      <div className="mt-4 flex gap-2">
                        <Link
                          href={`/collections/${tx.collection_id}`}
                          className="px-3 py-1 bg-gradient-to-br from-[#0f0f1e]/90 to-[#15152a]/90 hover:from-[#15152a] hover:to-[#0f0f1e] border border-[#00E5FF]/20 rounded text-sm transition-all"
                        >
                          View Collection →
                        </Link>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Pending Payments Tab */}
            {activeTab === 'pending' && (
              <div className="space-y-4">
                {pendingPayments.length === 0 ? (
                  <div className="bg-gradient-to-br from-[#0f0f1e]/90 to-[#15152a]/90 border border-[#00E5FF]/20 rounded-lg p-8 text-center">
                    <p className="text-[#a8a8b8]">No pending payments</p>
                  </div>
                ) : (
                  pendingPayments.map((payment) => (
                    <div key={payment.id} className="bg-[#1a1a24] rounded-lg p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <h3 className="text-lg font-bold text-white">{payment.listing_title || payment.collection_name}</h3>
                          <span className={`text-xs px-2 py-1 rounded ${
                            payment.status === 'pending' ? 'bg-yellow-900 text-yellow-300' :
                            payment.status === 'completed' ? 'bg-green-900 text-green-300' :
                            'bg-red-900 text-red-300'
                          }`}>
                            {payment.status}
                          </span>
                        </div>
                        <div className="text-right">
                          <div className="text-xl font-bold text-orange-400">
                            {parseFloat(payment.btc_amount).toFixed(8)} BTC
                          </div>
                          <div className="text-xs text-[#a8a8b8]">{payment.btc_amount_sats.toLocaleString()} sats</div>
                        </div>
                      </div>

                      <div className="grid md:grid-cols-2 gap-4 mb-4">
                        <div>
                          <div className="text-xs text-[#a8a8b8]/80">Buyer</div>
                          <div className="font-mono text-sm text-pink-400">{truncateWallet(payment.buyer_wallet)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-[#a8a8b8]/80">Seller</div>
                          <div className="font-mono text-sm text-purple-400">{truncateWallet(payment.seller_wallet)}</div>
                        </div>
                      </div>

                      <div className="grid md:grid-cols-3 gap-4 mb-4">
                        <div>
                          <div className="text-xs text-[#a8a8b8]/80">Payment Address</div>
                          <div className="font-mono text-xs text-white break-all">{payment.payment_address}</div>
                        </div>
                        <div>
                          <div className="text-xs text-[#a8a8b8]/80">Confirmations</div>
                          <div className={`text-lg font-bold ${payment.confirmations > 0 ? 'text-green-400' : 'text-[#FBBF24]'}`}>
                            {payment.confirmations}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-[#a8a8b8]/80">Expires</div>
                          <div className="text-sm text-white">{new Date(payment.expires_at).toLocaleString()}</div>
                        </div>
                      </div>

                      {payment.payment_txid ? (
                        <div className="p-3 bg-orange-900/30 border border-orange-700 rounded-lg">
                          <div className="flex items-center justify-between mb-1">
                            <div className="text-xs text-orange-400">Transaction ID</div>
                            <button
                              onClick={() => {
                                setEditingTxid(payment.id)
                                setTxidInput(payment.payment_txid || '')
                              }}
                              className="text-xs text-[#a8a8b8] hover:text-white"
                            >
                              ✏️ Edit
                            </button>
                          </div>
                          {editingTxid === payment.id ? (
                            <div className="flex gap-2 mt-2">
                              <input
                                type="text"
                                value={txidInput}
                                onChange={(e) => setTxidInput(e.target.value)}
                                placeholder="Enter 64-char txid"
                                className="flex-1 px-2 py-1 bg-[#050510] border border-[#00E5FF]/30 rounded text-xs font-mono text-white"
                              />
                              <button
                                onClick={() => updateTxid(payment.id)}
                                disabled={updatingTxid}
                                className="px-2 py-1 bg-green-600 hover:bg-green-700 rounded text-xs disabled:opacity-50"
                              >
                                {updatingTxid ? '...' : '✓'}
                              </button>
                              <button
                                onClick={() => { setEditingTxid(null); setTxidInput('') }}
                                className="px-2 py-1 bg-gradient-to-r from-[#00E5FF] to-[#FFD60A] hover:from-[#7a35cc] hover:to-[#11c97a] rounded text-xs transition-all"
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <a
                              href={`https://mempool.space/tx/${payment.payment_txid}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-mono text-xs text-orange-300 hover:text-orange-200 break-all underline"
                            >
                              {payment.payment_txid}
                            </a>
                          )}
                        </div>
                      ) : (
                        <div className="p-3 bg-yellow-900/30 border border-[#FBBF24]/20 rounded-lg">
                          <div className="text-xs text-[#FBBF24] mb-1">⚠️ No Transaction ID</div>
                          {editingTxid === payment.id ? (
                            <div className="flex gap-2 mt-2">
                              <input
                                type="text"
                                value={txidInput}
                                onChange={(e) => setTxidInput(e.target.value)}
                                placeholder="Enter 64-char txid from mempool"
                                className="flex-1 px-2 py-1 bg-[#050510] border border-[#00E5FF]/30 rounded text-xs font-mono text-white"
                              />
                              <button
                                onClick={() => updateTxid(payment.id)}
                                disabled={updatingTxid}
                                className="px-2 py-1 bg-green-600 hover:bg-green-700 rounded text-xs disabled:opacity-50"
                              >
                                {updatingTxid ? '...' : 'Save'}
                              </button>
                              <button
                                onClick={() => { setEditingTxid(null); setTxidInput('') }}
                                className="px-2 py-1 bg-gradient-to-r from-[#00E5FF] to-[#FFD60A] hover:from-[#7a35cc] hover:to-[#11c97a] rounded text-xs transition-all"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between">
                              <div className="text-xs text-yellow-300">
                                Add txid manually if buyer paid but it wasn't tracked.
                              </div>
                              <button
                                onClick={() => setEditingTxid(payment.id)}
                                className="px-2 py-1 bg-[#FBBF24] hover:bg-[#F59E0B] rounded text-xs font-medium"
                              >
                                + Add TX ID
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Active Listings Tab */}
            {activeTab === 'listings' && (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {listings.length === 0 ? (
                  <div className="col-span-full bg-[#1a1a24] rounded-lg p-8 text-center">
                    <p className="text-[#a8a8b8]">No active listings</p>
                  </div>
                ) : (
                  listings.map((listing) => (
                    <div key={listing.id} className="bg-[#1a1a24] rounded-lg overflow-hidden">
                      {/* Image */}
                      <div className="h-40 bg-[#1a1a24]/80">
                        {listing.sample_image ? (
                          <img
                            src={listing.sample_image}
                            alt={listing.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-4xl">🎨</div>
                        )}
                      </div>
                      
                      <div className="p-4">
                        <h3 className="font-bold text-white mb-1">{listing.title}</h3>
                        <p className="text-xs text-[#a8a8b8] mb-3">{listing.collection_name} • {listing.ordinal_count} images</p>
                        
                        <div className="flex items-center gap-2 mb-3">
                          {(listing.payment_type === 'credits' || listing.payment_type === 'both') && (
                            <span className="px-2 py-1 bg-green-900 text-green-300 text-xs rounded">
                              {listing.price_credits} Credits
                            </span>
                          )}
                          {(listing.payment_type === 'btc' || listing.payment_type === 'both') && listing.price_btc && (
                            <span className="px-2 py-1 bg-orange-900 text-orange-300 text-xs rounded">
                              {parseFloat(listing.price_btc).toFixed(8)} BTC
                            </span>
                          )}
                        </div>

                        <div className="text-xs text-[#a8a8b8]/80">
                          Seller: <span className="font-mono text-[#a8a8b8]">{truncateWallet(listing.seller_wallet)}</span>
                        </div>
                        <div className="text-xs text-[#a8a8b8]/80 mt-1">
                          Listed: {new Date(listing.created_at).toLocaleDateString()}
                        </div>

                        <div className="flex gap-2 mt-3">
                          <Link
                            href={`/marketplace/${listing.id}`}
                            className="flex-1 text-center px-3 py-2 bg-[#9945FF] hover:bg-[#7C3AED] rounded text-sm font-medium transition-colors"
                          >
                            View →
                          </Link>
                          <button
                            onClick={() => openEditModal(listing)}
                            className="px-3 py-2 bg-purple-600 hover:bg-purple-700 rounded text-sm font-medium transition-colors"
                            title="Edit listing"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => handleCancelListing(listing.id)}
                            disabled={cancellingListing === listing.id}
                            className="px-3 py-2 bg-[#FBBF24] hover:bg-[#F59E0B] rounded text-sm font-medium transition-colors disabled:opacity-50"
                            title="Cancel listing"
                          >
                            {cancellingListing === listing.id ? '...' : '🚫'}
                          </button>
                          <button
                            onClick={() => handleRemoveListing(listing.id)}
                            disabled={cancellingListing === listing.id}
                            className="px-3 py-2 bg-red-600 hover:bg-red-700 rounded text-sm font-medium transition-colors disabled:opacity-50"
                            title="Remove listing"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}

        {/* Edit Listing Modal */}
        {editingListing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-gradient-to-br from-[#0f0f1e]/90 to-[#15152a]/90 border border-[#00E5FF]/20 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold text-white">Edit Listing</h2>
                  <button
                    onClick={closeEditModal}
                    className="text-[#a8a8b8] hover:text-white text-2xl leading-none"
                  >
                    ×
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">
                      Title
                    </label>
                    <input
                      type="text"
                      value={editForm.title}
                      onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                      className="w-full px-3 py-2 bg-[#050510] border border-[#00E5FF]/30 rounded-lg text-white focus:ring-2 focus:ring-[#00E5FF] focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white mb-2">
                      Description
                    </label>
                    <textarea
                      value={editForm.description}
                      onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                      rows={4}
                      className="w-full px-3 py-2 bg-[#050510] border border-[#00E5FF]/30 rounded-lg text-white focus:ring-2 focus:ring-[#00E5FF] focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white mb-2">
                      Payment Type
                    </label>
                    <select
                      value={editForm.payment_type}
                      onChange={(e) => setEditForm({ ...editForm, payment_type: e.target.value as 'credits' | 'btc' | 'both' })}
                      className="w-full px-3 py-2 bg-[#050510] border border-[#00E5FF]/30 rounded-lg text-white focus:ring-2 focus:ring-[#00E5FF] focus:border-transparent"
                    >
                      <option value="credits">Credits Only</option>
                      <option value="btc">BTC Only</option>
                      <option value="both">Both Credits & BTC</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-white mb-2">
                        Price (Credits)
                      </label>
                      <input
                        type="number"
                        value={editForm.price_credits}
                        onChange={(e) => setEditForm({ ...editForm, price_credits: parseFloat(e.target.value) || 0 })}
                        min="0"
                        step="0.01"
                        className="w-full px-3 py-2 bg-[#050510] border border-[#00E5FF]/30 rounded-lg text-white focus:ring-2 focus:ring-[#00E5FF] focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-white mb-2">
                        Price (BTC)
                      </label>
                      <input
                        type="text"
                        value={editForm.price_btc}
                        onChange={(e) => setEditForm({ ...editForm, price_btc: e.target.value })}
                        placeholder="0.00000000"
                        className="w-full px-3 py-2 bg-[#050510] border border-[#00E5FF]/30 rounded-lg text-white focus:ring-2 focus:ring-[#00E5FF] focus:border-transparent"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white mb-2">
                      Seller BTC Address (optional)
                    </label>
                    <input
                      type="text"
                      value={editForm.seller_btc_address}
                      onChange={(e) => setEditForm({ ...editForm, seller_btc_address: e.target.value })}
                      placeholder="bc1..."
                      className="w-full px-3 py-2 bg-[#050510] border border-[#00E5FF]/30 rounded-lg text-white focus:ring-2 focus:ring-[#00E5FF] focus:border-transparent"
                    />
                  </div>
                </div>

                <div className="flex gap-3 mt-6">
                  <button
                    onClick={handleSaveListing}
                    disabled={savingListing || !editForm.title.trim()}
                    className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-white font-medium transition-colors disabled:opacity-50"
                  >
                    {savingListing ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button
                    onClick={closeEditModal}
                    disabled={savingListing}
                    className="px-4 py-2 bg-[#1a1a24]/80 hover:bg-gray-600 rounded-lg text-white font-medium transition-colors disabled:opacity-50"
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

