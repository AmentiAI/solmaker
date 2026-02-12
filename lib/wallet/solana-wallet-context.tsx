'use client'

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode, useMemo } from 'react'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js'

interface SolanaWalletState {
  isConnected: boolean
  address: string | null
  publicKey: PublicKey | null
  error: string | null
  isVerified: boolean
  isVerifying: boolean
}

interface SolanaWalletContextType extends SolanaWalletState {
  isPhantomInstalled: boolean
  connect: () => Promise<boolean>
  disconnect: () => Promise<void>
  sendTransaction: (to: string, amount: number) => Promise<string>
  signTransaction: ((transaction: Transaction) => Promise<Transaction>) | undefined
  getBalance: () => Promise<number>
  verifyWallet: (overridePublicKey?: PublicKey) => Promise<boolean>
  selectWallet: (walletName: string | null) => void
  wallet: any
  connecting: boolean
  adapterConnected: boolean
  adapterPublicKey: PublicKey | null
  activeWalletConnected: boolean
  activeWalletAddress: string | null
}

const SolanaWalletContext = createContext<SolanaWalletContextType | undefined>(undefined)

export function SolanaWalletProvider({ children }: { children: ReactNode }) {
  const { wallet, publicKey, connected, connecting, connect: adapterConnect, disconnect: adapterDisconnect, select, signMessage, sendTransaction: adapterSendTransaction, signTransaction } = useWallet()
  const { connection } = useConnection()
  
  const [state, setState] = useState<SolanaWalletState>({
    isConnected: false,
    address: null,
    publicKey: null,
    error: null,
    isVerified: false,
    isVerifying: false,
  })

  // Check if any Solana wallet is available
  const isPhantomInstalled = typeof window !== 'undefined' && (
    ((window as any).solana?.isPhantom) || 
    ((window as any).phantom?.solana?.isPhantom)
  )

  const hasWallets = typeof window !== 'undefined' && wallet !== null

  // Refs to prevent unnecessary updates
  const isVerifyingRef = useRef(false)
  const prevAddressRef = useRef<string | null>(null)
  const prevConnectedRef = useRef<boolean>(false)

  // Verify wallet with signature
  const verifyWallet = useCallback(async (overridePublicKey?: PublicKey): Promise<boolean> => {
    const keyToUse = overridePublicKey || state.publicKey || publicKey
    
    if (!keyToUse) {
      setState(prev => ({ ...prev, error: 'Wallet not connected. Please connect your wallet first.' }))
      return false
    }

    if (!wallet?.adapter) {
      setState(prev => ({ ...prev, error: 'Wallet adapter not available. Please try reconnecting.' }))
      return false
    }

    const adapterReady = wallet.adapter.readyState === 'Installed' || wallet.adapter.readyState === 'Loadable'
    if (!adapterReady) {
      setState(prev => ({ ...prev, error: `Wallet ${wallet.adapter.name} is not ready. Please ensure it's installed and unlocked.` }))
      return false
    }

    const address = keyToUse.toBase58()

    // Get signMessage
    let signMessageAvailable = signMessage
    if (!signMessageAvailable && wallet.adapter && typeof (wallet.adapter as any).signMessage === 'function') {
      signMessageAvailable = (wallet.adapter as any).signMessage.bind(wallet.adapter)
    }

    // Wait for signMessage if needed
    if (!signMessageAvailable) {
      for (let i = 0; i < 30; i++) {
        await new Promise(resolve => setTimeout(resolve, 100))
        if (signMessage) {
          signMessageAvailable = signMessage
          break
        }
        if (wallet?.adapter && typeof (wallet.adapter as any).signMessage === 'function') {
          signMessageAvailable = (wallet.adapter as any).signMessage.bind(wallet.adapter)
          break
        }
      }
    }

    if (!signMessageAvailable) {
      setState(prev => ({ ...prev, error: 'Wallet signMessage not available. Please ensure your wallet is unlocked and try again.' }))
      return false
    }

    try {
      setState(prev => ({ ...prev, isVerifying: true, error: null }))
      isVerifyingRef.current = true
      
      const messageText = `Verify wallet: ${address}`
      const message = new TextEncoder().encode(messageText)
      
      const signedMessage = await signMessageAvailable(message)
      
      const hasSignature = signedMessage && (
        signedMessage instanceof Uint8Array ||
        (typeof signedMessage === 'object' && 'signature' in signedMessage)
      )
      
      if (!hasSignature) {
        throw new Error('No signature received from wallet')
      }

      // Store verification
      if (typeof window !== 'undefined' && address) {
        sessionStorage.setItem(`sol_wallet_verified_${address}`, 'true')
        sessionStorage.setItem(`wallet_type_${address}`, 'sol')
      }

      isVerifyingRef.current = false
      setState(prev => ({
        ...prev,
        isVerified: true,
        isVerifying: false,
        error: null,
      }))

      // Dispatch event
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('solanaWalletConnected', { 
          detail: { address, isVerified: true } 
        }))
      }

      return true
    } catch (signError: any) {
      const errorMessage = signError?.message || String(signError)
      const isUserRejection =
        signError?.code === 4001 ||
        errorMessage.toLowerCase().includes('user rejected') ||
        errorMessage.toLowerCase().includes('cancel') ||
        errorMessage.toLowerCase().includes('reject')

      // Only log actual errors, not user rejections
      if (!isUserRejection) {
        console.error('[Solana Wallet] Signature verification failed:', signError)
      }

      const errorMsg = isUserRejection ? 'Signature request cancelled' : 'Signature verification failed'

      isVerifyingRef.current = false
      setState(prev => ({
        ...prev,
        isVerified: false,
        isVerifying: false,
        error: errorMsg,
      }))
      return false
    }
  }, [publicKey, state.publicKey, signMessage, wallet, connected])

  // Sync wallet adapter state
  useEffect(() => {
    if (publicKey && connected) {
      const address = publicKey.toBase58()
      const isVerifiedInStorage = typeof window !== 'undefined' 
        ? sessionStorage.getItem(`sol_wallet_verified_${address}`) === 'true' 
        : false
      
      const addressChanged = prevAddressRef.current !== address
      const connectedChanged = prevConnectedRef.current !== connected
      
      if (addressChanged || connectedChanged) {
        prevAddressRef.current = address
        prevConnectedRef.current = connected
        
        setState(prev => ({
          ...prev,
          isConnected: true,
          address,
          publicKey,
          isVerified: isVerifiedInStorage,
          error: null,
        }))

        if (addressChanged && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('solanaWalletConnected', { 
            detail: { address, isVerified: isVerifiedInStorage } 
          }))
        }
      }
    } else if (!connected && !connecting && !isVerifyingRef.current) {
      if (prevConnectedRef.current) {
        prevAddressRef.current = null
        prevConnectedRef.current = false
        isVerifyingRef.current = false
        setState(prev => ({
          ...prev,
          isConnected: false,
          address: null,
          publicKey: null,
          isVerified: false,
        }))
      }
    }
  }, [publicKey, connected, connecting])

  // Connect to wallet
  const connect = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, error: null }))

      if (wallet && publicKey) {
        const address = publicKey.toBase58()
        const isVerifiedInStorage = typeof window !== 'undefined' 
          ? sessionStorage.getItem(`sol_wallet_verified_${address}`) === 'true' 
          : false
        
        if (isVerifiedInStorage) {
          setState(prev => ({ ...prev, isVerified: true, isVerifying: false }))
          return true
        }
        return await verifyWallet()
      }

      if (!adapterConnect) {
        setState(prev => ({ ...prev, error: 'Connection not available' }))
        return false
      }

      try {
        await adapterConnect()
      } catch (connectError: any) {
        setState(prev => ({ ...prev, error: connectError?.message || 'Connection failed' }))
        return false
      }

      // Wait for publicKey
      let attempts = 0
      while (attempts < 50) {
        await new Promise(resolve => setTimeout(resolve, 100))
        attempts++
        
        const currentPublicKey = publicKey || wallet?.adapter?.publicKey
        if (currentPublicKey) {
          const address = currentPublicKey.toBase58()
          const isVerifiedInStorage = typeof window !== 'undefined' 
            ? sessionStorage.getItem(`sol_wallet_verified_${address}`) === 'true' 
            : false
          
          setState(prev => ({
            ...prev,
            isConnected: true,
            address,
            publicKey: currentPublicKey,
            isVerified: isVerifiedInStorage,
            error: null,
          }))
          
          if (isVerifiedInStorage) return true
          
          await new Promise(resolve => setTimeout(resolve, 500))
          return await verifyWallet(currentPublicKey)
        }
      }

      setState(prev => ({ ...prev, error: 'Connection timeout. Please try again.' }))
      return false
    } catch (error: any) {
      setState(prev => ({ ...prev, error: error?.message || 'Failed to connect', isVerifying: false }))
      return false
    }
  }, [wallet, publicKey, connected, signMessage, verifyWallet, adapterConnect])

  // Disconnect wallet
  const disconnect = useCallback(async () => {
    try {
      const addressToClear = state.address || publicKey?.toBase58()
      
      if (addressToClear && typeof window !== 'undefined') {
        sessionStorage.removeItem(`sol_wallet_verified_${addressToClear}`)
        sessionStorage.removeItem(`wallet_type_${addressToClear}`)
      }
      
      isVerifyingRef.current = false
      await adapterDisconnect()

      setState({
        isConnected: false,
        address: null,
        publicKey: null,
        error: null,
        isVerified: false,
        isVerifying: false,
      })
    } catch (error) {
      console.error('Error disconnecting wallet:', error)
    }
  }, [adapterDisconnect, state.address, publicKey])

  // Send transaction
  const sendTransaction = useCallback(async (to: string, amount: number) => {
    if (!publicKey) throw new Error('Wallet not connected')
    if (!adapterSendTransaction) throw new Error('sendTransaction not available')
    if (!connection) throw new Error('Solana connection not available')

    const toPublicKey = new PublicKey(to)
    const lamports = Math.floor(amount * LAMPORTS_PER_SOL)
    if (lamports <= 0) throw new Error('Invalid transaction amount')

    const transaction = new Transaction()
    const { blockhash } = await connection.getLatestBlockhash('finalized')
    
    transaction.recentBlockhash = blockhash
    transaction.feePayer = publicKey
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: publicKey,
        toPubkey: toPublicKey,
        lamports,
      })
    )

    const signature = await adapterSendTransaction(transaction, connection, {
      skipPreflight: false,
      maxRetries: 3,
    })

    if (!signature || typeof signature !== 'string') {
      throw new Error('Invalid transaction signature')
    }

    return signature
  }, [publicKey, adapterSendTransaction, connection])

  // Get balance
  const getBalance = useCallback(async (): Promise<number> => {
    if (!publicKey) return 0
    try {
      const balance = await connection.getBalance(publicKey)
      return balance / LAMPORTS_PER_SOL
    } catch {
      return 0
    }
  }, [publicKey, connection])

  const actualIsConnected = connected && !!publicKey
  const actualAddress = publicKey ? publicKey.toBase58() : null

  const value: SolanaWalletContextType = {
    ...state,
    isConnected: actualIsConnected || state.isConnected,
    address: actualAddress || state.address,
    publicKey: publicKey || state.publicKey,
    isPhantomInstalled: isPhantomInstalled || hasWallets,
    connect,
    disconnect,
    sendTransaction,
    signTransaction,
    getBalance,
    verifyWallet,
    selectWallet: select,
    wallet,
    connecting,
    adapterConnected: connected,
    adapterPublicKey: publicKey,
    activeWalletConnected: (actualIsConnected || state.isConnected) && state.isVerified,
    activeWalletAddress: actualAddress || state.address,
  }

  return (
    <SolanaWalletContext.Provider value={value}>
      {children}
    </SolanaWalletContext.Provider>
  )
}

// Hook to use the Solana wallet context
export function useSolanaWallet() {
  const context = useContext(SolanaWalletContext)
  if (context === undefined) {
    // Return safe defaults instead of throwing error
    // This allows components to work even if provider isn't available
    return {
      isConnected: false,
      address: null,
      publicKey: null,
      error: null,
      isVerified: false,
      isVerifying: false,
      isPhantomInstalled: false,
      connect: async () => false,
      disconnect: async () => {},
      sendTransaction: async () => { throw new Error('Solana wallet not available') },
      signTransaction: undefined,
      getBalance: async () => 0,
      verifyWallet: async () => false,
      selectWallet: () => {},
      wallet: null,
      connecting: false,
      adapterConnected: false,
      adapterPublicKey: null,
      activeWalletConnected: false,
      activeWalletAddress: null,
    }
  }
  return context
}

