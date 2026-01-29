# Integration Guide - Add Solana Minting to Your UI

## 1. Run Migration (First Time Only)

```bash
npx dotenv -e .env.local -- node scripts/run-migration-084.js
```

---

## 2. Add Deployment to Launch Page

In `app/collections/[id]/launch/page.tsx`:

```tsx
import { SolanaDeploymentWizard } from '@/components/SolanaDeploymentWizard'

// Add this section in your launch configuration page
{collection.deployment_status !== 'deployed' && (
  <Card className="mb-6">
    <CardHeader>
      <CardTitle>Deploy to Solana</CardTitle>
      <CardDescription>
        Deploy your collection as a Candy Machine before going live
      </CardDescription>
    </CardHeader>
    <CardContent>
      <SolanaDeploymentWizard
        collectionId={collection.id}
        onComplete={() => {
          router.refresh()
          toast.success('Collection deployed successfully!')
        }}
      />
    </CardContent>
  </Card>
)}

{collection.deployment_status === 'deployed' && (
  <div className="p-4 bg-green-50 border border-green-200 rounded-lg mb-6">
    <div className="flex items-center gap-2">
      <CheckCircle2 className="h-5 w-5 text-green-600" />
      <div>
        <p className="font-medium text-green-900">Collection Deployed!</p>
        <p className="text-sm text-green-700">
          Candy Machine: {collection.candy_machine_address?.substring(0, 12)}...
        </p>
      </div>
    </div>
  </div>
)}

{/* Update "Go Live" button */}
<Button
  onClick={handleGoLive}
  disabled={collection.deployment_status !== 'deployed'}
  size="lg"
>
  {collection.deployment_status !== 'deployed' 
    ? 'Deploy to Solana First' 
    : 'Go Live'}
</Button>
```

---

## 3. Add Minting to Collection Page

In your collection detail/launchpad page:

```tsx
'use client'

import { useState } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { mintFromCandyMachine, checkMintStatus } from '@/lib/solana-deployment'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'

export default function CollectionMintPage({ collection }: { collection: any }) {
  const { publicKey, connected } = useWallet()
  const [isMinting, setIsMinting] = useState(false)
  const [mintedNft, setMintedNft] = useState<string | null>(null)

  const handleMint = async () => {
    if (!connected || !publicKey) {
      toast.error('Please connect your wallet')
      return
    }

    setIsMinting(true)

    try {
      const result = await mintFromCandyMachine(
        collection.id,
        publicKey.toBase58(),
        undefined // or pass phase_id if multi-phase
      )

      if (result.success) {
        setMintedNft(result.nftMint!)
        toast.success('NFT Minted Successfully!', {
          description: `Mint: ${result.nftMint?.substring(0, 12)}...`,
          action: {
            label: 'View on Solscan',
            onClick: () => window.open(
              `https://solscan.io/token/${result.nftMint}`,
              '_blank'
            )
          }
        })
      } else {
        toast.error('Mint Failed', {
          description: result.error
        })
      }
    } catch (error: any) {
      toast.error('Mint Failed', {
        description: error.message
      })
    } finally {
      setIsMinting(false)
    }
  }

  if (!connected) {
    return (
      <div className="text-center">
        <p className="mb-4">Connect your Solana wallet to mint</p>
        <WalletMultiButton />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {mintedNft && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-green-900 font-medium">NFT Minted!</p>
          <p className="text-sm text-green-700 mt-1">
            {mintedNft}
          </p>
        </div>
      )}

      <Button
        onClick={handleMint}
        disabled={isMinting}
        size="lg"
        className="w-full"
      >
        {isMinting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Minting...
          </>
        ) : (
          'Mint NFT'
        )}
      </Button>

      <p className="text-sm text-muted-foreground text-center">
        Mint Price: {collection.mint_price || 0} SOL + ~0.00001 SOL network fee
      </p>
    </div>
  )
}
```

---

## 4. Show Collection Status

Add deployment status indicator:

```tsx
{collection.candy_machine_address && (
  <div className="flex items-center gap-2 text-sm">
    <span className="px-2 py-1 bg-green-100 text-green-800 rounded">
      ⛓️ On-Chain
    </span>
    <span className="text-muted-foreground">
      {collection.candy_machine_address.substring(0, 8)}...
    </span>
  </div>
)}
```

---

## 5. Environment Variables

Ensure these are in `.env.local`:

```bash
# Database
DATABASE_URL=your_neon_database_url

# Solana
NEXT_PUBLIC_SOLANA_NETWORK=mainnet-beta
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# For devnet testing:
# NEXT_PUBLIC_SOLANA_NETWORK=devnet
# NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
```

---

## 6. Add Wallet Adapter (If Not Already)

In your root layout or provider:

```tsx
'use client'

import { WalletAdapterNetwork } from '@solana/wallet-adapter-base'
import { 
  ConnectionProvider, 
  WalletProvider 
} from '@solana/wallet-adapter-react'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import { PhantomWalletAdapter } from '@solana/wallet-adapter-wallets'
import { useMemo } from 'react'

require('@solana/wallet-adapter-react-ui/styles.css')

export function SolanaProvider({ children }: { children: React.ReactNode }) {
  const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK as WalletAdapterNetwork
  const endpoint = process.env.NEXT_PUBLIC_SOLANA_RPC_URL!

  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
    ],
    [network]
  )

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}
```

---

## 7. Query Deployment Status

Get collections ready to deploy:

```tsx
const collectionsNeedingDeployment = await sql`
  SELECT *
  FROM collections
  WHERE wallet_address = ${userWallet}
  AND collection_status = 'draft'
  AND deployment_status = 'not_deployed'
  AND (SELECT COUNT(*) FROM generated_ordinals WHERE collection_id = collections.id) > 0
`
```

Get deployed collections:

```tsx
const deployedCollections = await sql`
  SELECT 
    c.*,
    (SELECT COUNT(*) FROM solana_nft_mints WHERE collection_id = c.id AND mint_status = 'confirmed') as minted_count
  FROM collections c
  WHERE c.candy_machine_address IS NOT NULL
  ORDER BY c.deployed_at DESC
`
```

---

## 8. Monitor Mints in Admin

Admin dashboard query:

```tsx
const recentMints = await sql`
  SELECT 
    snm.*,
    c.name as collection_name,
    c.image_url as collection_image
  FROM solana_nft_mints snm
  JOIN collections c ON snm.collection_id = c.id
  WHERE snm.mint_status = 'confirmed'
  ORDER BY snm.confirmed_at DESC
  LIMIT 50
`
```

Pending mints:

```tsx
const pendingMints = await sql`
  SELECT 
    snm.*,
    c.name as collection_name
  FROM solana_nft_mints snm
  JOIN collections c ON snm.collection_id = c.id
  WHERE snm.mint_status IN ('pending', 'confirming')
  ORDER BY snm.created_at DESC
`
```

---

## 9. Test Deployment (Devnet)

```bash
# 1. Switch to devnet
# Update .env.local:
NEXT_PUBLIC_SOLANA_NETWORK=devnet
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com

# 2. Get devnet SOL
# Visit: https://faucet.solana.com/
# Enter your wallet address
# Get 2 SOL

# 3. Create test collection
# - Go to /collections/new
# - Create collection with 10 NFTs
# - Generate images
# - Go to launch page
# - Click "Deploy to Solana"
# - Sign transactions
# - Mint a test NFT

# 4. Verify on Solscan devnet
# Visit: https://solscan.io/?cluster=devnet
# Search for your Candy Machine address or NFT mint
```

---

## 10. Manual Monitor Trigger (Testing)

```bash
# Trigger the cron job manually to check pending mints
curl -X POST http://localhost:3000/api/cron/monitor-solana-mints

# Or in production
curl -X POST https://your-domain.com/api/cron/monitor-solana-mints
```

---

## Quick Reference

### Key Functions

```tsx
// Deploy collection
import { SolanaDeployment } from '@/lib/solana-deployment'
const deployment = new SolanaDeployment(collectionId, wallet, onUpdate)
await deployment.deploy()

// Mint NFT
import { mintFromCandyMachine } from '@/lib/solana-deployment'
const result = await mintFromCandyMachine(collectionId, wallet, phaseId)

// Check mint status
import { checkMintStatus } from '@/lib/solana-deployment'
const status = await checkMintStatus(collectionId, signature)
```

### Key API Endpoints

```bash
# Upload metadata
POST /api/collections/[id]/deploy/upload-metadata

# Create collection NFT
POST /api/collections/[id]/deploy/create-collection-nft
PUT /api/collections/[id]/deploy/create-collection-nft

# Deploy Candy Machine
POST /api/collections/[id]/deploy/create-candy-machine
PUT /api/collections/[id]/deploy/create-candy-machine

# Build mint transaction
POST /api/launchpad/[collectionId]/mint/build

# Confirm mint
POST /api/launchpad/[collectionId]/mint/confirm
GET /api/launchpad/[collectionId]/mint/confirm?signature=xxx

# Monitor mints (auto-runs every minute)
POST /api/cron/monitor-solana-mints
```

---

## That's It!

You now have everything you need to integrate Solana NFT minting into your UI.

**Next Steps:**
1. ✅ Run migration
2. ✅ Add `<SolanaDeploymentWizard />` to launch page
3. ✅ Add mint button to collection page
4. ✅ Test on devnet
5. ✅ Deploy to production

🚀 **Ready to launch!**
