'use client'

/**
 * Client-side React hooks for art styles
 * This file is separate from art-styles.ts to allow server-side imports
 */

import { useState, useEffect } from 'react'

// Hook to fetch real collection examples for each art style
export function useArtStyleExamples() {
  const [examples, setExamples] = useState<Record<string, string | null>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchExamples() {
      try {
        const response = await fetch('/api/art-style-examples')
        if (response.ok) {
          const data = await response.json()
          setExamples(data.examples || {})
        }
      } catch (error) {
        console.error('Failed to fetch art style examples:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchExamples()
  }, [])

  return { examples, loading }
}

