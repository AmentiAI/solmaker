# Backend Conversion Checklist: Bitcoin Ordinals → Solana NFTs

## Overview
This document outlines every backend file/function that needs to be converted from Bitcoin Ordinals to Solana NFTs.

---

## Phase 1: Core Infrastructure (Priority: CRITICAL)

### 1.1 Candy Machine Deployment
**File to Create:** `lib/solana/candy-machine-deploy.ts`

```typescript
export async function deployCandyMachine(params: {
  collectionId: string
  collectionMintAddress: string
  itemsAvailable: number
  sellerFeeBasisPoints: number
  goLiveDate: Date
  price: number // lamports
  authority: PublicKey
}): Promise<{ candyMachineAddress: string; signature: string }>
```

**What it does:**
- Uses Metaplex SDK to create Candy Machine v3
- Sets initial guards (price, go-live date)
- Returns CM address to save in database

**Admin Flow:**
1. Owner uploads all images ✅ (already works)
2. Owner clicks "Deploy Collection"
3. Platform calls this function
4. Owner signs transaction (pays ~0.15 SOL)
5. Candy Machine created on-chain
6. Address saved to `collections.candy_machine_address`

---

### 1.2 Collection NFT Creation
**File to Create:** `lib/solana/collection-nft.ts`

```typescript
export async function createCollectionNFT(params: {
  name: string
  symbol: string
  uri: string // metadata JSON URI
  sellerFeeBasisPoints: number
  authority: PublicKey
}): Promise<{ collectionMint: string; signature: string }>
```

**What it does:**
- Creates master collection NFT (required by Metaplex)
- Sets royalty percentage
- Returns collection mint address

**Admin Flow:**
1. Owner sets collection name/symbol
2. Platform uploads collection metadata JSON
3. Owner clicks "Create Collection NFT"
4. Owner signs (pays ~0.01 SOL)
5. Collection NFT created
6. Address saved to `collections.collection_mint_address`

---

### 1.3 Metadata Upload Pipeline
**File to Create:** `lib/solana/metadata-upload.ts`

```typescript
export async function uploadCollectionMetadata(params: {
  collectionId: string
  nfts: Array<{
    id: string
    name: string
    image_url: string
    attributes: Array<{ trait_type: string; value: string }>
  }>
  storage: 'shadow' | 'arweave' | 'bundlr'
}): Promise<{ metadataUris: string[]; totalCost: number }>
```

**What it does:**
- Uploads all images to permanent storage
- Creates metadata JSON for each NFT
- Uploads metadata JSONs
- Returns array of URIs

**Admin Flow:**
1. Owner generates all images ✅
2. Owner clicks "Upload Metadata"
3. Platform estimates storage costs
4. Owner approves
5. Platform uploads everything
6. URIs stored in database

**API Endpoint Needed:**
- `POST /api/collections/[id]/upload-metadata`

---

### 1.4 Mint Transaction Builder
**File to Create:** `lib/solana/build-mint-transaction.ts`

```typescript
export async function buildMintTransaction(params: {
  candyMachineAddress: string
  minterPublicKey: PublicKey
  mintPrice: number // lamports
  platformFee?: number // lamports
  merkleProof?: number[] // For whitelist
}): Promise<{ transaction: Transaction; mintAddress: string }>
```

**What it does:**
- Builds Candy Machine mint instruction
- Adds payment instruction
- Adds platform fee (optional)
- Returns serialized transaction

**API Endpoint Needed:**
- `POST /api/launchpad/[collectionId]/mint/build-transaction`

**User Flow:**
1. User clicks "Mint NFT"
2. Platform calls this function
3. Returns transaction to frontend
4. User signs in Phantom wallet
5. Frontend broadcasts transaction
6. Platform monitors confirmation

---

## Phase 2: Database Schema Updates (Priority: HIGH)

### 2.1 Add Solana-Specific Columns

**collections table:**
```sql
ALTER TABLE collections
ADD COLUMN candy_machine_address TEXT,
ADD COLUMN collection_mint_address TEXT,
ADD COLUMN metadata_uploaded BOOLEAN DEFAULT false,
ADD COLUMN deployment_status TEXT DEFAULT 'not_deployed', -- not_deployed, deploying, deployed, failed
ADD COLUMN deployment_tx_signature TEXT,
ADD COLUMN deployed_at TIMESTAMPTZ,
ADD COLUMN deployed_by TEXT;
```

**Script:** `scripts/add-candy-machine-columns.js`

---

### 2.2 Create Solana Mints Tracking Table

```sql
CREATE TABLE solana_nft_mints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL,
  candy_machine_address TEXT NOT NULL,
  session_id UUID,
  phase_id UUID,
  
  -- NFT Details
  nft_mint_address TEXT, -- The actual NFT's address
  metadata_uri TEXT,
  token_account TEXT, -- User's token account
  
  -- User Info
  minter_wallet TEXT NOT NULL,
  
  -- Transaction
  mint_tx_signature TEXT,
  mint_price_lamports BIGINT NOT NULL,
  platform_fee_lamports BIGINT DEFAULT 0,
  
  -- Status
  mint_status TEXT DEFAULT 'pending',
  error_message TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  
  CONSTRAINT valid_status CHECK (mint_status IN ('pending', 'confirmed', 'failed'))
);

CREATE INDEX idx_solana_mints_collection ON solana_nft_mints(collection_id);
CREATE INDEX idx_solana_mints_candy_machine ON solana_nft_mints(candy_machine_address);
CREATE INDEX idx_solana_mints_minter ON solana_nft_mints(minter_wallet);
CREATE INDEX idx_solana_mints_status ON solana_nft_mints(mint_status);
```

**Script:** `scripts/create-solana-mints-table.js`

---

### 2.3 Create Metadata URIs Table

```sql
CREATE TABLE nft_metadata_uris (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL,
  ordinal_id UUID, -- Links to generated_ordinals
  nft_number INTEGER,
  
  -- Storage
  image_uri TEXT NOT NULL,
  metadata_uri TEXT NOT NULL,
  storage_provider TEXT, -- 'shadow', 'arweave', 'bundlr'
  
  -- Metadata
  metadata_json JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_metadata_uris_collection ON nft_metadata_uris(collection_id);
CREATE INDEX idx_metadata_uris_ordinal ON nft_metadata_uris(ordinal_id);
```

**Script:** `scripts/create-metadata-uris-table.js`

---

## Phase 3: API Routes (Priority: HIGH)

### 3.1 Deployment APIs

#### `POST /api/collections/[id]/deploy/upload-metadata`
```typescript
// Upload all images + metadata to storage
// Returns: { metadataUris: string[], cost: number }
```

#### `POST /api/collections/[id]/deploy/create-collection-nft`
```typescript
// Create collection NFT on-chain
// Owner signs transaction
// Returns: { collectionMint: string, signature: string }
```

#### `POST /api/collections/[id]/deploy/create-candy-machine`
```typescript
// Deploy Candy Machine
// Owner signs transaction
// Returns: { candyMachineAddress: string, signature: string }
```

#### `POST /api/collections/[id]/deploy/configure-guards`
```typescript
// Set up guards for phases/whitelists
// Owner signs transaction
// Returns: { signature: string }
```

---

### 3.2 Minting APIs

#### `POST /api/launchpad/[collectionId]/mint/build`
```typescript
// Build mint transaction for user
// Returns: { transaction: string, mintAddress: string }
```

#### `POST /api/launchpad/[collectionId]/mint/confirm`
```typescript
// User broadcasts, we verify & update database
// Body: { signature: string, mintAddress: string }
// Returns: { confirmed: boolean }
```

---

### 3.3 Monitoring APIs

#### `GET /api/launchpad/[collectionId]/mint-status`
```typescript
// Check mint confirmation status
// Returns: { confirmed: boolean, mintAddress: string }
```

#### `POST /api/cron/monitor-solana-mints`
```typescript
// Cron job to verify pending mints
// Runs every 30 seconds
```

---

## Phase 4: Frontend Integration (Priority: MEDIUM)

### 4.1 Update Collection Launch Flow

**File:** `app/collections/[id]/launch/page.tsx`

**Add Deployment Steps:**
1. ✅ Configure settings (already exists)
2. ❌ Upload metadata (NEW)
3. ❌ Create collection NFT (NEW)
4. ❌ Deploy Candy Machine (NEW)
5. ❌ Configure guards (NEW)
6. ✅ Go live (update existing)

---

### 4.2 Update Minting Flow

**File:** `app/launchpad/[collectionId]/page.tsx` (create if missing)

**User Mint Flow:**
1. User selects NFT (if choices mode)
2. User clicks "Mint"
3. Platform builds transaction
4. User signs in wallet
5. Frontend broadcasts
6. Platform confirms & updates

**Code Needed:**
```typescript
// In mint button handler:
const response = await fetch(`/api/launchpad/${collectionId}/mint/build`, {
  method: 'POST',
  body: JSON.stringify({ wallet_address, phase_id, nft_id })
})

const { transaction, mintAddress } = await response.json()

// Sign with wallet
const signed = await window.solana.signAndSendTransaction(transaction)

// Confirm
await fetch(`/api/launchpad/${collectionId}/mint/confirm`, {
  method: 'POST',
  body: JSON.stringify({ signature: signed.signature, mintAddress })
})
```

---

## Phase 5: Admin Tools (Priority: MEDIUM)

### 5.1 Candy Machine Manager
**Page:** `app/admin/candy-machines/page.tsx`

**Features:**
- View all deployed Candy Machines
- See items available vs minted
- Update guards
- Close Candy Machine (recover rent)
- Emergency controls

---

### 5.2 Deployment Dashboard
**Page:** `app/admin/deployments/page.tsx`

**Features:**
- See collections pending deployment
- Monitor deployment progress
- View deployment costs
- Retry failed deployments

---

### 5.3 Mint Monitor
**Page:** `app/admin/mints/solana/page.tsx`

**Features:**
- View all Solana mints
- Filter by collection/status
- Retry failed mints
- Export mint data

---

## Phase 6: Migration Strategy (Priority: LOW)

### 6.1 Dual Mode Support

Add column to collections:
```sql
ALTER TABLE collections
ADD COLUMN blockchain_type TEXT DEFAULT 'solana' CHECK (blockchain_type IN ('bitcoin', 'solana'));
```

Route logic based on type:
```typescript
if (collection.blockchain_type === 'solana') {
  // Use Solana Candy Machine logic
} else {
  // Use Bitcoin Ordinals logic
}
```

This allows supporting both until Bitcoin is fully deprecated.

---

## Rough Estimate: Work Required

### Core Development:
- Metaplex integration: 2-3 weeks
- API routes: 1-2 weeks  
- Database updates: 1 week
- Frontend integration: 1 week
- Testing: 2 weeks
- **Total: 7-9 weeks**

### If You Want It Faster:
- Hire Solana/Metaplex developer
- Use existing Candy Machine tools
- Integrate rather than build

---

## The Bottom Line

**Your platform is NOT ready to mint Solana NFTs on-chain.**

You have:
- ✅ Beautiful UI
- ✅ Wallet connection
- ✅ Database setup
- ✅ Credit system

You're missing:
- ❌ Candy Machine deployment
- ❌ Metadata upload
- ❌ Mint transaction building
- ❌ On-chain integration
- ❌ ~90% of the minting backend

This is a **2-3 month development project** to build properly, or a **3-4 week MVP** for basic functionality.

**Recommendation:** Add "Beta" or "Coming Soon" labels to launch features until the Solana backend is built.
