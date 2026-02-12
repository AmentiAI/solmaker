/**
 * Client-side utility to generate authentication signatures for API requests
 * Updated for Solana wallet adapter
 */

import bs58 from 'bs58'

/**
 * Generate authentication parameters for API requests
 * Creates a signed message proving wallet ownership using Solana wallet
 */
export async function generateApiAuth(
  walletAddress: string | null,
  signMessage: ((message: Uint8Array) => Promise<Uint8Array>) | null | undefined
): Promise<{
  wallet_address: string
  signature: string
  message: string
  timestamp: number
} | null> {
  if (!walletAddress || !signMessage) {
    console.error('[generateApiAuth] Missing walletAddress or signMessage function')
    return null
  }

  try {
    const timestamp = Date.now()
    const message = `Verify wallet ownership for ${walletAddress} at ${timestamp}`

    // Encode message to bytes for Solana wallet
    const messageBytes = new TextEncoder().encode(message)

    // Sign the message
    const signatureBytes = await signMessage(messageBytes)

    if (!signatureBytes) {
      console.error('[generateApiAuth] No signature returned from wallet')
      return null
    }

    // Convert signature to base58 string
    const signature = bs58.encode(signatureBytes)

    return {
      wallet_address: walletAddress,
      signature,
      message,
      timestamp
    }
  } catch (error: any) {
    // Don't log user rejections as errors
    const isUserRejection =
      error?.code === 4001 ||
      error?.message?.toLowerCase().includes('user rejected') ||
      error?.message?.toLowerCase().includes('cancel')

    if (!isUserRejection) {
      console.error('[generateApiAuth] Error generating API auth:', error)
    }
    return null
  }
}

/**
 * Add authentication to fetch request body
 */
export async function addAuthToBody(
  body: any,
  walletAddress: string | null,
  signMessage: ((message: Uint8Array) => Promise<Uint8Array>) | null | undefined
): Promise<any> {
  const auth = await generateApiAuth(walletAddress, signMessage)
  if (!auth) {
    return body
  }

  return {
    ...body,
    ...auth
  }
}
