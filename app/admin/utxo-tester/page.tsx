'use client'

import { useState } from 'react'
import Link from 'next/link'

interface UTXO {
  txid: string
  vout: number
  value: number
  scriptpubkey?: string
  scriptpubkey_type?: string
}

interface UTXOResult {
  utxos: UTXO[]
  excludedCount: number
  totalUtxos: number
  totalValue: number
}

export default function UTXOTesterPage() {
  const [address, setAddress] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<UTXOResult | null>(null)
  const [error, setError] = useState('')
  const [rawResponse, setRawResponse] = useState<string>('')
  const [showRaw, setShowRaw] = useState(false)

  const fetchUTXOs = async () => {
    if (!address.trim()) {
      setError('Please enter a Bitcoin address')
      return
    }

    setLoading(true)
    setError('')
    setResult(null)
    setRawResponse('')

    try {
      const response = await fetch(`/api/utxos?address=${encodeURIComponent(address.trim())}&filter=false`)
      const data = await response.json()
      
      setRawResponse(JSON.stringify(data, null, 2))

      if (!response.ok) {
        throw new Error(data.error || data.details || 'Failed to fetch UTXOs')
      }

      setResult(data)
    } catch (err: any) {
      setError(err.message || 'Failed to fetch UTXOs')
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
    <div className="container mx-auto px-6 py-8 bg-gradient-to-br from-[#050510] via-[#0f0f1e] to-[#15152a] min-h-screen">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link
            href="/admin"
            className="text-[#b4b4c8] hover:text-[#00E5FF] transition-colors"
          >
            ← Back to Admin
          </Link>
          <h1 className="text-3xl font-black bg-gradient-to-r from-[#00E5FF] via-[#FFD60A] to-[#00E5FF] bg-clip-text text-transparent">UTXO Tester</h1>
        </div>

        {/* Description */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
          <p className="text-blue-800 text-sm">
            <strong>Sandshrew API Tester:</strong> Enter a Bitcoin address to fetch its UTXOs using the Sandshrew/Esplora API. 
            This uses the <code className="bg-blue-100 px-1 rounded">sandshrew_balances</code> method to get spendable UTXOs.
          </p>
        </div>

        {/* Input Form */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Bitcoin Address
          </label>
          <div className="flex gap-3">
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="bc1p... or bc1q... or 1... or 3..."
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4561ad] focus:border-transparent font-mono text-sm"
              onKeyDown={(e) => e.key === 'Enter' && fetchUTXOs()}
            />
            <button
              onClick={fetchUTXOs}
              disabled={loading}
              className="px-6 py-3 bg-[#4561ad] text-white font-bold rounded-lg hover:bg-[#3a5294] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Fetching...' : 'Fetch UTXOs'}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-gradient-to-br from-red-900/30 to-red-800/20 border border-[#EF4444]/20/50 rounded-xl p-4 mb-6">
            <p className="text-red-300 font-semibold">❌ Error</p>
            <p className="text-[#EF4444] text-sm mt-1">{error}</p>
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-6">
            {/* Summary */}
            <div className="bg-gradient-to-br from-[#0f0f1e]/90 to-[#15152a]/90 border border-[#00E5FF]/20 rounded-xl p-6">
              <h2 className="text-lg font-bold bg-gradient-to-r from-[#FFD60A] to-[#00E5FF] bg-clip-text text-transparent mb-4">✅ Results</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-[#050510] to-[#0f0f1e] rounded-lg p-4 border border-[#00E5FF]/20">
                  <div className="text-sm text-[#b4b4c8]">Total UTXOs</div>
                  <div className="text-2xl font-bold text-white">{result.totalUtxos}</div>
                </div>
                <div className="bg-gradient-to-br from-[#050510] to-[#0f0f1e] rounded-lg p-4 border border-[#00E5FF]/20">
                  <div className="text-sm text-[#b4b4c8]">Total Value</div>
                  <div className="text-2xl font-bold text-[#FFD60A]">{formatSats(result.totalValue)}</div>
                </div>
                <div className="bg-gradient-to-br from-[#050510] to-[#0f0f1e] rounded-lg p-4 border border-[#00E5FF]/20">
                  <div className="text-sm text-[#b4b4c8]">BTC Value</div>
                  <div className="text-xl font-bold text-white">
                    {(result.totalValue / 100000000).toFixed(8)} BTC
                  </div>
                </div>
                <div className="bg-gradient-to-br from-[#050510] to-[#0f0f1e] rounded-lg p-4 border border-[#00E5FF]/20">
                  <div className="text-sm text-[#b4b4c8]">Excluded</div>
                  <div className="text-2xl font-bold text-white">{result.excludedCount}</div>
                </div>
              </div>
            </div>

            {/* UTXO List */}
            <div className="bg-gradient-to-br from-[#0f0f1e]/90 to-[#15152a]/90 border border-[#00E5FF]/20 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-[#00E5FF]/20 flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">UTXOs ({result.utxos.length})</h2>
                <button
                  onClick={() => setShowRaw(!showRaw)}
                  className="text-sm text-[#00E5FF] hover:text-[#FFD60A] hover:underline transition-colors"
                >
                  {showRaw ? 'Show Table' : 'Show Raw JSON'}
                </button>
              </div>

              {showRaw ? (
                <div className="p-4 bg-[#050510] overflow-x-auto">
                  <pre className="text-[#FFD60A] text-xs font-mono whitespace-pre-wrap">
                    {rawResponse}
                  </pre>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-[#050510]">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-[#b4b4c8] uppercase">#</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-[#b4b4c8] uppercase">TXID</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-[#b4b4c8] uppercase">Vout</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-[#b4b4c8] uppercase">Value</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-[#b4b4c8] uppercase">Type</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#00E5FF]/20">
                      {result.utxos.map((utxo, index) => (
                        <tr key={`${utxo.txid}:${utxo.vout}`} className="hover:bg-[#0f0f1e]/50">
                          <td className="px-4 py-3 text-sm text-[#b4b4c8]">{index + 1}</td>
                          <td className="px-4 py-3">
                            <a
                              href={`https://mempool.space/tx/${utxo.txid}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm font-mono text-[#00E5FF] hover:text-[#FFD60A] hover:underline transition-colors"
                            >
                              {utxo.txid.slice(0, 8)}...{utxo.txid.slice(-8)}
                            </a>
                          </td>
                          <td className="px-4 py-3 text-sm font-mono text-white">{utxo.vout}</td>
                          <td className="px-4 py-3 text-sm font-bold text-right text-[#FFD60A]">
                            {formatSats(utxo.value)}
                          </td>
                          <td className="px-4 py-3 text-xs font-mono text-[#b4b4c8]">
                            {utxo.scriptpubkey_type || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* API Info */}
        <div className="mt-8 bg-gradient-to-br from-[#0f0f1e]/90 to-[#15152a]/90 border border-[#00E5FF]/20 rounded-xl p-6">
          <h3 className="font-bold bg-gradient-to-r from-[#00E5FF] to-[#FFD60A] bg-clip-text text-transparent mb-3">API Details</h3>
          <div className="space-y-2 text-sm text-[#b4b4c8]">
            <p><strong>Endpoint:</strong> <code className="bg-[#050510] px-2 py-1 rounded border border-[#00E5FF]/20">/api/utxos?address=ADDRESS</code></p>
            <p><strong>Method:</strong> GET</p>
            <p><strong>Backend:</strong> Sandshrew API (<code>sandshrew_balances</code>)</p>
            <p><strong>Returns:</strong> Spendable UTXOs with txid, vout, value, and script info</p>
          </div>
        </div>
      </div>
    </div>
  )
}

