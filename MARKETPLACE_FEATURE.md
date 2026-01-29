# Collection Marketplace Feature

## Overview
A complete marketplace system where users can sell entire collections (as generated images, before inscription) for credits. This adds a third launch option alongside self-inscribe and launchpad.

## What Was Built

### 1. Database Schema
**New Tables:**
- `collection_marketplace_listings` - Stores active/sold marketplace listings
- `marketplace_transactions` - Records all purchase transactions with credit tracking
- `marketplace_seller_violations` - Fraud prevention system to ban repeat sellers

**New Columns on `collections`:**
- `marketplace_listing_id` - References active listing
- `marketplace_status` - 'listed' or 'sold'

**Database Functions:**
- `is_seller_banned()` - Checks if seller is banned from marketplace
- `transfer_collection_ownership()` - Atomically transfers collection to buyer

### 2. API Endpoints

**GET /api/marketplace/listings**
- Browse all active marketplace listings
- Filter by seller, status
- Returns collection details, sample images, promo materials

**POST /api/marketplace/listings**
- Create a new marketplace listing
- Validates: collection is locked, seller owns it, terms accepted
- Prevents selling same collection twice (auto-ban violators)

**GET /api/marketplace/listings/[id]**
- Get detailed information about a specific listing
- Shows sample images, promotional materials, full description

**PATCH /api/marketplace/listings/[id]**
- Update listing details (price, title, description)
- Cancel listing (action: 'cancel')

**POST /api/marketplace/purchase**
- Purchase a collection with credits
- Validates buyer has sufficient credits
- Atomically transfers credits and ownership
- Creates transaction records

### 3. Launch Page - Third Option

**Location:** `/collections/[id]/launch`

The launch page now has **3 options** in a grid:

1. **Self-Inscribe** ⚡ - Inscribe yourself in batches
2. **Launchpad Launch** 🚀 - Let collectors mint
3. **Sell on Marketplace** 💰 - **NEW!** Sell collection for credits

**Marketplace Interface includes:**
- Listing title and description fields
- Price input (in credits)
- Ability to include promotional materials from your promo history
- **Terms and conditions** with checkbox:
  - Can only sell each collection ONCE
  - Attempting multiple sales = permanent ban
  - All sales are final
  - Full ownership transfers to buyer
- Lock collection requirement (enforced)

### 4. Marketplace Browse Page

**Location:** `/marketplace`

Features:
- Grid view of all active listings
- Shows sample image, price, ordinal count, art style
- Preview of included promotional materials
- User's current credit balance displayed
- "Purchase" button (validates credits, ownership)
- Links to detailed listing page

### 5. Marketplace Detail Page

**Location:** `/marketplace/[id]`

Features:
- Gallery of sample images from collection
- Full promotional materials display
- Detailed pricing and balance info
- Complete description and collection details
- "What You Get" benefits list
- Purchase button with full validation

## Key Features

### Terms & Conditions
Users must explicitly accept terms before listing:
- Collection can only be sold to ONE buyer
- Seller agrees not to sell collection to anyone else (on or off platform)
- Sales are final, no refunds
- Full ownership and all rights transfer on purchase
- Cannot modify collection while listed
- Violations may result in account suspension (admin enforced)

### Fraud Prevention (Admin Tools)
- **Violation Tracking Table:** Records seller violations for manual admin review
- **Transaction History:** All sales tracked in `marketplace_transactions`
- **Seller History:** Can check if seller previously sold collections
- Admin can manually ban sellers using `marketplace_seller_violations` table

### Credit System Integration
- Purchases deduct from buyer credits
- Sales add to seller credits
- All transactions tracked with before/after balances
- Insufficient credit validation
- Transaction history in `marketplace_transactions`

### Collection Ownership Transfer
- Atomic transfer prevents race conditions
- Updates collection `wallet_address`
- Sets `marketplace_status` to 'sold'
- Marks listing as 'sold' with buyer info
- Prevents collection from being sold again

## How to Use

### As a Seller:
1. Go to your collection's launch page (`/collections/[id]/launch`)
2. Select "Sell on Marketplace" option
3. Lock your collection if not already locked
4. Fill in listing details (title, description, price)
5. Optionally select promotional images to include
6. Read and accept the terms and conditions
7. Click "List on Marketplace"
8. Your collection appears at `/marketplace`

### As a Buyer:
1. Browse marketplace at `/marketplace`
2. Click on a listing to see details
3. Review sample images, description, price
4. Ensure you have enough credits
5. Click "Purchase"
6. Collection transfers to your account
7. You can now generate more, inscribe, or launch it

## Files Created/Modified

### New Files:
- `scripts/migrations/043_create_marketplace_system.sql`
- `scripts/run-marketplace-migration.js`
- `app/api/marketplace/listings/route.ts`
- `app/api/marketplace/listings/[id]/route.ts`
- `app/api/marketplace/purchase/route.ts`
- `app/marketplace/page.tsx`
- `app/marketplace/[id]/page.tsx`

### Modified Files:
- `app/collections/[id]/launch/page.tsx` - Added third marketplace option

## Security & Safety

1. **Collection must be locked** before listing
2. **Ownership validation** on all operations
3. **Atomic transactions** for purchases
4. **Credit validation** before purchase
5. **Transaction logging** for audit trail
6. **Terms acceptance** required and tracked
7. **Violation tracking** for admin review
8. **Manual admin enforcement** of rules

## Database Migration

Run: `node scripts/run-marketplace-migration.js`

This creates:
- 3 new tables
- 2 new columns on collections
- 8 indexes for performance
- 4 foreign key constraints
- 2 PostgreSQL functions

## What Buyers Get

When purchasing a collection:
- ✅ Full ownership of all generated images
- ✅ Ability to generate MORE images in same style
- ✅ Rights to self-inscribe or launch on launchpad
- ✅ All included promotional materials
- ✅ Complete collection control

## Business Logic

**Seller Protection:**
- Can cancel listing anytime before sale
- Gets full credit amount immediately on sale
- Terms and conditions protect against disputes

**Buyer Protection:**
- Clear "what you get" information
- Sample images shown before purchase
- Credit balance validation prevents overspending
- Seller agreement tracked with timestamp

**Platform Protection:**
- Terms acceptance required and timestamped
- Transaction logging for disputes
- Violation tracking table for admin review
- Manual admin enforcement when needed
