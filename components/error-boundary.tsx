'use client'

import React from 'react'

interface Props {
  children: React.ReactNode
  fallback?: React.ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error boundary caught:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="min-h-screen bg-[#14141e] flex items-center justify-center p-4">
          <div className="bg-red-900/30 border-2 border-[#EF4444]/20 rounded-lg p-6 max-w-md">
            <h2 className="text-[#EF4444] text-xl font-bold mb-3">⚠️ Wallet System Error</h2>
            <p className="text-white mb-4">
              There was an issue initializing the wallet system. This usually happens when:
            </p>
            <ul className="text-[#a8a8b8] text-sm list-disc list-inside space-y-1 mb-4">
              <li>The wallet extension is not installed</li>
              <li>The browser is not compatible</li>
              <li>There's a temporary network issue</li>
            </ul>
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-[#9945FF] hover:bg-[#7C3AED] text-white px-4 py-2 rounded font-medium"
            >
              Reload Page
            </button>
            {this.state.error && (
              <details className="mt-4">
                <summary className="text-[#a8a8b8]/80 text-xs cursor-pointer">Technical Details</summary>
                <pre className="text-xs text-[#a8a8b8]/80 mt-2 overflow-auto">
                  {this.state.error.message}
                </pre>
              </details>
            )}
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

