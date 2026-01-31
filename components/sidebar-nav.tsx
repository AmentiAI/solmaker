'use client'

import { useState, useEffect } from 'react'
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
  Sticker,
  Coins,
  TrendingUp
} from 'lucide-react'
import { WalletConnect } from './wallet-connect'
import { useWallet } from '@/lib/wallet/compatibility'

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
  const { isConnected, currentAddress } = useWallet()
  const [credits, setCredits] = useState<number | null>(null)
  const [solPrice, setSolPrice] = useState<number | null>(null)
  const [priceChange, setPriceChange] = useState<number>(0)

  // Fetch user credits
  useEffect(() => {
    if (isConnected && currentAddress) {
      fetch(`/api/credits?wallet_address=${encodeURIComponent(currentAddress)}`)
        .then(res => res.json())
        .then(data => {
          if (data.credits !== undefined) {
            setCredits(data.credits)
          }
        })
        .catch(err => console.error('Error fetching credits:', err))
    } else {
      setCredits(null)
    }
  }, [isConnected, currentAddress])

  // Fetch Solana price
  useEffect(() => {
    const fetchSolPrice = async () => {
      try {
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd&include_24hr_change=true')
        const data = await response.json()
        if (data.solana) {
          setSolPrice(data.solana.usd)
          setPriceChange(data.solana.usd_24h_change || 0)
        }
      } catch (err) {
        console.error('Error fetching SOL price:', err)
      }
    }

    fetchSolPrice()
    const interval = setInterval(fetchSolPrice, 60000) // Update every minute
    return () => clearInterval(interval)
  }, [])

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

      {/* Premium Sidebar with glass morphism */}
      <aside
        className={`
          fixed top-0 left-0 h-screen w-80 glass-card border-r-2 border-[#9945FF]/30 z-40
          flex flex-col overflow-visible
          transition-transform duration-300 ease-in-out
          ${isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Premium Logo with glow */}
        <div className="p-8 border-b-2 border-[#9945FF]/30 relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-r from-[#9945FF]/5 to-[#14F195]/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <Link href="/" className="flex items-center gap-4 relative z-10">
            <div className="p-4 bg-gradient-to-br from-[#9945FF] via-[#DC1FFF] to-[#14F195] border-2 border-[#9945FF]/50 rounded-2xl cyber-glow group-hover:scale-110 transition-transform duration-300">
              <Sparkles className="h-7 w-7 text-white" />
            </div>
            <span className="text-3xl font-black gradient-text-neon">
              SolMaker
            </span>
          </Link>
        </div>

        {/* Premium Stats Section */}
        <div className="p-6 space-y-4 relative z-10">
          {/* Solana Price Display */}
          {solPrice !== null && (
            <div className="glass-card border-2 border-[#9945FF]/40 rounded-xl p-5 relative overflow-hidden group hover:border-[#9945FF]/60 transition-all duration-300">
              <div className="absolute inset-0 bg-gradient-to-br from-[#9945FF]/10 to-transparent" />
              <div className="relative z-10 flex items-center gap-4">
                <div className="p-3 bg-gradient-to-br from-[#9945FF] to-[#DC1FFF] rounded-xl cyber-glow flex items-center justify-center">
                  <svg className="w-6 h-6" viewBox="0 0 397.7 311.7" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M64.6 237.9c2.4-2.4 5.7-3.8 9.2-3.8h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1l62.7-62.7z" fill="white"/>
                    <path d="M64.6 3.8C67.1 1.4 70.4 0 73.8 0h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 3.8z" fill="white"/>
                    <path d="M333.1 120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8 0-8.7 7-4.6 11.1l62.7 62.7c2.4 2.4 5.7 3.8 9.2 3.8h317.4c5.8 0 8.7-7 4.6-11.1l-62.7-62.7z" fill="white"/>
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-[#B4B4C8] uppercase tracking-wide mb-1">SOL Price</p>
                  <div className="flex items-center gap-2">
                    <p className="text-2xl font-black text-white">${solPrice.toFixed(2)}</p>
                    <span className={`text-sm font-bold ${priceChange >= 0 ? 'text-[#14F195]' : 'text-red-500'}`}>
                      {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Wallet Connect */}
          <div className="relative group z-[100]">
            <div className="absolute inset-0 bg-gradient-to-r from-[#9945FF]/5 to-[#14F195]/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-xl pointer-events-none" />
            <div className="relative">
              <WalletConnect />
            </div>
          </div>
        </div>

        {/* Credits Display - Separate Card Below Wallet */}
        {isConnected && credits !== null && (
          <div className="px-6 pb-6">
            <div className="glass-card border-2 border-[#14F195]/40 rounded-xl p-5 relative overflow-hidden group hover:border-[#14F195]/60 transition-all duration-300">
              <div className="absolute inset-0 bg-gradient-to-br from-[#14F195]/10 to-transparent" />
              <div className="relative z-10 flex items-center gap-4">
                <div className="p-3 bg-gradient-to-br from-[#14F195] to-[#10B981] rounded-xl">
                  <Coins className="h-6 w-6 text-black" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-[#B4B4C8] uppercase tracking-wide mb-1">Credits</p>
                  <p className="text-2xl font-black text-[#14F195] drop-shadow-[0_0_10px_rgba(20,241,149,0.6)]">{credits.toLocaleString()}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Premium Navigation with effects */}
        <nav className="flex-1 overflow-y-auto px-6 pb-6 space-y-2 relative z-0">
          <div className="mb-8 space-y-3">
            {navigation.map((item) => {
              const isActive = pathname === item.href || pathname?.startsWith(item.href + '/')
              const Icon = item.icon
              
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setIsMobileOpen(false)}
                  className={`
                    group flex items-center gap-4 px-5 py-4 rounded-xl transition-all duration-300 relative overflow-hidden text-base
                    ${isActive
                      ? 'glass-card border-2 border-[#9945FF]/60 text-white shadow-lg shadow-[#9945FF]/20'
                      : 'text-[#B4B4C8] hover:text-white hover:glass-card hover:border-2 hover:border-[#9945FF]/30'
                    }
                  `}
                >
                  {isActive && (
                    <div className="absolute inset-0 bg-gradient-to-r from-[#9945FF]/10 via-[#DC1FFF]/10 to-[#14F195]/10" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-700" />
                  <Icon className={`h-6 w-6 relative z-10 ${isActive ? 'text-[#9945FF]' : ''} group-hover:scale-110 transition-transform duration-300`} />
                  <span className="font-bold relative z-10 text-base">{item.name}</span>
                  {isActive && <ChevronRight className="h-5 w-5 ml-auto relative z-10 text-[#14F195]" />}
                </Link>
              )
            })}
          </div>

          {/* Premium Tools Section */}
          <div>
            <div className="px-5 py-4 mb-3">
              <span className="text-sm font-black text-[#9945FF] uppercase tracking-wider flex items-center gap-2">
                <span className="w-2 h-2 bg-[#9945FF] rounded-full animate-pulse" />
                Tools
              </span>
            </div>
            <div className="space-y-3">
              {tools.map((item) => {
                const isActive = pathname === item.href
                const Icon = item.icon
                
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => setIsMobileOpen(false)}
                    className={`
                      group flex items-center gap-4 px-5 py-4 rounded-xl transition-all duration-300 relative overflow-hidden text-base
                      ${isActive
                        ? 'glass-card border-2 border-[#14F195]/60 text-white shadow-lg shadow-[#14F195]/20'
                        : 'text-[#B4B4C8] hover:text-white hover:glass-card hover:border-2 hover:border-[#14F195]/30'
                      }
                    `}
                  >
                    {isActive && (
                      <div className="absolute inset-0 bg-gradient-to-r from-[#14F195]/10 to-[#10B981]/10" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-700" />
                    <Icon className={`h-6 w-6 relative z-10 ${isActive ? 'text-[#14F195]' : ''} group-hover:scale-110 transition-transform duration-300`} />
                    <span className="font-bold relative z-10 text-base">{item.name}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        </nav>
      </aside>
    </>
  )
}
