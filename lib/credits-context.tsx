'use client'

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react'

interface CreditsContextType {
  credits: number | null
  loading: boolean
  loadCredits: (walletAddress: string) => Promise<void>
  clearCredits: () => void
}

const CreditsContext = createContext<CreditsContextType>({
  credits: null,
  loading: false,
  loadCredits: async () => {},
  clearCredits: () => {},
})

export function CreditsProvider({ children }: { children: ReactNode }) {
  const [credits, setCredits] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [lastWallet, setLastWallet] = useState<string | null>(null)

  const loadCredits = useCallback(async (walletAddress: string) => {
    // Don't reload if already loaded for this wallet
    if (lastWallet === walletAddress && credits !== null) {
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`/api/credits?wallet_address=${encodeURIComponent(walletAddress)}`)
      if (response.ok) {
        const data = await response.json()
        setCredits(data.credits || 0)
        setLastWallet(walletAddress)
      } else {
        setCredits(0)
      }
    } catch (error) {
      console.error('Error loading credits:', error)
      setCredits(0)
    } finally {
      setLoading(false)
    }
  }, [lastWallet, credits])

  const clearCredits = useCallback(() => {
    setCredits(null)
    setLastWallet(null)
  }, [])

  // Listen for credit refresh events
  useEffect(() => {
    const handleRefreshCredits = () => {
      if (lastWallet) {
        // Force reload by resetting lastWallet
        setLastWallet(null)
        setCredits(null)
      }
    }

    window.addEventListener('refreshCredits', handleRefreshCredits)
    return () => window.removeEventListener('refreshCredits', handleRefreshCredits)
  }, [lastWallet])

  return (
    <CreditsContext.Provider value={{ credits, loading, loadCredits, clearCredits }}>
      {children}
    </CreditsContext.Provider>
  )
}

export function useCredits() {
  return useContext(CreditsContext)
}

