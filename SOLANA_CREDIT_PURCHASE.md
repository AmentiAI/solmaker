# Solana Credit Purchase Implementation

## Overview
The credit purchase system has been fully integrated with Solana payments. Users can now purchase credits using SOL tokens through their connected Solana wallet (Phantom, Solflare, etc.).

## Components Updated

### 1. Frontend Components

#### `components/credit-purchase.tsx`
- **Changed**: Payment method from Bitcoin to Solana
- **Flow**: 
  1. Detects Solana wallet connection via `useWallet()` hook
  2. Creates payment request to API with `payment_type: 'sol'`
  3. Retrieves SOL amount needed from API response
  4. Constructs Solana transaction using `@solana/web3.js`
  5. Signs and sends transaction via `window.solana.signAndSendTransaction()`
  6. Waits for transaction confirmation
  7. Submits transaction signature to verification API
  8. Polls for credit award completion

#### `components/payment-method-selector.tsx`
- **Changed**: Payment type definition updated to include `'sol'` and `'eth'`

#### `app/buy-credits/page.tsx`
- **Changed**: Updated info text to mention Solana instead of Bitcoin

### 2. API Routes

#### `app/api/credits/create-payment/route.ts`
- **Existing Support**: Already supports Solana payments
- **Features**:
  - Fetches real-time SOL/USD exchange rate from CoinGecko
  - Calculates SOL amount needed based on credit tier price
  - Applies holder discounts (50% off for OrdMaker holders)
  - Creates pending payment record in database
  - Returns payment details including `solAmount` and `paymentAddress`

#### `app/api/credits/verify-payment/route.ts`
- **Existing Support**: Already verifies Solana transactions
- **Features**:
  - Checks transaction on Solana blockchain via RPC
  - Verifies transaction is finalized and error-free
  - Confirms correct amount was sent to payment address
  - Awards credits to user's account
  - Updates payment status to 'completed'

### 3. Wallet Integration

#### `lib/wallet/solana-wallet-context.tsx`
- **Provides**: 
  - Wallet connection state management
  - `sendTransaction()` method for sending SOL
  - `getBalance()` method for checking balance
  - `verifyWallet()` for signature verification
  - Integration with `@solana/wallet-adapter-react`

#### `lib/wallet/compatibility.tsx`
- **Maps**: Solana wallet functions to unified wallet interface
- **Exports**: `useWallet()` hook for consistent API across components

### 4. Type Definitions

#### `types/window.d.ts`
- **Defines**: TypeScript types for `window.solana` and `window.phantom.solana`
- **Includes**: All Phantom wallet methods and properties

## Payment Flow

### Step 1: User Initiates Purchase
```typescript
// User clicks "Buy Now" on a credit tier
handlePurchase(tierIndex)
```

### Step 2: Create Payment Request
```typescript
const response = await fetch('/api/credits/create-payment', {
  method: 'POST',
  body: JSON.stringify({
    wallet_address: currentAddress,
    tier_index: tierIndex,
    payment_type: 'sol',
    holder_discount: holderStatus?.isHolder ? 50 : 0
  })
})

const paymentData = await response.json()
// Returns: { paymentId, paymentAddress, solAmount, creditsAmount, ... }
```

### Step 3: Construct Solana Transaction
```typescript
import { PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL, Connection } from '@solana/web3.js'

const fromPubkey = new PublicKey(currentAddress)
const toPubkey = new PublicKey(paymentData.paymentAddress)
const lamports = Math.floor(solAmount * LAMPORTS_PER_SOL)

const connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC_URL, 'confirmed')
const { blockhash } = await connection.getLatestBlockhash('finalized')

const transaction = new Transaction()
transaction.recentBlockhash = blockhash
transaction.feePayer = fromPubkey
transaction.add(
  SystemProgram.transfer({
    fromPubkey,
    toPubkey,
    lamports
  })
)
```

### Step 4: Sign and Send Transaction
```typescript
const { signature } = await window.solana.signAndSendTransaction(transaction)
```

### Step 5: Wait for Confirmation
```typescript
const confirmation = await connection.confirmTransaction(signature, 'confirmed')
if (confirmation.value.err) {
  throw new Error('Transaction failed')
}
```

### Step 6: Verify Payment
```typescript
await fetch('/api/credits/verify-payment', {
  method: 'POST',
  body: JSON.stringify({
    payment_id: paymentData.paymentId,
    wallet_address: currentAddress,
    txid: signature
  })
})
```

### Step 7: Poll for Completion
The component automatically polls the verify-payment endpoint every 30 seconds until:
- Payment status becomes 'completed'
- Credits are awarded to user's account

## Exchange Rate Conversion

The system fetches real-time exchange rates from CoinGecko API:

```typescript
const solRate = await fetchExchangeRate('solana')
// Returns current SOL/USD price

const solAmount = usdAmount / solRate
// Calculates SOL needed for purchase
```

**Fallback**: If CoinGecko fails, defaults to $100/SOL as a safety measure.

## Transaction Verification

The backend verifies Solana transactions by:

1. **Fetching Transaction Status**: Using Solana RPC `getSignatureStatuses`
2. **Checking Finalization**: Ensures `confirmationStatus === 'finalized'`
3. **Parsing Transaction**: Using RPC `getTransaction` with JSON parsed encoding
4. **Extracting Amount**: Reading balance changes or transfer instruction amounts
5. **Validating Amount**: Confirms received amount matches expected (within 1% tolerance)
6. **Awarding Credits**: Adds credits to user's account via `addCredits()`

## Environment Variables

Required environment variables in `.env` or `.env.local`:

```bash
# Solana Configuration
SOL_PAYMENT_ADDRESS=5evWF4HACa6fomaEzXS4UtCogR6S9R5nh1PLgm6dEFZK
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# Optional: Helius RPC for better performance
NEXT_PUBLIC_HELIUS_API_KEY=your_helius_api_key
```

## User Experience

### Success Flow
1. User connects Solana wallet (Phantom, Solflare, etc.)
2. User selects credit tier
3. System displays SOL amount needed
4. User clicks "Buy Now"
5. Wallet popup appears for transaction approval
6. User approves transaction
7. Transaction is sent to Solana network
8. Confirmation appears (~0.5-2 seconds)
9. Credits are awarded to user's account
10. Success message displays with transaction link to Solscan

### Error Handling
- **Wallet Not Connected**: Shows "Please connect your wallet first"
- **User Cancels**: Shows "Transaction cancelled by user"
- **Insufficient Balance**: Shows actual balance vs required amount
- **Transaction Fails**: Shows detailed error message
- **Network Error**: Shows "Failed to send transaction"

## Transaction Tracking

All Solana transactions are tracked in the `pending_payments` table:

```sql
CREATE TABLE pending_payments (
  id UUID PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  credits_amount INTEGER NOT NULL,
  bitcoin_amount DECIMAL(16,8), -- Stores SOL amount
  payment_address TEXT NOT NULL,
  payment_txid TEXT, -- Stores Solana signature
  confirmations INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  payment_type TEXT, -- 'sol' for Solana
  network TEXT, -- 'solana'
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
```

## Testing Checklist

- [ ] Wallet connection works with Phantom
- [ ] Wallet connection works with Solflare
- [ ] Credit tiers display correct SOL amounts
- [ ] Transaction signing prompts wallet popup
- [ ] Transaction confirmation updates UI
- [ ] Credits are awarded after confirmation
- [ ] Transaction link to Solscan works
- [ ] Error messages display correctly
- [ ] User can cancel transaction
- [ ] Holder discount applies correctly (50% off)
- [ ] Multiple purchases work sequentially

## Security Features

1. **Server-Side Validation**: Payment amounts verified on blockchain
2. **Holder Discount Verification**: Always checked server-side, not just client-side
3. **Transaction Finalization**: Only awards credits for finalized transactions
4. **Amount Validation**: Confirms received amount matches expected (within 1% tolerance)
5. **Duplicate Prevention**: Checks for existing credit transactions with same txid
6. **Expiration**: Pending payments expire after 1 hour

## Monitoring

Transaction logs include:
- `💰 Solana Payment: X SOL to address`
- `🔐 Sending Solana transaction...`
- `✅ Transaction sent, signature: xxx`
- `⏳ Waiting for transaction confirmation...`
- `✅ Transaction confirmed!`
- `✅ Payment verified, status: completed`

## Future Enhancements

- [ ] Support for USDC/USDT payments on Solana
- [ ] Integration with Jupiter for better exchange rates
- [ ] Transaction speed-up via priority fees
- [ ] Multi-signature wallet support
- [ ] Ledger hardware wallet support
- [ ] Mobile wallet deep linking
