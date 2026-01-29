'use client'

import React from 'react'

interface ProviderErrorBoundaryProps {
  children: React.ReactNode
  fallback?: React.ReactNode
  providerName: string
}

interface ProviderErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

/**
 * Error boundary specifically for provider components
 * Provides graceful degradation when a provider fails to mount
 */
export class ProviderErrorBoundary extends React.Component<
  ProviderErrorBoundaryProps,
  ProviderErrorBoundaryState
> {
  constructor(props: ProviderErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ProviderErrorBoundaryState {
    // Check if this is a LaserEyes error
    const isLaserEyesError =
      error.message?.includes("Cannot read properties of undefined (reading 'push')") ||
      error.message?.includes('useLaserEyes') ||
      error.message?.includes('LaserEyesProvider') ||
      error.stack?.includes('lasereyes') ||
      error.stack?.includes('@omnisat') ||
      error.stack?.includes('c99df89fa69206ff.js')

    // If it's a LaserEyes error, suppress it
    if (isLaserEyesError) {
      return { hasError: false, error: null }
    }

    // For other errors, set error state
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Check if this is a LaserEyes error
    const isLaserEyesError =
      error.message?.includes("Cannot read properties of undefined (reading 'push')") ||
      error.message?.includes('useLaserEyes') ||
      error.message?.includes('LaserEyesProvider') ||
      error.stack?.includes('lasereyes') ||
      error.stack?.includes('@omnisat') ||
      error.stack?.includes('c99df89fa69206ff.js')

    // Only log non-LaserEyes errors
    if (!isLaserEyesError) {
      console.error(
        `ProviderErrorBoundary (${this.props.providerName}) caught an error:`,
        error,
        errorInfo
      )
    }
  }

  render() {
    // Always render children - error boundary catches errors but doesn't break the app
    // Even if there's an error, we render children to prevent blank screen
    if (this.state.hasError && this.state.error) {
      // Log the error but continue rendering children
      console.error(
        `ProviderErrorBoundary (${this.props.providerName}): Error caught but continuing to render`,
        this.state.error
      )
    }

    // If we have a fallback and an error, show fallback
    if (this.state.hasError && this.props.fallback) {
      return this.props.fallback
    }

    // Always return children - never return null or empty to prevent blank screen
    return this.props.children
  }
}

