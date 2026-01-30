'use client'

import { useState, useEffect } from 'react'
import { useWallet } from '@/lib/wallet/compatibility'
import { isAdmin } from '@/lib/auth/access-control'
import { AdminSidebar } from '@/components/admin-sidebar'

export default function SiteSettingsPage() {
  const { currentAddress } = useWallet()
  const [settings, setSettings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const activeWalletAddress = currentAddress
  const authorized = activeWalletAddress ? isAdmin(activeWalletAddress) : false

  useEffect(() => {
    if (activeWalletAddress && authorized) {
      loadSettings()
    }
  }, [activeWalletAddress, authorized])

  const loadSettings = async () => {
    if (!activeWalletAddress) return
    
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/admin/site-settings?wallet_address=${encodeURIComponent(activeWalletAddress)}`)
      if (!response.ok) {
        throw new Error('Failed to load settings')
      }
      const data = await response.json()
      setSettings(data.settings || [])
    } catch (err: any) {
      setError(err.message || 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }

  const updateSetting = async (key: string, value: any) => {
    if (!activeWalletAddress) return
    
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch('/api/admin/site-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address: activeWalletAddress,
          key,
          value
        })
      })
      
      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || 'Failed to update setting')
      }
      
      const data = await response.json()
      setSuccess(`Setting "${key}" updated successfully`)
      
      // Update local state
      setSettings(prev => prev.map((s: any) => 
        s.key === key ? { ...s, value: data.value, updated_at: data.updated_at } : s
      ))
      
      setTimeout(() => setSuccess(null), 3000)
    } catch (err: any) {
      setError(err.message || 'Failed to update setting')
    } finally {
      setSaving(false)
    }
  }

  if (!authorized) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#050510] via-[#0f0f1e] to-[#15152a]">
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-[#00E5FF] to-[#FFD60A] bg-clip-text text-transparent mb-4">Access Denied</h1>
            <p className="text-[#b4b4c8]">You must be an admin to access this page.</p>
          </div>
        </div>
      </div>
    )
  }

  const showCreditPurchase = settings.find((s: any) => s.key === 'show_credit_purchase')?.value ?? true

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#050510] via-[#0f0f1e] to-[#15152a]">
      <AdminSidebar />
      <div className="ml-64 p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-[#00E5FF] via-[#FFD60A] to-[#00E5FF] bg-clip-text text-transparent mb-2">Site Settings</h1>
          <p className="text-[#b4b4c8] mb-8">Manage site-wide configuration settings</p>

          {error && (
            <div className="mb-4 p-4 bg-gradient-to-br from-red-900/50 to-red-800/30 border border-red-500/50 rounded-lg text-red-200">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-4 p-4 bg-gradient-to-br from-green-900/50 to-green-800/30 border border-green-500/50 rounded-lg text-green-200">
              {success}
            </div>
          )}

          {loading ? (
            <div className="text-[#b4b4c8]">Loading settings...</div>
          ) : (
            <div className="space-y-6">
              {/* Credit Purchase Visibility */}
              <div className="bg-gradient-to-br from-[#0f0f1e]/90 to-[#15152a]/90 border border-[#00E5FF]/20 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-xl font-semibold bg-gradient-to-r from-[#00E5FF] to-[#FFD60A] bg-clip-text text-transparent mb-1">Credit Purchase Visibility</h2>
                    <p className="text-sm text-[#b4b4c8]">
                      Control whether credit purchase functionality is visible across the site
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showCreditPurchase}
                      onChange={(e) => updateSetting('show_credit_purchase', e.target.checked)}
                      disabled={saving}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-[#0f0f1e] peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#00E5FF]/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[#00E5FF]/30 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-[#00E5FF] peer-checked:to-[#FFD60A]"></div>
                    <span className="ml-3 text-sm font-medium text-white">
                      {showCreditPurchase ? 'Visible' : 'Hidden'}
                    </span>
                  </label>
                </div>
                
                <div className="mt-4 p-4 bg-[#050510] rounded-lg border border-[#00E5FF]/20">
                  <p className="text-sm text-[#b4b4c8] mb-2">When hidden, the following will be hidden:</p>
                  <ul className="text-sm text-[#b4b4c8] list-disc list-inside space-y-1">
                    <li>Credit purchase component on homepage</li>
                    <li>"Buy Credits" links in navigation</li>
                    <li>Credit purchase mentions in error messages</li>
                    <li>Credit purchase buttons and modals</li>
                  </ul>
                  <p className="text-sm text-[#b4b4c8] mt-3">
                    Note: Users can still access the standalone <code className="text-[#00E5FF]">/buy-credits</code> page directly if they know the URL.
                  </p>
                </div>
              </div>

              {/* Add more settings here in the future */}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

