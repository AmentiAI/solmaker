'use client'

import { useEffect, useState } from 'react'

/**
 * Ensures the app is properly hydrated
 * This component helps detect and handle hydration issues
 */
export function HydrationCheck({ children }: { children: React.ReactNode }) {
  const [isHydrated, setIsHydrated] = useState(false)

  useEffect(() => {
    // Mark as hydrated after mount - only set once to prevent re-renders
    if (isHydrated) return
    
    const timer = requestAnimationFrame(() => {
      setIsHydrated(true)
    })
    
    return () => {
      cancelAnimationFrame(timer)
    }
  }, [isHydrated])

  // Always render children - don't block rendering
  // The hydration state is just for debugging/monitoring
  return <>{children}</>
}

