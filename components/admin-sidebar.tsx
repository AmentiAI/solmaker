'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useWallet } from '@/lib/wallet/compatibility'
import { isAdmin } from '@/lib/auth/access-control'

export function AdminSidebar() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { currentAddress } = useWallet()
  const authorized = isAdmin(currentAddress || null)
  
  // Check if revenue share is enabled
  const enableRevenueShare = process.env.NEXT_PUBLIC_ENABLE_REVENUE_SHARE === 'true'
  
  // State to track which categories are expanded
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())

  if (!authorized) return null

  const isActive = (path: string, tab?: string) => {
    if (path === '/admin') {
      if (tab) {
        // For items with tabs, check if path matches and tab query param matches
        return pathname === '/admin' && searchParams?.get('tab') === tab
      }
      // For dashboard without tab, check if path matches and no tab param
      return pathname === '/admin' && !searchParams?.get('tab')
    }
    return pathname?.startsWith(path)
  }

  const allNavItems = [
    {
      category: 'Overview',
      items: [
        { path: '/admin', label: 'Dashboard', icon: '📊' },
      ]
    },
    {
      category: 'Launchpad',
      items: [
        { path: '/admin/launchpad', label: 'Launchpad Hub', icon: '🚀' },
        { path: '/admin/launchpad/collections', label: 'Collection Stats', icon: '📊' },
        { path: '/admin/collections', label: 'Collections Manager', icon: '📁' },
        { path: '/admin/launchpad/transactions', label: 'All Transactions', icon: '📝' },
        ...(enableRevenueShare ? [
          { path: '/admin/launchpad/pending-reveals', label: 'Pending Reveals', icon: '⏳' },
          { path: '/admin/mints', label: 'Mint Admin', icon: '🔥' },
          { path: '/admin/community-payouts', label: 'Community Payouts', icon: '💎' },
        ] : []),
      ]
    },
    {
      category: 'Transactions',
      items: [
        { path: '/admin/transactions/sol', label: 'Solana (SOL)', icon: '◎' },
        ...(enableRevenueShare ? [
          { path: '/admin/transactions/btc', label: 'Bitcoin (BTC)', icon: '₿' },
        ] : []),
      ]
    },
    {
      category: 'Marketplace',
      items: [
        { path: '/admin/marketplace', label: 'Marketplace', icon: '🏪' },
      ]
    },
    {
      category: 'System',
      items: [
        { path: '/admin', label: 'Users', icon: '👥', tab: 'users' },
        { path: '/admin', label: 'Credit Costs', icon: '💰', tab: 'credit-costs' },
        { path: '/admin', label: 'Generation Jobs', icon: '🎨', tab: 'generation-jobs' },
        { path: '/admin/generation-errors', label: 'Generation Errors', icon: '⚠️' },
        { path: '/admin', label: 'Generated Images', icon: '🖼️', tab: 'generated-images' },
        { path: '/admin', label: 'Homepage Visibility', icon: '🏠', tab: 'homepage-visibility' },
        { path: '/admin/preset-previews', label: 'Preset Previews', icon: '🎯' },
        { path: '/admin/site-settings', label: 'Site Settings', icon: '⚙️' },
      ]
    },
    {
      category: 'Tools',
      items: [
        ...(enableRevenueShare ? [
          { path: '/admin/utxo-tester', label: 'UTXO Tester', icon: '🔍' },
          { path: '/admin/magic-eden-checker', label: 'ME Wallet Checker', icon: '✨' },
          { path: '/admin/payout-testing', label: 'Payout Testing', icon: '💸' },
        ] : []),
      ].filter(item => item) // Remove empty if no revenue share tools
    },
  ]

  // Filter out empty categories
  const navItems = allNavItems.filter(category => category.items.length > 0)

  // Auto-expand categories that contain the active page
  useEffect(() => {
    const activeCategory = navItems.find(category =>
      category.items.some(item => {
        const itemTab = 'tab' in item ? item.tab : undefined
        return isActive(item.path, itemTab)
      })
    )
    
    if (activeCategory) {
      setExpandedCategories(prev => new Set([...prev, activeCategory.category]))
    }
  }, [pathname, searchParams])

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev)
      if (newSet.has(category)) {
        newSet.delete(category)
      } else {
        newSet.add(category)
      }
      return newSet
    })
  }

  return (
    <div className="w-64 bg-slate-900 border-r border-gray-800 min-h-screen p-4 pt-[130px] fixed left-0 top-0 overflow-y-auto z-50">
      <div className="mb-6">
        <Link href="/admin" className="block">
          <h1 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
            Admin Panel
          </h1>
          <p className="text-xs text-gray-500 mt-1">Management Console</p>
        </Link>
      </div>

      <nav className="space-y-2">
        {navItems.map((category) => {
          const isExpanded = expandedCategories.has(category.category)
          const hasActiveItem = category.items.some(item => {
            const itemTab = 'tab' in item ? item.tab : undefined
            return isActive(item.path, itemTab)
          })
          
          return (
            <div key={category.category}>
              <button
                onClick={() => toggleCategory(category.category)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-semibold text-gray-400 hover:text-white hover:bg-gray-800 transition-all duration-200 ${
                  hasActiveItem ? 'text-white bg-gray-800' : ''
                }`}
              >
                <span className="uppercase tracking-wider text-xs">{category.category}</span>
                <span className={`text-gray-500 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>
                  ▶
                </span>
              </button>
              {isExpanded && (
                <div className="mt-1 ml-2 space-y-1 border-l-2 border-gray-800 pl-2">
                  {category.items.map((item, index) => {
                    // Create unique key using category, path, tab, and index to avoid duplicates
                    const itemTab = 'tab' in item ? item.tab : undefined
                    const uniqueKey = `${category.category}-${item.path}-${itemTab || ''}-${index}`
                    const active = isActive(item.path, itemTab)
                    return (
                      <Link
                        key={uniqueKey}
                        href={item.path + (itemTab ? `?tab=${itemTab}` : '')}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                          active
                            ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-purple-500/30'
                            : 'text-gray-400 hover:text-white hover:bg-gray-800'
                        }`}
                      >
                        <span className="text-lg">{item.icon}</span>
                        <span>{item.label}</span>
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      <div className="mt-8 pt-6 border-t border-gray-800">
        <Link
          href="/"
          className="flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
        >
          <span>←</span>
          <span>Back to Site</span>
        </Link>
      </div>
    </div>
  )
}

