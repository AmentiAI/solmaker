# Credit Costs Column Fix - Complete ✅

## Issue
Error: `column "cost_per_unit" does not exist`

The `credit_costs` table had `credit_cost` column but the admin panel code expected `cost_per_unit`, plus missing `unit_name` and `updated_by` columns.

---

## Solution

### Migration 085 Created
- **File:** `scripts/migrations/085_add_credit_costs_columns.sql`
- **Script:** `scripts/run-credit-costs-migration.js`

### What Was Added
1. ✅ `cost_per_unit` column (DECIMAL) - copied from `credit_cost`
2. ✅ `unit_name` column (TEXT) - defaults set for existing rows
3. ✅ `updated_by` column (TEXT) - tracks who updated costs
4. ✅ Index on `action_type` for faster lookups

### Migration Ran Successfully
```
✅ Verified columns in credit_costs table:
  - cost_per_unit (numeric)
  - credit_cost (numeric)  
  - unit_name (text)
  - updated_by (text)
```

---

## How to Use

### Set Credit Costs in Admin Panel
1. Go to admin panel
2. Find "Credit Costs Configuration"
3. Set costs for:
   - `image_generation` - Cost per image (default: 1.0)
   - `trait_generation` - Cost per trait (default: 0.05)
   - `collection_generation` - Cost per collection (default: 1.0)
4. Click "Save Changes"

### Example Credit Costs
```
image_generation: 1.0 credits per image
trait_generation: 0.05 credits per trait (20 traits = 1 credit)
collection_generation: 1.0 credits per collection
```

---

## Database Schema

### Before
```sql
CREATE TABLE credit_costs (
  id UUID PRIMARY KEY,
  action_type TEXT UNIQUE NOT NULL,
  credit_cost DECIMAL(10,2) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

### After (Migration 085)
```sql
CREATE TABLE credit_costs (
  id UUID PRIMARY KEY,
  action_type TEXT UNIQUE NOT NULL,
  credit_cost DECIMAL(10,2) NOT NULL,        -- Legacy column (kept)
  cost_per_unit DECIMAL(10,2) NOT NULL,     -- NEW - Used by admin panel
  unit_name TEXT DEFAULT 'unit',            -- NEW - Display name (image, trait, etc)
  updated_by TEXT,                          -- NEW - Tracks who updated
  description TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

CREATE INDEX idx_credit_costs_action_type ON credit_costs(action_type);
```

---

## API Usage

### Get Credit Cost
```typescript
import { getCreditCost } from '@/lib/credits/credit-costs'

const cost = await getCreditCost('image_generation')
// Returns: 1.0 (credits per image)
```

### Calculate Credits Needed
```typescript
import { calculateCreditsNeeded } from '@/lib/credits/credit-costs'

const needed = await calculateCreditsNeeded('image_generation', 10)
// Returns: 10 (credits for 10 images)

const traitCost = await calculateCreditsNeeded('trait_generation', 20)
// Returns: 1.0 (credits for 20 traits at 0.05 each)
```

### Update Costs (Admin Only)
```typescript
// POST /api/admin/credit-costs
{
  "wallet_address": "admin_wallet",
  "costs": [
    {
      "action_type": "image_generation",
      "cost_per_unit": 1.5,
      "unit_name": "image",
      "description": "Cost per generated image"
    }
  ]
}
```

---

## Files Modified

### Created (3 files)
1. `scripts/migrations/085_add_credit_costs_columns.sql` - Migration SQL
2. `scripts/run-credit-costs-migration.js` - Migration script
3. `CREDIT_COSTS_FIX.md` - This file

### No Changes Needed
- ✅ `lib/credits/credit-costs.ts` - Already using correct column names
- ✅ `app/api/admin/credit-costs/route.ts` - Already using correct columns
- ✅ `app/admin/page.tsx` - Admin panel works now

---

## Testing

### Verify Columns
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'credit_costs';
```

Should show:
- `cost_per_unit` (numeric)
- `unit_name` (text)
- `updated_by` (text)
- `credit_cost` (numeric) - legacy, kept for compatibility

### Check Current Costs
```sql
SELECT action_type, cost_per_unit, unit_name, description 
FROM credit_costs;
```

### Test Admin Panel
1. Visit admin panel
2. Go to "Credit Costs Configuration"
3. Change a cost value
4. Click "Save Changes"
5. Should save successfully without errors

---

## Summary

✅ **Issue Fixed:**
- Column `cost_per_unit` now exists
- Added `unit_name` and `updated_by` columns
- Data copied from old `credit_cost` column
- Index added for performance
- Admin panel credit costs configuration now works

✅ **Migration Complete:**
- Run: `node -r dotenv/config scripts/run-credit-costs-migration.js dotenv_config_path=.env.local`
- Status: Successfully executed
- All columns added and verified

🎉 **Credit costs configuration is ready to use!**
