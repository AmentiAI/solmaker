import { createHmac, createHash } from 'crypto'
import { Keypair } from '@solana/web3.js'

/**
 * Derive a deterministic Solana Keypair from the AGENT_SIGNER_SECRET env var.
 * This keypair is used as the thirdPartySigner for agent mint candy guards.
 */
export function getAgentSignerKeypair(): Keypair {
  const secret = process.env.AGENT_SIGNER_SECRET
  if (!secret) throw new Error('AGENT_SIGNER_SECRET not configured')
  const seed = createHash('sha256').update(secret).digest()
  return Keypair.fromSeed(seed) // 32-byte seed → ed25519 keypair
}

/**
 * Get the base58 public key of the agent signer.
 */
export function getAgentSignerPublicKey(): string {
  return getAgentSignerKeypair().publicKey.toBase58()
}

/**
 * Create a time-limited, wallet-bound HMAC challenge for agent minting.
 * The agent must submit this challenge + timestamp when calling /mint/build.
 */
export function createAgentChallenge(
  walletAddress: string,
  collectionId: string
): { challenge: string; timestamp: number; expires_at: number } {
  const secret = process.env.AGENT_SIGNER_SECRET
  if (!secret) throw new Error('AGENT_SIGNER_SECRET not configured')

  const timestamp = Math.floor(Date.now() / 1000)
  const message = `${walletAddress}:${collectionId}:${timestamp}`
  const challenge = createHmac('sha256', secret).update(message).digest('hex')

  return { challenge, timestamp, expires_at: timestamp + 60 }
}

/**
 * Verify an agent challenge. Returns { valid, error? }.
 */
export function verifyAgentChallenge(
  walletAddress: string,
  collectionId: string,
  challenge: string,
  timestamp: number
): { valid: boolean; error?: string } {
  const secret = process.env.AGENT_SIGNER_SECRET
  if (!secret) return { valid: false, error: 'Server not configured for agent minting' }

  const now = Math.floor(Date.now() / 1000)
  if (now - timestamp > 60) return { valid: false, error: 'Challenge expired (60s limit)' }

  const message = `${walletAddress}:${collectionId}:${timestamp}`
  const expected = createHmac('sha256', secret).update(message).digest('hex')

  if (challenge !== expected) return { valid: false, error: 'Invalid challenge' }

  return { valid: true }
}
