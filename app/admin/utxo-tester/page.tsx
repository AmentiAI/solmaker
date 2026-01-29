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
    <div className="container mx-auto px-6 py-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link
            href="/admin"
            className="text-gray-600 hover:text-[#4561ad] transition-colors"
          >
            ← Back to Admin
          </Link>
          <h1 className="text-3xl font-black text-gray-900">UTXO Tester</h1>
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
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
            <p className="text-red-700 font-semibold">❌ Error</p>
            <p className="text-red-600 text-sm mt-1">{error}</p>
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-6">
            {/* Summary */}
            <div className="bg-green-50 border border-green-200 rounded-xl p-6">
              <h2 className="text-lg font-bold text-green-800 mb-4">✅ Results</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-lg p-4 border border-green-100">
                  <div className="text-sm text-gray-500">Total UTXOs</div>
                  <div className="text-2xl font-bold text-gray-900">{result.totalUtxos}</div>
                </div>
                <div className="bg-white rounded-lg p-4 border border-green-100">
                  <div className="text-sm text-gray-500">Total Value</div>
                  <div className="text-2xl font-bold text-[#e27d0f]">{formatSats(result.totalValue)}</div>
                </div>
                <div className="bg-white rounded-lg p-4 border border-green-100">
                  <div className="text-sm text-gray-500">BTC Value</div>
                  <div className="text-xl font-bold text-gray-900">
                    {(result.totalValue / 100000000).toFixed(8)} BTC
                  </div>
                </div>
                <div className="bg-white rounded-lg p-4 border border-green-100">
                  <div className="text-sm text-gray-500">Excluded</div>
                  <div className="text-2xl font-bold text-gray-900">{result.excludedCount}</div>
                </div>
              </div>
            </div>

            {/* UTXO List */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900">UTXOs ({result.utxos.length})</h2>
                <button
                  onClick={() => setShowRaw(!showRaw)}
                  className="text-sm text-[#4561ad] hover:underline"
                >
                  {showRaw ? 'Show Table' : 'Show Raw JSON'}
                </button>
              </div>

              {showRaw ? (
                <div className="p-4 bg-gray-900 overflow-x-auto">
                  <pre className="text-green-400 text-xs font-mono whitespace-pre-wrap">
                    {rawResponse}
                  </pre>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">#</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">TXID</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Vout</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Value</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Type</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {result.utxos.map((utxo, index) => (
                        <tr key={`${utxo.txid}:${utxo.vout}`} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm text-gray-500">{index + 1}</td>
                          <td className="px-4 py-3">
                            <a
                              href={`https://mempool.space/tx/${utxo.txid}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm font-mono text-[#4561ad] hover:underline"
                            >
                              {utxo.txid.slice(0, 8)}...{utxo.txid.slice(-8)}
                            </a>
                          </td>
                          <td className="px-4 py-3 text-sm font-mono text-gray-600">{utxo.vout}</td>
                          <td className="px-4 py-3 text-sm font-bold text-right text-[#e27d0f]">
                            {formatSats(utxo.value)}
                          </td>
                          <td className="px-4 py-3 text-xs font-mono text-gray-500">
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
        <div className="mt-8 bg-gray-50 border border-gray-200 rounded-xl p-6">
          <h3 className="font-bold text-gray-900 mb-3">API Details</h3>
          <div className="space-y-2 text-sm text-gray-600">
            <p><strong>Endpoint:</strong> <code className="bg-gray-100 px-2 py-1 rounded">/api/utxos?address=ADDRESS</code></p>
            <p><strong>Method:</strong> GET</p>
            <p><strong>Backend:</strong> Sandshrew API (<code>sandshrew_balances</code>)</p>
            <p><strong>Returns:</strong> Spendable UTXOs with txid, vout, value, and script info</p>
          </div>
        </div>
      </div>
    </div>
  )
}

