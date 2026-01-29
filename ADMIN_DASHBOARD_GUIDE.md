# Solana Admin Dashboard - Complete Guide

## Overview

Comprehensive admin dashboard for monitoring and managing all Solana NFT platform operations.

**Access:** `/admin/solana`

---

## Features

### 1. Platform Overview ✅
- Platform wallet balance in real-time
- Deployed vs pending collections count
- Total mints (confirmed, pending, failed)
- Active users and credit holders
- Marketplace listings

### 2. Collections Management ✅
- View all collections with deployment status
- Filter and search collections
- See Candy Machine addresses
- Track metadata upload status
- Monitor minted vs total supply
- Direct links to Solscan

### 3. Mints Tracking ✅
- View all NFT mints across platform
- Filter by status (pending, confirmed, failed)
- See transaction signatures
- Track mint prices and platform fees
- Monitor confirmation times
- Direct links to transaction explorer

### 4. User Profiles ✅
- View all users with activity
- See credit balances
- Track collections created per user
- Monitor NFTs minted per user
- View credits purchased and spent

### 5. Marketplace Listings ✅
- View active marketplace listings
- Track listing prices and status
- Monitor marketplace activity

### 6. Generated Images ✅ (via API)
- View all generated ordinals
- Filter by collection
- See minted vs unminted
- Check metadata upload status

---

## Dashboard Layout

### Top Stats Bar
```
┌──────────────┬──────────────┬──────────────┬──────────────┬──────────────┐
│ Platform     │ Deployed     │ Total Mints  │ Active Users │ Marketplace  │
│ Wallet       │ Collections  │              │              │              │
│ 0.5000 SOL   │ 12 deployed  │ 345 confirmed│ 67 users     │ 23 listings  │
│              │ 3 pending    │ 5 pending    │ 45 w/credits │ 18 active    │
└──────────────┴──────────────┴──────────────┴──────────────┴──────────────┘
```

### Tabs Navigation
- **Overview** - Quick glance at recent activity
- **Collections** - Full collection management
- **Mints** - Detailed mint tracking
- **Profiles** - User management
- **Marketplace** - Listing management

### Search & Filter
- Real-time search across all data
- Filter by status, date, user
- Export capabilities (future)

---

## API Endpoints

### GET /api/admin/solana/stats
Get overall platform statistics.

**Response:**
```json
{
  "platformWallet": {
    "address": "Gc8bhxacwnHAhvJSTPPXvYTT5Y1iNUDky1nqbztxVE8J",
    "balance": 0.5
  },
  "collections": {
    "total": 15,
    "deployed": 12,
    "pending": 3,
    "live": 8
  },
  "mints": {
    "total": 350,
    "confirmed": 345,
    "pending": 5,
    "failed": 0
  },
  "users": {
    "total": 67,
    "with_credits": 45
  },
  "marketplace": {
    "listings": 23,
    "active": 18
  }
}
```

### GET /api/admin/solana/collections
Get all collections.

**Response:**
```json
[
  {
    "id": "uuid",
    "name": "Cool Collection",
    "description": "Amazing NFTs",
    "wallet_address": "owner_wallet",
    "candy_machine_address": "CM_address",
    "collection_mint_address": "collection_NFT_address",
    "deployment_status": "deployed",
    "collection_status": "launchpad_live",
    "total_supply": 1000,
    "minted_count": 345,
    "metadata_count": 1000,
    "ordinals_count": 1000,
    "created_at": "2024-01-01T00:00:00Z",
    "deployed_at": "2024-01-02T00:00:00Z"
  }
]
```

### GET /api/admin/solana/mints
Get all mints.

**Query Params:**
- `status` - Filter by status (pending, confirmed, failed)
- `limit` - Limit results (default: 100)

**Response:**
```json
[
  {
    "id": "uuid",
    "collection_id": "uuid",
    "collection_name": "Cool Collection",
    "candy_machine_address": "CM_address",
    "nft_mint_address": "NFT_mint_address",
    "minter_wallet": "user_wallet",
    "mint_tx_signature": "tx_sig",
    "mint_price_lamports": 100000000,
    "platform_fee_lamports": 0,
    "mint_status": "confirmed",
    "created_at": "2024-01-01T00:00:00Z",
    "confirmed_at": "2024-01-01T00:00:05Z"
  }
]
```

### GET /api/admin/solana/profiles
Get user profiles.

**Query Params:**
- `limit` - Limit results (default: 100)

**Response:**
```json
[
  {
    "wallet_address": "user_wallet",
    "credits": 500,
    "collections_count": 2,
    "mints_count": 10,
    "ordinals_count": 2000,
    "credits_purchased": 1000,
    "credits_spent": 500,
    "created_at": "2024-01-01T00:00:00Z"
  }
]
```

### GET /api/admin/solana/marketplace
Get marketplace listings.

**Response:**
```json
[
  {
    "id": "uuid",
    "collection_id": "uuid",
    "collection_name": "Cool Collection",
    "nft_mint_address": "NFT_address",
    "price": 0.5,
    "status": "active",
    "created_at": "2024-01-01T00:00:00Z"
  }
]
```

### GET /api/admin/solana/images
Get generated images/ordinals.

**Query Params:**
- `collection_id` - Filter by collection
- `minted` - Filter by minted status (true/false)
- `limit` - Limit results (default: 100)

**Response:**
```json
[
  {
    "id": "uuid",
    "collection_id": "uuid",
    "collection_name": "Cool Collection",
    "image_url": "https://...",
    "compressed_image_url": "https://...",
    "attributes": {},
    "is_minted": true,
    "metadata_uploaded": true,
    "metadata_uri": "https://...",
    "nft_mint_address": "NFT_address",
    "mint_tx_signature": "tx_sig",
    "created_at": "2024-01-01T00:00:00Z"
  }
]
```

---

## Usage Examples

### Access the Dashboard
```
https://your-domain.com/admin/solana
```

### Check Platform Wallet
The dashboard shows platform wallet balance in real-time. Click on the wallet address to view on Solscan.

### Monitor Collections
1. Go to "Collections" tab
2. Search by name or wallet address
3. Click "View" to see collection details
4. Click Solscan link to view Candy Machine on-chain

### Track Mints
1. Go to "Mints" tab
2. Filter by status (pending, confirmed, failed)
3. Search by collection, wallet, or NFT address
4. Click transaction link to view on Solscan

### View User Profiles
1. Go to "Profiles" tab
2. See all users with credits or activity
3. View credits balance and usage
4. Click wallet to view on Solscan

### Monitor Marketplace
1. Go to "Marketplace" tab
2. View all active listings
3. Track prices and status

---

## Auto-Refresh

The dashboard auto-refreshes every 30 seconds to show real-time data. Manual refresh available via the "Refresh" button.

---

## Color Coding

### Status Badges
- **Green** - Deployed, Confirmed, Active
- **Yellow** - Pending, Processing
- **Red** - Failed, Expired
- **Gray** - Draft, Cancelled

### Icons
- 💰 **Wallet** - Platform wallet
- 🚀 **Rocket** - Collections
- 🖼️ **Image** - NFTs/Mints
- 👥 **Users** - Profiles
- 🛒 **Cart** - Marketplace
- ✅ **Check** - Confirmed
- ⏰ **Clock** - Pending
- ❌ **X** - Failed

---

## Monitoring Checklist

### Daily Checks
- [ ] Platform wallet balance
- [ ] Pending mints (should be low)
- [ ] Failed mints (investigate errors)
- [ ] New collections deployed
- [ ] User credit purchases

### Weekly Checks
- [ ] Total mints trend
- [ ] Active users growth
- [ ] Marketplace activity
- [ ] Storage usage (Vercel Blob)

### Monthly Checks
- [ ] Platform revenue (wallet balance growth)
- [ ] User retention
- [ ] Collection deployment success rate
- [ ] Average mint time

---

## Troubleshooting

### Dashboard Not Loading
1. Check database connection
2. Verify all API endpoints are accessible
3. Check browser console for errors

### Stats Showing Zero
1. Run database migration if not done
2. Verify tables exist (solana_nft_mints, etc.)
3. Check RPC connection

### Mints Stuck in Pending
1. Check cron job is running (`/api/cron/monitor-solana-mints`)
2. Verify RPC endpoint is working
3. Manually trigger monitor: `POST /api/cron/monitor-solana-mints`

### Collections Not Showing
1. Verify collections table has data
2. Check candy_machine_address column exists
3. Run migration 084 if missing

---

## Database Queries

### Get Platform Stats Manually
```sql
-- Collections
SELECT 
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE candy_machine_address IS NOT NULL) as deployed
FROM collections;

-- Mints
SELECT 
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE mint_status = 'confirmed') as confirmed
FROM solana_nft_mints;

-- Users
SELECT COUNT(DISTINCT wallet_address) FROM credits WHERE credits > 0;
```

### Get Recent Activity
```sql
-- Recent mints
SELECT * FROM solana_nft_mints 
ORDER BY created_at DESC 
LIMIT 10;

-- Recent deployments
SELECT * FROM collections 
WHERE candy_machine_address IS NOT NULL 
ORDER BY deployed_at DESC 
LIMIT 10;
```

### Find Issues
```sql
-- Failed mints
SELECT * FROM solana_nft_mints 
WHERE mint_status = 'failed' 
ORDER BY created_at DESC;

-- Stuck mints
SELECT * FROM solana_nft_mints 
WHERE mint_status IN ('pending', 'confirming') 
AND created_at < NOW() - INTERVAL '10 minutes';
```

---

## Security Notes

### Access Control
- This page should be protected by authentication
- Only admins should access this dashboard
- Add middleware to verify admin role

### Example Protection (Add to page.tsx):
```typescript
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function SolanaAdminPage() {
  const router = useRouter()

  useEffect(() => {
    // Check if user is admin
    const checkAdmin = async () => {
      const res = await fetch('/api/auth/check-admin')
      if (!res.ok) {
        router.push('/')
      }
    }
    checkAdmin()
  }, [])

  // ... rest of component
}
```

### Data Privacy
- User wallet addresses are shown (public data)
- No private keys or sensitive data displayed
- All data is already on-chain (public)

---

## Future Enhancements

### Short-term
- [ ] Add export to CSV functionality
- [ ] Add date range filters
- [ ] Add charts and graphs
- [ ] Add email alerts for failed mints

### Medium-term
- [ ] Add user impersonation (for support)
- [ ] Add bulk operations (retry failed mints)
- [ ] Add collection approval workflow
- [ ] Add automated reports

### Long-term
- [ ] Add analytics dashboard
- [ ] Add revenue tracking
- [ ] Add payout management
- [ ] Add marketplace moderation

---

## Summary

✅ **Full Admin Dashboard Created:**
- `/admin/solana` - Main dashboard page
- 6 API endpoints for data fetching
- Real-time stats and monitoring
- Collections, mints, profiles, marketplace
- Auto-refresh every 30 seconds
- Search and filter capabilities
- Direct Solscan links
- Mobile responsive

✅ **Ready to Use:**
1. Navigate to `/admin/solana`
2. View real-time platform stats
3. Monitor all Solana operations
4. Track mints and collections
5. Manage user profiles

🚀 **Admin dashboard is live and ready!**
