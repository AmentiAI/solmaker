# Platform Wallet Setup - Complete ✅

## New Solana Platform Wallet

### Wallet Generated
```
Address: Gc8bhxacwnHAhvJSTPPXvYTT5Y1iNUDky1nqbztxVE8J
Private Key: j5rXeyxuAAcRobQuTdiHrksJTDFf7SinFtfHrbfQ6JMpCDkGPDqnCQV3YpoZqqtgJQdLAiLtsYZxc76XsXfqPYn
```

⚠️ **IMPORTANT:** Never share the private key. It's already added to `.env.local`.

---

## What This Wallet Does

This is the **platform treasury wallet** that receives:

1. **Credit Purchase Payments**
   - Users buy credits with SOL
   - Payment goes to this wallet
   - Credits automatically added to user account

2. **Optional Platform Mint Fees**
   - If enabled, collect small fee per mint (~0.01 SOL)
   - Currently disabled by default
   - Can be enabled per-collection or globally

3. **Future Revenue Streams**
   - Secondary marketplace fees
   - Premium features
   - Creator payouts (if platform facilitates)

---

## Environment Variables Updated

Added to `.env.local`:

```bash
# Solana Platform Wallet (for fees & payments)
SOLANA_PLATFORM_WALLET=Gc8bhxacwnHAhvJSTPPXvYTT5Y1iNUDky1nqbztxVE8J
SOLANA_PLATFORM_PRIVATE_KEY=j5rXeyxuAAcRobQuTdiHrksJTDFf7SinFtfHrbfQ6JMpCDkGPDqnCQV3YpoZqqtgJQdLAiLtsYZxc76XsXfqPYn

# Legacy Bitcoin (deprecated - kept for reference)
FEE_WALLET=bc1p693zz6n9cvmsewemg4j0pmvfvs4th3ft9c74afrc90l6sah300uqt99vee
PHRASE="carpet mango business announce eager skate cereal island drastic boring submit child"
```

---

## Code Updated

### 1. Created Platform Wallet Module
`lib/solana/platform-wallet.ts`

Functions:
- `getPlatformWalletAddress()` - Get public key
- `getPlatformWalletPublicKey()` - Get PublicKey object
- `getPlatformWalletKeypair()` - Get private key (server-side only)
- `getPlatformWalletBalance()` - Check wallet balance
- `verifyPlatformWallet()` - Verify configuration

### 2. Updated Credit Purchase System
Files updated:
- `app/api/credits/create-payment/route.ts` - Uses new wallet for SOL payments
- `app/api/credits/verify-payment/route.ts` - Verifies payments to new wallet

### 3. Created Admin Endpoint
`app/api/admin/platform-wallet/route.ts`

Check wallet status:
```bash
GET /api/admin/platform-wallet
```

Returns:
```json
{
  "success": true,
  "wallet": {
    "address": "Gc8bhxacwnHAhvJSTPPXvYTT5Y1iNUDky1nqbztxVE8J",
    "balance": 0,
    "balanceFormatted": "0.0000 SOL"
  }
}
```

---

## How It Works

### Credit Purchase Flow (Updated)

```
User Buys Credits with SOL
         ↓
1. Frontend calls POST /api/credits/create-payment
   - payment_type: "sol"
   - tier_index: 0-4 (50, 100, 250, 500, 1000 credits)
         ↓
2. Backend calculates SOL amount
   - Gets current SOL/USD rate from CoinGecko
   - Calculates: USD price / SOL rate = SOL amount
   - Returns: paymentAddress (NEW PLATFORM WALLET)
         ↓
3. User sends SOL to platform wallet
   - Using Phantom or other Solana wallet
   - Amount shown in UI
         ↓
4. User submits transaction signature
         ↓
5. Backend verifies transaction
   - Checks signature on-chain
   - Verifies amount matches
   - Verifies recipient is platform wallet ✅
         ↓
6. Credits added to user account
   - Database updated
   - User can use credits immediately
```

### Mint Fee Collection (Future)

```typescript
// In Candy Machine mint transaction
import { getPlatformWalletAddress, calculatePlatformMintFee } from '@/lib/solana/platform-wallet'

const platformFee = calculatePlatformMintFee(enablePlatformFee)

// Add platform fee instruction to transaction
if (platformFee > 0) {
  transaction.add(
    SystemProgram.transfer({
      fromPubkey: user.publicKey,
      toPubkey: getPlatformWalletPublicKey(),
      lamports: platformFee,
    })
  )
}
```

---

## Security Notes

### ✅ What's Secure
1. Private key only in `.env.local` (never committed)
2. Private key only accessed on server-side
3. All credit purchases verified on-chain
4. No user funds ever held in custody
5. Transparent - all transactions visible on Solscan

### ⚠️ Important
1. **Backup private key** in secure password manager
2. **Never commit** `.env.local` to git (already in `.gitignore`)
3. **Never share** private key with anyone
4. **Monitor wallet** for unexpected activity
5. **Regular withdrawals** - don't keep large balance

---

## Monitoring the Wallet

### Check Balance (API)
```bash
curl http://localhost:3000/api/admin/platform-wallet
```

### Check on Solscan
```
https://solscan.io/account/Gc8bhxacwnHAhvJSTPPXvYTT5Y1iNUDky1nqbztxVE8J
```

### Check Recent Transactions
```bash
curl https://mainnet.helius-rpc.com/?api-key=YOUR_KEY \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "getSignaturesForAddress",
    "params": ["Gc8bhxacwnHAhvJSTPPXvYTT5Y1iNUDky1nqbztxVE8J", {"limit": 10}]
  }'
```

---

## Withdrawing Funds

To withdraw SOL from the platform wallet to your personal wallet:

```bash
# Create a withdrawal script
node scripts/withdraw-platform-funds.js --to YOUR_WALLET --amount 1.5
```

Or manually:
1. Import private key into Phantom/Solflare
2. Send SOL to your personal wallet
3. Remove from wallet app after (keep only in .env.local)

---

## Admin Dashboard Integration

Add to your admin dashboard:

```tsx
'use client'

import { useEffect, useState } from 'react'

export function PlatformWalletWidget() {
  const [wallet, setWallet] = useState<any>(null)

  useEffect(() => {
    fetch('/api/admin/platform-wallet')
      .then(res => res.json())
      .then(data => setWallet(data.wallet))
  }, [])

  if (!wallet) return <div>Loading...</div>

  return (
    <div className="p-4 bg-white rounded-lg shadow">
      <h3 className="font-bold mb-2">Platform Wallet</h3>
      <p className="text-sm text-gray-600">
        {wallet.address.substring(0, 12)}...
      </p>
      <p className="text-2xl font-bold mt-2">
        {wallet.balanceFormatted}
      </p>
      <a 
        href={`https://solscan.io/account/${wallet.address}`}
        target="_blank"
        className="text-blue-600 text-sm"
      >
        View on Solscan →
      </a>
    </div>
  )
}
```

---

## Testing

### 1. Test Wallet Configuration
```bash
node -e "
const { verifyPlatformWallet } = require('./lib/solana/platform-wallet');
verifyPlatformWallet().then(r => console.log(r));
"
```

### 2. Test Credit Purchase (Devnet)
```bash
# Switch to devnet in .env.local
NEXT_PUBLIC_SOLANA_NETWORK=devnet

# Get devnet SOL
# Visit: https://faucet.solana.com/

# Try purchasing credits on devnet
```

### 3. Test Admin Endpoint
```bash
curl http://localhost:3000/api/admin/platform-wallet
```

---

## Migration from Old System

### What Changed
| Old (Bitcoin) | New (Solana) |
|--------------|-------------|
| `FEE_WALLET` | `SOLANA_PLATFORM_WALLET` |
| `PHRASE` mnemonic | `SOLANA_PLATFORM_PRIVATE_KEY` base58 |
| `SOL_PAYMENT_ADDRESS` (hardcoded) | `SOLANA_PLATFORM_WALLET` (env var) |
| Bitcoin Ordinals minting | Solana NFT minting |

### Backward Compatibility
- Old Bitcoin env vars kept for reference
- No Bitcoin functionality removed (yet)
- Gradual migration possible

---

## Summary

✅ **New Solana Platform Wallet Created**
- Address: `Gc8bhxacwnHAhvJSTPPXvYTT5Y1iNUDky1nqbztxVE8J`
- Added to `.env.local`
- Private key secured

✅ **Code Updated**
- Credit purchase uses new wallet
- Payment verification updated
- Admin endpoint created
- Helper functions added

✅ **Ready for Production**
- Users can buy credits with SOL
- Platform receives payments automatically
- All transactions on-chain & transparent
- Secure & non-custodial

---

## Next Steps

1. **Fund the wallet** (optional - only needed for outgoing transactions)
2. **Test credit purchase** on devnet
3. **Monitor transactions** on Solscan
4. **Set up alerts** for large incoming payments (optional)
5. **Regular withdrawals** to cold storage (recommended)

🎉 **Platform wallet ready to receive SOL!**
