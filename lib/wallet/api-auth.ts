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
    const signatureResult = await signMessage(messageBytes)

    if (!signatureResult) {
      console.error('[generateApiAuth] No signature returned from wallet')
      return null
    }

    // Handle different signature formats from different wallets
    let signature: string

    if (signatureResult instanceof Uint8Array) {
      // Signature is Uint8Array - convert to base58
      console.log('[generateApiAuth] Signature is Uint8Array, byte length:', signatureResult.length)

      // Verify it's 64 bytes (Ed25519 signature)
      if (signatureResult.length !== 64) {
        console.error('[generateApiAuth] Invalid signature length! Expected 64 bytes, got:', signatureResult.length)
        return null
      }

      signature = bs58.encode(signatureResult)
      console.log('[generateApiAuth] Converted Uint8Array to base58, string length:', signature.length)
    } else if (typeof signatureResult === 'string') {
      // Already a string (some wallets return base58 directly)
      signature = signatureResult
      console.log('[generateApiAuth] Signature already string, length:', signature.length)
    } else if (signatureResult && typeof signatureResult === 'object' && 'signature' in signatureResult) {
      // Signature wrapped in object
      const sig = (signatureResult as any).signature
      if (sig instanceof Uint8Array) {
        console.log('[generateApiAuth] Extracted Uint8Array signature, byte length:', sig.length)

        // Verify it's 64 bytes (Ed25519 signature)
        if (sig.length !== 64) {
          console.error('[generateApiAuth] Invalid signature length! Expected 64 bytes, got:', sig.length)
          return null
        }

        signature = bs58.encode(sig)
        console.log('[generateApiAuth] Converted Uint8Array to base58, string length:', signature.length)
      } else {
        signature = String(sig)
        console.log('[generateApiAuth] Extracted string signature, length:', signature.length)
      }
    } else {
      console.error('[generateApiAuth] Unexpected signature format:', signatureResult)
      return null
    }

    console.log('[generateApiAuth] Final signature preview:', signature.substring(0, 20) + '...')
    console.log('[generateApiAuth] Signature format check:', {
      length: signature.length,
      hasNonBase58: /[^123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]/.test(signature),
      firstChar: signature[0],
      lastChar: signature[signature.length - 1]
    })

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
