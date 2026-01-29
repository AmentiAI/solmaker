# Solana NFT Implementation - Action Plan

## 🚨 CURRENT STATUS: NOT FUNCTIONAL FOR ON-CHAIN MINTING

The platform's UI is ready for Solana, but the backend still operates on Bitcoin Ordinals logic (commit/reveal transactions, tapscript, PSBTs). **Users cannot actually mint NFTs on Solana blockchain yet.**

---

## Option 1: QUICK FIX - Disable Minting (1 Hour)

**Purpose:** Be honest with users until full implementation is ready

### Steps:
1. Add warning banner to collection launch pages
2. Disable "Deploy Collection" and "Go Live" buttons
3. Add "Coming Soon - Solana Minting" message
4. Let users prepare collections but not launch yet

**Code:**
```typescript
// Add to collection launch page:
<div className="p-4 bg-yellow-100 border border-yellow-400 rounded-lg mb-6">
  <h3 className="font-bold text-yellow-800">⚠️ Solana Minting In Development</h3>
  <p className="text-yellow-700 text-sm">
    You can prepare your collection, but on-chain deployment to Solana is not yet available.
    This feature is coming soon.
  </p>
</div>
```

---

## Option 2: MVP IMPLEMENTATION (3-4 Weeks)

**Purpose:** Basic functional minting without advanced features

### What You Get:
- ✅ Deploy Candy Machine for collection
- ✅ Single-phase minting
- ✅ Basic metadata upload
- ✅ Users can mint NFTs on-chain
- ❌ No multi-phase (yet)
- ❌ No whitelist (yet)
- ❌ No advanced guards (yet)

### Week 1: Setup & Collection Deployment

#### Day 1-2: Metaplex SDK Integration
- [ ] Create `lib/solana/metaplex-config.ts`
- [ ] Create `lib/solana/collection-nft.ts`
- [ ] Test collection NFT creation on devnet

**Code Structure:**
```typescript
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { mplTokenMetadata } from '@metaplex-foundation/mpl-token-metadata'

export async function createCollectionNFT(
  name: string,
  symbol: string,
  uri: string,
  authorityKeypair: Keypair
) {
  const umi = createUmi(rpcUrl).use(mplTokenMetadata())
  
  const collectionMint = generateSigner(umi)
  
  await createNft(umi, {
    mint: collectionMint,
    name,
    symbol,
    uri,
    sellerFeeBasisPoints: percentAmount(5),
    isCollection: true,
  }).sendAndConfirm(umi)
  
  return collectionMint.publicKey
}
```

#### Day 3-4: Metadata Upload
- [ ] Choose storage (recommend Shadow Drive)
- [ ] Create `lib/solana/upload-images.ts`
- [ ] Create `lib/solana/create-metadata-json.ts`
- [ ] Create `app/api/collections/[id]/upload-metadata/route.ts`
- [ ] Test on devnet

**Storage Integration:**
```typescript
// For Shadow Drive:
import { ShadowDriveClient } from '@shadow-drive/sdk'

export async function uploadToShadowDrive(
  files: Array<{ name: string; data: Buffer }>,
  storageAccount: string
) {
  const drive = await new ShadowDriveClient(...).init()
  const uploads = await drive.uploadMultipleFiles(storageAccount, files)
  return uploads.map(u => u.finalized_location)
}
```

#### Day 5-7: Candy Machine Deployment
- [ ] Create `lib/solana/candy-machine-deploy.ts`
- [ ] Create `app/api/collections/[id]/deploy-candy-machine/route.ts`
- [ ] Add deployment UI to collection launch page
- [ ] Test full deployment on devnet

**Candy Machine Creation:**
```typescript
import { createCandyMachine } from '@metaplex-foundation/mpl-candy-machine'

export async function deployCandyMachine(
  collectionMint: PublicKey,
  itemsAvailable: number,
  sellerFeeBasisPoints: number,
  creators: Creator[],
  authority: PublicKey
) {
  const candyMachine = generateSigner(umi)
  
  await createCandyMachine(umi, {
    candyMachine,
    collectionMint,
    collectionUpdateAuthority: authority,
    itemsAvailable,
    sellerFeeBasisPoints,
    creators,
    isMutable: true,
    configLineSettings: {
      prefixName: '',
      nameLength: 32,
      prefixUri: '',
      uriLength: 200,
      isSequential: false,
    },
  }).sendAndConfirm(umi)
  
  return candyMachine.publicKey
}
```

### Week 2: Minting Flow

#### Day 8-10: Mint Transaction Builder
- [ ] Create `lib/solana/build-mint-tx.ts`
- [ ] Create `app/api/launchpad/[collectionId]/mint/build/route.ts`
- [ ] Test transaction building

**Mint Instruction:**
```typescript
import { mintV2 } from '@metaplex-foundation/mpl-candy-machine'

export async function buildMintTransaction(
  candyMachineAddress: string,
  minterPublicKey: PublicKey,
  mintPrice: number
) {
  const candyMachine = await fetchCandyMachine(umi, publicKey(candyMachineAddress))
  
  const nftMint = generateSigner(umi)
  
  const transaction = await mintV2(umi, {
    candyMachine: candyMachine.publicKey,
    nftMint,
    collectionMint: candyMachine.collectionMint,
    collectionUpdateAuthority: candyMachine.authority,
    mintArgs: {
      mintLimit: some({ id: 1 }),
    },
  }).getInstructions()
  
  // Add payment instruction if price > 0
  if (mintPrice > 0) {
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: minterPublicKey,
        toPubkey: candyMachine.authority,
        lamports: mintPrice,
      })
    )
  }
  
  return { transaction, nftMint: nftMint.publicKey }
}
```

#### Day 11-12: Frontend Mint Integration
- [ ] Update collection detail page with mint button
- [ ] Add transaction signing
- [ ] Add confirmation UI
- [ ] Handle errors

**Frontend Code:**
```typescript
async function handleMint() {
  // Get transaction from backend
  const res = await fetch(`/api/launchpad/${collectionId}/mint/build`, {
    method: 'POST',
    body: JSON.stringify({ wallet_address, phase_id }),
  })
  
  const { transaction, mintAddress } = await res.json()
  
  // Sign and send
  const { signature } = await window.solana.signAndSendTransaction(
    Transaction.from(Buffer.from(transaction, 'base64'))
  )
  
  // Wait for confirmation
  await connection.confirmTransaction(signature)
  
  // Update backend
  await fetch(`/api/launchpad/${collectionId}/mint/confirm`, {
    method: 'POST',
    body: JSON.stringify({ signature, mintAddress }),
  })
  
  toast.success('NFT Minted Successfully!')
}
```

#### Day 13-14: Database Updates & Monitoring
- [ ] Create `app/api/cron/monitor-solana-mints/route.ts`
- [ ] Update collection supply counts
- [ ] Mark NFTs as minted in database
- [ ] Handle failed transactions

### Week 3: Testing & Refinement

#### Day 15-17: Devnet Testing
- [ ] Deploy test collections
- [ ] Test minting flow end-to-end
- [ ] Test concurrent mints
- [ ] Test error scenarios
- [ ] Fix bugs

#### Day 18-19: Admin Tools
- [ ] Add Candy Machine viewer
- [ ] Add deployment status tracker
- [ ] Add mint analytics

#### Day 20-21: Polish & Deploy
- [ ] Final testing
- [ ] Update documentation
- [ ] Deploy to production
- [ ] Monitor first real launches

---

## Option 3: FULL IMPLEMENTATION (7-9 Weeks)

Everything from Option 2 plus:

### Week 4-5: Multi-Phase System
- [ ] Candy Machine Groups implementation
- [ ] Phase switching logic
- [ ] Dynamic guard updates
- [ ] Phase analytics

### Week 6: Whitelist System
- [ ] Merkle tree generation
- [ ] allowList guard configuration
- [ ] Proof generation API
- [ ] Whitelist management UI

### Week 7: Advanced Features
- [ ] Mint limit per wallet
- [ ] NFT freezing (for reveals)
- [ ] Token gating
- [ ] Time-based reveals

### Week 8-9: Production Polish
- [ ] Comprehensive testing
- [ ] Security audit
- [ ] Performance optimization
- [ ] Full admin dashboard

---

## Immediate Recommendations

### If You Want to Launch Soon:
1. **NOW:** Add "Beta" warning to launch pages
2. **Week 1:** Build MVP (Option 2)
3. **Week 2:** Test on devnet
4. **Week 3:** Launch with basic minting
5. **Ongoing:** Add features incrementally

### If You Have Time:
1. **NOW:** Disable minting features
2. **Next 2 months:** Build full system (Option 3)
3. **Then:** Launch with all features

### If You Need Help:
Consider hiring a Solana developer who knows:
- Metaplex SDK
- Candy Machine v3
- Shadow Drive/Arweave
- Token Metadata program

---

## Cost Summary

### Development:
- **MVP:** 3-4 weeks solo dev or 1-2 weeks with Solana expert
- **Full:** 7-9 weeks solo dev or 3-4 weeks with Solana expert

### Deployment (Per Collection):
- Collection NFT: 0.01 SOL
- Candy Machine: 0.15 SOL
- Metadata storage: $2-5 USD
- Rent: 2 SOL (refundable)
- **Total: ~2.2 SOL + $3** (~$300-400)

### Platform Costs:
- **If owner-paid:** $0 (owners pay their own deployment)
- **If platform-paid:** $300-400 × number of collections = $$$$

**Recommendation:** Owner-paid model

---

## Critical Path Items

**Must Have Before Launch:**
1. ✅ Wallet connection (done)
2. ❌ Candy Machine deployment
3. ❌ Metadata upload
4. ❌ Mint transaction building
5. ❌ Transaction confirmation
6. ✅ Database tracking (structure done, logic needed)

**Current Progress:** 2/6 (33%)

---

## My Assessment

The platform is:
- **UI:** 95% ready for Solana
- **Backend:** 5% ready for Solana
- **Overall:** NOT READY for production NFT minting

**You need to either:**
1. Build the Solana minting backend (2-3 months)
2. Hire someone to build it (1-2 months)
3. Partner with existing Candy Machine platform
4. Add "Coming Soon" and launch with other features first

The good news: The hard part (UI, database, wallets) is done. The remaining work is well-defined Solana blockchain integration.

Want me to start building the MVP implementation?
