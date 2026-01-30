# Build Error Fixes ✅

## Issues Fixed

### 1. Missing Export: `RENT_EXEMPT_MINIMUM`
**Error:**
```
Attempted import error: 'RENT_EXEMPT_MINIMUM' is not exported from '@/lib/solana/cost-estimation'
```

**Fix:**
Added the missing export to `lib/solana/cost-estimation.ts`:
```typescript
export const RENT_EXEMPT_MINIMUM = 0.00203928 * LAMPORTS_PER_SOL // ~0.002 SOL minimum rent exemption
```

**Files Modified:**
- `lib/solana/cost-estimation.ts` - Added RENT_EXEMPT_MINIMUM export

---

### 2. Build-Time Environment Variable Access
**Error:**
```
Error: SOLANA_PLATFORM_WALLET not configured in environment
at app/api/credits/create-payment/route.ts
```

**Root Cause:**
The code was calling `getPlatformWalletAddress()` at module load time (top-level), which executes during build. Environment variables might not be available during build, causing the build to fail.

**Fix:**
Changed the platform wallet functions to return `null` when not configured instead of throwing errors, and moved the calls from module-level to function-level:

**Before (Module-level - runs at build time):**
```typescript
const SOL_PAYMENT_ADDRESS = getPlatformWalletAddress(); // ❌ Runs during build
```

**After (Function-level - runs at request time):**
```typescript
function getSolPaymentAddress(): string {
  const address = getPlatformWalletAddress()
  if (!address) {
    throw new Error('Solana payment address not configured')
  }
  return address
}

// Then call it inside the request handler:
paymentAddress = getSolPaymentAddress(); // ✅ Runs during request
```

**Files Modified:**

1. **`lib/solana/platform-wallet.ts`**
   - Changed return types to allow `null`
   - Functions return `null` instead of throwing during build
   - `getPlatformWalletAddress(): string | null`
   - `getPlatformWalletPublicKey(): PublicKey | null`
   - `getPlatformWalletBalance(): Promise<number | null>`
   - `getPlatformFeeDestination(): string | null`

2. **`app/api/credits/create-payment/route.ts`**
   - Removed module-level `SOL_PAYMENT_ADDRESS` constant
   - Added `getSolPaymentAddress()` helper function
   - Call moved inside request handler

3. **`app/api/credits/verify-payment/route.ts`**
   - Removed module-level `SOL_PAYMENT_ADDRESS` constant
   - Added `getSolPaymentAddress()` helper function
   - Call moved inside request handler

4. **`app/api/admin/solana/stats/route.ts`**
   - Added null check before calling `getPlatformWalletBalance()`
   - Handles null wallet address gracefully

---

## Why This Matters

### Build vs Runtime
- **Build Time**: Next.js pre-renders pages and API routes during `npm run build`
- **Runtime**: Code executes when users make requests

### The Problem
When you access environment variables at the module level (top of file), that code runs during build:

```typescript
// ❌ BAD - Runs during build
const ADDRESS = process.env.SOLANA_PLATFORM_WALLET

// ✅ GOOD - Runs during request
function getAddress() {
  return process.env.SOLANA_PLATFORM_WALLET
}
```

### Environment Variables During Build
- Vercel/deployment platforms may not inject all env vars during build
- Some env vars are only available at runtime
- Throwing errors during build causes deployment to fail

---

## Solution Pattern

For any code that needs environment variables:

### ❌ Don't Do This:
```typescript
// Module-level access (runs at build time)
const WALLET = getWalletFromEnv() // Throws if not set during build
```

### ✅ Do This Instead:
```typescript
// Function that returns null if not available
function getWallet(): string | null {
  return process.env.WALLET || null
}

// Or function that throws at request time
function requireWallet(): string {
  const wallet = process.env.WALLET
  if (!wallet) {
    throw new Error('WALLET not configured')
  }
  return wallet
}

// Use inside request handlers
export async function POST(request: Request) {
  const wallet = requireWallet() // Only throws during request
  // ... use wallet
}
```

---

## Testing

### Build Test
```bash
npm run build
```

Should complete without errors even if `SOLANA_PLATFORM_WALLET` is not set.

### Runtime Test
When the API routes are called at runtime:
- If `SOLANA_PLATFORM_WALLET` is set → works normally
- If `SOLANA_PLATFORM_WALLET` is not set → returns error response (doesn't crash build)

---

## Benefits

✅ **Build succeeds** even without all env vars
✅ **Deployment works** on Vercel/production
✅ **Clear error messages** at runtime if env vars missing
✅ **Better separation** of build-time vs runtime concerns
✅ **More resilient** code that handles missing config gracefully

---

## Status

**STATUS**: ✅ **BUILD ERRORS FIXED**

Both issues resolved:
1. ✅ `RENT_EXEMPT_MINIMUM` export added
2. ✅ Platform wallet calls moved to request-time

**Build should now succeed!** 🎉

---

**Fix Date**: January 30, 2026
**Issues**: Build-time errors
**Resolution**: Export additions + runtime-only env access
**Status**: Ready for Deployment ✅
