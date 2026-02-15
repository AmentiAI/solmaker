'use client'

import { useState, useEffect } from 'react'
import { useWallet } from '@/lib/wallet/compatibility'
import { useAdminCheck } from '@/lib/auth/use-admin-check'
import { WalletConnect } from '@/components/wallet-connect'

interface GenerationError {
  id: string
  generation_job_id: string
  collection_id: string
  collection_name: string | null
  ordinal_number: number | null
  error_type: string
  error_message: string
  error_details: any
  api_response: any
  prompt: string | null
  created_at: string
  job_status: string | null
}

interface ErrorSummary {
  total: number
  content_policy_violations: number
  api_errors: number
  timeouts: number
  upload_errors: number
  download_errors: number
  thumbnail_errors: number
  compression_errors: number
  base64_errors: number
  unknown_errors: number
}

export default function AdminGenerationErrorsPage() {
  const { isConnected, currentAddress } = useWallet()
  const [errors, setErrors] = useState<GenerationError[]>([])
  const [summary, setSummary] = useState<ErrorSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [errorTypeFilter, setErrorTypeFilter] = useState<string>('all')
  const [expandedErrors, setExpandedErrors] = useState<Set<string>>(new Set())

  const { isAdmin: authorized } = useAdminCheck(currentAddress || null)

  useEffect(() => {
    if (currentAddress && authorized) {
      loadErrors()
    }
  }, [currentAddress, authorized, errorTypeFilter])

  const loadErrors = async () => {
    if (!currentAddress) return

    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        wallet_address: currentAddress,
      })
      if (errorTypeFilter !== 'all') {
        params.append('error_type', errorTypeFilter)
      }

      const response = await fetch(`/api/admin/generation-errors?${params}`)

      if (!response.ok) {
        if (response.status === 403) {
          setError('Unauthorized. Admin access only.')
        } else {
          const errorData = await response.json()
          setError(errorData.error || 'Failed to load generation errors')
        }
        setLoading(false)
        return
      }

      const data = await response.json()
      setErrors(data.errors || [])
      setSummary(data.summary || null)
    } catch (err) {
      console.error('Error loading generation errors:', err)
      setError('Failed to load generation errors')
    } finally {
      setLoading(false)
    }
  }

  const toggleError = (errorId: string) => {
    setExpandedErrors(prev => {
      const newSet = new Set(prev)
      if (newSet.has(errorId)) {
        newSet.delete(errorId)
      } else {
        newSet.add(errorId)
      }
      return newSet
    })
  }

  const getErrorTypeColor = (errorType: string) => {
    switch (errorType) {
      case 'content_policy_violation':
        return 'bg-purple-100 text-purple-800'
      case 'api_error':
        return 'bg-red-100 text-red-800'
      case 'timeout':
        return 'bg-orange-100 text-orange-800'
      case 'upload_error':
      case 'download_error':
        return 'bg-yellow-100 text-yellow-800'
      case 'thumbnail_error':
      case 'compression_error':
      case 'base64_error':
        return 'bg-blue-100 text-blue-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  if (!authorized) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#050510] via-[#0f0f1e] to-[#15152a]">
        <WalletConnect />
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-[#00E5FF] to-[#FFD60A] bg-clip-text text-transparent mb-4">Access Denied</h1>
            <p className="text-[#b4b4c8]">You must be an admin to view this page.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 pt-32">
      <WalletConnect />
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-[#00E5FF] via-[#FFD60A] to-[#00E5FF] bg-clip-text text-transparent mb-2">Generation Errors</h1>
            <p className="text-[#a8a8b8]">View and debug image generation API errors</p>
          </div>

          {summary && (
            <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90/50 rounded-lg p-6 mb-6 border border-slate-700">
              <h2 className="text-xl font-semibold text-white mb-4">Error Summary</h2>
              <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
                <div className="bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24]/50 rounded p-3">
                  <div className="text-sm text-[#a8a8b8]">Total Errors</div>
                  <div className="text-2xl font-bold text-white">{summary.total}</div>
                </div>
                <div className="bg-purple-900/30 rounded p-3 border border-purple-800/50">
                  <div className="text-sm text-purple-400">Content Policy</div>
                  <div className="text-2xl font-bold text-purple-300">{summary.content_policy_violations || 0}</div>
                </div>
                <div className="bg-red-900/30 rounded p-3 border border-red-800/50">
                  <div className="text-sm text-[#EF4444]">API Errors</div>
                  <div className="text-2xl font-bold text-red-300">{summary.api_errors}</div>
                </div>
                <div className="bg-orange-900/30 rounded p-3 border border-orange-800/50">
                  <div className="text-sm text-orange-400">Timeouts</div>
                  <div className="text-2xl font-bold text-orange-300">{summary.timeouts}</div>
                </div>
                <div className="bg-yellow-900/30 rounded p-3 border border-yellow-800/50">
                  <div className="text-sm text-[#FBBF24]">Upload/Download</div>
                  <div className="text-2xl font-bold text-yellow-300">{summary.upload_errors + summary.download_errors}</div>
                </div>
                <div className="bg-blue-900/30 rounded p-3 border border-blue-800/50">
                  <div className="text-sm text-blue-400">Other</div>
                  <div className="text-2xl font-bold text-blue-300">
                    {summary.thumbnail_errors + summary.compression_errors + summary.base64_errors + summary.unknown_errors}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90/50 rounded-lg p-6 mb-6 border border-slate-700">
            <div className="flex items-center gap-4 mb-4">
              <label className="text-white font-medium">Filter by Error Type:</label>
              <select
                value={errorTypeFilter}
                onChange={(e) => setErrorTypeFilter(e.target.value)}
                className="px-4 py-2 bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24] border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="all">All Errors</option>
                <option value="content_policy_violation">Content Policy Violations</option>
                <option value="api_error">API Errors</option>
                <option value="timeout">Timeouts</option>
                <option value="upload_error">Upload Errors</option>
                <option value="download_error">Download Errors</option>
                <option value="thumbnail_error">Thumbnail Errors</option>
                <option value="compression_error">Compression Errors</option>
                <option value="base64_error">Base64 Errors</option>
                <option value="unknown">Unknown</option>
              </select>
              <button
                onClick={loadErrors}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors"
              >
                🔄 Refresh
              </button>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <div className="text-white">Loading errors...</div>
            </div>
          ) : error ? (
            <div className="bg-red-900/30 border border-red-800 rounded-lg p-4 text-red-200">
              {error}
            </div>
          ) : errors.length === 0 ? (
            <div className="bg-gradient-to-br from-[#0f0f1e]/90 to-[#15152a]/90 rounded-lg p-8 text-center border border-[#00E5FF]/20">
              <div className="text-[#a8a8b8] text-lg">No generation errors found</div>
            </div>
          ) : (
            <div className="space-y-4">
              {errors.map((err) => (
                <div
                  key={err.id}
                  className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90/50 rounded-lg border border-slate-700 overflow-hidden"
                >
                  <div
                    className="p-4 cursor-pointer hover:bg-slate-700/50 transition-colors"
                    onClick={() => toggleError(err.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 flex-1">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${getErrorTypeColor(err.error_type)}`}>
                          {err.error_type}
                        </span>
                        <div className="flex-1">
                          <div className="text-white font-medium">{err.error_message.substring(0, 100)}...</div>
                          <div className="text-sm text-[#a8a8b8] mt-1">
                            {err.collection_name || 'Unknown Collection'} 
                            {err.ordinal_number !== null && ` • Ordinal #${err.ordinal_number}`}
                            {' • '}
                            {formatDate(err.created_at)}
                          </div>
                        </div>
                      </div>
                      <button className="text-[#a8a8b8] hover:text-white">
                        {expandedErrors.has(err.id) ? '▼' : '▶'}
                      </button>
                    </div>
                  </div>
                  {expandedErrors.has(err.id) && (
                    <div className="border-t border-[#00E5FF]/20 p-4 bg-[#050510]">
                      <div className="space-y-4">
                        <div>
                          <div className="text-sm font-medium text-[#a8a8b8] mb-1">Error Message:</div>
                          <div className="text-white font-mono text-sm bg-[#050510] border border-[#00E5FF]/20 p-3 rounded break-all">
                            {err.error_message}
                          </div>
                        </div>
                        {err.prompt && (
                          <div>
                            <div className="text-sm font-medium text-[#a8a8b8] mb-1">Prompt:</div>
                            <div className="text-white font-mono text-sm bg-[#050510] border border-[#00E5FF]/20 p-3 rounded break-all">
                              {err.prompt}
                            </div>
                          </div>
                        )}
                        {err.error_details && (
                          <div>
                            <div className="text-sm font-medium text-[#a8a8b8] mb-1">Error Details:</div>
                            <pre className="text-white font-mono text-xs bg-[#050510] border border-[#00E5FF]/20 p-3 rounded overflow-auto max-h-64">
                              {JSON.stringify(err.error_details, null, 2)}
                            </pre>
                          </div>
                        )}
                        {err.api_response && (
                          <div>
                            <div className="text-sm font-medium text-[#a8a8b8] mb-1">API Response:</div>
                            <pre className="text-white font-mono text-xs bg-[#050510] border border-[#00E5FF]/20 p-3 rounded overflow-auto max-h-64">
                              {JSON.stringify(err.api_response, null, 2)}
                            </pre>
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <div className="text-[#a8a8b8]">Job ID:</div>
                            <div className="text-white font-mono">{err.generation_job_id}</div>
                          </div>
                          <div>
                            <div className="text-[#a8a8b8]">Collection ID:</div>
                            <div className="text-white font-mono">{err.collection_id}</div>
                          </div>
                          <div>
                            <div className="text-[#a8a8b8]">Job Status:</div>
                            <div className="text-white">{err.job_status || 'N/A'}</div>
                          </div>
                          <div>
                            <div className="text-[#a8a8b8]">Error ID:</div>
                            <div className="text-white font-mono text-xs">{err.id}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
    </div>
  )
}

