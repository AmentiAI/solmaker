'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log all errors to help with debugging
    console.error('Application error:', error)
  }, [error])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-950 to-slate-900 flex items-center justify-center p-4">
      <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 border border-red-500/30 rounded-lg p-8 max-w-md w-full">
        <h2 className="text-[#EF4444] text-2xl font-bold mb-4">Something went wrong</h2>
        <p className="text-white mb-6">
          An error occurred while loading this page. Please try again.
        </p>
        <button
          onClick={reset}
          className="w-full bg-[#9945FF] hover:bg-[#7C3AED] text-white px-4 py-3 rounded-lg font-medium transition-colors"
        >
          Try again
        </button>
        {error.message && (
          <details className="mt-4">
            <summary className="text-[#a8a8b8]/80 text-sm cursor-pointer hover:text-[#a8a8b8]">
              Technical details
            </summary>
            <pre className="text-xs text-[#a8a8b8]/80 mt-2 overflow-auto p-3 bg-black/20 rounded">
              {error.message}
            </pre>
          </details>
        )}
      </div>
    </div>
  )
}
