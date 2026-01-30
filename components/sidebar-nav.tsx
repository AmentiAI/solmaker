'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { 
  Home,
  ShoppingBag,
  Layers,
  Rocket,
  CreditCard,
  User,
  Sparkles,
  Menu,
  X,
  ChevronRight,
  Megaphone,
  Sticker
} from 'lucide-react'
import { WalletConnect } from './wallet-connect'

const navigation = [
  { name: 'Home', href: '/', icon: Home },
  { name: 'Marketplace', href: '/marketplace', icon: ShoppingBag },
  { name: 'Collections', href: '/collections', icon: Layers },
  { name: 'Launchpad', href: '/launchpad', icon: Rocket },
  { name: 'Buy Credits', href: '/buy-credits', icon: CreditCard },
  { name: 'Profile', href: '/profile', icon: User },
]

const tools = [
  { name: 'Sticker Maker', href: '/sticker-maker', icon: Sticker },
  { name: 'Promotion', href: '/promotion', icon: Megaphone },
]

export function SidebarNav() {
  const pathname = usePathname()
  const [isMobileOpen, setIsMobileOpen] = useState(false)

  return (
    <>
      {/* Mobile Menu Button */}
      <button
        onClick={() => setIsMobileOpen(!isMobileOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-[var(--surface)] border border-[var(--solana-purple)]/30 rounded-xl text-white hover:bg-[var(--surface-elevated)] transition-colors"
      >
        {isMobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
      </button>

      {/* Overlay for mobile */}
      {isMobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 h-screen w-72 bg-[var(--surface)] border-r border-[var(--border)] z-40
          flex flex-col
          transition-transform duration-300 ease-in-out
          ${isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Logo */}
        <div className="p-6 border-b border-[var(--border)]">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="p-2 bg-gradient-to-br from-[var(--solana-purple)]/20 to-[var(--solana-green)]/20 border border-[var(--solana-purple)]/50 rounded-xl">
              <Sparkles className="h-6 w-6 text-[var(--solana-purple)]" />
            </div>
            <span className="text-2xl font-extrabold bg-gradient-to-r from-[var(--solana-purple)] to-[var(--solana-green)] bg-clip-text text-transparent">
              SolMaker
            </span>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-4 space-y-1">
          <div className="mb-6">
            {navigation.map((item) => {
              const isActive = pathname === item.href || pathname?.startsWith(item.href + '/')
              const Icon = item.icon
              
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setIsMobileOpen(false)}
                  className={`
                    flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200
                    ${isActive
                      ? 'bg-gradient-to-r from-[var(--solana-purple)]/20 to-[var(--solana-green)]/20 border border-[var(--solana-purple)]/30 text-white'
                      : 'text-[var(--text-secondary)] hover:text-white hover:bg-[var(--surface-elevated)]'
                    }
                  `}
                >
                  <Icon className="h-5 w-5" />
                  <span className="font-medium">{item.name}</span>
                  {isActive && <ChevronRight className="h-4 w-4 ml-auto" />}
                </Link>
              )
            })}
          </div>

          {/* Tools Section */}
          <div>
            <div className="px-4 py-2 text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">
              Tools
            </div>
            {tools.map((item) => {
              const isActive = pathname === item.href
              const Icon = item.icon
              
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setIsMobileOpen(false)}
                  className={`
                    flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200
                    ${isActive
                      ? 'bg-gradient-to-r from-[var(--solana-purple)]/20 to-[var(--solana-green)]/20 border border-[var(--solana-purple)]/30 text-white'
                      : 'text-[var(--text-secondary)] hover:text-white hover:bg-[var(--surface-elevated)]'
                    }
                  `}
                >
                  <Icon className="h-5 w-5" />
                  <span className="font-medium">{item.name}</span>
                </Link>
              )
            })}
          </div>
        </nav>

        {/* Wallet Connect at Bottom */}
        <div className="p-4 border-t border-[var(--border)]">
          <WalletConnect />
        </div>
      </aside>
    </>
  )
}
