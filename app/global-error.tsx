'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log all errors to help with debugging
    console.error('Global error:', error)
  }, [error])

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className="bg-gradient-to-br from-slate-950 via-gray-950 to-slate-900 min-h-screen flex items-center justify-center p-4" suppressHydrationWarning>
        <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-8 max-w-md w-full text-center">
          <h2 className="text-red-400 text-2xl font-bold mb-4">Critical Error</h2>
          <p className="text-gray-300 mb-6">
            A critical error occurred. Please try refreshing the page.
          </p>
          <button
            onClick={reset}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-lg font-medium transition-colors"
          >
            Try again
          </button>
          {error.message && (
            <details className="mt-4 text-left">
              <summary className="text-gray-500 text-sm cursor-pointer hover:text-gray-400">
                Technical details
              </summary>
              <pre className="text-xs text-gray-500 mt-2 overflow-auto p-3 bg-black/20 rounded">
                {error.message}
              </pre>
            </details>
          )}
        </div>
      </body>
    </html>
  )
}
