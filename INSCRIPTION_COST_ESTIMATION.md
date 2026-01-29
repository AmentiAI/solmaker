# Real-Time Inscription Cost Estimation

## Overview

The mint UI now displays real-time inscription cost estimates based on:
- Actual file sizes of selected ordinals
- Current Bitcoin network fee rates (from mempool.space)
- Accurate transaction size calculations

## What Was Implemented

### 1. Database Changes
- **New Column**: `file_size_bytes` added to `generated_ordinals` table
- **Migration**: `scripts/migrations/011_add_file_size.sql`
- **Script**: `scripts/add-file-size-column.js` to apply the migration

### 2. New API Endpoints

#### A. Cost Estimation Endpoint
**File**: `app/api/mint/estimate-cost/route.ts`

**Endpoint**: `POST /api/mint/estimate-cost`

**Request Body**:
```json
{
  "ordinalIds": ["uuid1", "uuid2", ...],
  "feeRate": 10
}
```

**Response**:
```json
{
  "ordinalSizes": [
    { "id": "uuid1", "fileSize": 52341 },
    { "id": "uuid2", "fileSize": 48920 }
  ],
  "estimate": {
    "commitFee": 2500,
    "revealFee": 15000,
    "outputValues": 660,
    "totalCost": 18160,
    "perInscription": 9080,
    "quantity": 2,
    "feeRate": 10,
    "totalSizeBytes": 101261,
    "avgSizeBytes": 50630
  }
}
```

**Features**:
- Fetches file sizes from database (if stored)
- Falls back to fetching actual file sizes from URLs
- Caches file sizes in database for future use
- Calculates accurate inscription costs using actual content size

#### B. Batch File Size Population Endpoint
**File**: `app/api/ordinals/batch-file-sizes/route.ts`

**Endpoint**: `POST /api/ordinals/batch-file-sizes`

**Request Body**:
```json
{
  "ordinal_ids": ["uuid1", "uuid2", ...]
}
```

**Response**:
```json
{
  "success": true,
  "successful": 18,
  "skipped": 2,
  "failed": 0,
  "total": 20
}
```

**Features**:
- Runs automatically in background when mint page loads
- Checks which ordinals don't have file sizes
- Fetches actual file sizes from thumbnail/image URLs (HEAD request)
- Updates database with calculated sizes
- Skips ordinals that already have file sizes
- Non-blocking - doesn't delay page rendering

**How it works**:
1. Receives array of ordinal IDs
2. Queries database for current file sizes
3. For each ordinal without a size:
   - Fetches HEAD request to get Content-Length
   - Tries thumbnail URL first (faster), falls back to image URL
   - Updates database with file size
4. Returns summary of processed ordinals

### 3. Enhanced Mint UI

**File**: `app/mint/[collectionId]/page.tsx`

**New Features**:

#### Cost Breakdown Display
Shows detailed cost breakdown when ordinals are selected:
- **Quantity**: Number of ordinals selected
- **Total Size**: Combined file size in KB
- **Commit Fee**: Transaction fee for commit phase
- **Reveal Fee**: Transaction fee for reveal phase (based on actual content size)
- **Output Values**: 330 sats per inscription
- **Per Inscription**: Cost per individual ordinal
- **Total Cost**: Final cost in BTC and sats

#### Real-Time Updates
- Cost updates automatically when:
  - Ordinals are selected/deselected
  - Fee rate is changed
  - Network fee rates are updated

#### Loading States
- Shows "Calculating exact costs..." while fetching from API
- Falls back to estimated costs if API call fails

## How It Works

### 1. Automatic File Size Population
When the mint page loads ordinals:
1. **Background task automatically checks** which ordinals don't have file sizes
2. **Batch processes** missing file sizes using `POST /api/ordinals/batch-file-sizes`
3. **Fetches actual file sizes** from thumbnail/image URLs (HEAD request)
4. **Stores in database** for future use
5. Runs silently in the background without blocking the UI

### 2. File Size Detection for Cost Estimates
When a user selects ordinals for minting:
1. API checks database for stored `file_size_bytes`
2. If not found, fetches actual file size from image/thumbnail URL on-demand
3. Caches the size in database for future requests

This two-tier approach ensures:
- **Old ordinals**: File sizes populated automatically when browsing
- **New ordinals**: File sizes can be calculated on-demand if needed
- **No delays**: Users don't wait for file size calculations

### 3. Cost Calculation
Uses the formula from `lib/inscription-utils.ts`:

```typescript
commitTxSize = 250 + (quantity * 43)
commitFee = commitTxSize * feeRate

revealTxSize = 150 + avgContentSize + (quantity * 43)
revealFee = revealTxSize * feeRate

outputValues = quantity * 330

totalCost = commitFee + revealFee + outputValues
```

### 4. Fee Rate Integration
- Fetches current Bitcoin fee rates from mempool.space
- Auto-sets to "Fastest" by default
- Updates cost estimate when fee rate changes

## User Experience

### Before Selection
```
┌─────────────────────────────┐
│  Price Breakdown            │
├─────────────────────────────┤
│  Select ordinals to see     │
│  cost estimate              │
└─────────────────────────────┘
```

### After Selection (2 ordinals, 10 sat/vB)
```
┌─────────────────────────────┐
│  Price Breakdown            │
├─────────────────────────────┤
│  Quantity        2 ordinals │
│  Total Size         101 KB  │
│  ─────────────────────────  │
│  Commit Fee      2,500 sats │
│  Reveal Fee     15,000 sats │
│  Output Values     660 sats │
│  ─────────────────────────  │
│  Per Inscription 9,080 sats │
│  Total Cost  0.00018160 BTC │
│                18,160 sats  │
└─────────────────────────────┘
```

## Benefits

1. **Accurate Pricing**: Users see exact costs before minting
2. **No Surprises**: Real file sizes prevent underestimation
3. **Fee Transparency**: Clear breakdown of all cost components
4. **Network Aware**: Uses current Bitcoin fee rates
5. **Performance**: Caches file sizes to avoid repeated lookups

## Technical Details

### Lazy Loading
File sizes are populated on-demand:
- First request fetches from URL
- Subsequent requests use cached database value
- No upfront processing required for existing ordinals

### Fallback Mechanism
If API fails or is slow:
- UI shows estimated costs (~50KB per ordinal)
- Still allows users to proceed with minting
- Updates to accurate costs when API responds

### Transaction Size Formula
Based on actual Tapscript inscription structure:
- Base overhead: 150 bytes
- Content data: Actual file size in bytes
- Output overhead: 43 bytes per inscription
- Commit transaction: 250 bytes + (43 * quantity)

## Future Enhancements

Potential improvements:
1. Show individual file sizes per ordinal
2. Estimate based on MIME type (PNG vs JPEG compression)
3. Warning for large files that may require higher fees
4. Batch optimization suggestions
5. Historical cost comparison

## Testing

To test the feature:
1. Navigate to mint page for a collection
2. Select 1-10 ordinals
3. Observe cost breakdown updates
4. Change fee rate using +/- buttons
5. Verify costs update in real-time
6. Check that file sizes are cached in database

## Dependencies

- `@neondatabase/serverless`: Database access
- Bitcoin mempool.space API: Fee rates
- Existing inscription utilities: Cost calculations

## Files Modified/Created

### Created
- `scripts/migrations/011_add_file_size.sql` - Database migration
- `scripts/add-file-size-column.js` - Migration runner script
- `app/api/mint/estimate-cost/route.ts` - Cost estimation endpoint
- `app/api/ordinals/batch-file-sizes/route.ts` - **Automatic file size population**
- `INSCRIPTION_COST_ESTIMATION.md` (this file)

### Modified
- `app/mint/[collectionId]/page.tsx`
  - Added `CostEstimate` interface
  - Added `costEstimate` and `loadingCost` state
  - Added `loadCostEstimate()` function
  - Added `ensureFileSizes()` background task - **Auto-populates file sizes**
  - Enhanced `calculateCost()` to use real estimates
  - Updated cost breakdown UI with detailed display
  - Updated `Ordinal` interface to include `file_size_bytes`

- `app/api/mint/available-ordinals/[collectionId]/route.ts`
  - Added `file_size_bytes` to SELECT queries
  - Returns file size data with each ordinal

## Summary

Users can now see accurate, real-time inscription costs based on actual file sizes and current Bitcoin network conditions. The system:

- **Automatically populates file sizes** for existing ordinals in the background (like thumbnail generation)
- **Intelligently caches** file sizes in the database to avoid repeated lookups
- **Provides graceful fallbacks** if file size data is temporarily unavailable
- **Uses actual Bitcoin fee rates** from mempool.space for accurate cost estimates
- **Updates in real-time** as users select ordinals or change fee rates

This ensures a smooth, transparent user experience with no surprises at minting time.

