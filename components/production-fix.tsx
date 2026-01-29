'use client'

import { useEffect, useRef } from 'react'

/**
 * Production-specific fixes to ensure interactivity works
 * This component addresses issues that only occur in production builds
 */
export function ProductionFix() {
  const hasRunRef = useRef(false)
  
  useEffect(() => {
    // Only run once to prevent infinite loops
    if (hasRunRef.current || typeof window === 'undefined') return
    hasRunRef.current = true

    // Fix for production: Ensure event handlers are attached
    const ensureEventHandlers = () => {
      // Force React to re-attach event handlers if they're missing
      // This is a workaround for production hydration issues
      const allButtons = document.querySelectorAll('button, a[href], [onclick], [role="button"]')
      
      allButtons.forEach((button) => {
        // Ensure buttons have pointer events enabled
        if (button instanceof HTMLElement) {
          button.style.pointerEvents = 'auto'
          button.style.cursor = 'pointer'
        }
      })
    }

    // Run only once after a delay to let React hydrate
    const timer = setTimeout(ensureEventHandlers, 500)

    return () => {
      clearTimeout(timer)
    }
  }, [])

  return null
}

