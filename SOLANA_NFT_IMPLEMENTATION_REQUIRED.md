# ⚠️ CRITICAL: Solana NFT Implementation Required

## Current State Analysis

### ✅ What's Complete:
- Frontend UI updated to Solana terminology
- Wallet connection works with Solana wallets
- Credit purchase works with SOL payments
- Database configured for Solana addresses
- Admin system functional

### ❌ What's MISSING - The Entire Minting Backend:

**The launchpad backend is 100% built for Bitcoin Ordinals, not Solana NFTs.**

## Evidence:

### 1. Database Schema (Bitcoin Ordinals-Specific)
`mint_inscriptions` table has:
- `commit_tx_id`, `commit_psbt`, `commit_output_index` ← Bitcoin commit transaction
- `reveal_tx_id`, `reveal_hex`, `reveal_fee_sats` ← Bitcoin reveal transaction  
- `inscription_id`, `inscription_number` ← Ordinals inscription tracking
- `reveal_data`, `inscription_priv_key`, `taproot_address` ← Tapscript data
- `fee_rate` (sat/vB), `total_cost_sats` ← Bitcoin fee calculation
- Status: 'commit_created', 'commit_broadcast', 'reveal_broadcast' ← Bitcoin 2-step process

### 2. API Routes (127 Bitcoin References)
Found across 19 API files:
- commit_tx tracking
- reveal_tx tracking
- PSBT handling
- Tapscript operations

### 3. Minting Flow (Bitcoin Ordinals)
Current system:
1. User pays in BTC
2. Backend creates PSBT for commit transaction
3. User signs PSBT
4. Backend broadcasts commit tx
5. Backend creates reveal transaction with tapscript
6. Backend broadcasts reveal tx
7. Inscription created on Bitcoin

**This does NOT work for Solana NFTs at all.**

---

## What Needs to Be Built for Solana NFTs

### Phase 1: Core NFT Minting Infrastructure

#### 1.1 Candy Machine Deployment System

**Files to Create:**
- `lib/solana/candy-machine.ts` - Candy Machine creation and management
- `lib/solana/metadata.ts` - NFT metadata handling
- `app/api/collections/[id]/deploy-candy-machine/route.ts` - Deploy CM for collection

**What It Does:**
```typescript
// When owner clicks "Launch Collection":
1. Upload all NFT images + metadata to Arweave/IPFS/Shadow Drive
2. Create collection NFT on-chain (using Metaplex)
3. Deploy Candy Machine v3 with:
   - Collection mint address
   - Total supply
   - Go-live date
   - Price per mint (in lamports)
   - Creator royalties
   - Guards (whitelist, mint limit, etc.)
4. Save candy_machine_address to database
5. Fund Candy Machine with rent-exempt balance
```

**Who Pays:**
- Collection owner pays for:
  - Candy Machine deployment (~0.1-0.2 SOL)
  - Collection NFT creation (~0.01 SOL)
  - Storage/rent (~0.02 SOL per NFT)
  - Metadata storage (varies)

#### 1.2 NFT Minting Transaction Builder

**Files to Create:**
- `lib/solana/mint-transaction.ts` - Build mint transactions
- `app/api/launchpad/[collectionId]/mint/route.ts` - Create mint transaction for user

**What It Does:**
```typescript
// When user clicks "Mint NFT":
1. Verify phase eligibility (time, whitelist, supply)
2. Reserve NFT from available supply
3. Build Candy Machine mint transaction:
   - Use Metaplex SDK
   - Add mint price payment instruction
   - Add platform fee instruction (optional)
   - Add any guard instructions (whitelist proof, etc.)
4. Return serialized transaction for user to sign
5. User signs in wallet
6. Frontend broadcasts transaction
7. Backend polls for confirmation
8. Update database: mark NFT as minted
```

**Who Pays:**
- User pays for:
  - NFT mint price (set by collection owner)
  - Solana transaction fee (~0.00001 SOL)
  - Optional platform fee

#### 1.3 Metadata Management

**Files to Create:**
- `lib/solana/storage.ts` - Upload to Arweave/Shadow Drive
- `lib/solana/metadata-builder.ts` - Build Metaplex metadata JSON
- `app/api/collections/[id]/upload-metadata/route.ts` - Batch upload

**What It Does:**
```typescript
// Before deploying Candy Machine:
1. For each NFT in collection:
   - Upload image to permanent storage (Arweave/Shadow Drive)
   - Create metadata JSON with:
     - name, symbol, description
     - image URI
     - attributes (traits)
     - creator royalties
   - Upload metadata JSON to storage
   - Get metadata URI
2. Create master metadata array for Candy Machine config
```

**Who Pays:**
- Collection owner pays for:
  - Arweave storage (~$2-5 per 1000 images)
  - OR Shadow Drive (~$1 per GB/year)
  - OR IPFS (varies, can be free)

### Phase 2: Phase & Whitelist Management

#### 2.1 Candy Machine Guards Configuration

**Files to Create:**
- `lib/solana/guards.ts` - Configure Candy Machine guards
- `app/api/launchpad/[collectionId]/update-guards/route.ts` - Update guards for phases

**What It Does:**
```typescript
// Candy Machine v3 Guards:
1. startDate - When minting begins
2. endDate - When minting ends
3. solPayment - Mint price in lamports
4. mintLimit - Max per wallet
5. allowList - Whitelist Merkle tree
6. freezeSolPayment - Freeze until reveal
7. And 20+ more guards available

// For multi-phase launches:
- Use Candy Machine "Groups" feature
- Each group = a phase with different guards
- Switch active group at phase start times
```

#### 2.2 Whitelist Merkle Tree Generation

**Files to Create:**
- `lib/solana/merkle-tree.ts` - Generate Merkle trees for whitelists
- `app/api/launchpad/[collectionId]/whitelists/[id]/generate-proof/route.ts` - Get proof for wallet

**What It Does:**
```typescript
// When owner creates whitelist:
1. Generate Merkle tree from wallet addresses
2. Store Merkle root on Candy Machine guard
3. When user mints:
   - Generate Merkle proof for their address
   - Include proof in mint transaction
   - Candy Machine verifies proof on-chain
```

### Phase 3: Transaction Processing & Monitoring

#### 3.1 Mint Transaction Processor

**Files to Create:**
- `app/api/cron/process-mint-transactions/route.ts` - Background processor
- `lib/solana/mint-monitor.ts` - Monitor transaction confirmations

**What It Does:**
```typescript
// Continuously running cron job:
1. Check pending mint sessions
2. Verify transactions on-chain
3. Update mint_nfts status
4. Award NFT ownership in database
5. Handle failed transactions
6. Track platform fees collected
```

#### 3.2 Signature Verification

**Files to Update:**
- All launchpad APIs need Solana signature verification
- Replace Bitcoin PSBT verification with Solana message signing

---

## Migration Path: Bitcoin Ordinals → Solana NFTs

### Option A: Full Replacement (Recommended)

**Effort:** 3-4 weeks of development
**Risk:** Medium - requires rewriting entire minting backend

**Steps:**
1. Design new database schema for Solana mints
2. Implement Metaplex/Candy Machine integration
3. Build metadata upload pipeline
4. Create transaction builder & monitor
5. Implement phase/whitelist guards
6. Test thoroughly on devnet
7. Deploy to mainnet

**New Database Tables:**
```sql
CREATE TABLE candy_machines (
  id UUID PRIMARY KEY,
  collection_id UUID NOT NULL,
  candy_machine_address TEXT NOT NULL,
  collection_mint_address TEXT NOT NULL,
  authority_wallet TEXT NOT NULL,
  items_available INTEGER NOT NULL,
  items_redeemed INTEGER DEFAULT 0,
  go_live_date TIMESTAMPTZ,
  metadata_uris JSONB, -- Array of metadata URIs
  guards_config JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE nft_mints (
  id UUID PRIMARY KEY,
  session_id UUID,
  collection_id UUID NOT NULL,
  candy_machine_address TEXT NOT NULL,
  nft_mint_address TEXT, -- The minted NFT's address
  minter_wallet TEXT NOT NULL,
  mint_tx_signature TEXT,
  mint_price_lamports BIGINT,
  platform_fee_lamports BIGINT,
  mint_status TEXT DEFAULT 'pending',
  confirmed_at TIMESTAMPTZ,
  metadata_uri TEXT,
  token_account TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Option B: Dual System (Bitcoin + Solana)

**Effort:** 2-3 weeks
**Risk:** Low - keep existing Bitcoin system, add Solana alongside

**Steps:**
1. Add `blockchain_type` column to collections ('bitcoin' | 'solana')
2. Route to appropriate minting logic based on type
3. Keep existing Bitcoin Ordinals code
4. Add new Solana NFT code
5. Both systems coexist

### Option C: UI-Only (Current State)

**Effort:** Complete ✅
**Risk:** High - non-functional for actual minting

**Current State:**
- UI says "Solana NFTs"
- Backend actually does Bitcoin Ordinals
- **Will fail when users try to mint**

---

## Detailed Implementation Plan (Option A)

### Week 1: Metaplex Integration

**Day 1-2: Setup & Collection Creation**
- [ ] Install Metaplex SDK dependencies
- [ ] Create collection NFT creation function
- [ ] Test collection creation on devnet
- [ ] Store collection mint address in database

**Day 3-4: Metadata Upload Pipeline**
- [ ] Choose storage (Arweave/Shadow Drive/Bundlr)
- [ ] Implement image upload function
- [ ] Implement metadata JSON creation
- [ ] Batch upload all collection assets
- [ ] Store metadata URIs in database

**Day 5: Candy Machine Deployment**
- [ ] Implement Candy Machine v3 creation
- [ ] Configure basic guards (price, go-live)
- [ ] Test deployment on devnet
- [ ] Create admin API to deploy CM

### Week 2: Minting Functionality

**Day 6-7: Mint Transaction Builder**
- [ ] Build mint instruction using Metaplex SDK
- [ ] Add payment instruction (SOL transfer)
- [ ] Add platform fee instruction (optional)
- [ ] Return transaction to frontend

**Day 8-9: Frontend Minting Flow**
- [ ] Add Solana transaction signing to frontend
- [ ] Handle transaction broadcast
- [ ] Show transaction confirmation
- [ ] Update UI on success/failure

**Day 10: Database Updates**
- [ ] Create new mint tracking tables
- [ ] Update collection status logic
- [ ] Track minted NFTs
- [ ] Update supply counts

### Week 3: Advanced Features

**Day 11-12: Multi-Phase System**
- [ ] Implement Candy Machine Groups
- [ ] Create phase switching logic
- [ ] API to update active group
- [ ] Test phase transitions

**Day 13-14: Whitelist System**
- [ ] Generate Merkle trees from whitelist
- [ ] Configure allowList guard
- [ ] API to generate Merkle proofs
- [ ] Test whitelist minting

**Day 15: Monitoring & Cron Jobs**
- [ ] Create transaction monitor
- [ ] Cron job to check confirmations
- [ ] Failed transaction handler
- [ ] Stuck transaction detection

### Week 4: Testing & Deployment

**Day 16-18: Comprehensive Testing**
- [ ] Test on devnet thoroughly
- [ ] Test all phase types
- [ ] Test whitelist minting
- [ ] Test concurrent mints
- [ ] Load testing

**Day 19-20: Mainnet Preparation**
- [ ] Audit security
- [ ] Set up monitoring/alerts
- [ ] Deploy to mainnet
- [ ] Create admin tools

---

## Key Technical Decisions Needed

### 1. Storage Provider
**Options:**
- **Arweave** - Permanent, expensive upfront (~$5 per 1000 images)
- **Shadow Drive** - Solana-native, cheaper (~$1/GB/year)
- **Bundlr** - Fast, scalable, moderately priced
- **IPFS + Pinata** - Cheapest, not truly permanent

**Recommendation:** Shadow Drive (Solana-native, affordable, permanent-ish)

### 2. Who Deploys Candy Machine?
**Options:**
- **Collection Owner** - They pay all deployment costs
- **Platform (Admin)** - Platform pays, charges owner later
- **Hybrid** - Owner approves, platform executes

**Recommendation:** Collection Owner deploys using their wallet
- Gives them full control
- They pay costs directly
- Platform just provides the interface

### 3. Platform Fees
**Options:**
- **No fee** - Platform makes money from credit sales only
- **Mint fee** - X lamports per mint (added to price)
- **Royalty share** - Take % of secondary sales

**Recommendation:** Optional mint fee (0.01-0.05 SOL per mint)
- Configurable per collection
- Goes to platform wallet
- Separate from creator's mint price

### 4. Royalty Enforcement
**Options:**
- **On-chain (Metaplex)** - Enforced by Metaplex standard
- **Off-chain (marketplaces)** - Honor system
- **Programmable NFTs** - Use Token Extensions

**Recommendation:** Metaplex on-chain royalties
- Set creator royalties in collection NFT
- Marketplaces auto-honor it
- Simple, standard approach

---

## Required Dependencies

### NPM Packages (Install These):
```bash
npm install @metaplex-foundation/mpl-candy-machine
npm install @metaplex-foundation/mpl-token-metadata
npm install @metaplex-foundation/umi
npm install @metaplex-foundation/umi-bundle-defaults
npm install @metaplex-foundation/umi-uploader-bundlr # For metadata upload
npm install @solana/spl-token
```

**Already installed:** ✅ (I see them in package.json)

---

## Backend Files That Need Complete Rewrite

### APIs (19 files - ~127 Bitcoin references):
1. `app/api/launchpad/[collectionId]/reserve/route.ts` ← Needs Solana logic
2. `app/api/launchpad/[collectionId]/mints/route.ts` ← Needs Solana tracking
3. `app/api/mint/create-nft/route.ts` ← Needs Candy Machine mint builder
4. `app/api/admin/mints/*` ← All need Solana versions
5. Plus 14 more files...

### Libraries (Need to Create):
1. `lib/solana/candy-machine-deploy.ts` ← NEW: Deploy Candy Machines
2. `lib/solana/mint-transaction.ts` ← NEW: Build mint transactions
3. `lib/solana/metadata-upload.ts` ← NEW: Upload to storage
4. `lib/solana/guards-config.ts` ← NEW: Configure CM guards
5. `lib/solana/merkle-tree.ts` ← NEW: Whitelist Merkle trees
6. `lib/solana/collection-nft.ts` ← NEW: Create collection NFTs

---

## Step-by-Step: What Happens When Owner Launches Collection

### Current System (Bitcoin Ordinals - DOESN'T WORK FOR SOLANA):
```
1. Owner fills out launch form
2. Backend stores settings in database
3. When user mints:
   - Backend creates commit PSBT
   - User signs with Bitcoin wallet
   - Backend broadcasts commit tx
   - Backend creates reveal tx with tapscript
   - Ordinal inscribed on Bitcoin
```

### What SHOULD Happen (Solana NFTs - NEEDS TO BE BUILT):
```
1. Owner fills out launch form ✅ (UI exists)
2. Owner clicks "Deploy Collection" 
   → Need to build this ❌
3. Backend:
   a. Uploads all images to Shadow Drive/Arweave ❌
   b. Creates metadata JSON for each NFT ❌
   c. Uploads metadata JSONs ❌
   d. Creates collection NFT on-chain ❌
   e. Deploys Candy Machine v3 ❌
   f. Configures guards for phases ❌
   g. Saves candy_machine_address to DB ❌
4. When user mints:
   a. Frontend fetches available NFTs ❌
   b. Backend builds Candy Machine mint instruction ❌
   c. User signs transaction in Phantom ❌
   d. Frontend broadcasts ❌
   e. Backend monitors confirmation ❌
   f. Database updated with mint address ❌
```

**Status: 0% of minting backend exists for Solana**

---

## Cost Breakdown

### Per Collection Deployment:
- **Collection NFT:** ~0.01 SOL (one-time)
- **Candy Machine:** ~0.1-0.2 SOL (one-time)
- **Metadata Storage:** 
  - Arweave: ~$5 USD per 1000 images
  - Shadow Drive: ~$1 USD per GB/year
- **Rent:** ~0.002 SOL per NFT (one-time)

**Example for 1000 NFT collection:**
- Collection NFT: 0.01 SOL
- Candy Machine: 0.15 SOL
- Storage (Shadow): ~$2 USD
- Rent: 2 SOL (refundable when CM closed)
- **Total: ~2.16 SOL + $2 USD** (~$300-400 depending on SOL price)

### Per Mint (User Pays):
- **NFT creation:** Free (handled by Candy Machine)
- **Transaction fee:** ~0.00001 SOL (~$0.001)
- **Mint price:** Whatever owner set
- **Platform fee:** Optional (your choice)

### Platform Costs (if platform deploys):
- Multiply collection costs × number of collections
- Could be $100K+ for 100+ collections
- **NOT RECOMMENDED** - Let owners deploy their own

---

## Recommended Architecture

### Deployment Model: **Owner-Deployed**

**Flow:**
1. Owner creates collection on platform ✅
2. Owner generates all images using AI ✅
3. Owner configures launch settings ✅
4. Owner clicks "Deploy to Solana" 
   - Platform shows costs
   - Owner approves transaction
   - Owner's wallet pays all costs
   - Platform facilitates deployment
5. Platform tracks candy_machine_address
6. Users mint through platform UI
   - Platform builds transactions
   - Users pay mint price + tx fee
   - Platform optionally takes small fee

**Pros:**
- Platform has minimal costs
- Owners have full control
- Scales infinitely
- Simple financial model

**Cons:**
- Owners need SOL upfront
- Platform can't deploy on behalf

---

## Critical Missing Pieces

### 1. No Metaplex Integration
The app has Metaplex packages installed but **no actual usage**:
- No candy machine deployment
- No NFT metadata creation
- No mint instruction building
- No collection NFT creation

### 2. Database Schema Mismatch
Tables designed for Bitcoin:
- commit/reveal transaction tracking
- PSBTs, tapscript, inscriptions
- Need new tables for:
  - Candy Machine addresses
  - NFT mint addresses
  - Metadata URIs
  - Guard configurations

### 3. No Storage Integration
- No Arweave upload
- No Shadow Drive integration
- No IPFS pinning
- Images/metadata have nowhere to go

### 4. Transaction Flow Wrong
- Current: 2-step Bitcoin commit/reveal
- Needed: 1-step Solana mint transaction
- Completely different architecture

---

## Immediate Action Items

### 1. Be Honest with Users ⚠️
**Add warning to launch page:**
```
"Solana NFT minting is currently in development. 
You can prepare your collection, but deployment to 
Solana blockchain is not yet available."
```

### 2. Build Minimum Viable Product
**Focus on core minting:**
1. Candy Machine deployment (owner pays)
2. Basic mint transaction building
3. Transaction confirmation tracking
4. Skip advanced features initially

### 3. Or Consider Alternative
**Use existing Solana NFT platforms:**
- Integrate with Metaplex Sugar CLI
- Owner deploys CM outside platform
- Platform just tracks the address
- Users mint through Candy Machine directly

---

## Current Status: NOT READY FOR PRODUCTION

### What Works:
- ✅ Collection creation
- ✅ AI image generation
- ✅ Wallet connection
- ✅ Credit purchases
- ✅ UI/UX

### What Doesn't Work:
- ❌ Deploying collection to Solana
- ❌ Creating Candy Machine
- ❌ Uploading metadata
- ❌ Minting NFTs on-chain
- ❌ Transaction processing
- ❌ Everything blockchain-related

### Reality Check:
**The platform is a beautiful UI shell with no Solana NFT minting backend.**

All the Bitcoin Ordinals code exists but none of it works for Solana NFTs. This requires building an entirely new minting system from scratch.

---

## Recommendation

### Immediate (This Week):
1. Add "Coming Soon" warning to launch functionality
2. Disable "Go Live" button
3. Let users prepare collections but not launch
4. Be transparent this is pre-launch

### Short-term (1-2 Months):
1. Build Candy Machine deployment (owner-paid)
2. Build basic minting flow
3. Test on devnet thoroughly
4. Launch with single-phase only

### Long-term (3-6 Months):
1. Add multi-phase support
2. Add whitelist Merkle trees
3. Add advanced guards
4. Add analytics & monitoring
5. Full production ready

---

## Estimated Development Time

**Full Solana NFT Launchpad:**
- Core minting: 3-4 weeks
- Phase system: 1-2 weeks
- Whitelist system: 1 week
- Testing & deployment: 2 weeks
- **Total: 7-9 weeks (2-3 months)**

**MVP (Basic Minting Only):**
- Candy Machine deploy: 1 week
- Simple mint flow: 1 week
- Testing: 1 week
- **Total: 3 weeks**

---

## Questions for You

1. **Timeline:** When do you need this functional?
2. **Budget:** Can you hire a Solana dev or want me to guide implementation?
3. **Approach:** Full replacement or MVP first?
4. **Deployment:** Owner-paid or platform-paid?
5. **Storage:** Arweave, Shadow Drive, or IPFS?

The good news: The UI is ready. The hard work is building the Solana blockchain integration, which is a substantial backend project.
