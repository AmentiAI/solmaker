'use client'

import { createContext, useContext, useMemo, ReactNode } from 'react'
import { useSolanaWallet } from '@/lib/wallet/solana-wallet-context'

interface ActiveWalletContextType {
  activeWalletAddress: string | null
  activeWalletConnected: boolean
  activeWalletType: 'sol' | null
  activeWalletVerified: boolean

  sol: {
    isConnected: boolean
    address: string | null
    isVerified: boolean
    isVerifying: boolean
    verifyWallet: () => Promise<boolean>
    connect: () => Promise<boolean>
    disconnect: () => Promise<void>
    sendTransaction: (to: string, amount: number) => Promise<string>
    getBalance: () => Promise<number>
  }
}

const ActiveWalletContext = createContext<ActiveWalletContextType | undefined>(undefined)

export function ActiveWalletProvider({ children }: { children: ReactNode }) {
  const solana = useSolanaWallet()

  const { activeWalletAddress, activeWalletConnected, activeWalletType, activeWalletVerified } = useMemo(() => {
    if (solana.address && solana.isConnected) {
      return {
        activeWalletAddress: solana.address,
        activeWalletConnected: true,
        activeWalletType: 'sol' as const,
        activeWalletVerified: solana.isVerified,
      }
    }

    return {
      activeWalletAddress: null,
      activeWalletConnected: false,
      activeWalletType: null,
      activeWalletVerified: false,
    }
  }, [solana.address, solana.isConnected, solana.isVerified])

  const value: ActiveWalletContextType = {
    activeWalletAddress,
    activeWalletConnected,
    activeWalletType,
    activeWalletVerified,

    sol: {
      isConnected: solana.isConnected,
      address: solana.address,
      isVerified: solana.isVerified,
      isVerifying: solana.isVerifying,
      verifyWallet: solana.verifyWallet,
      connect: solana.connect,
      disconnect: solana.disconnect,
      sendTransaction: solana.sendTransaction,
      getBalance: solana.getBalance,
    },
  }

  return (
    <ActiveWalletContext.Provider value={value}>
      {children}
    </ActiveWalletContext.Provider>
  )
}

export function useActiveWallet() {
  const context = useContext(ActiveWalletContext)
  if (context === undefined) {
    throw new Error('useActiveWallet must be used within an ActiveWalletProvider')
  }
  return context
}
