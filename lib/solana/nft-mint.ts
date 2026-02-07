import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { getConnectionAsync } from './connection'

export interface NftMintParams {
  name: string
  symbol: string
  uri: string // Metadata JSON URI
  sellerFeeBasisPoints: number
  creatorAddress: string
  payerPublicKey: PublicKey
}

export interface MintResult {
  mintAddress: string
  txSignature: string
  metadataAddress: string
}

/**
 * Verify a Solana transaction has been confirmed
 */
export async function verifyTransaction(
  signature: string,
  commitment: 'confirmed' | 'finalized' = 'confirmed'
): Promise<boolean> {
  const connection = await getConnectionAsync()
  try {
    const result = await connection.getTransaction(signature, {
      commitment,
      maxSupportedTransactionVersion: 0,
    })
    return result !== null && result.meta !== null && !result.meta.err
  } catch {
    return false
  }
}

/**
 * Get transaction details
 */
export async function getTransactionDetails(signature: string) {
  const connection = await getConnectionAsync()
  try {
    const result = await connection.getTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    })
    return result
  } catch {
    return null
  }
}

/**
 * Check if a mint address exists on-chain
 */
export async function checkMintExists(mintAddress: string): Promise<boolean> {
  const connection = await getConnectionAsync()
  try {
    const pubkey = new PublicKey(mintAddress)
    const accountInfo = await connection.getAccountInfo(pubkey)
    return accountInfo !== null
  } catch {
    return false
  }
}

/**
 * Get SOL balance for a wallet
 */
export async function getWalletBalance(walletAddress: string): Promise<number> {
  const connection = await getConnectionAsync()
  try {
    const pubkey = new PublicKey(walletAddress)
    const balance = await connection.getBalance(pubkey)
    return balance / LAMPORTS_PER_SOL
  } catch {
    return 0
  }
}

/**
 * Build a simple SOL transfer transaction
 */
export async function buildTransferTransaction(
  fromPubkey: PublicKey,
  toPubkey: PublicKey,
  lamports: number
): Promise<Transaction> {
  const connection = await getConnectionAsync()
  const { blockhash } = await connection.getLatestBlockhash('finalized')

  const transaction = new Transaction()
  transaction.recentBlockhash = blockhash
  transaction.feePayer = fromPubkey
  transaction.add(
    SystemProgram.transfer({
      fromPubkey,
      toPubkey,
      lamports,
    })
  )

  return transaction
}
