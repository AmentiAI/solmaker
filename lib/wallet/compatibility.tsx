"use client"

import { useSolanaWallet } from "@/lib/wallet/solana-wallet-context"
import { useWallet as useSolanaWalletAdapter } from '@solana/wallet-adapter-react'

// Re-export Solana wallet hook as useWallet for backwards compatibility
// All components that previously used the Bitcoin useWallet() now get the Solana wallet
interface WalletContextType {
  isConnected: boolean
  currentAddress: string | null
  paymentAddress: string | null
  paymentPublicKey: string | null
  publicKey: string | null
  client: any
  isVerified: boolean
  isVerifying: boolean
  isLiveConnection: boolean
  verifyWallet: () => Promise<boolean>
  signMessage: (message: string) => Promise<string>
  signPsbt: (psbtBase64: string, autoFinalize?: boolean, broadcast?: boolean) => Promise<any>
  connect: (provider: any) => Promise<void>
  disconnect: () => void
}

export function useWallet(): WalletContextType {
  const solana = useSolanaWallet()
  const { signMessage: solanaSignMessage } = useSolanaWalletAdapter()

  return {
    isConnected: solana.isConnected,
    currentAddress: solana.address,
    // Solana has a single address for both receiving and payment
    paymentAddress: solana.address,
    paymentPublicKey: solana.publicKey?.toBase58() || null,
    publicKey: solana.publicKey?.toBase58() || null,
    client: null,
    isVerified: solana.isVerified,
    isVerifying: solana.isVerifying,
    isLiveConnection: solana.isConnected,
    verifyWallet: solana.verifyWallet,
    signMessage: async (message: string) => {
      if (!solanaSignMessage) {
        throw new Error('Wallet signMessage not available')
      }
      const messageBytes = new TextEncoder().encode(message)
      const signature = await solanaSignMessage(messageBytes)
      // Convert signature to base64 string
      return Buffer.from(signature).toString('base64')
    },
    signPsbt: async () => {
      throw new Error("PSBTs are not supported on Solana")
    },
    connect: async () => {
      await solana.connect()
    },
    disconnect: () => {
      solana.disconnect()
    },
  }
}

// WalletProvider is no longer needed as a component wrapper since
// the Solana providers handle this in components/providers.tsx
export function WalletProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
