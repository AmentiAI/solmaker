# Wallet System Implementation Guide

This document describes the comprehensive Bitcoin wallet integration system implemented for the ordinal inscription platform.

## Overview

The wallet system provides a secure, verified connection to Bitcoin wallets using LaserEyes Core, supporting multiple wallet providers with automatic verification and PSBT signing capabilities.

## Architecture

### Components

```
providers/LaserEyesProvider.tsx
├── Wraps LaserEyes Core with mainnet config
└── Contains WalletProvider for app-wide wallet state

lib/wallet/compatibility.tsx
├── WalletProvider: Main wallet context provider
├── useWallet(): Hook for accessing wallet functionality
└── Wallet verification and signing logic

lib/wallet/psbt-utils.ts
├── PSBT signing utilities
├── Transaction broadcasting
├── Format conversion helpers
└── Fee calculation

components/wallet-connect.tsx
└── UI component for wallet connection/management

components/providers.tsx
└── Root provider wrapper with client-side mounting
```

## Setup

### 1. Install Dependencies

```bash
npm install @omnisat/lasereyes-core @omnisat/lasereyes-react bitcoinjs-lib
```

### 2. Wrap Your App

In `app/layout.tsx`:

```tsx
import { Providers } from '@/components/providers'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}
```

### 3. Use the Wallet Hook

In any client component:

```tsx
'use client'

import { useWallet } from '@/lib/wallet/compatibility'

export function MyComponent() {
  const {
    isConnected,
    currentAddress,
    balance,
    isVerified,
    connect,
    disconnect,
    signPsbt,
  } = useWallet()

  // Your component logic
}
```

## Features

### 1. Multi-Wallet Support

Supports the following Bitcoin wallets:
- **UniSat**: Popular Ordinals wallet
- **Xverse**: Multi-chain Bitcoin wallet
- **Magic Eden**: NFT marketplace wallet
- **OYL**: Advanced Bitcoin wallet

### 2. Automatic Wallet Verification

The system automatically verifies wallet ownership through message signing:

```typescript
// Triggered automatically on connection
const verified = await verifyWallet()

// Verification is stored in sessionStorage
// User only needs to verify once per session
```

### 3. Address Management

Three address types are managed:

```typescript
interface WalletAddresses {
  currentAddress: string | null      // Main wallet address
  paymentAddress: string | null      // P2SH-P2WPKH for compatibility
  taprootAddress: string | null      // Taproot for inscriptions
}
```

### 4. Balance Tracking

Real-time balance updates with automatic refresh:

```typescript
const { balance, getBalance } = useWallet()

// Balance is in satoshis
// Auto-refreshes every 30 seconds when connected
```

### 5. PSBT Signing

Full PSBT signing support for inscription transactions:

```typescript
const signedResult = await signPsbt(
  psbtBase64,
  autoFinalize,  // true to let wallet finalize
  broadcast      // true to broadcast immediately
)

// Returns: { txId, signedPsbtHex, signedPsbtBase64, txHex }
```

### 6. Message Signing

Cryptographic message signing for authentication:

```typescript
const signature = await signMessage('Verify ownership')
```

## Wallet Context API

### `useWallet()` Hook

Returns:

```typescript
interface WalletContextType {
  // Connection state
  isConnected: boolean
  currentAddress: string | null
  paymentAddress: string | null
  taprootAddress: string | null
  
  // Balance
  balance: number | null  // in satoshis
  
  // Verification state
  isVerified: boolean
  isVerifying: boolean
  userCancelled: boolean
  
  // LaserEyes client
  client: any | null
  
  // Methods
  connect: (provider: WalletProvider) => Promise<void>
  disconnect: () => Promise<void>
  verifyWallet: () => Promise<boolean>
  signPsbt: (psbtBase64: string, autoFinalize?: boolean, broadcast?: boolean) => Promise<any>
  signMessage: (message: string) => Promise<string>
  getBalance: () => Promise<void>
}
```

## PSBT Utilities

### Broadcasting Transactions

```typescript
import { broadcastTransaction } from '@/lib/wallet/psbt-utils'

const txId = await broadcastTransaction(txHex, 'mainnet')
```

### Handling Signed PSBTs

```typescript
import { handleSignedPsbt } from '@/lib/wallet/psbt-utils'

const txId = await handleSignedPsbt(
  signedResult,
  'mainnet',
  true  // shouldBroadcast
)
```

### PSBT Information

```typescript
import { getPsbtInfo } from '@/lib/wallet/psbt-utils'

const info = getPsbtInfo(psbtHex)
// Returns: { inputs, outputs, fee, inputValue, outputValue }
```

### Format Conversion

```typescript
import { convertPsbtFormat } from '@/lib/wallet/psbt-utils'

const base64 = convertPsbtFormat(psbtHex, 'base64')
const hex = convertPsbtFormat(psbtBase64, 'hex')
```

## Wallet Connect Component

### Basic Usage

```tsx
import { WalletConnect } from '@/components/wallet-connect'

export function MyPage() {
  return (
    <div>
      <WalletConnect />
    </div>
  )
}
```

### Features

- **Wallet Selection**: Dropdown UI for wallet selection
- **Verification Status**: Visual indicators for verification state
- **Balance Display**: Real-time BTC balance in both BTC and sats
- **Address Display**: Shows ordinal (taproot) and payment addresses
- **Copy to Clipboard**: One-click address copying
- **Error Handling**: Clear error messages and retry options

## Error Handling

### Connection Errors

```typescript
try {
  await connect(UNISAT)
} catch (error) {
  // Handle connection failure
  // User may have rejected or wallet not installed
}
```

### Verification Errors

```typescript
// If user cancels verification
if (userCancelled) {
  // Wallet is automatically disconnected
  // User needs to reconnect to try again
}
```

### Signing Errors

```typescript
try {
  const signed = await signPsbt(psbt)
} catch (error) {
  // Handle signing failure
  // User may have rejected or insufficient funds
}
```

## Security Considerations

### 1. Private Keys
- ❌ Platform NEVER accesses private keys
- ✅ All signing happens in the wallet extension
- ✅ Wallet maintains full custody

### 2. Verification
- ✅ Cryptographic proof of ownership
- ✅ Session-based verification storage
- ✅ Automatic re-verification on reconnect

### 3. Transaction Safety
- ✅ User reviews all transactions in wallet
- ✅ PSBT transparency (user sees all inputs/outputs)
- ✅ No auto-signing without user approval

## Integration with Inscription System

### Commit Transaction

```typescript
// 1. Create commit PSBT via API
const commitResponse = await fetch('/api/mint/create-commit', {
  method: 'POST',
  body: JSON.stringify({
    ordinal_ids: ['...'],
    minter_address: currentAddress,
    fee_rate: 10,
  }),
})

const { commit_psbt } = await commitResponse.json()

// 2. Sign and broadcast
const commitResult = await signPsbt(commit_psbt, true, true)
const commitTxId = commitResult.txId
```

### Reveal Transaction

```typescript
// 1. Create reveal PSBT via API
const revealResponse = await fetch('/api/mint/reveal', {
  method: 'POST',
  body: JSON.stringify({
    session_id: sessionId,
    commit_tx_id: commitTxId,
  }),
})

const { reveal_psbt } = await revealResponse.json()

// 2. Sign and broadcast
const revealResult = await signPsbt(reveal_psbt, true, true)
const inscriptionId = revealResult.txId
```

## Testing

### 1. Connection Flow

```typescript
// Test each wallet provider
for (const wallet of [UNISAT, XVERSE, MAGIC_EDEN, OYL]) {
  await connect(wallet)
  expect(isConnected).toBe(true)
  expect(currentAddress).toBeTruthy()
  await disconnect()
}
```

### 2. Verification Flow

```typescript
await connect(UNISAT)
const verified = await verifyWallet()
expect(verified).toBe(true)
expect(isVerified).toBe(true)
```

### 3. PSBT Signing

```typescript
// Create test PSBT
const testPsbt = createTestPsbt()

// Sign it
const signed = await signPsbt(testPsbt, false, false)

// Verify signature
expect(signed.signedPsbtHex).toBeTruthy()
```

## Troubleshooting

### Issue: LaserEyes not available

**Solution**: Ensure `Providers` is wrapping your app and only renders on client-side:

```tsx
// components/providers.tsx must use 'use client'
// and check mounted state before rendering
```

### Issue: Verification fails

**Solution**: Check that wallet supports message signing:

```typescript
// Some wallets may not support signMessage
// Handle gracefully with try-catch
```

### Issue: PSBT signing fails

**Solution**: Validate PSBT before signing:

```typescript
import { validatePsbt } from '@/lib/wallet/psbt-utils'

if (!validatePsbt(psbtBase64)) {
  throw new Error('Invalid PSBT')
}
```

### Issue: Balance not updating

**Solution**: Manually trigger balance refresh:

```typescript
const { getBalance } = useWallet()
await getBalance()
```

## Best Practices

### 1. Always Check Connection

```typescript
if (!isConnected) {
  return <WalletConnect />
}
```

### 2. Verify Before Critical Operations

```typescript
if (!isVerified) {
  const verified = await verifyWallet()
  if (!verified) return
}
```

### 3. Handle User Rejection

```typescript
try {
  await signPsbt(psbt)
} catch (error) {
  // Don't treat rejection as fatal error
  // User may want to retry
  showRetryButton()
}
```

### 4. Show Transaction Details

```typescript
const info = getPsbtInfo(psbt)
// Show user: inputs, outputs, fee
// Before requesting signature
```

## Future Enhancements

- [ ] Multi-signature support
- [ ] Hardware wallet integration
- [ ] Advanced fee estimation
- [ ] Transaction history tracking
- [ ] Batch signing operations
- [ ] Custom derivation paths

## Support

For issues or questions:
- Check LaserEyes documentation: https://www.lasereyes.build/
- Review error messages in browser console
- Verify wallet extension is up to date

---

**Version**: 1.0.0  
**Last Updated**: 2024  
**Maintainer**: Ordinal Platform Team

