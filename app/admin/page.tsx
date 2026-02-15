'use client'

import { useState, useEffect } from 'react'
import { useWallet } from '@/lib/wallet/compatibility'
import { useAdminCheck } from '@/lib/auth/use-admin-check'
import { WalletConnect } from '@/components/wallet-connect'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

interface User {
  wallet_address: string
  profile: {
    username: string
    display_name: string | null
    bio: string | null
    avatar_url: string | null
    payment_address: string | null
    opt_in: boolean
    created_at: string
    updated_at: string
  } | null
  credits: {
    current: number
    total_earned: number
    total_used: number
    total_spent: number
    purchase_count: number
    usage_count: number
  }
  collections: {
    count: number
  }
  payments: {
    pending: {
      count: number
      btc_total: number | null
    }
    completed: {
      count: number
      btc_total: number | null
      credits_total: number | null
    }
  }
  account_created: string | null
}

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
}

interface CreditTransaction {
  id: string
  wallet_address: string
  amount: number
  transaction_type: 'purchase' | 'usage' | 'refund'
  description: string | null
  payment_txid: string | null
  created_at: string
}

interface TransactionSummary {
  total_pending: number
  total_completed: number
  total_expired: number
  total_credited: number
  total_not_credited: number
}

export default function AdminPage() {
  const { isConnected, currentAddress, isVerified, isVerifying, verifyWallet } = useWallet()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [transactions, setTransactions] = useState<PendingPayment[]>([])
  const [creditTransactions, setCreditTransactions] = useState<CreditTransaction[]>([])
  const [summary, setSummary] = useState<TransactionSummary | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [usersSummary, setUsersSummary] = useState<{
    total_users: number;
    total_credits_in_circulation: number;
    total_spent_all_users: number;
    total_collections: number;
  } | null>(null)
  const [activeTab, setActiveTab] = useState<'transactions' | 'users' | 'credit-costs' | 'generation-jobs' | 'generated-images' | 'homepage-visibility'>('users')
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [editingCredits, setEditingCredits] = useState<string | null>(null)
  const [editCreditValue, setEditCreditValue] = useState<string>('')
  const [editCreditReason, setEditCreditReason] = useState<string>('')
  const [savingCredits, setSavingCredits] = useState<string | null>(null)
  const [editingProfile, setEditingProfile] = useState<string | null>(null)
  const [editUsername, setEditUsername] = useState<string>('')
  const [editOptIn, setEditOptIn] = useState<boolean>(false)
  const [savingProfile, setSavingProfile] = useState<string | null>(null)
  const [wipingTransactions, setWipingTransactions] = useState(false)
  const [openaiBalance, setOpenaiBalance] = useState<{
    balance: number | null
    total_used: number | null
    current_month_usage: number | null
    subscription: { plan: string; hard_limit: number } | null
  } | null>(null)
  const [openaiLoading, setOpenaiLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 25
  const [optInFilter, setOptInFilter] = useState<'all' | 'opted-in' | 'not-opted-in'>('all')
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null)

  // Check admin status from database
  const { isAdmin: isAdminUser, loading: adminLoading } = useAdminCheck(currentAddress)
  
  const authorized = isAdminUser
  // Require verification: must be connected, authorized, AND verified
  // isVerifying means the prompt is open but not yet signed - still block access
  // Only allow access when isVerified is true AND isVerifying is false
  const requiresVerification = authorized && isConnected && (!isVerified || isVerifying)

  const copyToClipboard = async (text: string, addressType: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedAddress(`${addressType}-${text}`)
      setTimeout(() => setCopiedAddress(null), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  // Read tab from URL query params and set active tab
  useEffect(() => {
    const tab = searchParams?.get('tab')
    if (tab && ['transactions', 'users', 'credit-costs', 'generation-jobs', 'generated-images', 'homepage-visibility'].includes(tab)) {
      setActiveTab(tab as any)
    }
  }, [searchParams])

  useEffect(() => {
    if (isConnected && authorized && isVerified) {
      loadTransactions()
      loadUsers()
      loadOpenaiBalance()
      trackVisit()
    }
  }, [isConnected, authorized, isVerified, currentAddress])

  const loadOpenaiBalance = async () => {
    if (!currentAddress) return
    setOpenaiLoading(true)
    try {
      const response = await fetch(`/api/admin/openai-balance?wallet_address=${encodeURIComponent(currentAddress)}`)
      if (response.ok) {
        const data = await response.json()
        setOpenaiBalance(data)
      }
    } catch (err) {
      console.error('Failed to load OpenAI balance:', err)
    } finally {
      setOpenaiLoading(false)
    }
  }

  const trackVisit = async () => {
    if (!currentAddress) return
    
    try {
      // Get user agent and IP (IP will be captured server-side)
      const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : null
      
      await fetch('/api/admin/track-visit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          wallet_address: currentAddress,
          user_agent: userAgent,
        }),
      })
    } catch (error) {
      // Silently fail - don't interrupt the admin page if tracking fails
      console.error('Failed to track admin visit:', error)
    }
  }

  const loadTransactions = async () => {
    if (!currentAddress || !isVerified) return

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/admin/transactions?wallet_address=${encodeURIComponent(currentAddress)}&is_verified=true`)

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
      setCreditTransactions(data.credit_transactions || [])
      setSummary(data.summary || null)
    } catch (err) {
      console.error('Error loading transactions:', err)
      setError('Failed to load transactions')
    } finally {
      setLoading(false)
    }
  }

  const loadUsers = async () => {
    if (!currentAddress) return

    try {
      const response = await fetch(`/api/admin/users?wallet_address=${encodeURIComponent(currentAddress)}&is_verified=true`)

      if (!response.ok) {
        if (response.status === 403) {
          setError('Unauthorized. Admin access only.')
        } else {
          const errorData = await response.json()
          setError(errorData.error || 'Failed to load users')
        }
        return
      }

      const data = await response.json()
      // Debug: Check payment_address for the specific wallet
      const debugWallet = 'bc1pvp5axlxx0k2j5w4afurf70m5v5qplkr44lswl2z8z6zpy0sx32ts2f5r82'
      const debugUser = data.users?.find((u: User) => u.wallet_address === debugWallet)
      if (debugUser) {
        console.log('[Admin Debug] Wallet payment_address:', {
          wallet: debugWallet,
          hasProfile: !!debugUser.profile,
          payment_address: debugUser.profile?.payment_address,
          payment_address_type: typeof debugUser.profile?.payment_address,
          payment_address_length: debugUser.profile?.payment_address?.length,
          payment_address_truthy: !!debugUser.profile?.payment_address,
          payment_address_trimmed: debugUser.profile?.payment_address?.trim(),
          payment_address_trimmed_length: debugUser.profile?.payment_address?.trim()?.length,
        })
      }
      setUsers(data.users || [])
      setUsersSummary(data.summary || null)
      setCurrentPage(1) // Reset to first page when users data changes
    } catch (err) {
      console.error('Error loading users:', err)
      setError('Failed to load users')
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await Promise.all([loadTransactions(), loadUsers(), loadOpenaiBalance()])
    setRefreshing(false)
  }

  const handleStartEditCredits = (walletAddress: string, currentCredits: number) => {
    setEditingCredits(walletAddress)
    setEditCreditValue(currentCredits.toFixed(2))
    setEditCreditReason('')
  }

  const handleCancelEditCredits = () => {
    setEditingCredits(null)
    setEditCreditValue('')
    setEditCreditReason('')
  }

  const handleSaveCredits = async (walletAddress: string) => {
    if (!currentAddress) return

    const newBalance = parseFloat(editCreditValue)
    if (isNaN(newBalance) || newBalance < 0) {
      alert('Please enter a valid non-negative number')
      return
    }

    setSavingCredits(walletAddress)

    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(walletAddress)}/credits`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          admin_wallet_address: currentAddress,
          new_balance: newBalance,
          reason: editCreditReason || undefined,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update credits')
      }

      // Refresh users list
      await loadUsers()
      handleCancelEditCredits()
    } catch (err) {
      console.error('Error updating credits:', err)
      alert(err instanceof Error ? err.message : 'Failed to update credits')
    } finally {
      setSavingCredits(null)
    }
  }

  const handleStartEditProfile = (walletAddress: string, username: string, optIn: boolean) => {
    setEditingProfile(walletAddress)
    setEditUsername(username)
    setEditOptIn(optIn)
  }

  const handleCancelEditProfile = () => {
    setEditingProfile(null)
    setEditUsername('')
    setEditOptIn(false)
  }

  const handleSaveProfile = async (walletAddress: string) => {
    if (!currentAddress) return

    setSavingProfile(walletAddress)

    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(walletAddress)}/profile`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          admin_wallet_address: currentAddress,
          username: editUsername.trim() || undefined,
          opt_in: editOptIn,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update profile')
      }

      // Refresh users list
      await loadUsers()
      handleCancelEditProfile()
    } catch (err) {
      console.error('Error updating profile:', err)
      alert(err instanceof Error ? err.message : 'Failed to update profile')
    } finally {
      setSavingProfile(null)
    }
  }

  const handleWipeTransactions = async () => {
    if (!currentAddress) return

    const confirmed = window.confirm(
      '⚠️ DANGER: This will permanently delete ALL transactions (pending_payments and credit_transactions).\n\n' +
      'This action cannot be undone. Are you absolutely sure?'
    )

    if (!confirmed) return

    setWipingTransactions(true)

    try {
      const response = await fetch('/api/admin/wipe-transactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          wallet_address: currentAddress,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to wipe transactions')
      }

      const data = await response.json()
      alert(`✅ ${data.message}\n\nDeleted:\n- ${data.deleted.pending_payments} pending payments\n- ${data.deleted.credit_transactions} credit transactions`)
      
      // Refresh data
      await loadTransactions()
    } catch (err) {
      console.error('Error wiping transactions:', err)
      alert(err instanceof Error ? err.message : 'Failed to wipe transactions')
    } finally {
      setWipingTransactions(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
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
      <div className="min-h-screen bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24] flex items-center justify-center p-8">
        <div className="max-w-md w-full">
          <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 border border-[#9945FF]/20 rounded-2xl p-8 text-center shadow-xl shadow-[#9945FF]/10 backdrop-blur-md">
            <div className="text-6xl mb-6 animate-[solanaFloat_4s_ease-in-out_infinite]">🔐</div>
            <h1 className="text-3xl font-black bg-gradient-to-r from-[#9945FF] via-[#00D4FF] to-[#14F195] bg-clip-text text-transparent mb-4">Admin Dashboard</h1>
            <p className="text-[#a8a8b8] mb-6">Please connect your wallet to access the admin dashboard.</p>
            <div className="flex justify-center mb-4">
              <WalletConnect />
            </div>
            <Link href="/" className="text-[#9945FF] hover:text-[#14F195] transition-colors">
              ← Back to Home
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Show loading while checking admin status
  if (adminLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24] flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-20 h-20 mx-auto mb-6">
            <div className="absolute inset-0 border-4 border-[#9945FF]/20 rounded-full" />
            <div className="absolute inset-0 border-4 border-[#9945FF] border-t-transparent rounded-full animate-spin" />
            <div className="absolute inset-2 border-4 border-[#14F195]/20 rounded-full" />
            <div className="absolute inset-2 border-4 border-[#14F195] border-b-transparent rounded-full animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
          </div>
          <p className="text-white text-lg font-bold mb-2">Verifying admin access...</p>
          <p className="text-[#a8a8b8] text-sm">Please wait...</p>
        </div>
      </div>
    )
  }

  if (!authorized) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24] flex items-center justify-center p-8">
        <div className="max-w-md w-full">
          <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 border border-[#EF4444]/20 rounded-2xl p-8 text-center shadow-xl shadow-[#EF4444]/10 backdrop-blur-md">
            <div className="text-6xl mb-6">🚫</div>
            <h1 className="text-3xl font-black text-[#EF4444] mb-4">Access Denied</h1>
            <p className="text-white mb-4">This page is restricted to admin accounts only.</p>
            <p className="text-[#a8a8b8] text-sm mb-4">
              Connected: {currentAddress?.slice(0, 8)}...{currentAddress?.slice(-6)}
            </p>
            <p className="text-[#a8a8b8]/80 text-xs mb-4">
              Admin status is checked from the database profile.
            </p>
            <Link href="/" className="text-[#9945FF] hover:text-[#14F195] transition-colors">
              ← Back to Home
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Show wallet connect screen if not connected
  if (!isConnected || !currentAddress) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24] flex items-center justify-center p-8">
        <div className="max-w-md w-full">
          <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 border border-[#9945FF]/20 rounded-2xl p-8 text-center shadow-xl shadow-[#9945FF]/10 backdrop-blur-md">
            <div className="text-6xl mb-6">👛</div>
            <h1 className="text-3xl font-black text-[#9945FF] mb-4">Connect Your Wallet</h1>
            <p className="text-white mb-4">Please connect your admin wallet to access the dashboard.</p>
            <p className="text-[#a8a8b8] text-sm mb-6">
              You'll need to verify ownership after connecting.
            </p>
            <div className="mb-6">
              <WalletConnect />
            </div>
            <Link href="/" className="text-[#9945FF] hover:text-[#14F195] transition-colors">
              ← Back to Home
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (requiresVerification) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24] flex items-center justify-center p-8">
        <div className="max-w-md w-full">
          <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 border border-[#FBBF24]/20 rounded-2xl p-8 text-center shadow-xl shadow-[#FBBF24]/10 backdrop-blur-md">
            <div className="text-6xl mb-6">✋</div>
            <h1 className="text-3xl font-black text-[#FBBF24] mb-4">Verification Required</h1>
            <p className="text-white mb-4">You must verify your wallet by signing a message to access the admin dashboard.</p>
            <p className="text-[#a8a8b8] text-sm mb-4">
              Connected: {currentAddress?.slice(0, 8)}...{currentAddress?.slice(-6)}
            </p>
            <p className="text-[#a8a8b8] text-xs mb-6">
              This ensures you actually own the wallet address.
            </p>
            {isVerifying ? (
              <div className="px-6 py-3 bg-gradient-to-r from-[#FBBF24] to-[#F59E0B] text-white rounded-xl font-bold mb-4">
                Verifying... Check your wallet for the signature request
              </div>
            ) : (
              <button
                onClick={verifyWallet}
                className="w-full px-8 py-3 bg-gradient-to-r from-[#FBBF24] to-[#F59E0B] hover:from-[#F59E0B] hover:to-[#FBBF24] text-white font-bold rounded-xl transition-all duration-300 shadow-lg shadow-[#FBBF24]/40 hover:shadow-xl hover:shadow-[#FBBF24]/50 hover:scale-105 active:scale-95 mb-4"
              >
                Sign Message to Verify
              </button>
            )}
            <div className="mt-4">
              <WalletConnect />
            </div>
            <Link href="/" className="block mt-4 text-[#9945FF] hover:text-[#14F195] transition-colors">
              ← Back to Home
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
        <div className="max-w-7xl mx-auto">
          {/* OpenAI Balance - Prominent Display */}
          <div className="mb-8">
            <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 border border-[#14F195]/30 rounded-2xl p-6 shadow-xl shadow-[#14F195]/10 backdrop-blur-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-[#14F195]/20 rounded-xl flex items-center justify-center">
                    <span className="text-3xl">🤖</span>
                  </div>
                  <div>
                    <div className="text-sm font-bold text-[#14F195] uppercase tracking-wide mb-1">OpenAI API Balance</div>
                    {openaiLoading ? (
                      <div className="text-2xl font-bold text-[#a8a8b8]">Loading...</div>
                    ) : openaiBalance?.balance !== null && openaiBalance?.balance !== undefined ? (
                      <div className="text-4xl font-black text-[#14F195]">${openaiBalance.balance.toFixed(2)}</div>
                    ) : openaiBalance?.subscription?.hard_limit ? (
                      <div className="text-4xl font-black text-[#14F195]">
                        ${((openaiBalance.subscription.hard_limit || 0) - (openaiBalance.current_month_usage || 0)).toFixed(2)}
                        <span className="text-lg text-[#a8a8b8] font-normal ml-2">remaining</span>
                      </div>
                    ) : (
                      <div>
                        <div className="text-lg font-medium text-[#a8a8b8]">Check balance manually</div>
                        <div className="text-xs text-[#a8a8b8]/80 mt-1">(API billing endpoints require dashboard access)</div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  {openaiBalance?.current_month_usage !== null && openaiBalance?.current_month_usage !== undefined && (
                    <div className="text-sm text-[#a8a8b8]">
                      This month: <span className="text-white font-semibold">${openaiBalance.current_month_usage.toFixed(2)}</span> used
                    </div>
                  )}
                  {openaiBalance?.subscription?.plan && (
                    <div className="text-xs text-[#a8a8b8]/80 mt-1">
                      Plan: {openaiBalance.subscription.plan}
                    </div>
                  )}
                  <a 
                    href="https://platform.openai.com/settings/organization/billing/overview" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-block mt-2 text-sm text-[#14F195] hover:text-[#14F195] underline"
                  >
                    View on OpenAI →
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Header */}
          <div className="mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
              <div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 bg-clip-text text-transparent mb-2">
                  Admin Dashboard
                </h1>
                <p className="text-[#a8a8b8] text-lg">Transaction tracking and credit management</p>
              </div>
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-xl font-semibold shadow-lg shadow-blue-500/20 transition-all duration-200 disabled:opacity-50 flex items-center gap-2"
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

            {/* Tabs - Only for dashboard content tabs, navigation is in sidebar */}
            <div className="flex flex-wrap gap-2 mb-6">
              <button
                onClick={() => setActiveTab('users')}
                className={`px-6 py-3 rounded-xl font-semibold transition-all duration-200 ${
                  activeTab === 'users'
                    ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg shadow-purple-500/30'
                    : 'bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90/50 border border-[#9945FF]/20 text-white hover:bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90'
                }`}
              >
                Users
              </button>
              <button
                onClick={() => setActiveTab('transactions')}
                className={`px-6 py-3 rounded-xl font-semibold transition-all duration-200 ${
                  activeTab === 'transactions'
                    ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg shadow-purple-500/30'
                    : 'bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90/50 border border-[#9945FF]/20 text-white hover:bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90'
                }`}
              >
                Transactions
              </button>
              <button
                onClick={() => setActiveTab('credit-costs')}
                className={`px-6 py-3 rounded-xl font-semibold transition-all duration-200 ${
                  activeTab === 'credit-costs'
                    ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg shadow-purple-500/30'
                    : 'bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90/50 border border-[#9945FF]/20 text-white hover:bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90'
                }`}
              >
                Credit Costs
              </button>
              <button
                onClick={() => setActiveTab('generation-jobs')}
                className={`px-6 py-3 rounded-xl font-semibold transition-all duration-200 ${
                  activeTab === 'generation-jobs'
                    ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg shadow-purple-500/30'
                    : 'bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90/50 border border-[#9945FF]/20 text-white hover:bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90'
                }`}
              >
                Generation Jobs
              </button>
              <button
                onClick={() => setActiveTab('generated-images')}
                className={`px-6 py-3 rounded-xl font-semibold transition-all duration-200 ${
                  activeTab === 'generated-images'
                    ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg shadow-purple-500/30'
                    : 'bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90/50 border border-[#9945FF]/20 text-white hover:bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90'
                }`}
              >
                Generated Images
              </button>
              <button
                onClick={() => setActiveTab('homepage-visibility')}
                className={`px-6 py-3 rounded-xl font-semibold transition-all duration-200 ${
                  activeTab === 'homepage-visibility'
                    ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg shadow-purple-500/30'
                    : 'bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90/50 border border-[#9945FF]/20 text-white hover:bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90'
                }`}
              >
                Homepage Visibility
              </button>
            </div>
          </div>

          {/* Summary Cards */}
          {activeTab === 'users' && usersSummary && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <div className="bg-gradient-to-br from-blue-900/30 to-blue-800/20 border border-blue-700/50 rounded-2xl p-6 shadow-lg shadow-blue-500/10">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium text-blue-300 uppercase tracking-wide">Total Users</div>
                  <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                </div>
                <div className="text-3xl font-bold text-white">{usersSummary.total_users}</div>
              </div>
              <div className="bg-gradient-to-br from-green-900/30 to-green-800/20 border border-green-700/50 rounded-2xl p-6 shadow-lg shadow-green-500/10">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium text-green-300 uppercase tracking-wide">Credits in Circulation</div>
                  <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="text-3xl font-bold text-white">
                  {typeof usersSummary.total_credits_in_circulation === 'number' 
                    ? usersSummary.total_credits_in_circulation.toLocaleString('en-US', { 
                        minimumFractionDigits: 0, 
                        maximumFractionDigits: 1 
                      })
                    : (() => {
                        const num = parseFloat(String(usersSummary.total_credits_in_circulation || 0))
                        return isNaN(num) ? '0' : num.toLocaleString('en-US', {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 1
                        })
                      })()
                  }
                </div>
              </div>
              <div className="bg-gradient-to-br from-purple-900/30 to-purple-800/20 border border-purple-700/50 rounded-2xl p-6 shadow-lg shadow-purple-500/10">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium text-purple-300 uppercase tracking-wide">Total Spent</div>
                  <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <div className="text-3xl font-bold text-white">
                  {typeof usersSummary.total_spent_all_users === 'number'
                    ? usersSummary.total_spent_all_users.toLocaleString('en-US', {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 1
                      })
                    : (() => {
                        const num = parseFloat(String(usersSummary.total_spent_all_users || 0))
                        return isNaN(num) ? '0' : num.toLocaleString('en-US', {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 1
                        })
                      })()
                  }
                </div>
              </div>
              <div className="bg-gradient-to-br from-orange-900/30 to-orange-800/20 border border-orange-700/50 rounded-2xl p-6 shadow-lg shadow-orange-500/10">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium text-orange-300 uppercase tracking-wide">Total Collections</div>
                  <svg className="w-6 h-6 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
                <div className="text-3xl font-bold text-white">
                  {(() => {
                    const collections = usersSummary.total_collections
                    // If it's a number, use it directly
                    if (typeof collections === 'number') {
                      return collections
                    }
                    // If it's a string that looks like a number, parse it
                    const num = parseFloat(String(collections || 0))
                    // If it's NaN or looks like an ID (very long), return 0 or count properly
                    if (isNaN(num) || String(collections).length > 10) {
                      return '0'
                    }
                    return num
                  })()}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'transactions' && summary && (
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
          <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 border border-[#EF4444]/20/50 rounded-xl p-4 mb-6 text-red-300">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
            <p className="text-white mt-4">Loading {activeTab}...</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Users Tab */}
            {activeTab === 'users' && (
              <div className="bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24]/50 border border-gray-800 rounded-2xl p-6 shadow-2xl backdrop-blur-sm">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold text-white">All Users</h2>
                  <div className="text-sm text-[#a8a8b8]">
                    {(() => {
                      const filteredUsers = optInFilter === 'all' 
                        ? users 
                        : optInFilter === 'opted-in'
                        ? users.filter(u => u.profile?.opt_in === true)
                        : users.filter(u => !u.profile || u.profile.opt_in !== true)
                      return `${filteredUsers.length} ${filteredUsers.length === 1 ? 'user' : 'users'}`
                    })()}
                    {(() => {
                      const filteredUsers = optInFilter === 'all' 
                        ? users 
                        : optInFilter === 'opted-in'
                        ? users.filter(u => u.profile?.opt_in === true)
                        : users.filter(u => !u.profile || u.profile.opt_in !== true)
                      return filteredUsers.length > itemsPerPage ? (
                        <span className="ml-2">
                          (Page {currentPage} of {Math.ceil(filteredUsers.length / itemsPerPage)})
                        </span>
                      ) : null
                    })()}
                  </div>
                </div>
                
                {/* Opt-In Filter */}
                <div className="mb-4 flex items-center gap-2">
                  <span className="text-sm text-[#a8a8b8]">Filter by Opt-In:</span>
                  <button
                    onClick={() => {
                      setOptInFilter('all')
                      setCurrentPage(1)
                    }}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      optInFilter === 'all'
                        ? 'bg-[#9945FF] text-white'
                        : 'bg-[#1a1a24]/80 text-white hover:bg-gray-600'
                    }`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => {
                      setOptInFilter('opted-in')
                      setCurrentPage(1)
                    }}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      optInFilter === 'opted-in'
                        ? 'bg-green-600 text-white'
                        : 'bg-[#1a1a24]/80 text-white hover:bg-gray-600'
                    }`}
                  >
                    ✅ Opted In
                  </button>
                  <button
                    onClick={() => {
                      setOptInFilter('not-opted-in')
                      setCurrentPage(1)
                    }}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      optInFilter === 'not-opted-in'
                        ? 'bg-[#FBBF24] text-white'
                        : 'bg-[#1a1a24]/80 text-white hover:bg-gray-600'
                    }`}
                  >
                    ❌ Not Opted In
                  </button>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-[#9945FF]/20">
                        <th className="text-left py-4 px-4 text-white font-semibold">User</th>
                        <th className="text-left py-4 px-4 text-white font-semibold">Wallet</th>
                        <th className="text-left py-4 px-4 text-white font-semibold">Credits</th>
                        <th className="text-left py-4 px-4 text-white font-semibold">Spent</th>
                        <th className="text-left py-4 px-4 text-white font-semibold">Used</th>
                        <th className="text-left py-4 px-4 text-white font-semibold">Collections</th>
                        <th className="text-left py-4 px-4 text-white font-semibold">Payments</th>
                        <th className="text-left py-4 px-4 text-white font-semibold">Opt-In</th>
                        <th className="text-left py-4 px-4 text-white font-semibold">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="text-center py-12 text-[#a8a8b8]">
                            <div className="flex flex-col items-center gap-2">
                              <svg className="w-12 h-12 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                              </svg>
                              <p className="text-lg">No users found</p>
                            </div>
                          </td>
                        </tr>
                      ) : (() => {
                        // Filter users by opt_in status
                        const filteredUsers = optInFilter === 'all' 
                          ? users 
                          : optInFilter === 'opted-in'
                          ? users.filter(u => u.profile?.opt_in === true)
                          : users.filter(u => !u.profile || u.profile.opt_in !== true)
                        
                        // Calculate pagination
                        const startIndex = (currentPage - 1) * itemsPerPage
                        const endIndex = startIndex + itemsPerPage
                        const paginatedUsers = filteredUsers.slice(startIndex, endIndex)
                        const totalPages = Math.ceil(filteredUsers.length / itemsPerPage)
                        
                        return (
                          <>
                            {paginatedUsers.map((user) => (
                          <tr key={user.wallet_address} className="border-b border-gray-800/50 hover:bg-[#1a1a24]/20 transition-colors">
                            <td className="py-4 px-4">
                              {editingProfile === user.wallet_address ? (
                                <div className="flex flex-col gap-2 min-w-[250px]">
                                  <input
                                    type="text"
                                    value={editUsername}
                                    onChange={(e) => setEditUsername(e.target.value)}
                                    className="px-3 py-2 bg-[#14141e] border border-[#9945FF]/30 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="Username"
                                    disabled={savingProfile === user.wallet_address}
                                    autoFocus
                                  />
                                  <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={editOptIn}
                                      onChange={(e) => setEditOptIn(e.target.checked)}
                                      disabled={savingProfile === user.wallet_address}
                                      className="w-4 h-4 rounded border-[#9945FF]/30 bg-[#14141e] text-[#9945FF] focus:ring-2 focus:ring-blue-500"
                                    />
                                    <span className="text-white text-sm">Opt In</span>
                                  </label>
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => handleSaveProfile(user.wallet_address)}
                                      disabled={savingProfile === user.wallet_address}
                                      className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs rounded-lg disabled:opacity-50 transition-colors"
                                    >
                                      {savingProfile === user.wallet_address ? 'Saving...' : 'Save'}
                                    </button>
                                    <button
                                      onClick={handleCancelEditProfile}
                                      disabled={savingProfile === user.wallet_address}
                                      className="px-3 py-1.5 bg-gray-600 hover:bg-[#1a1a24]/80 text-white text-xs rounded-lg disabled:opacity-50 transition-colors"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                user.profile ? (
                                  <div className="flex items-center gap-3">
                                    {user.profile.avatar_url ? (
                                      <img
                                        src={user.profile.avatar_url}
                                        alt={user.profile.username}
                                        className="w-10 h-10 rounded-full border-2 border-[#9945FF]/20"
                                      />
                                    ) : (
                                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center text-white font-bold border-2 border-[#9945FF]/20">
                                        {(user.profile.display_name || user.profile.username).charAt(0).toUpperCase()}
                                      </div>
                                    )}
                                    <div className="flex-1">
                                      <div className="text-white font-semibold">
                                        {user.profile.display_name || `@${user.profile.username}`}
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <div className="text-[#a8a8b8] text-xs">@{user.profile.username}</div>
                                        <button
                                          onClick={() => handleStartEditProfile(user.wallet_address, user.profile?.username || '', user.profile?.opt_in || false)}
                                          className="text-blue-400 hover:text-blue-300 p-1 hover:bg-blue-500/10 rounded transition-colors"
                                          title="Edit username"
                                        >
                                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                          </svg>
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-full bg-[#1a1a24]/80 flex items-center justify-center">
                                      <svg className="w-4 h-4 text-[#a8a8b8]/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                      </svg>
                                    </div>
                                    <span className="text-[#a8a8b8]/80 text-sm">No Profile</span>
                                  </div>
                                )
                              )}
                            </td>
                            <td className="py-4 px-4">
                              <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-xs text-[#a8a8b8] bg-[#1a1a24]/50 px-2 py-1 rounded" title={user.wallet_address}>
                                    {user.wallet_address.substring(0, 6)}...{user.wallet_address.substring(user.wallet_address.length - 6)}
                                  </span>
                                  <button
                                    onClick={() => copyToClipboard(user.wallet_address, 'wallet')}
                                    className="p-1 hover:bg-[#1a1a24]/80 rounded transition-colors group"
                                    title="Copy full wallet address"
                                  >
                                    {copiedAddress === `wallet-${user.wallet_address}` ? (
                                      <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                      </svg>
                                    ) : (
                                      <svg className="w-4 h-4 text-[#a8a8b8] group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                      </svg>
                                    )}
                                  </button>
                                  <div className="flex gap-1">
                                    <div className="w-2 h-2 rounded-full bg-green-500" title="Active"></div>
                                  </div>
                                </div>
                                {user.profile?.payment_address && 
                                 user.profile.payment_address.trim() !== '' && (
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono text-xs text-blue-400 bg-blue-900/30 px-2 py-1 rounded" title={user.profile.payment_address}>
                                      Payment: {user.profile.payment_address.substring(0, 6)}...{user.profile.payment_address.substring(user.profile.payment_address.length - 6)}
                                    </span>
                                    <button
                                      onClick={() => copyToClipboard(user.profile?.payment_address!, 'payment')}
                                      className="p-1 hover:bg-[#1a1a24]/80 rounded transition-colors group"
                                      title="Copy full payment address"
                                    >
                                      {copiedAddress === `payment-${user.profile.payment_address}` ? (
                                        <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                      ) : (
                                        <svg className="w-4 h-4 text-blue-400 group-hover:text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                        </svg>
                                      )}
                                    </button>
                                  </div>
                                )}
                                {(!user.profile?.payment_address || 
                                  user.profile?.payment_address?.trim() === '') && (
                                  <div className="text-xs text-[#a8a8b8]/80 italic">No payment address</div>
                                )}
                              </div>
                            </td>
                            <td className="py-4 px-4">
                              {editingCredits === user.wallet_address ? (
                                <div className="flex flex-col gap-2 min-w-[200px]">
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={editCreditValue}
                                    onChange={(e) => setEditCreditValue(e.target.value)}
                                    className="px-3 py-2 bg-[#14141e] border border-[#9945FF]/30 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="0.00"
                                    disabled={savingCredits === user.wallet_address}
                                    autoFocus
                                  />
                                  <input
                                    type="text"
                                    value={editCreditReason}
                                    onChange={(e) => setEditCreditReason(e.target.value)}
                                    className="px-3 py-2 bg-[#14141e] border border-[#9945FF]/30 rounded-lg text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="Reason (optional)"
                                    disabled={savingCredits === user.wallet_address}
                                  />
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => handleSaveCredits(user.wallet_address)}
                                      disabled={savingCredits === user.wallet_address}
                                      className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs rounded-lg disabled:opacity-50 transition-colors"
                                    >
                                      {savingCredits === user.wallet_address ? 'Saving...' : 'Save'}
                                    </button>
                                    <button
                                      onClick={handleCancelEditCredits}
                                      disabled={savingCredits === user.wallet_address}
                                      className="px-3 py-1.5 bg-gray-600 hover:bg-[#1a1a24]/80 text-white text-xs rounded-lg disabled:opacity-50 transition-colors"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <span className="text-green-400 font-bold text-lg">
                                    {parseFloat(String(user.credits.current || 0)).toLocaleString('en-US', {
                                      minimumFractionDigits: 0,
                                      maximumFractionDigits: 2
                                    })}
                                  </span>
                                  <button
                                    onClick={() => handleStartEditCredits(user.wallet_address, parseFloat(String(user.credits.current || 0)))}
                                    className="text-blue-400 hover:text-blue-300 p-1.5 hover:bg-blue-500/10 rounded-lg transition-colors"
                                    title="Edit credits"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                    </svg>
                                  </button>
                                </div>
                              )}
                            </td>
                            <td className="py-4 px-4">
                              <div className="text-white font-semibold">
                                {parseFloat(String(user.credits.total_spent || 0)).toLocaleString('en-US', {
                                  minimumFractionDigits: 0,
                                  maximumFractionDigits: 2
                                })}
                              </div>
                              <div className="text-[#a8a8b8]/80 text-xs mt-1">{user.credits.purchase_count} purchase{user.credits.purchase_count !== 1 ? 's' : ''}</div>
                            </td>
                            <td className="py-4 px-4">
                              <div className="text-[#EF4444] font-semibold">
                                {parseFloat(String(user.credits.total_used || 0)).toLocaleString('en-US', {
                                  minimumFractionDigits: 0,
                                  maximumFractionDigits: 2
                                })}
                              </div>
                              <div className="text-[#a8a8b8]/80 text-xs mt-1">{user.credits.usage_count} usage{user.credits.usage_count !== 1 ? 's' : ''}</div>
                            </td>
                            <td className="py-4 px-4">
                              <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-purple-600/20 text-purple-400 font-bold text-sm border border-purple-500/30">
                                {user.collections.count}
                              </span>
                            </td>
                            <td className="py-4 px-4">
                              <div className="space-y-1">
                                {user.payments.pending.count > 0 && (
                                  <div className="flex items-center gap-1.5">
                                    <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
                                    <span className="text-[#FBBF24] text-xs font-medium">Pending: {user.payments.pending.count}</span>
                                  </div>
                                )}
                                {user.payments.completed.count > 0 && (
                                  <div className="flex items-center gap-1.5">
                                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                    <span className="text-green-400 text-xs font-medium">Completed: {user.payments.completed.count}</span>
                                  </div>
                                )}
                                {user.payments.completed.btc_total && parseFloat(user.payments.completed.btc_total.toString()) > 0 && (
                                  <div className="text-[#a8a8b8] text-xs mt-1">₿ {parseFloat(user.payments.completed.btc_total.toString()).toFixed(8)}</div>
                                )}
                                {user.payments.pending.count === 0 && user.payments.completed.count === 0 && (
                                  <span className="text-[#a8a8b8]/80 text-xs">No payments</span>
                                )}
                              </div>
                            </td>
                            <td className="py-4 px-4">
                              {user.profile ? (
                                <div className="flex items-center gap-2">
                                  {user.profile.opt_in ? (
                                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-600/20 text-green-400 border border-green-500/30">
                                      ✅ Opted In
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-[#FBBF24]/20 text-[#FBBF24] border border-yellow-500/30">
                                      ❌ Not Opted In
                                    </span>
                                  )}
                                  {editingProfile !== user.wallet_address && (
                                    <button
                                      onClick={() => handleStartEditProfile(user.wallet_address, user.profile?.username || '', user.profile?.opt_in || false)}
                                      className="text-blue-400 hover:text-blue-300 p-1 hover:bg-blue-500/10 rounded transition-colors"
                                      title="Edit opt-in status"
                                    >
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                      </svg>
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <span className="text-[#a8a8b8]/80 text-xs italic">No Profile</span>
                              )}
                            </td>
                            <td className="py-4 px-4">
                              {user.account_created ? (
                                <div className="text-white text-xs">
                                  {new Date(user.account_created).toLocaleDateString('en-US', { 
                                    month: 'short', 
                                    day: 'numeric', 
                                    year: 'numeric' 
                                  })}
                                  <div className="text-[#a8a8b8]/80 text-[10px] mt-0.5">
                                    {new Date(user.account_created).toLocaleTimeString('en-US', { 
                                      hour: 'numeric', 
                                      minute: '2-digit' 
                                    })}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-[#a8a8b8]/80 text-xs">-</span>
                              )}
                            </td>
                          </tr>
                            ))}
                            
                            {/* Pagination Controls */}
                            {totalPages > 1 && (
                              <tr>
                                <td colSpan={9} className="py-4 px-4">
                                  <div className="flex items-center justify-between">
                                    <div className="text-sm text-[#a8a8b8]">
                                      Showing {startIndex + 1} to {Math.min(endIndex, filteredUsers.length)} of {filteredUsers.length} users
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <button
                                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                        disabled={currentPage === 1}
                                        className="px-4 py-2 bg-[#1a1a24] hover:bg-[#1a1a24]/80 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                      >
                                        Previous
                                      </button>
                                      <div className="flex items-center gap-1">
                                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                          let pageNum
                                          if (totalPages <= 5) {
                                            pageNum = i + 1
                                          } else if (currentPage <= 3) {
                                            pageNum = i + 1
                                          } else if (currentPage >= totalPages - 2) {
                                            pageNum = totalPages - 4 + i
                                          } else {
                                            pageNum = currentPage - 2 + i
                                          }
                                          
                                          return (
                                            <button
                                              key={pageNum}
                                              onClick={() => setCurrentPage(pageNum)}
                                              className={`px-3 py-2 rounded-lg transition-colors ${
                                                currentPage === pageNum
                                                  ? 'bg-[#9945FF] text-white'
                                                  : 'bg-[#1a1a24] hover:bg-[#1a1a24]/80 text-white'
                                              }`}
                                            >
                                              {pageNum}
                                            </button>
                                          )
                                        })}
                                      </div>
                                      <button
                                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                        disabled={currentPage === totalPages}
                                        className="px-4 py-2 bg-[#1a1a24] hover:bg-[#1a1a24]/80 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                      >
                                        Next
                                      </button>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </>
                        )
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Transactions Tab */}
            {activeTab === 'transactions' && (
              <>
                {/* Pending Payments Table */}
                <div className="bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24]/50 border border-gray-800 rounded-2xl p-6 shadow-2xl backdrop-blur-sm mb-6">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                    <div>
                      <h2 className="text-2xl font-bold text-white mb-2">Payment Transactions</h2>
                      <p className="text-sm text-[#a8a8b8]">
                        Showing only real transactions: completed payments with TXID, or active pending payments. Expired unpaid attempts are excluded.
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2 text-xs text-[#a8a8b8] bg-[#1a1a24]/50 px-3 py-1.5 rounded-lg">
                        <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>Real blockchain transaction</span>
                      </div>
                      <button
                        onClick={handleWipeTransactions}
                        disabled={wipingTransactions}
                        className="px-4 py-2 bg-red-600/80 hover:bg-red-600 text-white rounded-xl font-semibold text-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 border border-red-500/50"
                        title="Wipe all transactions (pending_payments and credit_transactions)"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        {wipingTransactions ? 'Wiping...' : 'Wipe Transactions'}
                      </button>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-[#9945FF]/20">
                          <th className="text-left py-4 px-4 text-white font-semibold">Date</th>
                          <th className="text-left py-4 px-4 text-white font-semibold">Wallet</th>
                          <th className="text-left py-4 px-4 text-white font-semibold">Credits</th>
                          <th className="text-left py-4 px-4 text-white font-semibold">BTC Amount</th>
                          <th className="text-left py-4 px-4 text-white font-semibold">Status</th>
                          <th className="text-left py-4 px-4 text-white font-semibold">TXID</th>
                          <th className="text-left py-4 px-4 text-white font-semibold">Confirmations</th>
                          <th className="text-left py-4 px-4 text-white font-semibold">Credited</th>
                        </tr>
                      </thead>
                      <tbody>
                        {transactions.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="text-center py-12 text-[#a8a8b8]">
                              <div className="flex flex-col items-center gap-2">
                                <svg className="w-12 h-12 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                </svg>
                                <p className="text-lg">No transactions found</p>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          transactions.map((tx) => (
                            <tr key={tx.id} className="border-b border-gray-800/50 hover:bg-[#1a1a24]/20 transition-colors">
                              <td className="py-4 px-4">
                                <div className="text-white text-sm">
                                  {new Date(tx.created_at).toLocaleDateString('en-US', { 
                                    month: 'short', 
                                    day: 'numeric', 
                                    year: 'numeric' 
                                  })}
                                  <div className="text-[#a8a8b8]/80 text-xs mt-0.5">
                                    {new Date(tx.created_at).toLocaleTimeString('en-US', { 
                                      hour: 'numeric', 
                                      minute: '2-digit' 
                                    })}
                                  </div>
                                </div>
                              </td>
                              <td className="py-4 px-4">
                                <span className="font-mono text-xs text-[#a8a8b8] bg-[#1a1a24]/50 px-2 py-1 rounded">
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

                {/* Credit Transactions Table */}
                <div className="bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24]/50 border border-gray-800 rounded-2xl p-6 shadow-2xl backdrop-blur-sm">
                  <div className="mb-6">
                    <h2 className="text-2xl font-bold text-white mb-2">All Credit Transactions</h2>
                    <p className="text-sm text-[#a8a8b8]">
                      Complete history of all credit transactions across all users (purchases, usage, and refunds)
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-[#9945FF]/20">
                          <th className="text-left py-4 px-4 text-white font-semibold">Date</th>
                          <th className="text-left py-4 px-4 text-white font-semibold">Wallet</th>
                          <th className="text-left py-4 px-4 text-white font-semibold">Amount</th>
                          <th className="text-left py-4 px-4 text-white font-semibold">Type</th>
                          <th className="text-left py-4 px-4 text-white font-semibold">Description</th>
                          <th className="text-left py-4 px-4 text-white font-semibold">Payment TXID</th>
                        </tr>
                      </thead>
                      <tbody>
                        {creditTransactions.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="text-center py-12 text-[#a8a8b8]">
                              <div className="flex flex-col items-center gap-2">
                                <svg className="w-12 h-12 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                </svg>
                                <p className="text-lg">No credit transactions found</p>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          creditTransactions.map((ct) => (
                            <tr key={ct.id} className="border-b border-gray-800/50 hover:bg-[#1a1a24]/20 transition-colors">
                              <td className="py-4 px-4">
                                <div className="text-white text-sm">
                                  {new Date(ct.created_at).toLocaleDateString('en-US', { 
                                    month: 'short', 
                                    day: 'numeric', 
                                    year: 'numeric' 
                                  })}
                                  <div className="text-[#a8a8b8]/80 text-xs mt-0.5">
                                    {new Date(ct.created_at).toLocaleTimeString('en-US', { 
                                      hour: 'numeric', 
                                      minute: '2-digit' 
                                    })}
                                  </div>
                                </div>
                              </td>
                              <td className="py-4 px-4">
                                <span className="font-mono text-xs text-[#a8a8b8] bg-[#1a1a24]/50 px-2 py-1 rounded">
                                  {ct.wallet_address.substring(0, 6)}...{ct.wallet_address.substring(ct.wallet_address.length - 6)}
                                </span>
                              </td>
                              <td className="py-4 px-4">
                                <div className={`font-bold text-lg flex items-center gap-1 ${parseFloat(String(ct.amount || 0)) > 0 ? 'text-green-400' : 'text-[#EF4444]'}`}>
                                  {parseFloat(String(ct.amount || 0)) > 0 ? (
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                    </svg>
                                  ) : (
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                                    </svg>
                                  )}
                                  {parseFloat(String(ct.amount || 0)) > 0 ? '+' : ''}
                                  {parseFloat(String(ct.amount || 0)).toLocaleString('en-US', {
                                    minimumFractionDigits: 0,
                                    maximumFractionDigits: 2
                                  })}
                                </div>
                              </td>
                              <td className="py-4 px-4">
                                <span className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                                  ct.transaction_type === 'purchase' 
                                    ? 'bg-green-900/30 border-green-700 text-green-300'
                                    : ct.transaction_type === 'refund'
                                    ? 'bg-blue-900/30 border-blue-700 text-blue-300'
                                    : 'bg-red-900/30 border-[#EF4444]/20 text-red-300'
                                }`}>
                                  {ct.transaction_type}
                                </span>
                              </td>
                              <td className="py-4 px-4">
                                <span className="text-white text-sm">{ct.description || '-'}</span>
                              </td>
                              <td className="py-4 px-4">
                                {ct.payment_txid ? (
                                  <a
                                    href={`https://mempool.space/tx/${ct.payment_txid}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-400 hover:text-blue-300 font-mono text-xs hover:underline flex items-center gap-1"
                                  >
                                    {ct.payment_txid.substring(0, 12)}...
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                    </svg>
                                  </a>
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
              </>
            )}

            {/* Credit Costs Management */}
            {activeTab === 'credit-costs' && (
              <CreditCostsManager walletAddress={currentAddress || ''} />
            )}

            {/* Generation Jobs */}
            {activeTab === 'generation-jobs' && (
              <GenerationJobsManager walletAddress={currentAddress || ''} />
            )}

            {/* Generated Images */}
            {activeTab === 'generated-images' && (
              <GeneratedImagesManager walletAddress={currentAddress || ''} />
            )}

            {/* Homepage Visibility */}
            {activeTab === 'homepage-visibility' && (
              <HomepageVisibilityManager walletAddress={currentAddress || ''} />
            )}
          </div>
        )}
    </div>
  )
}

// Generation Jobs Management Component
function GenerationJobsManager({ walletAddress }: { walletAddress: string }) {
  interface GenerationJob {
    id: string
    collection_id: string
    collection_name: string | null
    collection_owner: string | null
    ordinal_number: number | null
    trait_overrides: Record<string, string> | null
    status: 'pending' | 'processing' | 'completed' | 'failed'
    created_at: string
    started_at: string | null
    completed_at: string | null
    error_message: string | null
  }

  const [jobs, setJobs] = useState<GenerationJob[]>([])
  const [summary, setSummary] = useState<{
    pending: number
    processing: number
    completed: number
    failed: number
    total: number
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [error, setError] = useState<string | null>(null)
  const [wiping, setWiping] = useState(false)
  const [processing, setProcessing] = useState(false)

  useEffect(() => {
    if (walletAddress) {
      loadJobs()
    }
  }, [walletAddress, statusFilter])

  const loadJobs = async () => {
    if (!walletAddress) return

    setLoading(true)
    setError(null)

    try {
      const url = statusFilter === 'all' 
        ? `/api/admin/generation-jobs?wallet_address=${encodeURIComponent(walletAddress)}`
        : `/api/admin/generation-jobs?wallet_address=${encodeURIComponent(walletAddress)}&status=${statusFilter}`
      
      const response = await fetch(url)

      if (!response.ok) {
        if (response.status === 403) {
          setError('Unauthorized. Admin access only.')
        } else {
          const errorData = await response.json()
          setError(errorData.error || 'Failed to load generation jobs')
        }
        setLoading(false)
        return
      }

      const data = await response.json()
      setJobs(data.jobs || [])
      setSummary(data.summary || null)
    } catch (err) {
      console.error('Error loading generation jobs:', err)
      setError('Failed to load generation jobs')
    } finally {
      setLoading(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-900/30 text-yellow-300 border-[#FBBF24]/20'
      case 'processing':
        return 'bg-blue-900/30 text-blue-300 border-blue-700'
      case 'completed':
        return 'bg-green-900/30 text-green-300 border-green-700'
      case 'failed':
        return 'bg-red-900/30 text-red-300 border-[#EF4444]/20'
      default:
        return 'bg-[#1a1a24] text-[#a8a8b8] border-[#9945FF]/20'
    }
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-'
    return new Date(dateString).toLocaleString()
  }

  const getDuration = (started: string | null, completed: string | null) => {
    if (!started) return '-'
    const end = completed || new Date().toISOString()
    const duration = new Date(end).getTime() - new Date(started).getTime()
    const seconds = Math.floor(duration / 1000)
    const minutes = Math.floor(seconds / 60)
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`
    }
    return `${seconds}s`
  }

  const handleProcessJobs = async () => {
    setProcessing(true)
    try {
      const response = await fetch('/api/cron/process-generation-jobs-v2', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          wallet_address: walletAddress,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        console.error('Process jobs error:', data)
        throw new Error(data.error || 'Failed to process jobs')
      }

      alert(`✅ Jobs processed!\n\nProcessed: ${data.processed || 0} jobs\nSuccessful: ${data.successful || 0}\nFailed: ${data.failed || 0}`)
      
      // Reload jobs
      await loadJobs()
    } catch (err) {
      console.error('Error processing jobs:', err)
      alert(err instanceof Error ? err.message : 'Failed to process jobs')
    } finally {
      setProcessing(false)
    }
  }

  const handleWipe = async () => {
    if (!walletAddress) return

    const confirmed = window.confirm(
      '⚠️ DANGER: This will permanently delete ALL generation jobs (pending, processing, completed, and failed).\n\n' +
      'This action cannot be undone. Are you absolutely sure?'
    )

    if (!confirmed) return

    setWiping(true)

    try {
      const response = await fetch('/api/admin/wipe-generation-jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          wallet_address: walletAddress,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to wipe generation jobs')
      }

      const data = await response.json()
      alert(`✅ ${data.message}\n\nDeleted: ${data.deleted.generation_jobs} generation jobs`)
      
      // Reload jobs
      await loadJobs()
    } catch (err) {
      console.error('Error wiping generation jobs:', err)
      alert(err instanceof Error ? err.message : 'Failed to wipe generation jobs')
    } finally {
      setWiping(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">Generation Jobs</h2>
          <p className="text-[#a8a8b8]">Monitor all pending, processing, and completed generation jobs</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleProcessJobs}
            disabled={processing || loading}
            className="px-6 py-3 bg-gradient-to-r from-[#9945FF] to-[#14F195] hover:opacity-90 text-white rounded-lg font-bold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
            title="Manually process queued generation jobs"
          >
            {processing ? '⏳ Processing...' : '🚀 Process Jobs Now'}
          </button>
          <button
            onClick={loadJobs}
            disabled={loading}
            className="px-4 py-2 bg-[#9945FF] hover:bg-[#7C3AED] text-white rounded-lg font-semibold transition-all duration-200 disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
          <button
            onClick={handleWipe}
            disabled={wiping || loading}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold text-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Wipe all generation jobs"
          >
            {wiping ? 'Wiping...' : '🗑️ Wipe Generation Jobs'}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-900/30 border border-[#EF4444]/20 rounded-lg text-red-200">
          {error}
        </div>
      )}

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24]/50 border border-gray-800 rounded-xl p-4">
            <div className="text-2xl font-bold text-[#FBBF24]">{summary.pending}</div>
            <div className="text-sm text-[#a8a8b8]">Pending</div>
          </div>
          <div className="bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24]/50 border border-gray-800 rounded-xl p-4">
            <div className="text-2xl font-bold text-blue-400">{summary.processing}</div>
            <div className="text-sm text-[#a8a8b8]">Processing</div>
          </div>
          <div className="bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24]/50 border border-gray-800 rounded-xl p-4">
            <div className="text-2xl font-bold text-green-400">{summary.completed}</div>
            <div className="text-sm text-[#a8a8b8]">Completed</div>
          </div>
          <div className="bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24]/50 border border-gray-800 rounded-xl p-4">
            <div className="text-2xl font-bold text-[#EF4444]">{summary.failed}</div>
            <div className="text-sm text-[#a8a8b8]">Failed</div>
          </div>
          <div className="bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24]/50 border border-gray-800 rounded-xl p-4">
            <div className="text-2xl font-bold text-purple-400">{summary.total}</div>
            <div className="text-sm text-[#a8a8b8]">Total</div>
          </div>
        </div>
      )}

      {/* Status Filter */}
      <div className="flex gap-2">
        <button
          onClick={() => setStatusFilter('all')}
          className={`px-4 py-2 rounded-lg font-semibold transition-all duration-200 ${
            statusFilter === 'all'
              ? 'bg-purple-600 text-white'
              : 'bg-[#1a1a24]/80 text-white hover:bg-gray-600'
          }`}
        >
          All
        </button>
        <button
          onClick={() => setStatusFilter('pending')}
          className={`px-4 py-2 rounded-lg font-semibold transition-all duration-200 ${
            statusFilter === 'pending'
              ? 'bg-[#FBBF24] text-white'
              : 'bg-[#1a1a24]/80 text-white hover:bg-gray-600'
          }`}
        >
          Pending
        </button>
        <button
          onClick={() => setStatusFilter('processing')}
          className={`px-4 py-2 rounded-lg font-semibold transition-all duration-200 ${
            statusFilter === 'processing'
              ? 'bg-[#9945FF] text-white'
              : 'bg-[#1a1a24]/80 text-white hover:bg-gray-600'
          }`}
        >
          Processing
        </button>
        <button
          onClick={() => setStatusFilter('completed')}
          className={`px-4 py-2 rounded-lg font-semibold transition-all duration-200 ${
            statusFilter === 'completed'
              ? 'bg-green-600 text-white'
              : 'bg-[#1a1a24]/80 text-white hover:bg-gray-600'
          }`}
        >
          Completed
        </button>
        <button
          onClick={() => setStatusFilter('failed')}
          className={`px-4 py-2 rounded-lg font-semibold transition-all duration-200 ${
            statusFilter === 'failed'
              ? 'bg-red-600 text-white'
              : 'bg-[#1a1a24]/80 text-white hover:bg-gray-600'
          }`}
        >
          Failed
        </button>
      </div>

      {/* Jobs Table */}
      <div className="bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24]/50 border border-gray-800 rounded-xl p-6 shadow-xl">
        {loading ? (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
            <p className="text-[#a8a8b8] mt-2">Loading jobs...</p>
          </div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-8 text-[#a8a8b8]">
            <p>No generation jobs found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#9945FF]/20">
                  <th className="text-left py-3 px-4 text-white">Status</th>
                  <th className="text-left py-3 px-4 text-white">Collection</th>
                  <th className="text-left py-3 px-4 text-white">Owner</th>
                  <th className="text-left py-3 px-4 text-white">Ordinal #</th>
                  <th className="text-left py-3 px-4 text-white">Trait Filters</th>
                  <th className="text-left py-3 px-4 text-white">Created</th>
                  <th className="text-left py-3 px-4 text-white">Started</th>
                  <th className="text-left py-3 px-4 text-white">Completed</th>
                  <th className="text-left py-3 px-4 text-white">Duration</th>
                  <th className="text-left py-3 px-4 text-white">Error</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id} className="border-b border-gray-800 hover:bg-[#1a1a24]/30">
                    <td className="py-3 px-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(job.status)}`}>
                        {job.status}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-white font-semibold">{job.collection_name || 'Unknown'}</div>
                      <div className="text-[#a8a8b8] text-xs font-mono">{job.collection_id.substring(0, 8)}...</div>
                    </td>
                    <td className="py-3 px-4">
                      {job.collection_owner ? (
                        <span className="font-mono text-xs text-[#a8a8b8]">
                          {job.collection_owner.substring(0, 8)}...{job.collection_owner.substring(job.collection_owner.length - 8)}
                        </span>
                      ) : (
                        <span className="text-[#a8a8b8]/80">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-white">
                      {job.ordinal_number !== null ? `#${job.ordinal_number}` : 'Auto'}
                    </td>
                    <td className="py-3 px-4">
                      {job.trait_overrides && Object.keys(job.trait_overrides).length > 0 ? (
                        <div className="text-xs">
                          <div className="text-orange-400 font-semibold mb-1">
                            {Object.keys(job.trait_overrides).length} filter{Object.keys(job.trait_overrides).length > 1 ? 's' : ''}
                          </div>
                          <div className="text-[#a8a8b8] space-y-0.5">
                            {Object.entries(job.trait_overrides).slice(0, 2).map(([layer, trait]) => (
                              <div key={layer} className="truncate max-w-[120px]" title={`${layer}: ${trait}`}>
                                {layer}: {trait}
                              </div>
                            ))}
                            {Object.keys(job.trait_overrides).length > 2 && (
                              <div className="text-[#a8a8b8]/80">+{Object.keys(job.trait_overrides).length - 2} more</div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span className="text-[#a8a8b8]/80 text-xs">None</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-white text-xs">
                      {formatDate(job.created_at)}
                    </td>
                    <td className="py-3 px-4 text-white text-xs">
                      {formatDate(job.started_at)}
                    </td>
                    <td className="py-3 px-4 text-white text-xs">
                      {formatDate(job.completed_at)}
                    </td>
                    <td className="py-3 px-4 text-white text-xs">
                      {getDuration(job.started_at, job.completed_at)}
                    </td>
                    <td className="py-3 px-4">
                      {job.error_message ? (
                        <span className="text-[#EF4444] text-xs" title={job.error_message}>
                          {job.error_message.substring(0, 50)}...
                        </span>
                      ) : (
                        <span className="text-[#a8a8b8]/80">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// Credit Costs Management Component
function CreditCostsManager({ walletAddress }: { walletAddress: string }) {
  const [costs, setCosts] = useState<Array<{
    id: number
    action_type: string
    cost_per_unit: number
    unit_name: string
    description: string | null
    updated_at: string
    updated_by: string | null
  }>>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    loadCosts()
  }, [walletAddress])

  const loadCosts = async () => {
    if (!walletAddress) return

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/admin/credit-costs?wallet_address=${encodeURIComponent(walletAddress)}`)

      if (!response.ok) {
        if (response.status === 403) {
          setError('Unauthorized. Admin access only.')
        } else {
          const errorData = await response.json()
          setError(errorData.error || 'Failed to load credit costs')
        }
        setLoading(false)
        return
      }

      const data = await response.json()
      setCosts(data.costs || [])
    } catch (err) {
      console.error('Error loading credit costs:', err)
      setError('Failed to load credit costs')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!walletAddress) return

    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/api/admin/credit-costs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          wallet_address: walletAddress,
          costs: costs.map(c => ({
            action_type: c.action_type,
            cost_per_unit: c.cost_per_unit,
            unit_name: c.unit_name,
            description: c.description,
          })),
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to save credit costs')
      }

      const data = await response.json()
      setCosts(data.costs || [])
      setSuccess(data.message || 'Credit costs updated successfully!')
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      console.error('Error saving credit costs:', err)
      setError(err instanceof Error ? err.message : 'Failed to save credit costs')
    } finally {
      setSaving(false)
    }
  }

  const updateCost = (actionType: string, field: 'cost_per_unit' | 'unit_name' | 'description', value: string | number) => {
    setCosts(prev => prev.map(c => 
      c.action_type === actionType 
        ? { ...c, [field]: value }
        : c
    ))
  }

  if (loading) {
    return (
      <div className="bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24]/50 border border-gray-800 rounded-xl p-8 text-center">
        <p className="text-[#a8a8b8]">Loading credit costs...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24]/50 border border-gray-800 rounded-xl p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-purple-400">Credit Costs Configuration</h2>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold shadow-lg shadow-green-500/20 transition-all duration-200 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 border border-[#EF4444]/20/50 rounded-lg text-[#EF4444]">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 p-4 bg-green-900/20 border border-green-700/50 rounded-lg text-green-400">
            {success}
          </div>
        )}

        <div className="space-y-4">
          {costs.map((cost) => (
            <div key={cost.id} className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90/50 border border-[#9945FF]/20 rounded-lg p-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-white mb-1">
                    Action Type
                  </label>
                  <input
                    type="text"
                    value={cost.action_type}
                    disabled
                    className="w-full px-3 py-2 bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24]/50 border border-[#9945FF]/20 rounded-lg text-[#a8a8b8] cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-white mb-1">
                    Cost Per Unit
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={cost.cost_per_unit}
                    onChange={(e) => updateCost(cost.action_type, 'cost_per_unit', parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24] border border-[#9945FF]/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-white mb-1">
                    Unit Name
                  </label>
                  <input
                    type="text"
                    value={cost.unit_name}
                    onChange={(e) => updateCost(cost.action_type, 'unit_name', e.target.value)}
                    className="w-full px-3 py-2 bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24] border border-[#9945FF]/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-white mb-1">
                    Description
                  </label>
                  <input
                    type="text"
                    value={cost.description || ''}
                    onChange={(e) => updateCost(cost.action_type, 'description', e.target.value)}
                    className="w-full px-3 py-2 bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24] border border-[#9945FF]/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>
              {cost.updated_at && (
                <div className="mt-2 text-xs text-[#a8a8b8]/80">
                  Last updated: {new Date(cost.updated_at).toLocaleString()}
                  {cost.updated_by && ` by ${cost.updated_by.substring(0, 8)}...`}
                </div>
              )}
            </div>
          ))}
        </div>

        {costs.length === 0 && (
          <div className="text-center py-8 text-[#a8a8b8]">
            No credit costs configured. Default values will be used.
          </div>
        )}

        <div className="mt-6 p-4 bg-blue-900/20 border border-blue-700/30 rounded-lg text-sm">
          <p className="text-blue-300 font-semibold mb-2">ℹ️ Credit Costs Information:</p>
          <ul className="text-blue-200 text-xs space-y-1 ml-4 list-disc">
            <li>Changes take effect immediately after saving</li>
            <li>Credits are deducted BEFORE generation starts</li>
            <li>Cost per unit can be a decimal (e.g., 0.05 for 1 credit = 20 traits)</li>
            <li>Unit name is used in error messages and UI displays</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

// Generated Images Management Component
function GeneratedImagesManager({ walletAddress }: { walletAddress: string }) {
  interface GeneratedImage {
    id: string
    collection_id: string
    collection_name: string
    ordinal_number: number | null
    image_url: string
    original_image_url?: string | null
    compressed_image_url?: string | null
    thumbnail_url: string | null
    metadata_url: string
    prompt?: string | null
    ordinal_art_style?: string | null
    original_size_kb?: number | null
    compressed_size_kb?: number | null
    thumbnail_size_kb?: number | null
    traits?: Record<string, any> | null
    created_at: string
    generation_error?: {
      error_type: string
      error_message: string
      error_details?: any
      api_response?: any
      error_prompt?: string
      error_created_at: string
    } | null
    collection_settings?: {
      art_style?: string | null
      border_requirements?: string | null
      custom_rules?: string | null
      colors_description?: string | null
      lighting_description?: string | null
      generation_mode?: string | null
      compression_quality?: number | null
      compression_dimensions?: number | null
      compression_format?: string | null
      compression_target_kb?: number | null
      is_pfp_collection?: boolean | null
      facing_direction?: string | null
      body_style?: string | null
      use_hyper_detailed?: boolean | null
      pixel_perfect?: boolean | null
      wireframe_config?: any | null
    }
  }

  const [images, setImages] = useState<GeneratedImage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const [page, setPage] = useState(1)
  const [limit] = useState(50)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [search, setSearch] = useState('')
  const [collectionFilter, setCollectionFilter] = useState<string>('')
  const [collections, setCollections] = useState<Array<{ id: string; name: string }>>([])
  const [expandedImages, setExpandedImages] = useState<Set<string>>(new Set())

  const toggleExpanded = (imageId: string) => {
    const newExpanded = new Set(expandedImages)
    if (newExpanded.has(imageId)) {
      newExpanded.delete(imageId)
    } else {
      newExpanded.add(imageId)
    }
    setExpandedImages(newExpanded)
  }

  useEffect(() => {
    loadCollections()
  }, [])

  useEffect(() => {
    loadImages()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, collectionFilter])

  const loadCollections = async () => {
    try {
      // For admin, fetch all collections
      const response = await fetch(`/api/admin/collections?wallet_address=${encodeURIComponent(walletAddress)}`)
      if (response.ok) {
        const data = await response.json()
        setCollections(data.collections || [])
      }
    } catch (error) {
      console.error('Error loading collections:', error)
    }
  }

  const loadImages = async () => {
    if (!walletAddress) return

    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        wallet_address: walletAddress,
        page: page.toString(),
        limit: limit.toString(),
      })
      if (search) params.append('search', search)
      if (collectionFilter) params.append('collection_id', collectionFilter)

      const response = await fetch(`/api/admin/generated-images?${params}`)

      if (!response.ok) {
        if (response.status === 403) {
          setError('Unauthorized. Admin access only.')
        } else {
          const errorData = await response.json()
          setError(errorData.error || 'Failed to load images')
        }
        setLoading(false)
        return
      }

      const data = await response.json()
      setImages(data.ordinals || [])
      setTotal(data.pagination?.total || 0)
      setTotalPages(data.pagination?.totalPages || 0)
    } catch (err) {
      console.error('Error loading images:', err)
      setError('Failed to load images')
    } finally {
      setLoading(false)
    }
  }

  const handleSelectAll = () => {
    if (selectedIds.size === images.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(images.map(img => img.id)))
    }
  }

  const handleSelect = (id: string) => {
    const newSelected = new Set(selectedIds)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedIds(newSelected)
  }

  const handleDelete = async () => {
    if (selectedIds.size === 0) {
      alert('Please select at least one image to delete')
      return
    }

    if (!confirm(`Are you sure you want to delete ${selectedIds.size} image(s)? This action cannot be undone.`)) {
      return
    }

    setDeleting(true)
    try {
      const response = await fetch(`/api/admin/generated-images?wallet_address=${encodeURIComponent(walletAddress)}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ordinal_ids: Array.from(selectedIds),
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        alert(`Error deleting images: ${errorData.error || 'Unknown error'}`)
        return
      }

      const data = await response.json()
      alert(`Successfully deleted ${data.deleted_count} image(s)`)
      setSelectedIds(new Set())
      loadImages()
    } catch (error) {
      console.error('Error deleting images:', error)
      alert('Failed to delete images')
    } finally {
      setDeleting(false)
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
  }

  const handleDownloadImage = async (imageUrl: string, filename: string) => {
    try {
      const response = await fetch(imageUrl)
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error('Error downloading image:', error)
      alert('Failed to download image. Please try again.')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">Generated Images</h2>
          <p className="text-[#a8a8b8]">Manage all generated ordinals across all collections</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadImages}
            disabled={loading}
            className="px-4 py-2 bg-[#9945FF] hover:bg-[#7C3AED] text-white rounded-lg font-semibold transition-all duration-200 disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
          {selectedIds.size > 0 && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition-all duration-200 disabled:opacity-50"
            >
              {deleting ? 'Deleting...' : `Delete ${selectedIds.size} Selected`}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-900/30 border border-[#EF4444]/20 rounded-lg text-red-200">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24]/50 border border-gray-800 rounded-xl p-4">
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-white mb-2">Search</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by collection name, ID, or ordinal number..."
              className="w-full px-4 py-2 bg-[#14141e] border border-[#9945FF]/20 rounded-lg text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none"
            />
          </div>
          <div className="sm:w-64">
            <label className="block text-sm font-medium text-white mb-2">Collection</label>
            <select
              value={collectionFilter}
              onChange={(e) => {
                setCollectionFilter(e.target.value)
                setPage(1)
              }}
              className="w-full px-4 py-2 bg-[#14141e] border border-[#9945FF]/20 rounded-lg text-white focus:border-purple-500 focus:outline-none"
            >
              <option value="">All Collections</option>
              {collections.map(collection => (
                <option key={collection.id} value={collection.id}>{collection.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold transition-all duration-200"
            >
              Search
            </button>
          </div>
        </form>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24]/50 border border-gray-800 rounded-xl p-4">
          <div className="text-2xl font-bold text-blue-400">{total}</div>
          <div className="text-sm text-[#a8a8b8]">Total Images</div>
        </div>
        <div className="bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24]/50 border border-gray-800 rounded-xl p-4">
          <div className="text-2xl font-bold text-purple-400">{images.length}</div>
          <div className="text-sm text-[#a8a8b8]">On This Page</div>
        </div>
        <div className="bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24]/50 border border-gray-800 rounded-xl p-4">
          <div className="text-2xl font-bold text-orange-400">{selectedIds.size}</div>
          <div className="text-sm text-[#a8a8b8]">Selected</div>
        </div>
        <div className="bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24]/50 border border-gray-800 rounded-xl p-4">
          <div className="text-2xl font-bold text-green-400">{totalPages}</div>
          <div className="text-sm text-[#a8a8b8]">Total Pages</div>
        </div>
      </div>

      {/* Images Grid */}
      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
          <p className="text-[#a8a8b8] mt-4">Loading images...</p>
        </div>
      ) : images.length === 0 ? (
        <div className="text-center py-12 text-[#a8a8b8]">
          <p className="text-lg">No images found</p>
          <p className="text-sm mt-2">Try adjusting your search or filters</p>
        </div>
      ) : (
        <>
          <div className="bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24]/50 border border-gray-800 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-gray-800 flex items-center gap-4">
              <input
                type="checkbox"
                checked={selectedIds.size === images.length && images.length > 0}
                onChange={handleSelectAll}
                className="w-5 h-5 text-purple-600 bg-[#14141e] border-[#9945FF]/20 rounded focus:ring-purple-500"
              />
              <span className="text-sm text-[#a8a8b8]">
                {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select all'}
              </span>
            </div>
            <div className="space-y-4 p-4">
              {images.map((image) => {
                const isExpanded = expandedImages.has(image.id)
                return (
                  <div
                    key={image.id}
                    className={`border-2 rounded-lg overflow-hidden transition-all ${
                      selectedIds.has(image.id)
                        ? 'border-purple-500 bg-purple-500/10'
                        : 'border-[#9945FF]/20 hover:border-[#9945FF]/30'
                    }`}
                  >
                    {/* Header */}
                    <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90/50 p-4 flex items-center gap-4">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(image.id)}
                        onChange={() => handleSelect(image.id)}
                        className="w-5 h-5 text-purple-600 bg-[#14141e] border-[#9945FF]/20 rounded focus:ring-purple-500"
                      />
                      <div className="flex-1 flex items-center gap-4">
                        <div className="w-20 h-20 rounded-lg overflow-hidden bg-[#14141e] flex-shrink-0">
                          <img
                            src={image.image_url}
                            alt={`${image.collection_name} #${image.ordinal_number || image.id}`}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="text-white font-semibold truncate">{image.collection_name}</h3>
                            {image.ordinal_number && (
                              <span className="text-[#a8a8b8] text-sm">#{image.ordinal_number}</span>
                            )}
                            {/* Error indicator badge */}
                            {image.generation_error && (
                              <span className="px-2 py-0.5 bg-red-900/50 border border-[#EF4444]/20 text-red-300 text-xs rounded-full">
                                ⚠️ {image.generation_error.error_type}
                              </span>
                            )}
                          </div>
                          <p className="text-[#a8a8b8] text-sm mt-1">
                            ID: <span className="font-mono text-xs">{image.id}</span>
                          </p>
                          <p className="text-[#a8a8b8]/80 text-xs mt-1">
                            Created: {new Date(image.created_at).toLocaleString()}
                          </p>
                          {/* Brief error message */}
                          {image.generation_error && (
                            <p className="text-[#EF4444] text-xs mt-1 truncate">
                              Error: {image.generation_error.error_message}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => toggleExpanded(image.id)}
                            className="px-4 py-2 bg-[#1a1a24]/80 hover:bg-gray-600 text-white rounded-lg text-sm font-semibold transition-all"
                          >
                            {isExpanded ? 'Hide Details' : 'Show Details'}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDownloadImage(image.image_url, `${image.collection_name}_${image.ordinal_number || image.id}.png`)
                            }}
                            className="px-4 py-2 bg-[#9945FF] hover:bg-[#7C3AED] text-white rounded-lg text-sm font-semibold transition-all flex items-center gap-2"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            Download
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Expanded Details */}
                    {isExpanded && (
                      <div className="bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24]/50 border-t border-gray-800 p-6 space-y-6">
                        {/* Generation Error (if any) */}
                        {image.generation_error && (
                          <div className="bg-red-900/30 border border-[#EF4444]/20 rounded-lg p-4">
                            <h4 className="text-red-300 font-semibold mb-3 flex items-center gap-2">
                              <span>⚠️</span> Generation Error
                            </h4>
                            <div className="space-y-3 text-sm">
                              <div>
                                <span className="text-[#EF4444] font-medium">Error Type:</span>
                                <span className="text-red-200 ml-2">{image.generation_error.error_type}</span>
                              </div>
                              <div>
                                <span className="text-[#EF4444] font-medium">Error Message:</span>
                                <p className="text-red-200 mt-1 whitespace-pre-wrap break-words">{image.generation_error.error_message}</p>
                              </div>
                              {image.generation_error.error_created_at && (
                                <div>
                                  <span className="text-[#EF4444] font-medium">Error Time:</span>
                                  <span className="text-red-200 ml-2">{new Date(image.generation_error.error_created_at).toLocaleString()}</span>
                                </div>
                              )}
                              {image.generation_error.error_prompt && (
                                <div>
                                  <span className="text-[#EF4444] font-medium">Prompt Used:</span>
                                  <p className="text-red-200/80 mt-1 text-xs whitespace-pre-wrap break-words bg-red-950/50 p-2 rounded">{image.generation_error.error_prompt}</p>
                                </div>
                              )}
                              {image.generation_error.error_details && (
                                <div>
                                  <span className="text-[#EF4444] font-medium">Error Details:</span>
                                  <pre className="text-red-200/80 mt-1 text-xs whitespace-pre-wrap break-words bg-red-950/50 p-2 rounded overflow-x-auto">
                                    {JSON.stringify(image.generation_error.error_details, null, 2)}
                                  </pre>
                                </div>
                              )}
                              {image.generation_error.api_response && (
                                <div>
                                  <span className="text-[#EF4444] font-medium">API Response:</span>
                                  <pre className="text-red-200/80 mt-1 text-xs whitespace-pre-wrap break-words bg-red-950/50 p-2 rounded overflow-x-auto max-h-48 overflow-y-auto">
                                    {JSON.stringify(image.generation_error.api_response, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* No Error Message - show when no error exists */}
                        {!image.generation_error && (
                          <div className="bg-green-900/20 border border-green-700/50 rounded-lg p-4">
                            <div className="flex items-center gap-2 text-green-300">
                              <span>✓</span>
                              <span className="font-medium">No generation errors logged for this ordinal</span>
                            </div>
                            <p className="text-green-400/70 text-xs mt-1">
                              If the image appears blank or broken, the error may not have been captured. Check the Generation Errors page for more details.
                            </p>
                          </div>
                        )}

                        {/* Image URLs & Sizes */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90/50 rounded-lg p-4">
                            <h4 className="text-white font-semibold mb-3">Image Files</h4>
                            <div className="space-y-2 text-sm">
                              <div>
                                <span className="text-[#a8a8b8]">Display URL:</span>
                                <a href={image.image_url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline ml-2 font-mono text-xs break-all">
                                  {image.image_url}
                                </a>
                              </div>
                              {image.original_image_url && (
                                <div>
                                  <span className="text-[#a8a8b8]">Original URL:</span>
                                  <a href={image.original_image_url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline ml-2 font-mono text-xs break-all">
                                    {image.original_image_url}
                                  </a>
                                </div>
                              )}
                              {image.compressed_image_url && (
                                <div>
                                  <span className="text-[#a8a8b8]">Compressed URL:</span>
                                  <a href={image.compressed_image_url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline ml-2 font-mono text-xs break-all">
                                    {image.compressed_image_url}
                                  </a>
                                </div>
                              )}
                              {image.thumbnail_url && (
                                <div>
                                  <span className="text-[#a8a8b8]">Thumbnail URL:</span>
                                  <a href={image.thumbnail_url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline ml-2 font-mono text-xs break-all">
                                    {image.thumbnail_url}
                                  </a>
                                </div>
                              )}
                              {image.metadata_url && (
                                <div>
                                  <span className="text-[#a8a8b8]">Metadata URL:</span>
                                  <a href={image.metadata_url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline ml-2 font-mono text-xs break-all">
                                    {image.metadata_url}
                                  </a>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90/50 rounded-lg p-4">
                            <h4 className="text-white font-semibold mb-3">File Sizes</h4>
                            <div className="space-y-2 text-sm">
                              {image.original_size_kb !== null && image.original_size_kb !== undefined && (
                                <div>
                                  <span className="text-[#a8a8b8]">Original:</span>
                                  <span className="text-white ml-2">{Number(image.original_size_kb).toFixed(2)} KB</span>
                                </div>
                              )}
                              {image.compressed_size_kb !== null && image.compressed_size_kb !== undefined && (
                                <div>
                                  <span className="text-[#a8a8b8]">Compressed:</span>
                                  <span className="text-white ml-2">{Number(image.compressed_size_kb).toFixed(2)} KB</span>
                                </div>
                              )}
                              {image.thumbnail_size_kb !== null && image.thumbnail_size_kb !== undefined && (
                                <div>
                                  <span className="text-[#a8a8b8]">Thumbnail:</span>
                                  <span className="text-white ml-2">{Number(image.thumbnail_size_kb).toFixed(2)} KB</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Prompt & Art Style */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {image.prompt && (
                            <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90/50 rounded-lg p-4">
                              <h4 className="text-white font-semibold mb-3">Generation Prompt</h4>
                              <p className="text-white text-sm whitespace-pre-wrap break-words">{image.prompt}</p>
                            </div>
                          )}
                          <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90/50 rounded-lg p-4">
                            <h4 className="text-white font-semibold mb-3">Art Style</h4>
                            <div className="space-y-2 text-sm">
                              {image.ordinal_art_style && (
                                <div>
                                  <span className="text-[#a8a8b8]">Ordinal Art Style:</span>
                                  <span className="text-white ml-2">{image.ordinal_art_style}</span>
                                </div>
                              )}
                              {image.collection_settings?.art_style && (
                                <div>
                                  <span className="text-[#a8a8b8]">Collection Art Style:</span>
                                  <span className="text-white ml-2">{image.collection_settings.art_style}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Collection Settings */}
                        {image.collection_settings && (
                          <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90/50 rounded-lg p-4">
                            <h4 className="text-white font-semibold mb-3">Collection Settings</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                              {image.collection_settings.generation_mode && (
                                <div>
                                  <span className="text-[#a8a8b8]">Generation Mode:</span>
                                  <span className="text-white ml-2">{image.collection_settings.generation_mode}</span>
                                </div>
                              )}
                              {image.collection_settings.compression_quality !== null && image.collection_settings.compression_quality !== undefined && (
                                <div>
                                  <span className="text-[#a8a8b8]">Compression Quality:</span>
                                  <span className="text-white ml-2">{image.collection_settings.compression_quality}</span>
                                </div>
                              )}
                              {image.collection_settings.compression_dimensions !== null && image.collection_settings.compression_dimensions !== undefined && (
                                <div>
                                  <span className="text-[#a8a8b8]">Compression Dimensions:</span>
                                  <span className="text-white ml-2">{image.collection_settings.compression_dimensions}px</span>
                                </div>
                              )}
                              {image.collection_settings.compression_format && (
                                <div>
                                  <span className="text-[#a8a8b8]">Compression Format:</span>
                                  <span className="text-white ml-2">{image.collection_settings.compression_format}</span>
                                </div>
                              )}
                              {image.collection_settings.compression_target_kb !== null && image.collection_settings.compression_target_kb !== undefined && (
                                <div>
                                  <span className="text-[#a8a8b8]">Target Size:</span>
                                  <span className="text-white ml-2">{image.collection_settings.compression_target_kb} KB</span>
                                </div>
                              )}
                              {image.collection_settings.is_pfp_collection !== null && image.collection_settings.is_pfp_collection !== undefined && (
                                <div>
                                  <span className="text-[#a8a8b8]">PFP Collection:</span>
                                  <span className="text-white ml-2">{image.collection_settings.is_pfp_collection ? 'Yes' : 'No'}</span>
                                </div>
                              )}
                              {image.collection_settings.facing_direction && (
                                <div>
                                  <span className="text-[#a8a8b8]">Facing Direction:</span>
                                  <span className="text-white ml-2">{image.collection_settings.facing_direction}</span>
                                </div>
                              )}
                              {image.collection_settings.body_style && (
                                <div>
                                  <span className="text-[#a8a8b8]">Body Style:</span>
                                  <span className="text-white ml-2">{image.collection_settings.body_style}</span>
                                </div>
                              )}
                              {image.collection_settings.use_hyper_detailed !== null && image.collection_settings.use_hyper_detailed !== undefined && (
                                <div>
                                  <span className="text-[#a8a8b8]">Hyper Detailed:</span>
                                  <span className="text-white ml-2">{image.collection_settings.use_hyper_detailed ? 'Yes' : 'No'}</span>
                                </div>
                              )}
                              {image.collection_settings.pixel_perfect !== null && image.collection_settings.pixel_perfect !== undefined && (
                                <div>
                                  <span className="text-[#a8a8b8]">Pixel Perfect:</span>
                                  <span className="text-white ml-2">{image.collection_settings.pixel_perfect ? 'Yes' : 'No'}</span>
                                </div>
                              )}
                            </div>
                            {image.collection_settings.border_requirements && (
                              <div className="mt-4">
                                <span className="text-[#a8a8b8] text-sm">Border Requirements:</span>
                                <p className="text-white text-sm mt-1">{image.collection_settings.border_requirements}</p>
                              </div>
                            )}
                            {image.collection_settings.custom_rules && (
                              <div className="mt-4">
                                <span className="text-[#a8a8b8] text-sm">Custom Rules:</span>
                                <p className="text-white text-sm mt-1">{image.collection_settings.custom_rules}</p>
                              </div>
                            )}
                            {image.collection_settings.colors_description && (
                              <div className="mt-4">
                                <span className="text-[#a8a8b8] text-sm">Colors Description:</span>
                                <p className="text-white text-sm mt-1">{image.collection_settings.colors_description}</p>
                              </div>
                            )}
                            {image.collection_settings.lighting_description && (
                              <div className="mt-4">
                                <span className="text-[#a8a8b8] text-sm">Lighting Description:</span>
                                <p className="text-white text-sm mt-1">{image.collection_settings.lighting_description}</p>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Traits */}
                        {image.traits && (
                          <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90/50 rounded-lg p-4">
                            <h4 className="text-white font-semibold mb-3">Traits</h4>
                            <pre className="text-white text-xs overflow-auto bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24]/50 p-3 rounded">
                              {JSON.stringify(image.traits, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <div className="text-sm text-[#a8a8b8]">
                Page {page} of {totalPages} ({total} total)
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-4 py-2 bg-[#1a1a24] hover:bg-[#1a1a24]/80 text-white rounded-lg font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-4 py-2 bg-[#1a1a24] hover:bg-[#1a1a24]/80 text-white rounded-lg font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// Homepage Visibility Management Component
function HomepageVisibilityManager({ walletAddress }: { walletAddress: string }) {
  interface Ordinal {
    id: string
    collection_id: string
    collection_name: string
    ordinal_number: number | null
    image_url: string
    thumbnail_url: string | null
    hidden_from_homepage: boolean | null
    collection_hidden?: boolean | null
  }

  const [ordinals, setOrdinals] = useState<Ordinal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [updating, setUpdating] = useState(false)
  const [page, setPage] = useState(1)
  const [limit] = useState(50)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [showHiddenOnly, setShowHiddenOnly] = useState(false)
  const [collectionFilter, setCollectionFilter] = useState<string>('')
  const [collections, setCollections] = useState<
    Array<{ id: string; name: string; hidden_from_homepage?: boolean | null; force_show_on_homepage_ticker?: boolean | null }>
  >([])
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<Set<string>>(new Set())
  const [selectedTickerCollectionIds, setSelectedTickerCollectionIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    loadCollections()
  }, [])

  useEffect(() => {
    loadOrdinals()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, showHiddenOnly, collectionFilter])

  const loadCollections = async () => {
    try {
      const response = await fetch(`/api/admin/collections?wallet_address=${encodeURIComponent(walletAddress)}`)
      if (response.ok) {
        const data = await response.json()
        setCollections(data.collections || [])
      }
    } catch (error) {
      console.error('Error loading collections:', error)
    }
  }

  const handleToggleCollectionVisibility = async (hidden: boolean) => {
    if (selectedCollectionIds.size === 0) {
      alert('Please select at least one collection to update')
      return
    }

    setUpdating(true)
    try {
      const response = await fetch('/api/admin/homepage-visibility', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          wallet_address: walletAddress,
          collection_ids: Array.from(selectedCollectionIds),
          hidden,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        alert(`Error updating collection visibility: ${errorData.error || 'Unknown error'}`)
        return
      }

      const data = await response.json()
      alert(`✅ ${data.message}`)
      setSelectedCollectionIds(new Set())
      loadCollections()
      loadOrdinals() // Refresh ordinals to show updated status
    } catch (error) {
      console.error('Error updating collection visibility:', error)
      alert('Failed to update collection visibility')
    } finally {
      setUpdating(false)
    }
  }

  const handleToggleTickerCollections = async (tickerEnabled: boolean) => {
    if (selectedTickerCollectionIds.size === 0) {
      alert('Please select at least one collection to update')
      return
    }

    setUpdating(true)
    try {
      const response = await fetch('/api/admin/homepage-visibility', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          wallet_address: walletAddress,
          collection_ids: Array.from(selectedTickerCollectionIds),
          ticker_enabled: tickerEnabled,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        alert(`Error updating ticker collections: ${errorData.error || 'Unknown error'}`)
        return
      }

      const data = await response.json()
      alert(`✅ ${data.message}`)
      setSelectedTickerCollectionIds(new Set())
      loadCollections()
    } catch (error) {
      console.error('Error updating ticker collections:', error)
      alert('Failed to update ticker collections')
    } finally {
      setUpdating(false)
    }
  }

  const loadOrdinals = async () => {
    if (!walletAddress) return

    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        wallet_address: walletAddress,
        page: page.toString(),
        limit: limit.toString(),
        hidden_only: showHiddenOnly.toString(),
      })
      if (collectionFilter) params.append('collection_id', collectionFilter)

      const response = await fetch(`/api/admin/homepage-visibility?${params}`)

      if (!response.ok) {
        if (response.status === 403) {
          setError('Unauthorized. Admin access only.')
        } else {
          const errorData = await response.json()
          setError(errorData.error || 'Failed to load ordinals')
        }
        setLoading(false)
        return
      }

      const data = await response.json()
      setOrdinals(data.ordinals || [])
      setTotal(data.pagination?.total || 0)
      setTotalPages(data.pagination?.totalPages || 0)
    } catch (err) {
      console.error('Error loading ordinals:', err)
      setError('Failed to load ordinals')
    } finally {
      setLoading(false)
    }
  }

  const handleSelectAll = () => {
    if (selectedIds.size === ordinals.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(ordinals.map(ord => ord.id)))
    }
  }

  const handleSelect = (id: string) => {
    const newSelected = new Set(selectedIds)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedIds(newSelected)
  }

  const handleToggleVisibility = async (hidden: boolean) => {
    if (selectedIds.size === 0) {
      alert('Please select at least one image to update')
      return
    }

    setUpdating(true)
    try {
      const response = await fetch('/api/admin/homepage-visibility', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          wallet_address: walletAddress,
          ordinal_ids: Array.from(selectedIds),
          hidden,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        alert(`Error updating visibility: ${errorData.error || 'Unknown error'}`)
        return
      }

      const data = await response.json()
      alert(`✅ ${data.message}`)
      setSelectedIds(new Set())
      loadOrdinals()
    } catch (error) {
      console.error('Error updating visibility:', error)
      alert('Failed to update visibility')
    } finally {
      setUpdating(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">Homepage Visibility</h2>
          <p className="text-[#a8a8b8]">Manage which images appear on the homepage ticker</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadOrdinals}
            disabled={loading}
            className="px-4 py-2 bg-[#9945FF] hover:bg-[#7C3AED] text-white rounded-lg font-semibold transition-all duration-200 disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
          {selectedIds.size > 0 && (
            <>
              <button
                onClick={() => handleToggleVisibility(true)}
                disabled={updating}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition-all duration-200 disabled:opacity-50"
              >
                {updating ? 'Hiding...' : `Hide ${selectedIds.size} from Homepage`}
              </button>
              <button
                onClick={() => handleToggleVisibility(false)}
                disabled={updating}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition-all duration-200 disabled:opacity-50"
              >
                {updating ? 'Showing...' : `Show ${selectedIds.size} on Homepage`}
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-900/30 border border-[#EF4444]/20 rounded-lg text-red-200">
          {error}
        </div>
      )}

      {/* Collection Management Section */}
      <div className="bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24]/50 border border-gray-800 rounded-xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <div>
            <h3 className="text-xl font-bold text-white mb-1">Hide Collections from Homepage</h3>
            <p className="text-sm text-[#a8a8b8]">Hide entire collections to exclude all their images from the homepage ticker</p>
          </div>
          {selectedCollectionIds.size > 0 && (
            <div className="flex gap-2">
              <button
                onClick={() => handleToggleCollectionVisibility(true)}
                disabled={updating}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold text-sm transition-all duration-200 disabled:opacity-50"
              >
                {updating ? 'Hiding...' : `Hide ${selectedCollectionIds.size} Collection(s)`}
              </button>
              <button
                onClick={() => handleToggleCollectionVisibility(false)}
                disabled={updating}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold text-sm transition-all duration-200 disabled:opacity-50"
              >
                {updating ? 'Showing...' : `Show ${selectedCollectionIds.size} Collection(s)`}
              </button>
            </div>
          )}
        </div>
        
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {collections.map((collection) => (
            <div
              key={collection.id}
              className={`relative border-2 rounded-lg p-3 cursor-pointer transition-all ${
                selectedCollectionIds.has(collection.id)
                  ? 'border-purple-500 bg-purple-500/10'
                  : collection.hidden_from_homepage
                  ? 'border-red-500/50 bg-red-500/5'
                  : 'border-[#9945FF]/20 hover:border-[#9945FF]/30'
              }`}
              onClick={() => {
                const newSelected = new Set(selectedCollectionIds)
                if (newSelected.has(collection.id)) {
                  newSelected.delete(collection.id)
                } else {
                  newSelected.add(collection.id)
                }
                setSelectedCollectionIds(newSelected)
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="checkbox"
                  checked={selectedCollectionIds.has(collection.id)}
                  onChange={() => {}}
                  onClick={(e) => e.stopPropagation()}
                  className="w-4 h-4 text-purple-600 bg-[#14141e] border-[#9945FF]/20 rounded focus:ring-purple-500"
                />
                {collection.hidden_from_homepage && (
                  <span className="text-xs bg-red-600 text-white px-2 py-0.5 rounded font-bold">HIDDEN</span>
                )}
              </div>
              <p className="text-sm text-white font-semibold truncate" title={collection.name}>
                {collection.name}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Homepage Ticker Collections Section */}
      <div className="bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24]/50 border border-gray-800 rounded-xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <div>
            <h3 className="text-xl font-bold text-white mb-1">Homepage Ordinal Ticker Collections</h3>
            <p className="text-sm text-[#a8a8b8]">
              Choose which collections are eligible for the homepage ordinal ticker. Every collection is listed here.
            </p>
          </div>
          {selectedTickerCollectionIds.size > 0 && (
            <div className="flex gap-2">
              <button
                onClick={() => handleToggleTickerCollections(true)}
                disabled={updating}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold text-sm transition-all duration-200 disabled:opacity-50"
              >
                {updating ? 'Updating...' : `Show ${selectedTickerCollectionIds.size} in Ticker`}
              </button>
              <button
                onClick={() => handleToggleTickerCollections(false)}
                disabled={updating}
                className="px-4 py-2 bg-[#1a1a24]/80 hover:bg-gray-600 text-white rounded-lg font-semibold text-sm transition-all duration-200 disabled:opacity-50"
              >
                {updating ? 'Updating...' : `Hide ${selectedTickerCollectionIds.size} from Ticker`}
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {collections.map((collection) => {
            const enabled = Boolean(collection.force_show_on_homepage_ticker)
            const selected = selectedTickerCollectionIds.has(collection.id)
            return (
              <div
                key={collection.id}
                className={`relative border-2 rounded-lg p-3 cursor-pointer transition-all ${
                  selected
                    ? 'border-blue-500 bg-blue-500/10'
                    : enabled
                      ? 'border-green-500/60 bg-green-500/5'
                      : 'border-[#9945FF]/20 hover:border-[#9945FF]/30'
                }`}
                onClick={() => {
                  const next = new Set(selectedTickerCollectionIds)
                  if (next.has(collection.id)) next.delete(collection.id)
                  else next.add(collection.id)
                  setSelectedTickerCollectionIds(next)
                }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => {}}
                    onClick={(e) => e.stopPropagation()}
                    className="w-4 h-4 text-[#9945FF] bg-[#14141e] border-[#9945FF]/20 rounded focus:ring-blue-500"
                  />
                  {enabled ? (
                    <span className="text-xs bg-green-600 text-white px-2 py-0.5 rounded font-bold">ON</span>
                  ) : (
                    <span className="text-xs bg-[#1a1a24]/80 text-white px-2 py-0.5 rounded font-bold">OFF</span>
                  )}
                </div>
                <p className="text-sm text-white font-semibold truncate" title={collection.name}>
                  {collection.name}
                </p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24]/50 border border-gray-800 rounded-xl p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="sm:w-64">
            <label className="block text-sm font-medium text-white mb-2">Collection</label>
            <select
              value={collectionFilter}
              onChange={(e) => {
                setCollectionFilter(e.target.value)
                setPage(1)
              }}
              className="w-full px-4 py-2 bg-[#14141e] border border-[#9945FF]/20 rounded-lg text-white focus:border-purple-500 focus:outline-none"
            >
              <option value="">All Collections</option>
              {collections.map(collection => (
                <option key={collection.id} value={collection.id}>{collection.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showHiddenOnly}
                onChange={(e) => {
                  setShowHiddenOnly(e.target.checked)
                  setPage(1)
                }}
                className="w-5 h-5 text-purple-600 bg-[#14141e] border-[#9945FF]/20 rounded focus:ring-purple-500"
              />
              <span className="text-sm text-white">Show hidden only</span>
            </label>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24]/50 border border-gray-800 rounded-xl p-4">
          <div className="text-2xl font-bold text-blue-400">{total}</div>
          <div className="text-sm text-[#a8a8b8]">Total {showHiddenOnly ? 'Hidden' : 'Images'}</div>
        </div>
        <div className="bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24]/50 border border-gray-800 rounded-xl p-4">
          <div className="text-2xl font-bold text-purple-400">{ordinals.length}</div>
          <div className="text-sm text-[#a8a8b8]">On This Page</div>
        </div>
        <div className="bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24]/50 border border-gray-800 rounded-xl p-4">
          <div className="text-2xl font-bold text-orange-400">{selectedIds.size}</div>
          <div className="text-sm text-[#a8a8b8]">Selected</div>
        </div>
        <div className="bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24]/50 border border-gray-800 rounded-xl p-4">
          <div className="text-2xl font-bold text-green-400">{totalPages}</div>
          <div className="text-sm text-[#a8a8b8]">Total Pages</div>
        </div>
      </div>

      {/* Images Grid */}
      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
          <p className="text-[#a8a8b8] mt-4">Loading images...</p>
        </div>
      ) : ordinals.length === 0 ? (
        <div className="text-center py-12 text-[#a8a8b8]">
          <p className="text-lg">No images found</p>
          <p className="text-sm mt-2">Try adjusting your filters</p>
        </div>
      ) : (
        <>
          <div className="bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24]/50 border border-gray-800 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-gray-800 flex items-center gap-4">
              <input
                type="checkbox"
                checked={selectedIds.size === ordinals.length && ordinals.length > 0}
                onChange={handleSelectAll}
                className="w-5 h-5 text-purple-600 bg-[#14141e] border-[#9945FF]/20 rounded focus:ring-purple-500"
              />
              <span className="text-sm text-[#a8a8b8]">
                {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select all'}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 p-4">
              {ordinals.map((ordinal) => (
                <div
                  key={ordinal.id}
                  className={`relative group border-2 rounded-lg overflow-hidden transition-all ${
                    selectedIds.has(ordinal.id)
                      ? 'border-purple-500 bg-purple-500/10'
                      : ordinal.hidden_from_homepage || ordinal.collection_hidden
                      ? 'border-red-500/50 bg-red-500/5'
                      : 'border-[#9945FF]/20 hover:border-[#9945FF]/30'
                  }`}
                >
                  <div className="absolute top-2 left-2 z-10">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(ordinal.id)}
                      onChange={() => handleSelect(ordinal.id)}
                      className="w-5 h-5 text-purple-600 bg-[#14141e] border-[#9945FF]/20 rounded focus:ring-purple-500"
                    />
                  </div>
                  {(ordinal.hidden_from_homepage || ordinal.collection_hidden) && (
                    <div className="absolute top-2 right-2 z-10 bg-red-600 text-white text-xs font-bold px-2 py-1 rounded">
                      {ordinal.collection_hidden ? 'COLLECTION HIDDEN' : 'HIDDEN'}
                    </div>
                  )}
                  <div className="aspect-square relative bg-[#14141e]">
                    <img
                      src={ordinal.thumbnail_url || ordinal.image_url}
                      alt={`${ordinal.collection_name} #${ordinal.ordinal_number || ordinal.id}`}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="absolute bottom-0 left-0 right-0 p-2">
                        <p className="text-xs text-white font-semibold truncate">{ordinal.collection_name}</p>
                        {ordinal.ordinal_number && (
                          <p className="text-xs text-white">#{ordinal.ordinal_number}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <div className="text-sm text-[#a8a8b8]">
                Page {page} of {totalPages} ({total} total)
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-4 py-2 bg-[#1a1a24] hover:bg-[#1a1a24]/80 text-white rounded-lg font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-4 py-2 bg-[#1a1a24] hover:bg-[#1a1a24]/80 text-white rounded-lg font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

