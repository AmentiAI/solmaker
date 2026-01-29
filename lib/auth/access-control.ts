// Authorized wallet addresses and usernames for restricted features
export const AUTHORIZED_WALLETS = [
  'bc1pmhglspy7jd7fzx6ycrdcdyet35ppqsu2ywfaakzapzxpwde3jafshshqwe', // Bitcoin wallet
  'bc1ptku2xtatqhntfctzachrmr8laq36s20wtrgnm66j39g0a3fwamlqxkryf2', // Bitcoin wallet
  'D3SNZXJwsMVqJM7qBMUZ8w2rnDhNiLbSs2TT1Ez8GiLJ', // Solana wallet - Admin
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
 * Check if a wallet address has admin privileges (client-side fallback)
 * For proper admin checks, use checkAuthorizationServer with database access
 */
export function isAdmin(walletAddress: string | null | undefined): boolean {
  if (!walletAddress) return false
  const addressLower = walletAddress.toLowerCase()
  // Fallback to hardcoded list for client-side checks
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

  // Check if wallet has admin privileges - prioritize database check
  let isAdminUser = false

  if (sql) {
    try {
      // First, check database for is_admin flag
      const profileResult = await sql`
        SELECT is_admin, username FROM profiles
        WHERE wallet_address = ${walletAddress}
        LIMIT 1
      `
      
      if (profileResult.length > 0 && profileResult[0].is_admin === true) {
        isAdminUser = true
      }
      
      // Also check if username is in authorized list (fallback)
      if (!isAdminUser && profileResult.length > 0 && profileResult[0].username) {
        const usernameLower = profileResult[0].username.toLowerCase()
        if (AUTHORIZED_USERNAMES.map(u => u.toLowerCase()).includes(usernameLower)) {
          isAdminUser = true
        }
      }
    } catch (error) {
      console.error('Error checking admin status from database:', error)
    }
  }
  
  // Fallback to hardcoded wallet list if database check didn't return admin
  if (!isAdminUser) {
    const addressLower = walletAddress.toLowerCase()
    isAdminUser = AUTHORIZED_WALLETS.some(w => w.toLowerCase() === addressLower)
  }

  return { isAuthorized, isAdmin: isAdminUser, walletAddress }
}

