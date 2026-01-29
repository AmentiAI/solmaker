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
        <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
          <div className="bg-red-900/30 border-2 border-red-700 rounded-lg p-6 max-w-md">
            <h2 className="text-red-400 text-xl font-bold mb-3">⚠️ Wallet System Error</h2>
            <p className="text-gray-300 mb-4">
              There was an issue initializing the wallet system. This usually happens when:
            </p>
            <ul className="text-gray-400 text-sm list-disc list-inside space-y-1 mb-4">
              <li>The wallet extension is not installed</li>
              <li>The browser is not compatible</li>
              <li>There's a temporary network issue</li>
            </ul>
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-medium"
            >
              Reload Page
            </button>
            {this.state.error && (
              <details className="mt-4">
                <summary className="text-gray-500 text-xs cursor-pointer">Technical Details</summary>
                <pre className="text-xs text-gray-500 mt-2 overflow-auto">
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

