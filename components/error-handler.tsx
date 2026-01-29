'use client'

import { useEffect } from 'react'
import { safeStringify } from '@/lib/json-utils'

/**
 * Client-side error handler component
 * Moves error filtering logic from layout script to React component
 * This ensures it runs after React hydration and doesn't interfere with event system
 */
export function ErrorHandler() {
  useEffect(() => {
    // Only run on client side after React mounts
    if (typeof window === 'undefined') return

    // Initialize Next.js _next_f array before anything else to prevent SSR errors
    if (typeof self !== 'undefined' && !self._next_f) {
      self._next_f = []
    }

    // Store original console methods
    const originalError = console.error
    const originalWarn = console.warn
    const originalLog = console.log

    // Helper to check if message is LaserEyes error or spam
    function isLaserEyesError(msg: string | unknown): boolean {
      if (typeof msg !== 'string') {
        try {
          msg = String(msg)
        } catch (e) {
          return false
        }
      }
      return (
        msg.includes("Cannot read properties of undefined (reading 'push')") ||
        msg.includes('removeListeners') ||
        msg.includes('Content Script Bridge') ||
        msg.includes('2e88a1be5074068e.js') ||
        (msg.includes('Cannot read property') && msg.includes('push')) ||
        (msg.includes('push') &&
          (msg.includes('lasereyes') ||
            msg.includes('LaserEyes') ||
            msg.includes('@omnisat') ||
            msg.includes('c99df89fa69206ff.js')))
      )
    }

    // Filter console.error
    console.error = function (...args: unknown[]) {
      const errorMsg = args
        .map((arg) => {
          if (typeof arg === 'string') return arg
          if (arg && typeof arg === 'object') {
            if ('message' in arg && typeof arg.message === 'string') return arg.message
            if ('stack' in arg && typeof arg.stack === 'string') return arg.stack
            try {
              return safeStringify(arg)
            } catch (e) {
              return String(arg)
            }
          }
          return String(arg)
        })
        .join(' ')

      // Suppress LaserEyes errors
      if (
        isLaserEyesError(errorMsg) ||
        (errorMsg.includes('Global error:') && isLaserEyesError(errorMsg))
      ) {
        return // Suppress
      }

      originalError.apply(console, args)
    }

    // Filter console.warn
    console.warn = function (...args: unknown[]) {
      const warnMsg = args
        .map((arg) => {
          if (typeof arg === 'string') return arg
          if (arg && typeof arg === 'object') {
            if ('message' in arg && typeof arg.message === 'string') return arg.message
            try {
              return safeStringify(arg)
            } catch (e) {
              return String(arg)
            }
          }
          return String(arg)
        })
        .join(' ')

      if (isLaserEyesError(warnMsg)) {
        return // Suppress
      }

      originalWarn.apply(console, args)
    }

    // Filter console.log for spam
    console.log = function (...args: unknown[]) {
      const logMsg = args
        .map((arg) => {
          if (typeof arg === 'string') return arg
          if (arg && typeof arg === 'object') {
            if ('message' in arg && typeof arg.message === 'string') return arg.message
            try {
              return safeStringify(arg)
            } catch (e) {
              return String(arg)
            }
          }
          return String(arg)
        })
        .join(' ')

      if (isLaserEyesError(logMsg)) {
        return // Suppress
      }

      originalLog.apply(console, args)
    }

    // Catch unhandled errors - but NEVER prevent default or stop propagation
    // This was blocking all events!
    const errorHandler = (event: ErrorEvent) => {
      const errorMsg = event.message || (event.error?.message as string) || ''
      if (isLaserEyesError(errorMsg)) {
        // Just suppress logging, don't prevent default
        return
      }
    }

    // Catch unhandled promise rejections - don't prevent default
    const rejectionHandler = (event: PromiseRejectionEvent) => {
      const errorMsg = (event.reason?.message || event.reason || '') as string
      if (isLaserEyesError(String(errorMsg))) {
        // Just suppress logging, don't prevent default
        return
      }
    }

    window.addEventListener('error', errorHandler, false)
    window.addEventListener('unhandledrejection', rejectionHandler)

    // Cleanup on unmount
    return () => {
      console.error = originalError
      console.warn = originalWarn
      console.log = originalLog
      window.removeEventListener('error', errorHandler)
      window.removeEventListener('unhandledrejection', rejectionHandler)
    }
  }, [])

  // This component doesn't render anything
  return null
}
 
                  
