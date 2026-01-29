# Bitcoin to Solana Migration - Remaining Updates

## Overview
The database and wallet system have been fully migrated to Solana, but the UI still contains Bitcoin/Ordinals terminology that should be updated.

## ✅ Already Migrated

### Backend/Database
- ✅ Wallet system uses Solana wallets
- ✅ Credit purchase system uses SOL
- ✅ Payment processing via Solana RPC
- ✅ Database supports Solana addresses
- ✅ Admin system checks Solana wallets

### Configuration
- ✅ Helius RPC configured
- ✅ SOL payment addresses set
- ✅ Environment variables updated

## 🔄 Needs Update - UI/UX Terminology

### Collection Settings
**File:** `app/collections/[id]/launch/components/CollectionSettingsStep.tsx`

#### Current (Bitcoin):
```
Creator Payment Wallet (BTC Address) *
Placeholder: "bc1q... or 3... (your BTC receiving address)"
```

#### Updated to:
```
Creator Payment Wallet (Solana Address) *
Placeholder: "Your Solana wallet address (e.g., D3SNZ...GiLJ)"
```
✅ **FIXED**

### Launch Mode Descriptions

**File:** `app/collections/[id]/launch/components/LaunchModeSelector.tsx`

#### Current Issues:
1. **Launchpad Mode:**
   - "Let collectors inscribe on mint"
   - "Automated inscription"
   
   **Should say:**
   - "Let collectors mint NFTs"
   - "Automated minting"

2. **Self-Inscribe Mode:**
   - "Inscribe your collection yourself in batches"
   - "Full control over inscription process"
   - "Batch inscriptions"
   - "Track inscription status"
   - "Build metadata outputs"
   
   **Should say:**
   - "Mint your collection yourself in batches"
   - "Full control over minting process"
   - "Batch minting"
   - "Track minting status"
   - "Build metadata"

3. **Marketplace Mode:**
   - "Sell your entire collection (as images) for bitcoin or credits"
   - "Sell collection for btc or credits"
   - "Never inscribe it yourself"
   
   **Should say:**
   - "Sell your entire collection (as images) for SOL or credits"
   - "Sell collection for SOL or credits"
   - "Never mint it yourself"

### Validation Messages

**File:** `app/collections/[id]/launch/page.tsx`

#### Updated:
```typescript
// Before:
toast.error('...Please enter a Creator Payment Wallet (BTC Address)...')

// After:
toast.error('...Please enter a Creator Payment Wallet (Solana Address)...')
```
✅ **FIXED**

## Technical Considerations

### System Architecture
The platform appears to have been originally built for Bitcoin Ordinals but is now transitioning to Solana NFTs. This means:

1. **Ordinals → NFTs**: Replace "ordinal" with "NFT" throughout
2. **Inscription → Minting**: Replace "inscribe/inscription" with "mint/minting"
3. **Satoshis → Lamports**: Replace "sats" with "lamports" or "SOL"
4. **BTC Addresses → SOL Addresses**: Update wallet format expectations

### Database Compatibility
The database still has some Bitcoin-era column names:
- `mint_inscriptions` table (should be `mint_nfts` or keep as is)
- `inscription_id` fields
- `commit_tx_id`, `reveal_tx_id` (Ordinals-specific)

**Recommendation:** Keep database column names for backwards compatibility, but update UI labels and descriptions.

## Quick Wins - High Priority Updates

### 1. Collection Settings Step ✅ DONE
- Updated wallet label from "BTC Address" to "Solana Address"
- Updated placeholder text
- Updated validation message

### 2. Launch Mode Selector 🔲 TODO
File: `app/collections/[id]/launch/components/LaunchModeSelector.tsx`
- Update all "inscribe" → "mint"
- Update "bitcoin" → "SOL"
- Update "ordinal" → "NFT"

### 3. Pricing Display 🔲 TODO
- Update from "satoshis" to "lamports" or "SOL"
- Remove "sat/vB" fee rate references (Solana doesn't use this)
- Update pricing displays to show SOL amounts

### 4. Collection Pages 🔲 TODO
- Update terminology in grid displays
- Change "Ordinals Grid" to "NFTs Grid"
- Update card labels

## Implementation Priority

### High Priority (User-Facing)
1. ✅ Creator wallet input labels
2. 🔲 Launch mode descriptions
3. 🔲 Pricing displays
4. 🔲 Navigation labels

### Medium Priority (Feature Specific)
5. 🔲 Phase configuration UI
6. 🔲 Whitelist management labels
7. 🔲 Transaction status messages

### Low Priority (Technical)
8. 🔲 API response field names
9. 🔲 Internal variable names
10. 🔲 Console log messages

## Testing Checklist

After updates, verify:
- [ ] Collection creation uses Solana wallet
- [ ] Launch setup shows Solana terminology
- [ ] Pricing displays in SOL/lamports
- [ ] Minting works with Solana transactions
- [ ] No Bitcoin/Ordinals confusion for users

## Notes

The backend appears to be platform-agnostic enough to work with Solana, but the frontend needs a terminology pass to match. The database schema can remain as is since changing table/column names would require extensive refactoring.

**Recommendation:** Focus on user-facing UI updates first, then tackle backend terminology if needed.
