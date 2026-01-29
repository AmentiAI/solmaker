'use client'

import React from 'react'

interface WalletErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class WalletErrorBoundary extends React.Component<
  { children: React.ReactNode },
  WalletErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): WalletErrorBoundaryState {
    // Check if this is a LaserEyes error
    const isLaserEyesError =
      error.message?.includes('Cannot read properties of undefined (reading \'push\')') ||
      error.message?.includes('useLaserEyes') ||
      error.message?.includes('LaserEyesProvider') ||
      error.stack?.includes('lasereyes') ||
      error.stack?.includes('@omnisat')

    // If it's a LaserEyes error, don't set error state (suppress it)
    if (isLaserEyesError) {
      return { hasError: false, error: null }
    }

    // For other errors, set error state
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Check if this is a LaserEyes error
    const isLaserEyesError =
      error.message?.includes('Cannot read properties of undefined (reading \'push\')') ||
      error.message?.includes('useLaserEyes') ||
      error.message?.includes('LaserEyesProvider') ||
      error.stack?.includes('lasereyes') ||
      error.stack?.includes('@omnisat')

    // Only log non-LaserEyes errors
    if (!isLaserEyesError) {
      console.error('WalletErrorBoundary caught an error:', error, errorInfo)
    }
  }

  render() {
    // Always render children - error boundary catches errors but doesn't break the app
    // Even if there's an error, we render children to prevent blank screen
    if (this.state.hasError && this.state.error) {
      // Log the error but continue rendering children
      console.error('WalletErrorBoundary: Error caught but continuing to render', this.state.error)
    }
    
    // Always return children - never return null or empty to prevent blank screen
    return this.props.children
  }
}

 
           
                                           
