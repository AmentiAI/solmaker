# Solana Signature Verification Fix

## Problem
The application was throwing a "bad signature size" error and "Invalid cryptographic signature" when verifying Solana wallet signatures. This happened because:

1. **Type Signature Mismatch (CRITICAL)**: The `compatibility.tsx` wrapper was converting the Solana `signMessage` function signature from `(Uint8Array) => Uint8Array` to `(string) => string`, causing `generateApiAuth` to pass a Uint8Array to a function expecting a string. This resulted in signing the wrong message entirely.

2. **Missing Base64 Support**: Solana wallets can return signatures in different formats (base58, base64, or raw Uint8Array). The server was only handling base58 and hex, but many wallets return base64-encoded signatures.

3. **No Length Validation**: The code wasn't validating that signatures are exactly 64 bytes before attempting cryptographic verification. Ed25519 signatures (used by Solana) must be exactly 64 bytes.

4. **Insufficient Debugging**: Neither client nor server had adequate logging to diagnose signature format issues.

## Error Details
```
Error: bad signature size
    at verifySolanaSignature (lib\auth\signature-verification.ts:86:49)
```

This error was thrown by the `nacl.sign.detached.verify()` function when it received a signature that wasn't exactly 64 bytes.

## Solution

### Root Cause Fix (`lib/wallet/compatibility.tsx`) - CRITICAL

**The main issue**: The compatibility layer was wrapping the Solana `signMessage` function and changing its signature:

```typescript
// BEFORE (BROKEN):
signMessage: async (message: string) => {
  const messageBytes = new TextEncoder().encode(message)
  const signature = await solanaSignMessage(messageBytes)
  return Buffer.from(signature).toString('base64')
}
```

This wrapper expected a **string** but `generateApiAuth` was passing a **Uint8Array**. When TypeScript coerced the Uint8Array to a string, it created garbage data like `"[object Uint8Array]"`, which was then signed - producing a signature for the WRONG message!

**Fixed version**:
```typescript
// AFTER (FIXED):
signMessage: solanaSignMessage || null
```

Now the compatibility layer returns the **raw Solana wallet adapter's signMessage function**, which has the correct signature: `(message: Uint8Array) => Promise<Uint8Array>`. This matches what `generateApiAuth` expects, so the message is signed correctly.

### Server-Side Changes (`lib/auth/signature-verification.ts`)

1. **Added Base64 Decoding Support**:
   ```typescript
   // Now tries in order: base58 → base64 → hex
   try {
     signatureBytes = bs58.decode(signature)
   } catch (e) {
     try {
       signatureBytes = Uint8Array.from(Buffer.from(signature, 'base64'))
     } catch (base64Error) {
       // Try hex as last resort
     }
   }
   ```

2. **Added Signature Length Validation**:
   ```typescript
   if (signatureBytes.length !== 64) {
     console.error('Invalid signature length:', signatureBytes.length, 'expected 64 bytes')
     return false
   }
   ```

3. **Enhanced Logging**: Added detailed logs showing which encoding format was used and the decoded signature length.

### Client-Side Changes (`lib/wallet/api-auth.ts`)

1. **Added Signature Length Validation**:
   ```typescript
   if (signatureResult.length !== 64) {
     console.error('Invalid signature length! Expected 64 bytes, got:', signatureResult.length)
     return null
   }
   ```

2. **Enhanced Logging**: Added detailed logs showing:
   - Original signature format (Uint8Array, string, or object)
   - Byte length before encoding
   - String length after encoding
   - Encoding method used

## Testing

### 1. Connect Wallet and Make Authenticated Request

```javascript
// In browser console:
// 1. Connect your Solana wallet
// 2. Make an authenticated API request (e.g., update collection settings)
// 3. Check browser console for logs like:
//    "[generateApiAuth] Signature is Uint8Array, byte length: 64"
//    "[generateApiAuth] Converted Uint8Array to base58, string length: 87"
```

### 2. Check Server Logs

After making a request, check the server logs for:
```
[verifySolanaSignature] Verifying: { address: '...', signature_length: 87, ... }
[verifySolanaSignature] Decoded base58 signature, length: 64
```

### 3. Expected Behavior

✅ **Success**: The signature should be:
- Exactly 64 bytes after decoding
- Successfully verified with `nacl.sign.detached.verify()`
- Logged with clear encoding format

❌ **Failure Indicators**:
- "Invalid signature length: X expected 64 bytes" → Signature is wrong size
- "Failed to decode signature as base58, base64, or hex" → Unsupported encoding
- "Invalid cryptographic signature" → Signature doesn't match (possible attack)

## Common Signature Formats

| Wallet | Format | Byte Length | String Length |
|--------|--------|-------------|---------------|
| Phantom | Uint8Array | 64 | 87-88 (base58) |
| Solflare | Uint8Array | 64 | 87-88 (base58) |
| Some wallets | base64 string | 64 | 88 (base64) |
| Raw hex | hex string | 64 | 128 (hex) |

## Message Format

Both client and server use this exact format:
```
Verify wallet ownership for {walletAddress} at {timestamp}
```

Example:
```
Verify wallet ownership for 7aXh...Kj9m at 1707789456123
```

The timestamp is checked to prevent replay attacks (must be within 5 minutes).

## Security Features

1. **Replay Attack Prevention**: Signatures are cached for 5 minutes and rejected if reused
2. **Timestamp Validation**: Messages older than 5 minutes are rejected
3. **Address Verification**: The wallet address in the message must match the claimed address
4. **Cryptographic Verification**: Uses Ed25519 signature verification via TweetNaCl

## Related Files

- `lib/auth/signature-verification.ts` - Server-side signature verification
- `lib/wallet/api-auth.ts` - Client-side signature generation
- `lib/wallet/solana-wallet-context.tsx` - Wallet connection and signing

## Next Steps

If issues persist:

1. **Check Wallet Extension**: Ensure the Solana wallet extension is up to date
2. **Check Browser Console**: Look for detailed signature format logs
3. **Check Server Logs**: Look for decoding errors or length mismatches
4. **Test Different Wallets**: Try Phantom, Solflare, or other Solana wallets
5. **Verify Network**: Ensure you're on the correct Solana network (mainnet/devnet)

## Debug Mode

To enable verbose signature debugging, check browser and server console for logs prefixed with:
- `[generateApiAuth]` - Client-side signature generation
- `[verifySolanaSignature]` - Server-side signature verification

These logs now include:
- Signature encoding format (base58/base64/hex)
- Byte lengths before/after encoding
- Decoding success/failure details
- Cryptographic verification results
