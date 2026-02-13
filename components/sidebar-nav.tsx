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
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-[#0a0a0a] border border-[#D4AF37]/40 text-white hover:bg-[#1a1a1a] transition-colors"
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

      {/* Technical Sidebar - Matte Black */}
      <aside
        className={`
          fixed top-0 left-0 h-screen w-80 bg-[#0a0a0a] border-r border-[#D4AF37]/20 z-40
          flex flex-col overflow-visible
          transition-transform duration-300 ease-in-out
          ${isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Technical Logo */}
        <div className="p-8 border-b border-[#D4AF37]/20 relative overflow-hidden">
          <Link href="/" className="flex items-center gap-4 relative z-10 group">
            <div className="p-3 bg-[#1a1a1a] border border-[#D4AF37] group-hover:bg-[#D4AF37]/10 transition-colors duration-200">
              <Sparkles className="h-7 w-7 text-[#D4AF37]" />
            </div>
            <span className="text-3xl font-black text-[#D4AF37] tracking-tight">
              SolMaker
            </span>
          </Link>
        </div>

        {/* Technical Stats Section */}
        <div className="p-6 space-y-4 relative z-10">
          {/* Solana Price Display */}
          {solPrice !== null && (
            <div className="bg-[#1a1a1a] border border-[#404040] p-4 relative overflow-hidden group hover:border-[#D4AF37]/40 transition-all duration-200">
              <div className="relative z-10 flex items-center gap-4">
                <div className="p-2 bg-[#0a0a0a] border border-[#D4AF37]/40 flex items-center justify-center">
                  <svg className="w-5 h-5" viewBox="0 0 397.7 311.7" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M64.6 237.9c2.4-2.4 5.7-3.8 9.2-3.8h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1l62.7-62.7z" fill="#D4AF37"/>
                    <path d="M64.6 3.8C67.1 1.4 70.4 0 73.8 0h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 3.8z" fill="#D4AF37"/>
                    <path d="M333.1 120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8 0-8.7 7-4.6 11.1l62.7 62.7c2.4 2.4 5.7 3.8 9.2 3.8h317.4c5.8 0 8.7-7 4.6-11.1l-62.7-62.7z" fill="#D4AF37"/>
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-xs font-bold text-[#808080] uppercase tracking-wider mb-1">SOL/USD</p>
                  <div className="flex items-center gap-2">
                    <p className="text-xl font-bold text-white">${solPrice.toFixed(2)}</p>
                    <span className={`text-xs font-bold ${priceChange >= 0 ? 'text-[#D4AF37]' : 'text-[#999]'}`}>
                      {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Wallet Connect */}
          <div className="relative z-[100]">
            <WalletConnect />
          </div>
        </div>

        {/* Credits Display - Separate Card Below Wallet */}
        {isConnected && credits !== null && (
          <div className="px-6 pb-6 relative z-0">
            <div className="bg-[#1a1a1a] border border-[#D4AF37] p-4 relative overflow-hidden group hover:border-[#D4AF37] transition-all duration-200">
              <div className="relative z-10 flex items-center gap-4">
                <div className="p-2 bg-[#0a0a0a] border border-[#D4AF37]/40">
                  <Coins className="h-5 w-5 text-[#D4AF37]" />
                </div>
                <div className="flex-1">
                  <p className="text-xs font-bold text-[#808080] uppercase tracking-wider mb-1">Credits</p>
                  <p className="text-xl font-bold text-[#D4AF37]">{credits.toLocaleString()}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Technical Navigation */}
        <nav className="flex-1 overflow-y-auto px-6 pb-6 space-y-1 relative z-0">
          <div className="mb-8 space-y-1">
            {navigation.map((item) => {
              const isActive = pathname === item.href || pathname?.startsWith(item.href + '/')
              const Icon = item.icon

              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setIsMobileOpen(false)}
                  className={`
                    group flex items-center gap-3 px-4 py-3 transition-all duration-200 relative text-sm
                    ${isActive
                      ? 'bg-[#1a1a1a] border-l-2 border-[#D4AF37] text-white'
                      : 'text-[#808080] hover:text-white hover:bg-[#1a1a1a]/50 border-l-2 border-transparent hover:border-[#404040]'
                    }
                  `}
                >
                  <Icon className={`h-5 w-5 relative z-10 ${isActive ? 'text-[#D4AF37]' : ''} transition-colors duration-200`} />
                  <span className="font-semibold relative z-10 text-sm uppercase tracking-wide">{item.name}</span>
                  {isActive && <ChevronRight className="h-4 w-4 ml-auto relative z-10 text-[#D4AF37]" />}
                </Link>
              )
            })}
          </div>

          {/* Technical Tools Section */}
          <div>
            <div className="px-4 py-3 mb-1 border-t border-[#404040]/40">
              <span className="text-xs font-bold text-[#D4AF37] uppercase tracking-wider flex items-center gap-2">
                <span className="w-1 h-1 bg-[#D4AF37]" />
                Tools
              </span>
            </div>
            <div className="space-y-1">
              {tools.map((item) => {
                const isActive = pathname === item.href
                const Icon = item.icon

                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => setIsMobileOpen(false)}
                    className={`
                      group flex items-center gap-3 px-4 py-3 transition-all duration-200 relative text-sm
                      ${isActive
                        ? 'bg-[#1a1a1a] border-l-2 border-[#D4AF37] text-white'
                        : 'text-[#808080] hover:text-white hover:bg-[#1a1a1a]/50 border-l-2 border-transparent hover:border-[#404040]'
                      }
                    `}
                  >
                    <Icon className={`h-5 w-5 relative z-10 ${isActive ? 'text-[#D4AF37]' : ''} transition-colors duration-200`} />
                    <span className="font-semibold relative z-10 text-sm uppercase tracking-wide">{item.name}</span>
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
