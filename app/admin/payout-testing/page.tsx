'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface WalletInfo {
  p2wpkh: { address: string; path: string; pubKeyHex: string; pubKeyLength: number }
  p2tr: { address: string; path: string; pubKeyHex: string; tapInternalKey: string; tapInternalKeyLength: number; pubKeyLength: number }
  p2sh: { address: string; path: string; pubKeyHex: string; pubKeyLength: number }
  p2pkh: { address: string; path: string; pubKeyHex: string; pubKeyLength: number }
}

export default function PayoutTestingPage() {
  const [recipientAddress, setRecipientAddress] = useState('')
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [walletInfo, setWalletInfo] = useState<{
    feeWallet: string
    feeWalletMatches: boolean
    matchedType: string | null
    wallets: WalletInfo
  } | null>(null)
  const [walletLoading, setWalletLoading] = useState(true)
  const [result, setResult] = useState<{
    success: boolean
    txid?: string
    message: string
    sourceAddress?: string
    sourceAddressType?: string
  } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const fetchWalletInfo = async () => {
      try {
        const response = await fetch('/api/admin/payout-testing')
        const data = await response.json()
        if (response.ok) {
          setWalletInfo(data)
        } else {
          setError(data.error || 'Failed to load wallet information')
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load wallet information')
      } finally {
        setWalletLoading(false)
      }
    }
    fetchWalletInfo()
  }, [])

  const handleTestPayout = async () => {
    if (!recipientAddress.trim()) {
      setError('Please enter a recipient wallet address')
      return
    }

    const amountNum = parseFloat(amount)
    if (isNaN(amountNum) || amountNum <= 0) {
      setError('Please enter a valid amount (greater than 0)')
      return
    }

    setLoading(true)
    setError('')
    setResult(null)

    try {
      const response = await fetch('/api/admin/payout-testing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipientAddress: recipientAddress.trim(),
          amount: amountNum,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send payout')
      }

      setResult(data)
    } catch (err: any) {
      setError(err.message || 'Failed to send payout')
    } finally {
      setLoading(false)
    }
  }

  const formatSats = (sats: number): string => {
    if (sats >= 100000000) {
      return `${(sats / 100000000).toFixed(8)} BTC`
    }
    return `${sats.toLocaleString()} sats`
  }

  return (
    <div className="p-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="flex items-center gap-4 mb-8">
            <Link
              href="/admin"
              className="text-[#b4b4c8] hover:text-white transition-colors"
            >
              ← Back to Admin
            </Link>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-[#00E5FF] via-[#FFD60A] to-[#00E5FF] bg-clip-text text-transparent">Payout Testing</h1>
          </div>

          {/* Description */}
          <div className="bg-gradient-to-br from-[#0f0f1e]/90 to-[#15152a]/90 border border-[#00E5FF]/20 rounded-xl p-4 mb-6">
            <p className="text-[#b4b4c8] text-sm">
              <strong>⚠️ Test Payout System:</strong> This tool allows you to test sending Bitcoin payments from the wallet stored in the <code className="bg-[#050510] px-1 rounded border border-[#00E5FF]/20">PHRASE</code> environment variable. 
              Enter a recipient address and amount to create, sign, and broadcast a PSBT transaction.
            </p>
          </div>

          {/* Wallet Breakdown */}
          {walletLoading ? (
            <div className="bg-gradient-to-br from-[#0f0f1e]/90 to-[#15152a]/90 border border-[#00E5FF]/20 rounded-xl p-6 mb-6">
              <p className="text-[#b4b4c8] text-sm">Loading wallet information...</p>
            </div>
          ) : walletInfo ? (
            <div className="bg-gradient-to-br from-[#0f0f1e]/90 to-[#15152a]/90 border border-[#00E5FF]/20 rounded-xl p-6 mb-6">
              <h2 className="text-lg font-bold bg-gradient-to-r from-[#00E5FF] to-[#FFD60A] bg-clip-text text-transparent mb-4">Wallet Breakdown from PHRASE</h2>
              
              {/* FEE_WALLET Verification */}
              <div className={`mb-6 p-4 rounded-lg border ${walletInfo.feeWalletMatches ? 'bg-gradient-to-br from-green-900/30 to-green-800/20 border-green-700/50' : 'bg-gradient-to-br from-yellow-900/30 to-yellow-800/20 border-[#FBBF24]/20/50'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={walletInfo.feeWalletMatches ? 'text-[#FFD60A]' : 'text-[#00E5FF]'}>
                    {walletInfo.feeWalletMatches ? '✅' : '⚠️'}
                  </span>
                  <span className={`font-semibold ${walletInfo.feeWalletMatches ? 'text-[#FFD60A]' : 'text-[#00E5FF]'}`}>
                    FEE_WALLET Environment Variable
                  </span>
                </div>
                <p className="text-xs text-white font-mono break-all mb-2">{walletInfo.feeWallet}</p>
                {walletInfo.feeWalletMatches ? (
                  <p className="text-xs text-[#FFD60A]">
                    ✅ Matches {walletInfo.matchedType?.toUpperCase()} address derived from PHRASE
                  </p>
                ) : (
                  <p className="text-xs text-[#00E5FF]">
                    ⚠️ Does not match any derived address from PHRASE
                  </p>
                )}
              </div>

              {/* P2TR (Taproot) */}
              <div className="mb-4 p-4 bg-[#050510] rounded-lg border border-[#00E5FF]/30">
                <h3 className="text-sm font-bold text-[#00E5FF] mb-3 flex items-center gap-2">
                  <span>🔷</span> P2TR (Taproot) - bc1p...
                </h3>
                <div className="space-y-2 text-xs">
                  <div>
                    <span className="text-[#b4b4c8]">Derivation Path:</span>
                    <span className="text-white font-mono ml-2">{walletInfo.wallets.p2tr.path}</span>
                  </div>
                  <div>
                    <span className="text-[#b4b4c8]">Address:</span>
                    <span className="text-white font-mono ml-2 break-all">{walletInfo.wallets.p2tr.address}</span>
                  </div>
                  <div>
                    <span className="text-[#b4b4c8]">Public Key (hex):</span>
                    <span className="text-white font-mono ml-2 break-all text-[10px]">{walletInfo.wallets.p2tr.pubKeyHex}</span>
                    <span className="text-[#b4b4c8] ml-2">({walletInfo.wallets.p2tr.pubKeyLength} bytes)</span>
                  </div>
                  <div>
                    <span className="text-[#b4b4c8]">Tap Internal Key (hex):</span>
                    <span className="text-white font-mono ml-2 break-all text-[10px]">{walletInfo.wallets.p2tr.tapInternalKey}</span>
                    <span className="text-[#b4b4c8] ml-2">({walletInfo.wallets.p2tr.tapInternalKeyLength} bytes - used for signing)</span>
                  </div>
                  <div className="mt-2 pt-2 border-t border-[#00E5FF]/20">
                    <p className="text-[#b4b4c8] text-[10px]">
                      Taproot uses a 32-byte internal key (tapInternalKey) derived from the public key by removing the prefix byte. 
                      This is used for taproot signature verification.
                    </p>
                  </div>
                </div>
              </div>

              {/* P2WPKH (Native SegWit) */}
              <div className="mb-4 p-4 bg-[#050510] rounded-lg border border-[#00E5FF]/30">
                <h3 className="text-sm font-bold text-[#00E5FF] mb-3 flex items-center gap-2">
                  <span>🔵</span> P2WPKH (Native SegWit) - bc1q...
                </h3>
                <div className="space-y-2 text-xs">
                  <div>
                    <span className="text-[#b4b4c8]">Derivation Path:</span>
                    <span className="text-white font-mono ml-2">{walletInfo.wallets.p2wpkh.path}</span>
                  </div>
                  <div>
                    <span className="text-[#b4b4c8]">Address:</span>
                    <span className="text-white font-mono ml-2 break-all">{walletInfo.wallets.p2wpkh.address}</span>
                  </div>
                  <div>
                    <span className="text-[#b4b4c8]">Public Key (hex):</span>
                    <span className="text-white font-mono ml-2 break-all text-[10px]">{walletInfo.wallets.p2wpkh.pubKeyHex}</span>
                    <span className="text-[#b4b4c8] ml-2">({walletInfo.wallets.p2wpkh.pubKeyLength} bytes)</span>
                  </div>
                </div>
              </div>

              {/* P2SH (Nested SegWit) */}
              <div className="mb-4 p-4 bg-[#050510] rounded-lg border border-[#00E5FF]/30">
                <h3 className="text-sm font-bold text-[#00E5FF] mb-3 flex items-center gap-2">
                  <span>🟠</span> P2SH (Nested SegWit) - 3...
                </h3>
                <div className="space-y-2 text-xs">
                  <div>
                    <span className="text-[#b4b4c8]">Derivation Path:</span>
                    <span className="text-white font-mono ml-2">{walletInfo.wallets.p2sh.path}</span>
                  </div>
                  <div>
                    <span className="text-[#b4b4c8]">Address:</span>
                    <span className="text-white font-mono ml-2 break-all">{walletInfo.wallets.p2sh.address}</span>
                  </div>
                  <div>
                    <span className="text-[#b4b4c8]">Public Key (hex):</span>
                    <span className="text-white font-mono ml-2 break-all text-[10px]">{walletInfo.wallets.p2sh.pubKeyHex}</span>
                    <span className="text-[#b4b4c8] ml-2">({walletInfo.wallets.p2sh.pubKeyLength} bytes)</span>
                  </div>
                </div>
              </div>

              {/* P2PKH (Legacy) */}
              <div className="mb-4 p-4 bg-[#050510] rounded-lg border border-[#00E5FF]/30">
                <h3 className="text-sm font-bold text-[#b4b4c8] mb-3 flex items-center gap-2">
                  <span>⚪</span> P2PKH (Legacy) - 1...
                </h3>
                <div className="space-y-2 text-xs">
                  <div>
                    <span className="text-[#b4b4c8]">Derivation Path:</span>
                    <span className="text-white font-mono ml-2">{walletInfo.wallets.p2pkh.path}</span>
                  </div>
                  <div>
                    <span className="text-[#b4b4c8]">Address:</span>
                    <span className="text-white font-mono ml-2 break-all">{walletInfo.wallets.p2pkh.address}</span>
                  </div>
                  <div>
                    <span className="text-[#b4b4c8]">Public Key (hex):</span>
                    <span className="text-white font-mono ml-2 break-all text-[10px]">{walletInfo.wallets.p2pkh.pubKeyHex}</span>
                    <span className="text-[#b4b4c8] ml-2">({walletInfo.wallets.p2pkh.pubKeyLength} bytes)</span>
                  </div>
                </div>
              </div>

              {/* Derivation Paths Summary */}
              <div className="mt-4 pt-4 border-t border-[#00E5FF]/20">
                <h3 className="text-sm font-bold text-white mb-2">BIP32 Derivation Paths Summary</h3>
                <div className="text-xs text-[#b4b4c8] space-y-1">
                  <p>• <strong className="text-[#00E5FF]">P2TR (Taproot):</strong> m/86'/0'/0'/0/0 - Most modern, efficient, uses tapInternalKey</p>
                  <p>• <strong className="text-[#00E5FF]">P2WPKH (Native SegWit):</strong> m/84'/0'/0'/0/0 - Common in modern wallets</p>
                  <p>• <strong className="text-[#00E5FF]">P2SH (Nested SegWit):</strong> m/49'/0'/0'/0/0 - Backward compatible</p>
                  <p>• <strong className="text-[#b4b4c8]">P2PKH (Legacy):</strong> m/44'/0'/0'/0/0 - Original Bitcoin addresses</p>
                </div>
              </div>
            </div>
          ) : null}

          {/* Input Form */}
          <div className="bg-gradient-to-br from-[#0f0f1e]/90 to-[#15152a]/90 border border-[#00E5FF]/20 rounded-xl p-6 mb-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-white mb-2">
                  Recipient Wallet Address
                </label>
                <input
                  type="text"
                  value={recipientAddress}
                  onChange={(e) => setRecipientAddress(e.target.value)}
                  placeholder="bc1p... or bc1q... or 1... or 3..."
                  className="w-full px-4 py-3 bg-[#050510] border border-[#00E5FF]/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00E5FF] focus:border-transparent font-mono text-sm text-white"
                  disabled={loading}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-white mb-2">
                  Amount (BTC)
                </label>
                <input
                  type="number"
                  step="0.00000001"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.001"
                  className="w-full px-4 py-3 bg-[#050510] border border-[#00E5FF]/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00E5FF] focus:border-transparent text-white"
                  disabled={loading}
                />
                {amount && !isNaN(parseFloat(amount)) && (
                  <p className="mt-2 text-sm text-[#b4b4c8]">
                    ≈ {formatSats(Math.round(parseFloat(amount) * 100000000))}
                  </p>
                )}
              </div>
              <button
                onClick={handleTestPayout}
                disabled={loading || !recipientAddress.trim() || !amount}
                className="w-full px-6 py-3 bg-gradient-to-r from-[#00E5FF] to-[#FFD60A] text-white font-bold rounded-lg hover:from-[#7a35cc] hover:to-[#11c97a] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-[#00E5FF]/30"
              >
                {loading ? 'Sending...' : 'Send Test Payout'}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-gradient-to-br from-red-900/30 to-red-800/20 border border-[#EF4444]/20/50 rounded-xl p-4 mb-6">
              <p className="text-red-200 font-semibold">❌ Error</p>
              <p className="text-red-300 text-sm mt-1">{error}</p>
            </div>
          )}

          {/* Results */}
          {result && (
            <div className={`${result.success ? 'bg-gradient-to-br from-green-900/30 to-green-800/20 border-green-700/50' : 'bg-gradient-to-br from-yellow-900/30 to-yellow-800/20 border-[#FBBF24]/20/50'} border rounded-xl p-6`}>
              <h2 className={`text-lg font-bold ${result.success ? 'text-[#FFD60A]' : 'text-[#00E5FF]'} mb-4`}>
                {result.success ? '✅ Success' : '⚠️ Result'}
              </h2>
              <div className="space-y-2 text-sm">
                <p className={result.success ? 'text-[#FFD60A]' : 'text-[#00E5FF]'}>
                  {result.message}
                </p>
                {result.sourceAddress && (
                  <div className="mt-4 pt-4 border-t border-[#00E5FF]/20">
                    <p className="text-[#b4b4c8] text-xs mb-1">Source Address:</p>
                    <p className="text-white font-mono text-xs break-all">{result.sourceAddress}</p>
                    {result.sourceAddressType && (
                      <p className="text-[#b4b4c8] text-xs mt-1">
                        Type: <span className="text-white">{result.sourceAddressType}</span>
                      </p>
                    )}
                  </div>
                )}
                {result.txid && (
                  <div className="mt-4 pt-4 border-t border-[#00E5FF]/20">
                    <p className="text-[#b4b4c8] text-xs mb-1">Transaction ID:</p>
                    <a
                      href={`https://mempool.space/tx/${result.txid}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#00E5FF] hover:text-[#FFD60A] font-mono text-xs break-all underline transition-colors"
                    >
                      {result.txid}
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Info */}
          <div className="mt-8 bg-gradient-to-br from-[#0f0f1e]/90 to-[#15152a]/90 border border-[#00E5FF]/20 rounded-xl p-6">
            <h3 className="font-bold bg-gradient-to-r from-[#00E5FF] to-[#FFD60A] bg-clip-text text-transparent mb-3">How It Works</h3>
            <div className="space-y-2 text-sm text-[#b4b4c8]">
              <p>1. Derives a Bitcoin wallet from the <code className="bg-[#050510] px-1 rounded border border-[#00E5FF]/20">PHRASE</code> environment variable</p>
              <p>2. Fetches UTXOs from the derived wallet address</p>
              <p>3. Creates a PSBT with inputs from the wallet and output to recipient</p>
              <p>4. Signs the PSBT using the wallet's private key</p>
              <p>5. Broadcasts the transaction to the Bitcoin network</p>
            </div>
          </div>
        </div>
    </div>
  )
}

