import { PublicKey, Transaction } from '@solana/web3.js'

declare global {
  interface Window {
    solana?: {
      isPhantom?: boolean
      isConnected: boolean
      publicKey: PublicKey | null
      signAndSendTransaction: (transaction: Transaction) => Promise<{ signature: string }>
      signTransaction: (transaction: Transaction) => Promise<Transaction>
      signAllTransactions: (transactions: Transaction[]) => Promise<Transaction[]>
      connect: () => Promise<{ publicKey: PublicKey }>
      disconnect: () => Promise<void>
      on: (event: string, callback: (args: any) => void) => void
      off: (event: string, callback: (args: any) => void) => void
    }
    phantom?: {
      solana?: {
        isPhantom?: boolean
        isConnected: boolean
        publicKey: PublicKey | null
        signAndSendTransaction: (transaction: Transaction) => Promise<{ signature: string }>
        signTransaction: (transaction: Transaction) => Promise<Transaction>
        signAllTransactions: (transactions: Transaction[]) => Promise<Transaction[]>
        connect: () => Promise<{ publicKey: PublicKey }>
        disconnect: () => Promise<void>
        on: (event: string, callback: (args: any) => void) => void
        off: (event: string, callback: (args: any) => void) => void
      }
    }
  }
}

export {}
