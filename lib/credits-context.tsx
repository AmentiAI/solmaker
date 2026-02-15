'use client'

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react'

interface CreditsContextType {
  credits: number | null
  loading: boolean
  loadCredits: (walletAddress: string, force?: boolean) => Promise<void>
  addCreditsLocally: (amount: number) => void
  clearCredits: () => void
}

const CreditsContext = createContext<CreditsContextType>({
  credits: null,
  loading: false,
  loadCredits: async () => {},
  addCreditsLocally: () => {},
  clearCredits: () => {},
})

export function CreditsProvider({ children }: { children: ReactNode }) {
  const [credits, setCredits] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [lastWallet, setLastWallet] = useState<string | null>(null)

  const loadCredits = useCallback(async (walletAddress: string, force?: boolean) => {
    // Don't reload if already loaded for this wallet (unless forced)
    if (!force && lastWallet === walletAddress && credits !== null) {
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

  // Instantly update credit display without an API call
  const addCreditsLocally = useCallback((amount: number) => {
    setCredits(prev => (prev ?? 0) + amount)
  }, [])

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
    <CreditsContext.Provider value={{ credits, loading, loadCredits, addCreditsLocally, clearCredits }}>
      {children}
    </CreditsContext.Provider>
  )
}

export function useCredits() {
  return useContext(CreditsContext)
}

