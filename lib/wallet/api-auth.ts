/**
 * Client-side utility to generate authentication signatures for API requests
 * Updated for Solana wallet adapter
 */

/**
 * Generate authentication parameters for API requests
 * Creates a signed message proving wallet ownership using Solana wallet
 */
export async function generateApiAuth(
  walletAddress: string | null,
  signMessage: ((message: string) => Promise<string>) | null
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

    const signature = await signMessage(message)

    if (!signature) {
      console.error('[generateApiAuth] No signature returned from wallet')
      return null
    }

    return {
      wallet_address: walletAddress,
      signature: typeof signature === 'string' ? signature : JSON.stringify(signature),
      message,
      timestamp
    }
  } catch (error) {
    console.error('[generateApiAuth] Error generating API auth:', error)
    return null
  }
}

/**
 * Add authentication to fetch request body
 */
export async function addAuthToBody(
  body: any,
  walletAddress: string | null,
  signMessage: ((message: string) => Promise<string>) | null
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
