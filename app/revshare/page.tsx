'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

const TOTAL_SUPPLY = 168

export default function RevSharePage() {
  const [btcPrice, setBtcPrice] = useState<number | null>(null)
  const [priceLoading, setPriceLoading] = useState(true)

  // Fetch BTC price on mount
  useEffect(() => {
    const fetchBtcPrice = async () => {
      try {
        const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd')
        const data = await res.json()
        setBtcPrice(data.bitcoin.usd)
      } catch (err) {
        console.error('Failed to fetch BTC price:', err)
        setBtcPrice(100000) // Fallback price
      } finally {
        setPriceLoading(false)
      }
    }
    fetchBtcPrice()
  }, [])
 
  // Monthly activity assumptions
  const MONTHLY_MINTS = 30000
  const MINT_FEE = 4000
  const MONTHLY_CREDITS = 10000 // USD
  const MONTHLY_MARKETPLACE_VOLUME = 20000000 // sats (0.2 BTC)
  const MONTHLY_INSCRIPTIONS = 5000
  const INSCRIPTION_FEE = 2500

  // Calculate rev shares in sats
  const mintRevShare = Math.floor(MONTHLY_MINTS * MINT_FEE * 0.30)
  const creditRevShareUsd = Math.floor((MONTHLY_CREDITS * 0.50) * 0.30) // $1,500
  const marketplaceRevShare = Math.floor(MONTHLY_MARKETPLACE_VOLUME * 0.03 * 0.30)
  const inscribingRevShare = Math.floor(MONTHLY_INSCRIPTIONS * INSCRIPTION_FEE * 0.30)
  
  // Convert USD to sats using live BTC price
  const usdToSats = (usd: number): number => {
    if (!btcPrice) return 0
    const btcAmount = usd / btcPrice
    return Math.floor(btcAmount * 100000000)
  }

  const creditRevShareSats = usdToSats(creditRevShareUsd)
  const totalRevShareSats = mintRevShare + marketplaceRevShare + inscribingRevShare + creditRevShareSats

  const formatSats = (sats: number) => {
    if (sats >= 1000000) return `${(sats / 1000000).toFixed(1)}M`
    if (sats >= 1000) return `${(sats / 1000).toFixed(0)}K`
    return sats.toLocaleString()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#4561ad] via-[#5a7bc4] to-[#e27d0f]">
      <div className="container mx-auto px-6 py-12">
        <div className="max-w-4xl mx-auto">
          
          {/* Hero - Compact */}
          <div className="text-center mb-10">
            <Link href="/" className="text-white/70 hover:text-white text-sm mb-4 inline-block">← Back</Link>
            <h1 className="text-5xl md:text-7xl font-black text-white mb-3">
              <span className="text-yellow-300">30%</span> RevShare
            </h1>
            <p className="text-xl text-white/90">
              Split among <span className="font-bold text-yellow-300">{TOTAL_SUPPLY}</span> collection holders
            </p>
      </div>

          {/* The Formula - Big & Simple */}
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 mb-8 text-center">
            <p className="text-white text-lg">
              <span className="text-3xl font-black text-yellow-300">Your Share</span>
              <span className="mx-3">=</span>
              <span className="text-2xl">(Pieces ÷ {TOTAL_SUPPLY})</span>
              <span className="mx-3">×</span>
              <span className="text-2xl">30% of revenue</span>
            </p>
            </div>

          {/* 4 Revenue Sources - Compact Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
            <div className="cosmic-card rounded-xl p-4 text-center border border-[#00d4ff]/30">
              <div className="text-3xl mb-2">🎨</div>
              <div className="text-xs text-white/70 uppercase font-bold">Mints</div>
              <div className="text-lg font-black text-[#ff6b35]">30%</div>
              <div className="text-xs text-white/60">of mint fees</div>
              </div>
            <div className="cosmic-card rounded-xl p-4 text-center border border-[#00d4ff]/30">
              <div className="text-3xl mb-2">💳</div>
              <div className="text-xs text-white/70 uppercase font-bold">Credits</div>
              <div className="text-lg font-black text-[#00d4ff]">30%</div>
              <div className="text-xs text-white/60">of net profit*</div>
            </div>
            <div className="cosmic-card rounded-xl p-4 text-center border border-[#00d4ff]/30">
              <div className="text-3xl mb-2">🏪</div>
              <div className="text-xs text-white/70 uppercase font-bold">Market</div>
              <div className="text-lg font-black text-[#00d4ff]">30%</div>
              <div className="text-xs text-white/60">of 3% fee</div>
              </div>
            <div className="cosmic-card rounded-xl p-4 text-center border border-[#00d4ff]/30">
              <div className="text-3xl mb-2">📜</div>
              <div className="text-xs text-white/70 uppercase font-bold">Inscribe</div>
              <div className="text-lg font-black text-[#00d4ff]">30%</div>
              <div className="text-xs text-white/60">of service fee</div>
            </div>
          </div>

          {/* Monthly Example - The Main Event */}
          <div className="cosmic-card rounded-2xl overflow-hidden mb-8 border border-[#00d4ff]/30">
            <div className="bg-gradient-to-r from-[#0a0e27] to-[#1a1f3a] px-6 py-4">
              <h2 className="text-xl font-bold text-white text-center">
                📊 Example Monthly Earnings
                </h2>
              {btcPrice && (
                <p className="text-center text-white/60 text-xs mt-1">
                  BTC @ ${btcPrice.toLocaleString()}
                </p>
              )}
                        </div>
            
            {/* Activity Summary */}
            <div className="grid grid-cols-4 gap-1 p-4 cosmic-card text-center text-xs">
              <div>
                <div className="font-bold text-white">30K</div>
                <div className="text-white/70">mints</div>
                        </div>
              <div>
                <div className="font-bold text-white">$10K</div>
                <div className="text-white/70">credits</div>
                      </div>
              <div>
                <div className="font-bold text-white">0.2 BTC</div>
                <div className="text-white/70">trades</div>
                    </div>
              <div>
                <div className="font-bold text-white">5K</div>
                <div className="text-white/70">inscriptions</div>
              </div>
            </div>

            {/* Rev Share Pool */}
            <div className="p-6 text-center border-b border-[#00d4ff]/30">
              <div className="text-sm text-white/70 mb-1">Total Monthly Rev Share Pool</div>
              {priceLoading ? (
                <div className="text-2xl text-white/50">Loading...</div>
              ) : (
                <>
                  <div className="text-4xl font-black text-[#00d4ff]">
                    {formatSats(totalRevShareSats)} sats
              </div>
                  <div className="text-sm text-white/60 mt-1">
                    (~{(totalRevShareSats / 100000000).toFixed(3)} BTC)
                        </div>
                </>
              )}
                        </div>

            {/* Your Earnings Based on Holdings */}
            <div className="p-6">
              <div className="text-center text-sm text-white/70 mb-4">Your monthly earnings based on holdings</div>
              {priceLoading ? (
                <div className="text-center text-white/50">Calculating...</div>
              ) : (
                <div className="grid grid-cols-3 gap-4">
                  <div className="cosmic-card rounded-xl p-4 text-center border border-[#00d4ff]/30">
                    <div className="text-xs text-white/70 mb-2">1 piece</div>
                    <div className="text-2xl font-black text-[#ff6b35]">
                      {formatSats(Math.floor(totalRevShareSats / TOTAL_SUPPLY))}
                        </div>
                    <div className="text-sm text-white/70">sats/month</div>
                      </div>
                  <div className="cosmic-card rounded-xl p-4 text-center border-2 border-[#00d4ff]/50">
                    <div className="text-xs text-white/70 mb-2">10 pieces</div>
                    <div className="text-2xl font-black text-[#00d4ff]">
                      {formatSats(Math.floor(totalRevShareSats * 10 / TOTAL_SUPPLY))}
                    </div>
                    <div className="text-sm text-white/70">sats/month</div>
                        </div>
                  <div className="cosmic-card rounded-xl p-4 text-center border border-[#ff6b35]/30">
                    <div className="text-xs text-white/70 mb-2">22 pieces <span className="text-[#ff6b35]">(10%)</span></div>
                    <div className="text-2xl font-black text-[#ff6b35]">
                      {formatSats(Math.floor(totalRevShareSats * 22 / TOTAL_SUPPLY))}
                        </div>
                    <div className="text-sm text-white/70">sats/month</div>
                        </div>
                      </div>
              )}
              </div>
            </div>

          {/* Breakdown - Collapsible or minimal */}
          <details className="cosmic-card rounded-xl overflow-hidden mb-8 border border-[#00d4ff]/30">
            <summary className="px-6 py-4 cursor-pointer text-white font-bold flex items-center justify-between">
              <span>📋 Detailed Breakdown by Source</span>
              <span className="text-white/50 text-sm">click to expand</span>
            </summary>
            <div className="px-6 pb-6 grid md:grid-cols-2 gap-4">
              <div className="cosmic-card rounded-lg p-4 border border-[#00d4ff]/30">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">🎨</span>
                  <span className="font-bold text-white">Mint Fees</span>
              </div>
                <div className="text-sm text-white/80 space-y-1">
                        <div className="flex justify-between">
                    <span>30K mints × 4K sats:</span>
                    <span className="font-semibold">1.2 BTC</span>
                        </div>
                  <div className="flex justify-between text-[#ff6b35]">
                    <span>Rev Share (30%):</span>
                    <span className="font-bold">{formatSats(mintRevShare)} sats</span>
                        </div>
                      </div>
                    </div>
              <div className="cosmic-card rounded-lg p-4 border border-[#00d4ff]/30">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">💳</span>
                  <span className="font-bold text-white">Credits</span>
                </div>
                <div className="text-sm text-white/80 space-y-1">
                  <div className="flex justify-between">
                    <span>$10K sales → $5K net:</span>
                    <span className="font-semibold">50% costs</span>
                  </div>
                  <div className="flex justify-between text-[#00d4ff]">
                    <span>Rev Share (30%):</span>
                    <span className="font-bold">${creditRevShareUsd.toLocaleString()} → {formatSats(creditRevShareSats)} sats</span>
                </div>
              </div>
            </div>
              <div className="cosmic-card rounded-lg p-4 border border-[#00d4ff]/30">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">🏪</span>
                  <span className="font-bold text-white">Marketplace</span>
              </div>
                <div className="text-sm text-white/80 space-y-1">
                        <div className="flex justify-between">
                    <span>0.2 BTC volume × 3%:</span>
                    <span className="font-semibold">600K sats</span>
                        </div>
                  <div className="flex justify-between text-[#00d4ff]">
                    <span>Rev Share (30%):</span>
                    <span className="font-bold">{formatSats(marketplaceRevShare)} sats</span>
                        </div>
                      </div>
                    </div>
              <div className="cosmic-card rounded-lg p-4 border border-[#00d4ff]/30">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">📜</span>
                  <span className="font-bold text-white">Inscribing</span>
                </div>
                <div className="text-sm text-white/80 space-y-1">
                  <div className="flex justify-between">
                    <span>5K × 2.5K sats:</span>
                    <span className="font-semibold">0.125 BTC</span>
                  </div>
                  <div className="flex justify-between text-[#00d4ff]">
                    <span>Rev Share (30%):</span>
                    <span className="font-bold">{formatSats(inscribingRevShare)} sats</span>
                </div>
              </div>
            </div>
          </div>
          </details>

          {/* Fine Print */}
          <div className="text-center text-white/60 text-xs space-y-1">
            <p>* Credits: 30% of net profit after 50% platform costs (converted to sats at current BTC price)</p>
            <p>Payouts processed monthly • Must hold ordinal in wallet to qualify</p>
          </div>

        </div>
      </div>
    </div>
  )
}
