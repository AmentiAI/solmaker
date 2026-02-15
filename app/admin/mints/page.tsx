'use client'

import { useState, useEffect, useCallback } from 'react'
import { useWallet } from '@/lib/wallet/compatibility'
import { useAdminCheck } from '@/lib/auth/use-admin-check'
import { WalletConnect } from '@/components/wallet-connect'
import Link from 'next/link'

// Type definitions
interface MintStats {
  launches: {
    total: number
    active: number
    draft: number
    completed: number
  }
  inscriptions: {
    total: number
    completed: number
    pending: number
    failed: number
    stuck: number
    test: number
    flagged: number
  }
  revenue: {
    total_sats: number
    fees_spent: number
  }
  unique_minters: number
}

interface Launch {
  id: string
  collection_id: string
  collection_name: string
  launch_name: string
  mint_price_sats: number
  total_supply: number
  minted_count: number
  launch_status: string
  scheduled_start: string | null
  actual_start: string | null
  total_revenue_sats: number
  unique_minters: number
}

interface Inscription {
  id: string
  minter_wallet: string
  receiving_wallet: string
  mint_status: string
  commit_tx_id: string | null
  reveal_tx_id: string | null
  inscription_id: string | null
  fee_rate: number
  total_cost_sats: number
  is_test_mint: boolean
  is_admin_mint: boolean
  flagged_for_review: boolean
  error_message: string | null
  created_at: string
  completed_at: string | null
  collection_name: string
  launch_name: string | null
}

interface StuckTransaction {
  id: string
  tx_type: string
  tx_id: string
  detected_at: string
  stuck_duration_minutes: number
  current_fee_rate: number
  recommended_fee_rate: number
  resolution_status: string
  minter_wallet: string
  total_cost_sats: number
  collection_name: string
}

interface LaunchableCollection {
  id: string
  name: string
  description: string
  is_locked: boolean
  total_ordinals: number
  minted_ordinals: number
  active_launch_id: string | null
  launch_status: string | null
  owner_wallet: string
}

interface TestMintRecord {
  id: string
  collection_id: string
  ordinal_id: string
  minter_wallet: string
  receiving_wallet: string
  mint_status: string
  commit_tx_id: string | null
  commit_broadcast_at: string | null
  commit_confirmed_at: string | null
  reveal_tx_id: string | null
  reveal_hex: string | null
  reveal_broadcast_at: string | null
  inscription_id: string | null
  inscription_address: string | null
  fee_rate: number
  total_cost_sats: number
  content_size_bytes: number
  error_message: string | null
  created_at: string
  completed_at: string | null
  collection_name: string
  ordinal_number: number | null
  thumbnail_url: string | null
}

export default function AdminMintsPage() {
  const { isConnected, currentAddress, paymentAddress, paymentPublicKey, signPsbt } = useWallet()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<MintStats | null>(null)
  const [launches, setLaunches] = useState<Launch[]>([])
  const [inscriptions, setInscriptions] = useState<Inscription[]>([])
  const [stuckTransactions, setStuckTransactions] = useState<StuckTransaction[]>([])
  const [collections, setCollections] = useState<LaunchableCollection[]>([])
  const [activeTab, setActiveTab] = useState<'overview' | 'launches' | 'inscriptions' | 'stuck' | 'collections' | 'test-mint'>('overview')
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  // Filter states
  const [statusFilter, setStatusFilter] = useState('')
  const [testMintFilter, setTestMintFilter] = useState(false)
  const [flaggedFilter, setFlaggedFilter] = useState(false)

  // Test mint states
  const [testMintCollectionId, setTestMintCollectionId] = useState('')
  const [testMintReceivingAddress, setTestMintReceivingAddress] = useState('')
  const [testMintFeeRate, setTestMintFeeRate] = useState('1')
  const [testMintResult, setTestMintResult] = useState<any>(null)
  const [testMintLoading, setTestMintLoading] = useState(false)
  const [testMintHistory, setTestMintHistory] = useState<TestMintRecord[]>([])
  const [testMintHistoryLoading, setTestMintHistoryLoading] = useState(false)
  const [testMintHistoryPage, setTestMintHistoryPage] = useState(1)
  const [testMintHistoryTotalPages, setTestMintHistoryTotalPages] = useState(1)
  const [testMintHistoryTotal, setTestMintHistoryTotal] = useState(0)
  const [testMintHistoryStatus, setTestMintHistoryStatus] = useState<string>('') // Filter by status
  const [testMintHistorySortBy, setTestMintHistorySortBy] = useState<string>('created_at')
  const [testMintHistorySortOrder, setTestMintHistorySortOrder] = useState<string>('desc')
  const [testMintDryRun, setTestMintDryRun] = useState(true) // Toggle for dry run mode
  const [testMintStep, setTestMintStep] = useState<'create' | 'sign' | 'commit' | 'reveal' | 'done'>('create')
  const [pendingPsbt, setPendingPsbt] = useState<string | null>(null)
  const [pendingTestMintId, setPendingTestMintId] = useState<string | null>(null)

  // Create launch states
  const [createLaunchOpen, setCreateLaunchOpen] = useState(false)
  const [selectedCollection, setSelectedCollection] = useState<LaunchableCollection | null>(null)
  const [launchName, setLaunchName] = useState('')
  const [mintPrice, setMintPrice] = useState('0')
  const [creatorWallet, setCreatorWallet] = useState('')

  const { isAdmin: authorized } = useAdminCheck(currentAddress || null)

  const loadDashboardData = useCallback(async () => {
    if (!currentAddress) return

    setLoading(true)
    setError(null)

    try {
      // Load main dashboard data
      const response = await fetch(`/api/admin/mints?wallet_address=${encodeURIComponent(currentAddress)}`)
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to load dashboard')
      }

      const data = await response.json()
      setStats(data.stats)
      setInscriptions(data.recent_inscriptions || [])
      setStuckTransactions(data.stuck_transactions || [])
      setLaunches(data.active_launches || [])

      // Load launchable collections
      const collectionsResponse = await fetch(`/api/admin/mints/launchable-collections?wallet_address=${encodeURIComponent(currentAddress)}`)
      if (collectionsResponse.ok) {
        const collectionsData = await collectionsResponse.json()
        // API returns collections under 'all' key
        setCollections(collectionsData.all || [])
      }
    } catch (err) {
      console.error('Error loading dashboard:', err)
      setError(err instanceof Error ? err.message : 'Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }, [currentAddress])

  const loadAllLaunches = useCallback(async () => {
    if (!currentAddress) return

    try {
      const response = await fetch(`/api/admin/mints/launches?wallet_address=${encodeURIComponent(currentAddress)}`)
      if (response.ok) {
        const data = await response.json()
        setLaunches(data.launches || [])
      }
    } catch (err) {
      console.error('Error loading launches:', err)
    }
  }, [currentAddress])

  useEffect(() => {
    if (isConnected && authorized) {
      loadDashboardData()
    }
  }, [isConnected, authorized, loadDashboardData])

  // Load all launches when switching to launches tab
  useEffect(() => {
    if (activeTab === 'launches' && isConnected && authorized && currentAddress) {
      loadAllLaunches()
    }
  }, [activeTab, isConnected, authorized, currentAddress, loadAllLaunches])

  const handleRefresh = async () => {
    setRefreshing(true)
    await loadDashboardData()
    if (activeTab === 'launches') {
      await loadAllLaunches()
    }
    setRefreshing(false)
  }

  const loadFilteredInscriptions = async () => {
    if (!currentAddress) return

    try {
      const params = new URLSearchParams({
        wallet_address: currentAddress,
      })
      if (statusFilter) params.append('status', statusFilter)
      if (testMintFilter) params.append('is_test', 'true')
      if (flaggedFilter) params.append('is_flagged', 'true')

      const response = await fetch(`/api/admin/mints/inscriptions?${params}`)
      if (response.ok) {
        const data = await response.json()
        setInscriptions(data.inscriptions || [])
      }
    } catch (err) {
      console.error('Error loading inscriptions:', err)
    }
  }

  const loadTestMintHistory = useCallback(async (page = testMintHistoryPage) => {
    if (!currentAddress) return

    setTestMintHistoryLoading(true)
    try {
      const params = new URLSearchParams({
        wallet_address: currentAddress,
        page: page.toString(),
        limit: '10',
        sort_by: testMintHistorySortBy,
        sort_order: testMintHistorySortOrder,
      })
      if (testMintHistoryStatus) {
        params.set('status', testMintHistoryStatus)
      }
      
      const response = await fetch(`/api/admin/mints/test-mint?${params.toString()}`)
      if (response.ok) {
        const data = await response.json()
        setTestMintHistory(data.test_mints || [])
        setTestMintHistoryPage(data.pagination?.page || 1)
        setTestMintHistoryTotalPages(data.pagination?.total_pages || 1)
        setTestMintHistoryTotal(data.pagination?.total_count || 0)
      }
    } catch (err) {
      console.error('Error loading test mint history:', err)
    } finally {
      setTestMintHistoryLoading(false)
    }
  }, [currentAddress, testMintHistoryPage, testMintHistorySortBy, testMintHistorySortOrder, testMintHistoryStatus])

  // Load test mint history when tab changes to test-mint or filters change
  useEffect(() => {
    if (activeTab === 'test-mint' && isConnected && authorized && currentAddress) {
      loadTestMintHistory(1) // Reset to page 1 when filters change
    }
  }, [activeTab, isConnected, authorized, currentAddress, testMintHistorySortBy, testMintHistorySortOrder, testMintHistoryStatus])
  
  // Also reload when page changes (without resetting to page 1)
  useEffect(() => {
    if (activeTab === 'test-mint' && isConnected && authorized && currentAddress && testMintHistoryPage > 0) {
      loadTestMintHistory(testMintHistoryPage)
    }
  }, [testMintHistoryPage])

  const handleDetectStuck = async () => {
    if (!currentAddress) return

    try {
      const response = await fetch(`/api/admin/mints/stuck?wallet_address=${encodeURIComponent(currentAddress)}&detect=true`)
      if (response.ok) {
        const data = await response.json()
        setStuckTransactions(data.stuck_transactions || [])
        if (data.newly_detected?.length > 0) {
          alert(`Detected ${data.newly_detected.length} new stuck transactions`)
        }
      }
    } catch (err) {
      console.error('Error detecting stuck:', err)
    }
  }

  const handleStuckAction = async (stuckTxId: string, action: string) => {
    if (!currentAddress) return

    try {
      const response = await fetch('/api/admin/mints/stuck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admin_wallet: currentAddress,
          stuck_tx_id: stuckTxId,
          action,
        }),
      })

      if (response.ok) {
        handleRefresh()
      }
    } catch (err) {
      console.error('Error handling stuck tx:', err)
    }
  }


  const handleCreateLaunch = async () => {
    if (!currentAddress || !selectedCollection) return

    try {
      const response = await fetch('/api/admin/mints/launches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admin_wallet: currentAddress,
          collection_id: selectedCollection.id,
          launch_name: launchName || `${selectedCollection.name} Launch`,
          mint_price_sats: parseInt(mintPrice) || 0,
          creator_wallet: creatorWallet || currentAddress,
        }),
      })

      if (response.ok) {
        setCreateLaunchOpen(false)
        setSelectedCollection(null)
        setLaunchName('')
        setMintPrice('0')
        handleRefresh()
      } else {
        const errorData = await response.json()
        alert(errorData.error || 'Failed to create launch')
      }
    } catch (err) {
      console.error('Error creating launch:', err)
    }
  }

  const handleUpdateLaunchStatus = async (launchId: string, newStatus: string) => {
    if (!currentAddress) return

    try {
      const response = await fetch(`/api/admin/mints/launches/${launchId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admin_wallet: currentAddress,
          launch_status: newStatus,
        }),
      })

      if (response.ok) {
        handleRefresh()
      } else {
        const errorData = await response.json()
        alert(errorData.error || 'Failed to update launch')
      }
    } catch (err) {
      console.error('Error updating launch:', err)
    }
  }

  const handleTestMint = async () => {
    if (!currentAddress) return

    setTestMintLoading(true)
    setTestMintResult(null)
    setTestMintStep('create')

    try {
      const requestBody = {
        admin_wallet: currentAddress,
        collection_id: testMintCollectionId,
        receiving_address: testMintReceivingAddress || currentAddress,
        payment_address: paymentAddress || currentAddress,
        payment_pubkey: paymentPublicKey,
        fee_rate: parseFloat(testMintFeeRate) || 1,
        dry_run: testMintDryRun,
      }
      console.log('🔍 Sending test mint request:', { ...requestBody, dry_run: testMintDryRun })
      
      const response = await fetch('/api/admin/mints/test-mint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      const data = await response.json()
      setTestMintResult(data)

      // If not dry run and we got a PSBT, prompt for signing
      if (!testMintDryRun && data.commit_psbt?.base64) {
        console.log('🔥 PSBT received, switching to SIGN step')
        console.log('   PSBT length:', data.commit_psbt.base64.length)
        console.log('   Test mint ID:', data.test_mint_id)
        setPendingPsbt(data.commit_psbt.base64)
        setPendingTestMintId(data.test_mint_id)
        setTestMintStep('sign')
      } else if (!testMintDryRun) {
        console.warn('⚠️ Live mode but no PSBT returned:', { 
          dry_run: testMintDryRun,
          has_commit_psbt: !!data.commit_psbt,
          has_base64: !!data.commit_psbt?.base64 
        })
      }
    } catch (err) {
      console.error('Error creating test mint:', err)
      setTestMintResult({ error: 'Failed to create test mint' })
    } finally {
      setTestMintLoading(false)
    }
  }

  const handleSignAndBroadcastCommit = async () => {
    if (!pendingPsbt || !pendingTestMintId || !currentAddress) return

    setTestMintLoading(true)
    setTestMintStep('commit')

    try {
      // Sign PSBT with wallet - autoFinalize=true, broadcast=false
      console.log('🔏 Requesting wallet signature...')
      console.log('   PSBT (first 100 chars):', pendingPsbt.substring(0, 100))
      
      const signedResult = await signPsbt(pendingPsbt, true, false)
      console.log('✅ Wallet signed, result type:', typeof signedResult)
      console.log('   Result:', signedResult)

      // Handle different wallet return formats
      let signedPsbtBase64: string | undefined
      let signedPsbtHex: string | undefined  
      let txHex: string | undefined

      if (typeof signedResult === 'string') {
        // Some wallets return just the signed PSBT string
        signedPsbtBase64 = signedResult
        console.log('   Got string result (signed PSBT base64)')
      } else if (signedResult && typeof signedResult === 'object') {
        // LaserEyes returns an object
        signedPsbtBase64 = signedResult.signedPsbtBase64 || signedResult.psbt
        signedPsbtHex = signedResult.signedPsbtHex || signedResult.hex
        txHex = signedResult.txHex || signedResult.tx
        console.log('   Got object result:', { 
          hasBase64: !!signedPsbtBase64, 
          hasHex: !!signedPsbtHex, 
          hasTxHex: !!txHex 
        })
      }

      if (!signedPsbtBase64 && !signedPsbtHex && !txHex) {
        throw new Error('Wallet did not return signed PSBT or transaction')
      }

      // Send to commit endpoint
      const response = await fetch('/api/admin/mints/test-mint/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admin_wallet: currentAddress,
          test_mint_id: pendingTestMintId,
          signed_psbt_base64: signedPsbtBase64,
          signed_psbt_hex: signedPsbtHex,
          tx_hex: txHex,
        }),
      })

      const data = await response.json()
      
      if (data.success) {
        setTestMintResult((prev: any) => ({
          ...prev,
          commit_tx_id: data.commit_tx_id,
          commit_status: 'broadcast',
        }))
        // Move to reveal step after short delay
        setTimeout(() => setTestMintStep('reveal'), 1000)
      } else {
        setTestMintResult((prev: any) => ({
          ...prev,
          commit_error: data.error || data.details,
        }))
      }
    } catch (err: any) {
      console.error('Error signing/broadcasting commit:', err)
      setTestMintResult((prev: any) => ({
        ...prev,
        commit_error: err.message || 'Failed to sign commit',
      }))
    } finally {
      setTestMintLoading(false)
    }
  }

  const handleCreateReveal = async () => {
    if (!pendingTestMintId || !currentAddress) return

    setTestMintLoading(true)

    try {
      const response = await fetch('/api/admin/mints/test-mint/reveal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admin_wallet: currentAddress,
          test_mint_id: pendingTestMintId,
          auto_broadcast: true,
        }),
      })

      const data = await response.json()
      
      if (data.success) {
        setTestMintResult((prev: any) => ({
          ...prev,
          reveal_tx_id: data.reveal_tx_id,
          inscription_id: data.inscription_id,
          mempool_link: data.mempool_link,
          ordinals_link: data.ordinals_link,
          reveal_error: null, // Clear any previous error
        }))
        setTestMintStep('done')
        // Refresh history
        loadTestMintHistory()
      } else {
        setTestMintResult((prev: any) => ({
          ...prev,
          reveal_error: data.error || data.details,
        }))
      }
    } catch (err: any) {
      console.error('Error creating reveal:', err)
      setTestMintResult((prev: any) => ({
        ...prev,
        reveal_error: err.message || 'Failed to create reveal',
      }))
    } finally {
      setTestMintLoading(false)
    }
  }

  const resetTestMint = () => {
    setTestMintResult(null)
    setPendingPsbt(null)
    setPendingTestMintId(null)
    setTestMintStep('create')
  }

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return '—'
    return new Date(dateString).toLocaleString()
  }

  const formatSats = (sats: number | null | undefined) => {
    if (sats === null || sats === undefined) return '0'
    return sats.toLocaleString()
  }

  const getStatusBadge = (status: string) => {
    const statusColors: Record<string, string> = {
      completed: 'bg-green-900/30 border-green-700 text-green-300',
      pending: 'bg-yellow-900/30 border-[#FBBF24]/20 text-yellow-300',
      failed: 'bg-red-900/30 border-[#EF4444]/20 text-red-300',
      stuck: 'bg-orange-900/30 border-orange-700 text-orange-300',
      active: 'bg-blue-900/30 border-blue-700 text-blue-300',
      draft: 'bg-[#14141e]/30 border-[#9945FF]/20 text-white',
      scheduled: 'bg-purple-900/30 border-purple-700 text-purple-300',
      paused: 'bg-yellow-900/30 border-[#FBBF24]/20 text-yellow-300',
      cancelled: 'bg-red-900/30 border-[#EF4444]/20 text-red-300',
    }
    return statusColors[status] || 'bg-[#14141e]/30 border-[#9945FF]/20 text-white'
  }

  const truncateAddress = (address: string) => {
    if (!address) return ''
    return `${address.substring(0, 8)}...${address.substring(address.length - 6)}`
  }

  if (!isConnected) {
    return (
      <div className="container mx-auto px-6 py-12 bg-gradient-to-br from-[#050510] via-[#0f0f1e] to-[#15152a] min-h-screen">
        <div className="max-w-7xl mx-auto">
          <div className="bg-gradient-to-br from-[#0f0f1e]/90 to-[#15152a]/90 border border-[#00E5FF]/20 rounded-xl p-8 text-center shadow-xl backdrop-blur-sm">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-[#00E5FF] to-[#FFD60A] bg-clip-text text-transparent mb-4">Mint Admin Dashboard</h1>
            <p className="text-[#b4b4c8] mb-6">Please connect your wallet to access the mint administration.</p>
            <div className="flex justify-center mb-4">
              <WalletConnect />
            </div>
            <Link href="/admin" className="text-[#00E5FF] hover:text-[#FFD60A] transition-colors">
              ← Back to Admin
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (!authorized) {
    return (
      <div className="container mx-auto px-6 py-12 bg-gradient-to-br from-[#050510] via-[#0f0f1e] to-[#15152a] min-h-screen">
        <div className="max-w-7xl mx-auto">
          <div className="bg-gradient-to-br from-red-900/20 to-red-800/10 border border-[#EF4444]/20/50 rounded-xl p-8 text-center shadow-xl backdrop-blur-sm">
            <h1 className="text-3xl font-bold text-[#EF4444] mb-4">Access Denied</h1>
            <p className="text-white mb-4">This page is restricted to admin accounts only.</p>
            <Link href="/" className="text-[#00E5FF] hover:text-[#FFD60A] transition-colors">
              ← Back to Home
            </Link>
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
                  🔥 Mint Admin
                </h1>
                <p className="text-[#b4b4c8] text-lg">Manage collection launches, monitor mints, and handle stuck transactions</p>
              </div>
              <div className="flex gap-3">
                <Link
                  href="/admin"
                  className="px-4 py-2 bg-gradient-to-br from-[#0f0f1e]/90 to-[#15152a]/90 hover:from-[#15152a] hover:to-[#0f0f1e] text-white rounded-lg transition-all border border-[#00E5FF]/20"
                >
                  ← Admin Home
                </Link>
                <Link
                  href="/admin/launchpad"
                  className="px-4 py-2 bg-gradient-to-r from-[#00E5FF] to-[#FFD60A] hover:from-[#7a35cc] hover:to-[#11c97a] text-white rounded-lg transition-all font-medium shadow-lg shadow-[#00E5FF]/20"
                >
                  🚀 Launchpad Mgmt
                </Link>
                <button
                  onClick={handleRefresh}
                  disabled={refreshing}
                  className="px-6 py-3 bg-gradient-to-r from-[#00E5FF] to-[#FFD60A] hover:from-[#7a35cc] hover:to-[#11c97a] text-white rounded-xl font-semibold shadow-lg shadow-[#00E5FF]/20 transition-all duration-200 disabled:opacity-50 flex items-center gap-2"
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

            {/* Tabs */}
            <div className="flex flex-wrap gap-2 mb-6">
              {[
                { id: 'overview', label: '📊 Overview' },
                { id: 'launches', label: '🚀 Launches' },
                { id: 'inscriptions', label: '📜 Inscriptions' },
                { id: 'stuck', label: '⚠️ Stuck Txs' },
                { id: 'collections', label: '📁 Collections' },
                { id: 'test-mint', label: '🧪 Test Mint' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`px-6 py-3 rounded-xl font-semibold transition-all duration-200 ${
                    activeTab === tab.id
                      ? 'bg-gradient-to-r from-[#00E5FF] to-[#FFD60A] text-white shadow-lg shadow-[#00E5FF]/30'
                      : 'bg-gradient-to-br from-[#0f0f1e]/90 to-[#15152a]/90 text-[#b4b4c8] hover:text-white border border-[#00E5FF]/20'
                  }`}
                >
                  {tab.label}
                  {tab.id === 'stuck' && stats?.inscriptions.stuck ? (
                    <span className="ml-2 px-2 py-0.5 bg-red-600 text-white text-xs rounded-full">
                      {stats.inscriptions.stuck}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#00E5FF] mx-auto mb-4"></div>
              <p className="text-[#b4b4c8]">Loading mint data...</p>
            </div>
          ) : error ? (
            <div className="bg-gradient-to-br from-red-900/20 to-red-800/10 border border-[#EF4444]/20/50 rounded-xl p-6 text-center">
              <p className="text-[#EF4444]">{error}</p>
              <button onClick={handleRefresh} className="mt-4 text-[#00E5FF] hover:text-[#FFD60A] transition-colors">
                Try again
              </button>
            </div>
          ) : (
            <>
              {/* Overview Tab */}
              {activeTab === 'overview' && stats && (
                <div className="space-y-8">
                  {/* Stats Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="bg-gradient-to-br from-[#0f0f1e]/90 to-[#15152a]/90 border border-[#00E5FF]/20 rounded-2xl p-6 shadow-lg">
                      <div className="text-sm font-medium text-[#00E5FF] uppercase tracking-wide mb-2">Active Launches</div>
                      <div className="text-3xl font-bold text-white">{stats.launches.active}</div>
                      <div className="text-sm text-[#b4b4c8] mt-1">{stats.launches.total} total</div>
                    </div>
                    <div className="bg-gradient-to-br from-[#0f0f1e]/90 to-[#15152a]/90 border border-[#FFD60A]/20 rounded-2xl p-6 shadow-lg">
                      <div className="text-sm font-medium text-[#FFD60A] uppercase tracking-wide mb-2">Completed Mints</div>
                      <div className="text-3xl font-bold text-white">{stats.inscriptions.completed}</div>
                      <div className="text-sm text-[#b4b4c8] mt-1">{stats.inscriptions.total} total</div>
                    </div>
                    <div className="bg-gradient-to-br from-[#0f0f1e]/90 to-[#15152a]/90 border border-[#00E5FF]/20 rounded-2xl p-6 shadow-lg">
                      <div className="text-sm font-medium text-[#00E5FF] uppercase tracking-wide mb-2">Stuck/Failed</div>
                      <div className="text-3xl font-bold text-white">{stats.inscriptions.stuck + stats.inscriptions.failed}</div>
                      <div className="text-sm text-[#b4b4c8] mt-1">{stats.inscriptions.pending} pending</div>
                    </div>
                    <div className="bg-gradient-to-br from-[#0f0f1e]/90 to-[#15152a]/90 border border-[#00E5FF]/20 rounded-2xl p-6 shadow-lg">
                      <div className="text-sm font-medium text-[#00E5FF] uppercase tracking-wide mb-2">Total Fees</div>
                      <div className="text-3xl font-bold text-white">{formatSats(stats.revenue.fees_spent)}</div>
                      <div className="text-sm text-[#b4b4c8] mt-1">sats spent on fees</div>
                    </div>
                  </div>

                  {/* Recent Activity */}
                  <div className="bg-gradient-to-br from-[#0f0f1e]/90 to-[#15152a]/90 border border-[#00E5FF]/20 rounded-xl p-6">
                    <h2 className="text-xl font-bold bg-gradient-to-r from-[#00E5FF] to-[#FFD60A] bg-clip-text text-transparent mb-4">Recent Inscriptions</h2>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-[#b4b4c8] border-b border-[#00E5FF]/20">
                            <th className="pb-3 pr-4">Status</th>
                            <th className="pb-3 pr-4">Collection</th>
                            <th className="pb-3 pr-4">Minter</th>
                            <th className="pb-3 pr-4">Fee Rate</th>
                            <th className="pb-3 pr-4">Cost</th>
                            <th className="pb-3 pr-4">Created</th>
                            <th className="pb-3">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="text-white">
                          {inscriptions.slice(0, 10).map((inscription) => (
                            <tr key={inscription.id} className="border-b border-[#00E5FF]/20 hover:bg-[#0f0f1e]/50">
                              <td className="py-3 pr-4">
                                <span className={`px-2 py-1 rounded-full text-xs border ${getStatusBadge(inscription.mint_status)}`}>
                                  {inscription.mint_status}
                                </span>
                                {inscription.is_test_mint && (
                                  <span className="ml-1 px-2 py-0.5 bg-purple-900/50 text-purple-300 text-xs rounded">TEST</span>
                                )}
                                {inscription.flagged_for_review && (
                                  <span className="ml-1 px-2 py-0.5 bg-red-900/50 text-red-300 text-xs rounded">🚩</span>
                                )}
                              </td>
                              <td className="py-3 pr-4">{inscription.collection_name || '-'}</td>
                              <td className="py-3 pr-4 font-mono text-xs">{truncateAddress(inscription.minter_wallet)}</td>
                              <td className="py-3 pr-4">{inscription.fee_rate} sat/vB</td>
                              <td className="py-3 pr-4">{formatSats(inscription.total_cost_sats || 0)} sats</td>
                              <td className="py-3 pr-4 text-xs">{formatDate(inscription.created_at)}</td>
                              <td className="py-3">
                                {inscription.commit_tx_id && (
                                  <a
                                    href={`https://mempool.space/tx/${inscription.commit_tx_id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-400 hover:text-blue-300 text-xs mr-2"
                                  >
                                    Commit
                                  </a>
                                )}
                                {inscription.inscription_id && (
                                  <a
                                    href={`https://ordinals.com/inscription/${inscription.inscription_id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-orange-400 hover:text-orange-300 text-xs"
                                  >
                                    View
                                  </a>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Launches Tab */}
              {activeTab === 'launches' && (
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <h2 className="text-xl font-bold text-white">Mint Launches</h2>
                  </div>

                  {launches.length === 0 ? (
                    <div className="bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24]/50 border border-gray-800 rounded-xl p-8 text-center">
                      <p className="text-[#a8a8b8] mb-4">No launches found. Go to Collections tab to create one.</p>
                      <button
                        onClick={loadAllLaunches}
                        className="px-4 py-2 bg-[#9945FF] hover:bg-[#7C3AED] text-white rounded-lg text-sm"
                      >
                        Refresh Launches
                      </button>
                    </div>
                  ) : (
                    <div className="grid gap-4">
                      {launches.map((launch) => (
                        <div key={launch.id} className="bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24]/50 border border-gray-800 rounded-xl p-6">
                          <div className="flex justify-between items-start mb-4">
                            <div>
                              <h3 className="text-lg font-bold text-white">{launch.launch_name}</h3>
                              <p className="text-sm text-[#a8a8b8]">{launch.collection_name}</p>
                            </div>
                            <span className={`px-3 py-1 rounded-full text-sm border ${getStatusBadge(launch.launch_status)}`}>
                              {launch.launch_status}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                            <div>
                              <div className="text-xs text-[#a8a8b8]/80 uppercase">Supply</div>
                              <div className="text-white font-semibold">{launch.minted_count} / {launch.total_supply}</div>
                            </div>
                            <div>
                              <div className="text-xs text-[#a8a8b8]/80 uppercase">Price</div>
                              <div className="text-white font-semibold">{launch.mint_price_sats > 0 ? `${formatSats(launch.mint_price_sats)} sats` : 'Free'}</div>
                            </div>
                            <div>
                              <div className="text-xs text-[#a8a8b8]/80 uppercase">Revenue</div>
                              <div className="text-white font-semibold">{formatSats(launch.total_revenue_sats || 0)} sats</div>
                            </div>
                            <div>
                              <div className="text-xs text-[#a8a8b8]/80 uppercase">Minters</div>
                              <div className="text-white font-semibold">{launch.unique_minters || 0}</div>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            {launch.launch_status === 'draft' && (
                              <button
                                onClick={() => handleUpdateLaunchStatus(launch.id, 'active')}
                                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm"
                              >
                                Activate
                              </button>
                            )}
                            {launch.launch_status === 'active' && (
                              <>
                                <button
                                  onClick={() => handleUpdateLaunchStatus(launch.id, 'paused')}
                                  className="px-4 py-2 bg-[#FBBF24] hover:bg-[#F59E0B] text-white rounded-lg text-sm"
                                >
                                  Pause
                                </button>
                                <button
                                  onClick={() => handleUpdateLaunchStatus(launch.id, 'completed')}
                                  className="px-4 py-2 bg-[#9945FF] hover:bg-[#7C3AED] text-white rounded-lg text-sm"
                                >
                                  Complete
                                </button>
                              </>
                            )}
                            {launch.launch_status === 'paused' && (
                              <button
                                onClick={() => handleUpdateLaunchStatus(launch.id, 'active')}
                                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm"
                              >
                                Resume
                              </button>
                            )}
                            {['draft', 'paused'].includes(launch.launch_status) && (
                              <button
                                onClick={() => handleUpdateLaunchStatus(launch.id, 'cancelled')}
                                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm"
                              >
                                Cancel
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Inscriptions Tab */}
              {activeTab === 'inscriptions' && (
                <div className="space-y-6">
                  <div className="flex flex-wrap gap-4 items-center">
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="px-4 py-2 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 border border-[#9945FF]/20 rounded-lg text-white"
                    >
                      <option value="">All Statuses</option>
                      <option value="pending">Pending</option>
                      <option value="completed">Completed</option>
                      <option value="failed">Failed</option>
                      <option value="stuck">Stuck</option>
                    </select>
                    <label className="flex items-center gap-2 text-white">
                      <input
                        type="checkbox"
                        checked={testMintFilter}
                        onChange={(e) => setTestMintFilter(e.target.checked)}
                        className="rounded"
                      />
                      Test Mints Only
                    </label>
                    <label className="flex items-center gap-2 text-white">
                      <input
                        type="checkbox"
                        checked={flaggedFilter}
                        onChange={(e) => setFlaggedFilter(e.target.checked)}
                        className="rounded"
                      />
                      Flagged Only
                    </label>
                    <button
                      onClick={loadFilteredInscriptions}
                      className="px-4 py-2 bg-[#9945FF] hover:bg-[#7C3AED] text-white rounded-lg"
                    >
                      Apply Filters
                    </button>
                  </div>

                  <div className="bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24]/50 border border-gray-800 rounded-xl p-6">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-[#a8a8b8] border-b border-[#9945FF]/20">
                            <th className="pb-3 pr-4">Status</th>
                            <th className="pb-3 pr-4">Collection</th>
                            <th className="pb-3 pr-4">Minter</th>
                            <th className="pb-3 pr-4">Fee Rate</th>
                            <th className="pb-3 pr-4">Cost</th>
                            <th className="pb-3 pr-4">Created</th>
                            <th className="pb-3">Links</th>
                          </tr>
                        </thead>
                        <tbody className="text-white">
                          {inscriptions.map((inscription) => (
                            <tr key={inscription.id} className="border-b border-gray-800 hover:bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90/50">
                              <td className="py-3 pr-4">
                                <span className={`px-2 py-1 rounded-full text-xs border ${getStatusBadge(inscription.mint_status)}`}>
                                  {inscription.mint_status}
                                </span>
                                {inscription.is_test_mint && (
                                  <span className="ml-1 px-2 py-0.5 bg-purple-900/50 text-purple-300 text-xs rounded">TEST</span>
                                )}
                              </td>
                              <td className="py-3 pr-4">{inscription.collection_name || '-'}</td>
                              <td className="py-3 pr-4 font-mono text-xs">{truncateAddress(inscription.minter_wallet)}</td>
                              <td className="py-3 pr-4">{inscription.fee_rate} sat/vB</td>
                              <td className="py-3 pr-4">{formatSats(inscription.total_cost_sats || 0)}</td>
                              <td className="py-3 pr-4 text-xs">{formatDate(inscription.created_at)}</td>
                              <td className="py-3 space-x-2">
                                {inscription.commit_tx_id && (
                                  <a href={`https://mempool.space/tx/${inscription.commit_tx_id}`} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 text-xs">
                                    Commit
                                  </a>
                                )}
                                {inscription.reveal_tx_id && (
                                  <a href={`https://mempool.space/tx/${inscription.reveal_tx_id}`} target="_blank" rel="noopener noreferrer" className="text-green-400 hover:text-green-300 text-xs">
                                    Reveal
                                  </a>
                                )}
                                {inscription.inscription_id && (
                                  <a href={`https://ordinals.com/inscription/${inscription.inscription_id}`} target="_blank" rel="noopener noreferrer" className="text-orange-400 hover:text-orange-300 text-xs">
                                    Ord
                                  </a>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Stuck Transactions Tab */}
              {activeTab === 'stuck' && (
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <h2 className="text-xl font-bold text-white">Stuck Transactions</h2>
                    <button
                      onClick={handleDetectStuck}
                      className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg flex items-center gap-2"
                    >
                      🔍 Detect Stuck
                    </button>
                  </div>

                  {stuckTransactions.length === 0 ? (
                    <div className="bg-green-900/20 border border-green-700/50 rounded-xl p-8 text-center">
                      <p className="text-green-400">✅ No stuck transactions found!</p>
                    </div>
                  ) : (
                    <div className="grid gap-4">
                      {stuckTransactions.map((stuckTx) => (
                        <div key={stuckTx.id} className="bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24]/50 border border-orange-700/50 rounded-xl p-6">
                          <div className="flex justify-between items-start mb-4">
                            <div>
                              <div className="text-xs text-[#a8a8b8]/80 uppercase mb-1">
                                {stuckTx.tx_type.toUpperCase()} Transaction
                              </div>
                              <a
                                href={`https://mempool.space/tx/${stuckTx.tx_id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-400 hover:text-blue-300 font-mono text-sm"
                              >
                                {truncateAddress(stuckTx.tx_id)}
                              </a>
                            </div>
                            <span className={`px-3 py-1 rounded-full text-sm border ${getStatusBadge(stuckTx.resolution_status)}`}>
                              {stuckTx.resolution_status}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 text-sm">
                            <div>
                              <div className="text-xs text-[#a8a8b8]/80">Stuck For</div>
                              <div className="text-orange-400 font-semibold">{stuckTx.stuck_duration_minutes} min</div>
                            </div>
                            <div>
                              <div className="text-xs text-[#a8a8b8]/80">Current Fee</div>
                              <div className="text-white">{stuckTx.current_fee_rate} sat/vB</div>
                            </div>
                            <div>
                              <div className="text-xs text-[#a8a8b8]/80">Recommended Fee</div>
                              <div className="text-green-400">{stuckTx.recommended_fee_rate} sat/vB</div>
                            </div>
                            <div>
                              <div className="text-xs text-[#a8a8b8]/80">Collection</div>
                              <div className="text-white">{stuckTx.collection_name || '-'}</div>
                            </div>
                          </div>
                          {stuckTx.resolution_status === 'detected' && (
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleStuckAction(stuckTx.id, 'mark_resolved')}
                                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm"
                              >
                                Mark Resolved
                              </button>
                              <button
                                onClick={() => handleStuckAction(stuckTx.id, 'request_rbf')}
                                className="px-4 py-2 bg-[#9945FF] hover:bg-[#7C3AED] text-white rounded-lg text-sm"
                              >
                                Request RBF
                              </button>
                              <button
                                onClick={() => handleStuckAction(stuckTx.id, 'abandon')}
                                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm"
                              >
                                Abandon
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Collections Tab */}
              {activeTab === 'collections' && (
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <h2 className="text-xl font-bold text-white">Collections for Mint Launch</h2>
                  </div>

                  <div className="grid gap-4">
                    {collections.map((collection) => (
                      <div key={collection.id} className="bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24]/50 border border-gray-800 rounded-xl p-6">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <h3 className="text-lg font-bold text-white">{collection.name}</h3>
                            <p className="text-sm text-[#a8a8b8]">{collection.description?.substring(0, 100) || 'No description'}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {collection.is_locked ? (
                              <span className="px-3 py-1 bg-green-900/30 border border-green-700 text-green-300 rounded-full text-sm">
                                🔒 Locked
                              </span>
                            ) : (
                              <span className="px-3 py-1 bg-yellow-900/30 border border-[#FBBF24]/20 text-yellow-300 rounded-full text-sm">
                                🔓 Unlocked
                              </span>
                            )}
                            {collection.active_launch_id && (
                              <span className={`px-3 py-1 rounded-full text-sm border ${getStatusBadge(collection.launch_status || 'draft')}`}>
                                {collection.launch_status}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 text-sm">
                          <div>
                            <div className="text-xs text-[#a8a8b8]/80">Total Ordinals</div>
                            <div className="text-white font-semibold">{collection.total_ordinals}</div>
                          </div>
                          <div>
                            <div className="text-xs text-[#a8a8b8]/80">Minted</div>
                            <div className="text-white font-semibold">{collection.minted_ordinals}</div>
                          </div>
                          <div>
                            <div className="text-xs text-[#a8a8b8]/80">Available</div>
                            <div className="text-green-400 font-semibold">{parseInt(String(collection.total_ordinals)) - parseInt(String(collection.minted_ordinals))}</div>
                          </div>
                          <div>
                            <div className="text-xs text-[#a8a8b8]/80">Owner</div>
                            <div className="text-white font-mono text-xs">{truncateAddress(collection.owner_wallet || '')}</div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {!collection.active_launch_id && (
                            <button
                              onClick={() => {
                                setSelectedCollection(collection)
                                setCreateLaunchOpen(true)
                              }}
                              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm"
                            >
                              🚀 Create Launch
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Create Launch Modal */}
                  {createLaunchOpen && selectedCollection && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                      <div className="bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24] border border-[#9945FF]/20 rounded-xl p-6 max-w-md w-full mx-4">
                        <h3 className="text-xl font-bold text-white mb-4">Create Mint Launch</h3>
                        <p className="text-[#a8a8b8] mb-4">Collection: {selectedCollection.name}</p>
                        
                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm text-[#a8a8b8] mb-1">Launch Name</label>
                            <input
                              type="text"
                              value={launchName}
                              onChange={(e) => setLaunchName(e.target.value)}
                              placeholder={`${selectedCollection.name} Launch`}
                              className="w-full px-4 py-2 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 border border-[#9945FF]/20 rounded-lg text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-sm text-[#a8a8b8] mb-1">Mint Price (sats)</label>
                            <input
                              type="number"
                              value={mintPrice}
                              onChange={(e) => setMintPrice(e.target.value)}
                              placeholder="0"
                              className="w-full px-4 py-2 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 border border-[#9945FF]/20 rounded-lg text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-sm text-[#a8a8b8] mb-1">Creator Wallet (receives payment)</label>
                            <input
                              type="text"
                              value={creatorWallet}
                              onChange={(e) => setCreatorWallet(e.target.value)}
                              placeholder={currentAddress || ''}
                              className="w-full px-4 py-2 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 border border-[#9945FF]/20 rounded-lg text-white font-mono text-sm"
                            />
                          </div>
                        </div>

                        <div className="flex gap-3 mt-6">
                          <button
                            onClick={handleCreateLaunch}
                            className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg"
                          >
                            Create Launch
                          </button>
                          <button
                            onClick={() => {
                              setCreateLaunchOpen(false)
                              setSelectedCollection(null)
                            }}
                            className="px-4 py-2 bg-[#1a1a24]/80 hover:bg-gray-600 text-white rounded-lg"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Test Mint Tab */}
              {activeTab === 'test-mint' && (
                <div className="space-y-6">
                  {/* Wallet Info */}
                  <div className="bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24]/50 border border-gray-800 rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-[#a8a8b8] mb-2">Connected Wallet</h3>
                    <div className="grid md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <div className="text-[#a8a8b8]/80">Ordinal Address</div>
                        <div className="text-white font-mono text-xs truncate">{currentAddress || 'Not connected'}</div>
                      </div>
                      <div>
                        <div className="text-[#a8a8b8]/80">Payment Address</div>
                        <div className="text-white font-mono text-xs truncate">{paymentAddress || currentAddress || 'Not connected'}</div>
                      </div>
                    </div>
                    {!paymentPublicKey && !testMintDryRun && (
                      <div className="mt-2 text-[#FBBF24] text-xs">
                        ⚠️ Payment public key not available. Some wallets may not support PSBT signing.
                      </div>
                    )}
                  </div>

                  <div className="bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24]/50 border border-gray-800 rounded-xl p-6">
                    <div className="flex justify-between items-center mb-4">
                      <h2 className="text-xl font-bold text-white">🧪 Test Mint</h2>
                      {testMintResult && (
                        <button
                          onClick={resetTestMint}
                          className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm"
                        >
                          Reset
                        </button>
                      )}
                    </div>
                    
                    {/* Step indicator */}
                    {!testMintDryRun && testMintResult && (
                      <div className="flex items-center gap-2 mb-4 text-sm">
                        <span className={`px-2 py-1 rounded ${testMintStep === 'create' ? 'bg-[#9945FF]' : 'bg-green-600'}`}>1. Create</span>
                        <span className="text-gray-600">→</span>
                        <span className={`px-2 py-1 rounded ${testMintStep === 'sign' ? 'bg-[#9945FF]' : ['commit', 'reveal', 'done'].includes(testMintStep) ? 'bg-green-600' : 'bg-[#1a1a24]/80'}`}>2. Sign</span>
                        <span className="text-gray-600">→</span>
                        <span className={`px-2 py-1 rounded ${testMintStep === 'commit' ? 'bg-[#9945FF]' : ['reveal', 'done'].includes(testMintStep) ? 'bg-green-600' : 'bg-[#1a1a24]/80'}`}>3. Commit</span>
                        <span className="text-gray-600">→</span>
                        <span className={`px-2 py-1 rounded ${testMintStep === 'reveal' ? 'bg-[#9945FF]' : testMintStep === 'done' ? 'bg-green-600' : 'bg-[#1a1a24]/80'}`}>4. Reveal</span>
                        <span className="text-gray-600">→</span>
                        <span className={`px-2 py-1 rounded ${testMintStep === 'done' ? 'bg-green-600' : 'bg-[#1a1a24]/80'}`}>5. Done</span>
                      </div>
                    )}

                    <div className="grid md:grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm text-[#a8a8b8] mb-1">Collection</label>
                          <select
                            value={testMintCollectionId}
                            onChange={(e) => setTestMintCollectionId(e.target.value)}
                            disabled={testMintStep !== 'create' || testMintLoading}
                            className="w-full px-4 py-2 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 border border-[#9945FF]/20 rounded-lg text-white disabled:opacity-50"
                          >
                            <option value="">Select a collection...</option>
                            {collections.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name} ({c.total_ordinals} ordinals)
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm text-[#a8a8b8] mb-1">Receiving Address (optional)</label>
                          <input
                            type="text"
                            value={testMintReceivingAddress}
                            onChange={(e) => setTestMintReceivingAddress(e.target.value)}
                            placeholder={currentAddress || 'Your address'}
                            disabled={testMintStep !== 'create' || testMintLoading}
                            className="w-full px-4 py-2 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 border border-[#9945FF]/20 rounded-lg text-white font-mono text-sm disabled:opacity-50"
                          />
                        </div>
                        <div>
                          <label className="block text-sm text-[#a8a8b8] mb-1">Fee Rate (sat/vB)</label>
                          <input
                            type="number"
                            value={testMintFeeRate}
                            onChange={(e) => setTestMintFeeRate(e.target.value)}
                            placeholder="1"
                            step="0.1"
                            min="0.1"
                            disabled={testMintStep !== 'create' || testMintLoading}
                            className="w-full px-4 py-2 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 border border-[#9945FF]/20 rounded-lg text-white disabled:opacity-50"
                          />
                        </div>
                        
                        {/* Dry Run Toggle */}
                        <div className="flex items-center gap-3 p-3 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90/50 rounded-lg border border-[#9945FF]/20">
                          <input
                            type="checkbox"
                            id="dryRunToggle"
                            checked={!testMintDryRun}
                            onChange={(e) => setTestMintDryRun(!e.target.checked)}
                            disabled={testMintStep !== 'create' || testMintLoading}
                            className="w-5 h-5 accent-green-500"
                          />
                          <label htmlFor="dryRunToggle" className="flex-1">
                            <div className={`font-semibold ${!testMintDryRun ? 'text-green-400' : 'text-[#a8a8b8]'}`}>
                              {testMintDryRun ? '🔒 Dry Run Mode' : '🔥 LIVE MODE - Real Bitcoin'}
                            </div>
                            <div className="text-xs text-[#a8a8b8]/80">
                              {testMintDryRun 
                                ? 'Only calculates costs, no transactions sent'
                                : 'Will create real transactions and spend sats!'}
                            </div>
                          </label>
                        </div>

                        {/* Step Progress Indicator */}
                        {!testMintDryRun && testMintStep !== 'create' && (
                          <div className="p-3 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90/50 rounded-lg border border-[#9945FF]/20 mb-2">
                            <div className="text-xs text-[#a8a8b8] mb-2">Current Step</div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`px-2 py-1 rounded text-xs font-bold ${testMintStep === 'sign' ? 'bg-orange-600 text-white' : 'bg-[#1a1a24]/80 text-[#a8a8b8]'}`}>1. Sign</span>
                              <span className="text-gray-600">→</span>
                              <span className={`px-2 py-1 rounded text-xs font-bold ${testMintStep === 'commit' ? 'bg-[#9945FF] text-white' : 'bg-[#1a1a24]/80 text-[#a8a8b8]'}`}>2. Broadcast</span>
                              <span className="text-gray-600">→</span>
                              <span className={`px-2 py-1 rounded text-xs font-bold ${testMintStep === 'reveal' ? 'bg-green-600 text-white' : 'bg-[#1a1a24]/80 text-[#a8a8b8]'}`}>3. Reveal</span>
                              <span className="text-gray-600">→</span>
                              <span className={`px-2 py-1 rounded text-xs font-bold ${testMintStep === 'done' ? 'bg-purple-600 text-white' : 'bg-[#1a1a24]/80 text-[#a8a8b8]'}`}>4. Done</span>
                            </div>
                          </div>
                        )}

                        {/* Action Buttons */}
                        {testMintStep === 'create' && (
                          <button
                            onClick={handleTestMint}
                            disabled={!testMintCollectionId || testMintLoading}
                            className={`w-full px-6 py-3 ${testMintDryRun 
                              ? 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700' 
                              : 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700'
                            } text-white rounded-lg font-semibold disabled:opacity-50`}
                          >
                            {testMintLoading 
                              ? 'Creating...' 
                              : testMintDryRun 
                                ? '🧪 Create Dry Run' 
                                : '🔥 Create LIVE Mint'}
                          </button>
                        )}
                        
                        {testMintStep === 'sign' && pendingPsbt && (
                          <div className="space-y-3">
                            <div className="p-3 bg-orange-900/30 border border-orange-500/50 rounded-lg text-center">
                              <p className="text-orange-400 font-semibold">📦 Commit PSBT Ready</p>
                              <p className="text-xs text-[#a8a8b8]">Click below to sign with your wallet</p>
                            </div>
                            <button
                              onClick={handleSignAndBroadcastCommit}
                              disabled={testMintLoading}
                              className="w-full px-6 py-4 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white rounded-lg font-bold text-lg disabled:opacity-50 animate-pulse"
                            >
                              {testMintLoading ? 'Signing...' : '✍️ Sign & Broadcast Commit'}
                            </button>
                          </div>
                        )}
                        
                        {testMintStep === 'reveal' && (
                          <button
                            onClick={handleCreateReveal}
                            disabled={testMintLoading}
                            className="w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white rounded-lg font-semibold disabled:opacity-50"
                          >
                            {testMintLoading ? 'Creating Reveal...' : '📜 Create & Broadcast Reveal'}
                          </button>
                        )}
                      </div>

                      {testMintResult && (
                        <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90/50 border border-[#9945FF]/20 rounded-xl p-4">
                          <h3 className="text-lg font-bold text-white mb-3">
                            {testMintDryRun ? 'Dry Run Result' : 'Mint Progress'}
                          </h3>
                          {testMintResult.error ? (
                            <p className="text-[#EF4444]">{testMintResult.error}</p>
                          ) : (
                            <div className="space-y-3 text-sm">
                              {/* Ordinal Info */}
                              <div className="p-2 bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24] rounded">
                                <div className="text-[#a8a8b8]/80 text-xs mb-1">Ordinal</div>
                                <div className="text-white">#{testMintResult.ordinal?.ordinal_number || 'Random'}</div>
                              </div>
                              
                              {/* Compression */}
                              <div className="grid grid-cols-2 gap-2">
                                <div className="text-[#a8a8b8]">Original Size</div>
                                <div className="text-white">{(testMintResult.compression?.original_size / 1024 / 1024).toFixed(2)} MB</div>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div className="text-[#a8a8b8]">Compressed Size</div>
                                <div className="text-green-400 font-semibold">{(testMintResult.compression?.compressed_size / 1024).toFixed(1)} KB ({testMintResult.compression?.reduction_percent}% reduction)</div>
                              </div>
                              
                              {/* Costs */}
                              <div className="border-t border-[#9945FF]/20 pt-2 mt-2">
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="text-[#a8a8b8]">Commit Fee</div>
                                  <div className="text-white">{formatSats(testMintResult.costs?.commit_fee || 0)} sats</div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="text-[#a8a8b8]">Reveal Fee</div>
                                  <div className="text-white">{formatSats(testMintResult.costs?.reveal_fee || 0)} sats</div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="text-[#a8a8b8]">Total Cost</div>
                                  <div className="text-orange-400 font-bold">{formatSats(testMintResult.costs?.total_cost || 0)} sats</div>
                                </div>
                              </div>
                              
                              {/* Taproot Address */}
                              <div className="border-t border-[#9945FF]/20 pt-2 mt-2">
                                <div className="text-[#a8a8b8] mb-1 text-xs">Inscription Taproot Address</div>
                                <div className="text-white font-mono text-xs break-all bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24] p-2 rounded">{testMintResult.inscription?.taproot_address}</div>
                              </div>
                              
                              {/* Transaction Progress (for live mints) */}
                              {!testMintDryRun && (
                                <div className="border-t border-[#9945FF]/20 pt-2 mt-2 space-y-2">
                                  {testMintResult.commit_tx_id && (
                                    <div>
                                      <div className="text-[#a8a8b8] text-xs">Commit TX</div>
                                      <a 
                                        href={`https://mempool.space/tx/${testMintResult.commit_tx_id}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-400 hover:text-blue-300 font-mono text-xs break-all"
                                      >
                                        {testMintResult.commit_tx_id}
                                      </a>
                                    </div>
                                  )}
                                  {testMintResult.commit_error && (
                                    <div className="text-[#EF4444] text-sm">❌ Commit Error: {testMintResult.commit_error}</div>
                                  )}
                                  {testMintResult.reveal_tx_id && (
                                    <div>
                                      <div className="text-[#a8a8b8] text-xs">Reveal TX</div>
                                      <a 
                                        href={`https://mempool.space/tx/${testMintResult.reveal_tx_id}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-400 hover:text-blue-300 font-mono text-xs break-all"
                                      >
                                        {testMintResult.reveal_tx_id}
                                      </a>
                                    </div>
                                  )}
                                  {testMintResult.reveal_error && (
                                    <div className="text-[#EF4444] text-sm">❌ Reveal Error: {testMintResult.reveal_error}</div>
                                  )}
                                  {testMintResult.inscription_id && (
                                    <div className="p-3 bg-green-900/30 border border-green-700 rounded-lg">
                                      <div className="text-green-400 font-semibold mb-1">🎉 Inscription Created!</div>
                                      <a 
                                        href={`https://ordinals.com/inscription/${testMintResult.inscription_id}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-green-300 hover:text-green-200 font-mono text-xs break-all"
                                      >
                                        {testMintResult.inscription_id}
                                      </a>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Test Mint History */}
                  <div className="bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24]/50 border border-gray-800 rounded-xl p-6">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                      <div className="flex items-center gap-3">
                        <h2 className="text-xl font-bold text-white">📜 Test Mint History</h2>
                        <span className="text-[#a8a8b8] text-sm">({testMintHistoryTotal} total)</span>
                      </div>
                      
                      {/* Filters and Sort */}
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Status Filter */}
                        <select
                          value={testMintHistoryStatus}
                          onChange={(e) => {
                            setTestMintHistoryStatus(e.target.value)
                            setTestMintHistoryPage(1)
                          }}
                          className="px-3 py-1.5 bg-slate-700 border border-[#9945FF]/30 rounded text-white text-sm"
                        >
                          <option value="">All Status</option>
                          <option value="pending">Pending</option>
                          <option value="commit_created">Commit Created</option>
                          <option value="commit_broadcast">Commit Broadcast</option>
                          <option value="commit_confirmed">Commit Confirmed</option>
                          <option value="reveal_created">Reveal Created</option>
                          <option value="reveal_broadcast">Reveal Broadcast</option>
                          <option value="completed">Completed</option>
                          <option value="failed">Failed</option>
                        </select>
                        
                        {/* Sort By */}
                        <select
                          value={testMintHistorySortBy}
                          onChange={(e) => {
                            setTestMintHistorySortBy(e.target.value)
                            setTestMintHistoryPage(1)
                          }}
                          className="px-3 py-1.5 bg-slate-700 border border-[#9945FF]/30 rounded text-white text-sm"
                        >
                          <option value="created_at">Sort: Date</option>
                          <option value="mint_status">Sort: Status</option>
                        </select>
                        
                        {/* Sort Order */}
                        <button
                          onClick={() => {
                            setTestMintHistorySortOrder(prev => prev === 'desc' ? 'asc' : 'desc')
                            setTestMintHistoryPage(1)
                          }}
                          className="px-3 py-1.5 bg-slate-700 border border-[#9945FF]/30 rounded text-white text-sm hover:bg-slate-600"
                        >
                          {testMintHistorySortOrder === 'desc' ? '↓ Newest' : '↑ Oldest'}
                        </button>
                        
                        <button
                          onClick={() => loadTestMintHistory(testMintHistoryPage)}
                          disabled={testMintHistoryLoading}
                          className="px-4 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm disabled:opacity-50"
                        >
                          {testMintHistoryLoading ? '...' : '🔄'}
                        </button>
                      </div>
                    </div>

                    {testMintHistoryLoading ? (
                      <div className="text-center py-8 text-[#a8a8b8]">Loading test mint history...</div>
                    ) : testMintHistory.length === 0 ? (
                      <div className="text-center py-8 text-[#a8a8b8]">
                        No test mints yet. Create one above to get started.
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {testMintHistory.map((mint) => (
                          <div key={mint.id} className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90/50 border border-[#9945FF]/20 rounded-lg p-4">
                            <div className="flex items-start justify-between gap-4">
                              {/* Left: Basic info */}
                              <div className="flex items-center gap-4">
                                {mint.thumbnail_url && (
                                  <img src={mint.thumbnail_url} alt="" className="w-16 h-16 rounded-lg object-cover border border-[#9945FF]/30" />
                                )}
                                <div>
                                  <div className="text-white font-medium">{mint.collection_name || 'Unknown Collection'}</div>
                                  <div className="text-[#a8a8b8] text-sm">#{mint.ordinal_number || 'N/A'} • {(mint.content_size_bytes / 1024).toFixed(1)} KB</div>
                                  <div className="text-[#a8a8b8]/80 text-xs mt-1">
                                    {new Date(mint.created_at).toLocaleDateString()} {new Date(mint.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </div>
                                </div>
                              </div>

                              {/* Center: Status & Cost */}
                              <div className="text-center">
                                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                                  mint.mint_status === 'completed' ? 'bg-green-900/50 text-green-400 border border-green-700' :
                                  mint.mint_status === 'reveal_broadcast' ? 'bg-purple-900/50 text-purple-400 border border-purple-700' :
                                  mint.mint_status === 'commit_confirmed' ? 'bg-cyan-900/50 text-cyan-400 border border-cyan-700' :
                                  mint.mint_status === 'commit_broadcast' ? 'bg-blue-900/50 text-blue-400 border border-blue-700' :
                                  mint.mint_status === 'pending' ? 'bg-yellow-900/50 text-[#FBBF24] border border-[#FBBF24]/20' :
                                  mint.mint_status === 'failed' ? 'bg-red-900/50 text-[#EF4444] border border-[#EF4444]/20' :
                                  'bg-[#14141e]/50 text-[#a8a8b8] border border-[#9945FF]/20'
                                }`}>
                                  {mint.mint_status.replace(/_/g, ' ')}
                                </span>
                                <div className="text-orange-400 text-sm mt-2">{formatSats(mint.total_cost_sats)} sats</div>
                                <div className="text-[#a8a8b8]/80 text-xs">{mint.fee_rate} sat/vB</div>
                              </div>

                              {/* Right: Actions */}
                              <div className="flex flex-col gap-2 min-w-[140px]">
                                {/* Retry reveal if commit done but no reveal */}
                                {mint.commit_tx_id && !mint.reveal_tx_id && (
                                  <button
                                    onClick={async () => {
                                      if (!currentAddress) return
                                      try {
                                        const res = await fetch('/api/admin/mints/test-mint/reveal', {
                                          method: 'POST',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({
                                            admin_wallet: currentAddress,
                                            test_mint_id: mint.id,
                                            auto_broadcast: true,
                                          }),
                                        })
                                        const data = await res.json()
                                        if (data.success) {
                                          alert(`✅ Reveal broadcast: ${data.reveal_tx_id}`)
                                          loadTestMintHistory()
                                        } else {
                                          alert(`❌ Error: ${data.error || data.details}`)
                                        }
                                      } catch (err) {
                                        alert('Failed to create reveal')
                                      }
                                    }}
                                    className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs rounded font-medium"
                                  >
                                    📜 Create Reveal
                                  </button>
                                )}
                                
                                {/* Rebroadcast reveal if we have hex but not confirmed */}
                                {mint.reveal_hex && mint.mint_status !== 'completed' && (
                                  <>
                                    <button
                                      onClick={async () => {
                                        if (!mint.reveal_hex) return
                                        try {
                                          const res = await fetch('https://mempool.space/api/tx', {
                                            method: 'POST',
                                            body: mint.reveal_hex,
                                          })
                                          if (res.ok) {
                                            const txid = await res.text()
                                            alert(`✅ Reveal rebroadcast: ${txid}`)
                                            loadTestMintHistory()
                                          } else {
                                            const error = await res.text()
                                            alert(`❌ Broadcast failed: ${error}`)
                                          }
                                        } catch (err) {
                                          alert('Failed to rebroadcast')
                                        }
                                      }}
                                      className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs rounded font-medium"
                                    >
                                      🔄 Rebroadcast Reveal
                                    </button>
                                    <button
                                      onClick={() => {
                                        if (!mint.reveal_hex) return
                                        navigator.clipboard.writeText(mint.reveal_hex)
                                        alert('✅ Reveal hex copied to clipboard')
                                      }}
                                      className="px-3 py-1.5 bg-gray-600 hover:bg-[#1a1a24]/80 text-white text-xs rounded font-medium"
                                    >
                                      📋 Copy Reveal Hex
                                    </button>
                                  </>
                                )}
                                
                                {/* Check status button for in-progress mints */}
                                {mint.mint_status !== 'completed' && mint.mint_status !== 'pending' && (
                                  <button
                                    onClick={async () => {
                                      if (!currentAddress) return
                                      try {
                                        // Check reveal status if we have a reveal tx
                                        if (mint.reveal_tx_id) {
                                          const res = await fetch(`/api/admin/mints/test-mint/reveal?wallet_address=${currentAddress}&test_mint_id=${mint.id}`)
                                          const data = await res.json()
                                          if (data.confirmed) {
                                            alert(`✅ Reveal confirmed! Inscription: ${data.inscription_id}`)
                                          } else {
                                            alert(`⏳ Reveal pending (${data.confirmations || 0} confirmations)`)
                                          }
                                        } else if (mint.commit_tx_id) {
                                          // Check commit status
                                          const res = await fetch(`/api/admin/mints/test-mint/commit?wallet_address=${currentAddress}&test_mint_id=${mint.id}`)
                                          const data = await res.json()
                                          if (data.confirmed) {
                                            alert(`✅ Commit confirmed (${data.confirmations} confirmations). Ready for reveal!`)
                                          } else {
                                            alert(`⏳ Commit pending in mempool`)
                                          }
                                        }
                                        loadTestMintHistory()
                                      } catch (err) {
                                        alert('Failed to check status')
                                      }
                                    }}
                                    className="px-3 py-1.5 bg-slate-600 hover:bg-slate-700 text-white text-xs rounded font-medium"
                                  >
                                    🔍 Check Status
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Transaction IDs */}
                            <div className="mt-4 pt-4 border-t border-[#9945FF]/20 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                              {/* Commit TX */}
                              <div>
                                <div className="text-[#a8a8b8]/80 mb-1">Commit TX</div>
                                {mint.commit_tx_id ? (
                                  <a 
                                    href={`https://mempool.space/tx/${mint.commit_tx_id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-400 hover:text-blue-300 font-mono break-all"
                                  >
                                    {mint.commit_tx_id.substring(0, 16)}...
                                  </a>
                                ) : (
                                  <span className="text-gray-600">Not broadcast</span>
                                )}
                                {mint.commit_confirmed_at && (
                                  <span className="ml-2 text-green-400">✓</span>
                                )}
                              </div>

                              {/* Reveal TX */}
                              <div>
                                <div className="text-[#a8a8b8]/80 mb-1">Reveal TX</div>
                                {mint.reveal_tx_id ? (
                                  <a 
                                    href={`https://mempool.space/tx/${mint.reveal_tx_id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-400 hover:text-blue-300 font-mono break-all"
                                  >
                                    {mint.reveal_tx_id.substring(0, 16)}...
                                  </a>
                                ) : mint.reveal_hex ? (
                                  <span className="text-[#FBBF24]">Created (not broadcast)</span>
                                ) : (
                                  <span className="text-gray-600">Not created</span>
                                )}
                              </div>

                              {/* Inscription ID */}
                              <div>
                                <div className="text-[#a8a8b8]/80 mb-1">Inscription</div>
                                {mint.inscription_id ? (
                                  <a 
                                    href={`https://ordinals.com/inscription/${mint.inscription_id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-green-400 hover:text-green-300 font-mono break-all"
                                  >
                                    {mint.inscription_id.substring(0, 16)}...
                                  </a>
                                ) : (
                                  <span className="text-gray-600">Pending</span>
                                )}
                              </div>
                            </div>

                            {/* Error message if any */}
                            {mint.error_message && (
                              <div className="mt-3 p-2 bg-red-900/30 border border-[#EF4444]/20 rounded text-[#EF4444] text-xs">
                                ⚠️ {mint.error_message}
                              </div>
                            )}
                          </div>
                        ))}
                        
                        {/* Pagination Controls */}
                        {testMintHistoryTotalPages > 1 && (
                          <div className="flex items-center justify-between mt-6 pt-4 border-t border-[#9945FF]/20">
                            <div className="text-[#a8a8b8] text-sm">
                              Page {testMintHistoryPage} of {testMintHistoryTotalPages}
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setTestMintHistoryPage(1)}
                                disabled={testMintHistoryPage === 1 || testMintHistoryLoading}
                                className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                ««
                              </button>
                              <button
                                onClick={() => setTestMintHistoryPage(p => Math.max(1, p - 1))}
                                disabled={testMintHistoryPage === 1 || testMintHistoryLoading}
                                className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                ‹ Prev
                              </button>
                              
                              {/* Page numbers */}
                              <div className="flex items-center gap-1">
                                {Array.from({ length: Math.min(5, testMintHistoryTotalPages) }, (_, i) => {
                                  let pageNum: number
                                  if (testMintHistoryTotalPages <= 5) {
                                    pageNum = i + 1
                                  } else if (testMintHistoryPage <= 3) {
                                    pageNum = i + 1
                                  } else if (testMintHistoryPage >= testMintHistoryTotalPages - 2) {
                                    pageNum = testMintHistoryTotalPages - 4 + i
                                  } else {
                                    pageNum = testMintHistoryPage - 2 + i
                                  }
                                  return (
                                    <button
                                      key={pageNum}
                                      onClick={() => setTestMintHistoryPage(pageNum)}
                                      disabled={testMintHistoryLoading}
                                      className={`w-8 h-8 rounded text-sm ${
                                        testMintHistoryPage === pageNum
                                          ? 'bg-orange-600 text-white'
                                          : 'bg-slate-700 hover:bg-slate-600 text-white'
                                      } disabled:opacity-50`}
                                    >
                                      {pageNum}
                                    </button>
                                  )
                                })}
                              </div>
                              
                              <button
                                onClick={() => setTestMintHistoryPage(p => Math.min(testMintHistoryTotalPages, p + 1))}
                                disabled={testMintHistoryPage === testMintHistoryTotalPages || testMintHistoryLoading}
                                className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                Next ›
                              </button>
                              <button
                                onClick={() => setTestMintHistoryPage(testMintHistoryTotalPages)}
                                disabled={testMintHistoryPage === testMintHistoryTotalPages || testMintHistoryLoading}
                                className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                »»
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
          </div>
    </div>
  )
}

