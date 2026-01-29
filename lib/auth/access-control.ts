// Authorized wallet addresses and usernames for restricted features
export const AUTHORIZED_WALLETS = [
  'bc1pmhglspy7jd7fzx6ycrdcdyet35ppqsu2ywfaakzapzxpwde3jafshshqwe', // Actual wallet address
  'bc1ptku2xtatqhntfctzachrmr8laq36s20wtrgnm66j39g0a3fwamlqxkryf2',
]

export const AUTHORIZED_USERNAMES = [
  'SigNullBtc',
  'signullbtc',
  'mrbrc',
]

/**
 * Check if a wallet address is authorized to access the platform
 * Now allows any connected wallet to access
 */
export function isAuthorized(walletAddress: string | null | undefined): boolean {
  // Allow any connected wallet to access the platform
  return !!walletAddress
}

/**
 * Check if a wallet address has admin privileges
 * Use this for admin-only features
 */
export function isAdmin(walletAddress: string | null | undefined): boolean {
  if (!walletAddress) return false
  const addressLower = walletAddress.toLowerCase()
  return AUTHORIZED_WALLETS.some(w => w.toLowerCase() === addressLower)
}

/**
 * Server-side authorization check that can also check by username
 * Use this in API routes when you have access to the database
 * 
 * Can accept either a NextRequest object or a wallet address string
 */
export async function checkAuthorizationServer(
  requestOrWallet: any,
  sql?: any
): Promise<{ isAuthorized: boolean; isAdmin: boolean; walletAddress: string | null }> {
  // Extract wallet address - handle both NextRequest and string
  let walletAddress: string | null = null
  
  if (typeof requestOrWallet === 'string') {
    walletAddress = requestOrWallet
  } else if (requestOrWallet && typeof requestOrWallet === 'object') {
    // It's a NextRequest - extract wallet_address from query params or body
    try {
      const url = new URL(requestOrWallet.url)
      walletAddress = url.searchParams.get('wallet_address')
      
      // If not in query params, try to get from body
      if (!walletAddress) {
        try {
          const clonedRequest = requestOrWallet.clone()
          const body = await clonedRequest.json().catch(() => ({}))
          walletAddress = body.wallet_address || body.admin_wallet_address || null
        } catch {
          // Body might not be JSON or might be empty
        }
      }
    } catch {
      // If URL parsing fails, try to get from body
      try {
        const clonedRequest = requestOrWallet.clone()
        const body = await clonedRequest.json().catch(() => ({}))
        walletAddress = body.wallet_address || body.admin_wallet_address || null
      } catch {
        walletAddress = null
      }
    }
  }

  if (!walletAddress) {
    return { isAuthorized: false, isAdmin: false, walletAddress: null }
  }

  // Check if wallet is connected (any wallet = authorized)
  const isAuthorized = !!walletAddress

  // Check if wallet has admin privileges
  const addressLower = walletAddress.toLowerCase()
  let isAdmin = AUTHORIZED_WALLETS.some(w => w.toLowerCase() === addressLower)

  // If we have database access and not yet admin, check by username
  if (!isAdmin && sql) {
    try {
      const profileResult = await sql`
        SELECT username FROM profiles
        WHERE wallet_address = ${walletAddress}
        AND LOWER(username) = ANY(${AUTHORIZED_USERNAMES.map(u => u.toLowerCase())})
        LIMIT 1
      `
      if (profileResult.length > 0) {
        isAdmin = true
      }
    } catch (error) {
      console.error('Error checking authorization by username:', error)
    }
  }

  return { isAuthorized, isAdmin, walletAddress }
}

