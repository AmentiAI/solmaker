# ✅ Solana Network Switching - Complete!

## What Was Built

You can now **switch between Solana devnet and mainnet** directly from the admin panel! This lets you:
- Test deployments on devnet (free testnet SOL)
- Verify everything works correctly
- Switch to mainnet for production launches
- Keep different RPC endpoints for each network

---

## How It Works

### 1. Database Settings (Migration 117)

Added 3 new settings to `site_settings` table:
- `solana_network` - Current network (`"devnet"` or `"mainnet-beta"`)
- `solana_rpc_devnet` - Devnet RPC endpoint
- `solana_rpc_mainnet` - Mainnet RPC endpoint

**Default:** Starts on `devnet` for safe testing!

### 2. Dynamic Connection Code

Updated `lib/solana/connection.ts` to:
- Read network settings from database first
- Fall back to env vars if database unavailable
- Cache settings for 1 minute (for performance)
- Clear cache when settings change

```typescript
// New async functions
await getConnectionAsync()  // Gets connection with DB settings
await getClusterAsync()     // Gets current network from DB
await getExplorerUrlAsync() // Gets explorer URL for current network

// Sync versions still work (use cache or env vars)
getConnection()
getCluster()
getExplorerUrl()
```

### 3. Admin UI

Added network switching UI to **Admin → System → Site Settings**:

```
┌─────────────────────────────────────────┐
│ ◎ Solana Network Configuration          │
├─────────────────────────────────────────┤
│                                         │
│ Active Network:                         │
│  ┌──────────┐  ┌──────────┐           │
│  │ 🧪 Devnet │  │ 🚀 Mainnet│          │
│  │ Testing  │  │ Production│           │
│  └──────────┘  └──────────┘           │
│                                         │
│ Devnet RPC: [api.devnet.solana.com]   │
│ Mainnet RPC: [api.mainnet-beta...]    │
│                                         │
│ Current Network: 🧪 Devnet (Testing)   │
│ Active RPC: https://api.devnet...      │
│                                         │
│ ⚠️ Changing networks affects all new   │
│    deployments and mints               │
└─────────────────────────────────────────┘
```

---

## Usage Workflow

### Testing on Devnet

1. **Start on Devnet** (default)
   - Go to **Admin → Site Settings**
   - Verify network shows `🧪 Devnet`

2. **Get Free Devnet SOL**
   - Visit https://faucet.solana.com/
   - Request 2 SOL (free!)

3. **Create Test Collection**
   - Generate NFTs
   - Go to Launch → Step 5
   - Click "Deploy to Solana"
   - Sign transactions (costs ~0.16 devnet SOL)

4. **Test Minting**
   - Go to launchpad page
   - Mint an NFT (free devnet SOL)
   - Verify it works

### Switching to Mainnet

5. **Switch Network**
   - Go to **Admin → Site Settings**
   - Click **🚀 Mainnet** button
   - Network instantly switches

6. **Deploy Production Collection**
   - Create your real collection
   - Generate NFTs
   - Go to Launch → Step 5
   - Deploy (costs ~0.16 real SOL)
   - Launch for production!

---

## Network Isolation

**Important:** Collections deployed on one network stay on that network forever!

- Collections deployed on devnet = devnet only
- Collections deployed on mainnet = mainnet only
- No cross-network compatibility

**Best Practice:**
1. Test everything on devnet first
2. Once confident, switch to mainnet
3. Deploy your production collections on mainnet

---

## RPC Endpoints

### Default Endpoints

**Devnet:**
```
https://api.devnet.solana.com
```

**Mainnet:**
```
https://api.mainnet-beta.solana.com
```

### Upgrade to Paid RPC (Recommended for Production)

For better performance on mainnet, use a paid RPC provider:

**Helius:**
```
https://rpc.helius.xyz/?api-key=YOUR_KEY
```

**QuickNode:**
```
https://solana-mainnet.quicknode.pro/YOUR_KEY
```

**Triton:**
```
https://solana-mainnet.rpc.triton.one/?api_key=YOUR_KEY
```

Update in **Admin → Site Settings → Mainnet RPC Endpoint**

---

## Files Modified

1. **`lib/solana/connection.ts`**
   - Added `getConnectionAsync()` - Reads from database
   - Added `getClusterAsync()` - Gets current network
   - Added `getExplorerUrlAsync()` - Dynamic explorer URLs
   - Added `clearConnectionCache()` - Clears cache when settings change
   - Keeps sync versions for backward compatibility

2. **`app/admin/site-settings/page.tsx`**
   - Added Solana network switching UI
   - Added network status display
   - Added RPC endpoint configuration
   - Shows warning about network changes

3. **`scripts/migrations/117_add_solana_network_setting.sql`**
   - Added 3 new site settings
   - Default to devnet for safety

---

## Database Schema

```sql
-- site_settings table
INSERT INTO site_settings (setting_key, setting_value, description) VALUES
('solana_network', '"devnet"', 'devnet or mainnet-beta'),
('solana_rpc_devnet', '"https://api.devnet.solana.com"', 'Devnet RPC'),
('solana_rpc_mainnet', '"https://api.mainnet-beta.solana.com"', 'Mainnet RPC');
```

---

## API Integration

### Server-Side (API Routes)

```typescript
import { getConnectionAsync, getClusterAsync } from '@/lib/solana/connection'

// In your API route
const connection = await getConnectionAsync()
const network = await getClusterAsync()
console.log(`Using ${network} network`)
```

### Client-Side (Frontend)

```typescript
// Fetch current network
const response = await fetch('/api/admin/site-settings?key=solana_network')
const data = await response.json()
const network = data.value // "devnet" or "mainnet-beta"
```

---

## Caching & Performance

- Settings cached for 1 minute in memory
- Reduces database queries
- Automatic refresh when cache expires
- Call `clearConnectionCache()` to force refresh

---

## Testing Checklist

### Devnet Testing
- [ ] Switch to devnet in admin panel
- [ ] Get devnet SOL from faucet
- [ ] Deploy test collection
- [ ] Mint test NFT
- [ ] Verify on Solscan (devnet)
- [ ] Check all transactions show as devnet

### Mainnet Launch
- [ ] Verify devnet tests passed
- [ ] Switch to mainnet in admin panel
- [ ] Ensure wallet has real SOL (~0.2 SOL minimum)
- [ ] Deploy production collection
- [ ] Verify on Solscan (mainnet)
- [ ] Test production mint
- [ ] Monitor transactions

---

## Important Notes

### ⚠️ Network Changes

- **Instant Effect**: Network change applies immediately to new operations
- **No Retroactive**: Existing collections stay on their deployed network
- **Database Tracked**: Each collection stores which network it was deployed on
- **Explorer URLs**: Automatically show correct network (devnet.solscan.io vs solscan.io)

### ⚠️ Wallet Switching

Make sure your wallet is on the correct network:
- Phantom/Solflare usually auto-detect
- Check wallet network matches admin setting
- Testnet wallets may not work on mainnet

### ⚠️ SOL Requirements

**Devnet:**
- Free SOL from faucet
- ~2 SOL is plenty for testing

**Mainnet:**
- Real SOL required
- ~0.2 SOL minimum for testing
- ~0.16 SOL per collection deployment

---

## Migration Summary

**Migration 117** added 3 settings:
```
✅ solana_network: devnet
✅ solana_rpc_devnet: https://api.devnet.solana.com
✅ solana_rpc_mainnet: https://api.mainnet-beta.solana.com
```

**Files Created:**
1. `scripts/migrations/117_add_solana_network_setting.sql`
2. `scripts/run-solana-network-setting-migration.js`
3. `SOLANA_NETWORK_SWITCHING_COMPLETE.md` (this file)

**Files Modified:**
1. `lib/solana/connection.ts` - Dynamic network loading
2. `app/admin/site-settings/page.tsx` - Network switching UI

---

## Next Steps

1. ✅ Migration run (defaulted to devnet)
2. ✅ Admin UI added for switching
3. ✅ Connection code reads from database
4. 📋 **Your Turn:** Go to Admin → Site Settings
5. 📋 **Your Turn:** Start on devnet, deploy test collection
6. 📋 **Your Turn:** Once confident, switch to mainnet!

---

🎉 **Network switching is ready! Start testing on devnet, then launch on mainnet when ready!**
