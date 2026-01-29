# Mint Administration System

## Overview

A comprehensive admin system for managing collection mint launches, monitoring inscriptions, detecting stuck transactions, and performing test mints. Built on top of the existing tapscript inscription minting infrastructure.

---

## Features

### 1. **Collection Mint Launches**
- Lock collections from editing before launch
- Create mint launches with pricing, supply limits, and configurations
- Schedule launches or activate immediately
- Pause, resume, or complete launches
- Track revenue and unique minters

### 2. **Inscription Tracking**
- Real-time monitoring of all mint inscriptions
- Track status through entire lifecycle:
  - `pending` → `commit_created` → `commit_broadcast` → `commit_confirmed`
  - → `reveal_created` → `reveal_broadcast` → `reveal_confirmed` → `completed`
- View transaction links on mempool.space and ordinals.com
- Filter by status, collection, minter, test mints, or flagged items

### 3. **Stuck Transaction Detection**
- Automatic detection of transactions stuck for 30+ minutes
- Current vs recommended fee rate comparison
- Resolution actions: Mark Resolved, Request RBF, Request CPFP, Abandon
- Tracks resolution history and admin actions

### 4. **Test Mint System**
- Test mint any ordinal from a collection (dry run)
- Verifies image compression (WebP 666x666)
- Shows cost calculation breakdown
- Creates taproot address for verification
- Stores test mint records for tracking

### 5. **Loss Prevention**
- Flagging system for suspicious mints
- Admin notes on inscriptions
- Refund tracking
- Complete audit trail via activity log

---

## Database Schema

### New Tables Created

1. **`collection_mint_launches`** - Tracks launch configurations
2. **`mint_inscriptions`** - Individual inscription records  
3. **`mint_whitelist`** - Whitelist entries for launches
4. **`mint_activity_log`** - Audit trail
5. **`stuck_transactions`** - Stuck tx tracking

### New Columns Added to `collections`
- `is_locked` - Boolean for locking editing
- `locked_at` - Timestamp
- `locked_by` - Admin wallet
- `active_launch_id` - Reference to current launch

---

## API Endpoints

### Dashboard & Overview
```
GET /api/admin/mints?wallet_address=<admin_wallet>
```
Returns overall stats, recent inscriptions, stuck transactions, active launches.

### Launches
```
GET  /api/admin/mints/launches - List all launches
POST /api/admin/mints/launches - Create a new launch
GET  /api/admin/mints/launches/[id] - Get launch details
PATCH /api/admin/mints/launches/[id] - Update launch (status, settings)
DELETE /api/admin/mints/launches/[id] - Delete draft launch
```

### Inscriptions
```
GET /api/admin/mints/inscriptions - List with filters
GET /api/admin/mints/inscriptions/[id] - Get details
PATCH /api/admin/mints/inscriptions/[id] - Admin actions
```

**Admin Actions:**
- `flag_for_review` - Flag inscription
- `unflag` - Remove flag
- `mark_stuck` - Manually mark as stuck
- `retry` - Reset for retry
- `cancel` - Cancel inscription
- `mark_refunded` - Record refund
- `add_note` - Add admin note

### Collections
```
GET  /api/admin/mints/launchable-collections - Get collections for launch
POST /api/admin/mints/launchable-collections - Lock/unlock collection
```

### Test Mints
```
GET  /api/admin/mints/test-mint - List test mints
POST /api/admin/mints/test-mint - Create test mint
```

### Stuck Transactions
```
GET  /api/admin/mints/stuck?detect=true - Get stuck txs, optionally run detection
POST /api/admin/mints/stuck - Take action on stuck tx
```

**Actions:**
- `mark_resolved` - Tx confirmed
- `abandon` - Give up on tx
- `request_rbf` - Mark RBF requested
- `request_cpfp` - Mark CPFP requested

---

## Admin Dashboard UI

Access at: `/admin/mints`

### Tabs

1. **📊 Overview** - Stats cards, recent inscriptions
2. **🚀 Launches** - Manage mint launches
3. **📜 Inscriptions** - Browse all inscriptions with filters
4. **⚠️ Stuck Txs** - Handle stuck transactions
5. **📁 Collections** - Lock/unlock, create launches
6. **🧪 Test Mint** - Dry run mint testing

---

## Running the Migration

```bash
cd scripts
node run-mint-launch-migration.js
```

Or run the SQL directly:
```bash
psql $DATABASE_URL < scripts/migrations/032_create_mint_launch_system.sql
```

---

## Mint Flow (For Reference)

### Launch Flow
1. Admin locks collection for editing
2. Admin creates mint launch with settings
3. Admin activates launch
4. Users can mint (via frontend mint page - separate implementation)
5. Admin monitors mints, handles stuck txs
6. Admin completes or cancels launch

### Single Mint Flow (Tapscript)
1. **Compress** - Image → WebP 666×666
2. **Create Commit** - Generate keypair, taproot address, PSBT
3. **Sign Commit** - User signs PSBT in wallet
4. **Broadcast Commit** - Send to network
5. **Wait Confirm** - Poll mempool for confirmation
6. **Create Reveal** - Sign reveal tx on server
7. **Broadcast Reveal** - Send to network
8. **Complete** - Inscription confirmed

---

## Cost Calculation

From existing system (see `MINT_COST_CALCULATIONS.md`):

```
revealTxFee = vSize × feeRate
baseRevealCost = revealTxFee + 330 (inscription output)
safetyBuffer = baseRevealCost × 0.15 (15%)
revealSatsNeeded = baseRevealCost + safetyBuffer
totalCost = commitTxFee + revealSatsNeeded
```

---

## Security

- All admin endpoints require wallet authorization
- Wallet addresses verified against `AUTHORIZED_WALLETS` list
- All actions logged to `mint_activity_log`
- Sensitive keys stored in database (consider encryption for production)

---

## Future Enhancements

1. **Public Mint Page** - Frontend for users to mint
2. **RBF/CPFP Implementation** - Actually create bump transactions
3. **Refund Processing** - Automated refunds for failed mints
4. **Webhook Notifications** - Alert on stuck/failed mints
5. **Analytics Dashboard** - Revenue charts, minter stats
6. **Whitelist Management UI** - Upload CSV, manage WL
7. **Batch Operations** - Bulk cancel, refund, etc.

---

## Files Created

### Migrations
- `scripts/migrations/032_create_mint_launch_system.sql`
- `scripts/run-mint-launch-migration.js`

### API Routes
- `app/api/admin/mints/route.ts` - Dashboard overview
- `app/api/admin/mints/launches/route.ts` - List/create launches
- `app/api/admin/mints/launches/[id]/route.ts` - Launch CRUD
- `app/api/admin/mints/inscriptions/route.ts` - List inscriptions
- `app/api/admin/mints/inscriptions/[id]/route.ts` - Inscription actions
- `app/api/admin/mints/launchable-collections/route.ts` - Collection management
- `app/api/admin/mints/test-mint/route.ts` - Test minting
- `app/api/admin/mints/stuck/route.ts` - Stuck tx handling

### UI
- `app/admin/mints/page.tsx` - Full admin dashboard

---

## Integration with Existing System

This admin system integrates with your existing:
- `lib/inscription-utils.ts` - Tapscript inscription utilities
- `lib/database.ts` - Neon database connection
- `lib/auth/access-control.ts` - Admin authorization
- Compression system (sharp, WebP 666×666)
- Mempool API for confirmation tracking
- Your documented tapscript minting flow

