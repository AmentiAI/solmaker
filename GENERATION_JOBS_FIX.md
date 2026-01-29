# Generation Jobs Columns Fix - Complete ✅

## Issues
1. Error: `column "j.ordinal_number" does not exist`
2. Error: `column "j.trait_overrides" does not exist`

The `generation_jobs` table was missing critical columns for tracking NFT generation jobs.

---

## Solution

### Migration 086 Created
- **File:** `scripts/migrations/086_add_generation_jobs_ordinal_number.sql`
- **Script:** `scripts/run-generation-jobs-migration.js`

### What Was Added
1. ✅ `ordinal_number` column (INTEGER, nullable)
2. ✅ `trait_overrides` column (JSONB, nullable)
3. ✅ Index on `(collection_id, ordinal_number)` for faster lookups
4. ✅ GIN index on `trait_overrides` for JSONB queries
5. ✅ Column comments for documentation

### Migration Ran Successfully
```
✅ Verified columns in generation_jobs table:
  - ordinal_number (integer, nullable: YES)
  - trait_overrides (jsonb, nullable: YES)
```

---

## Purpose

### `ordinal_number` Column
Tracks which specific NFT number is being generated:
- Specific NFT number (e.g., #1, #2, #3...)
- NULL when auto-assigned (system picks next available number)
- Used by admin panel to show job details
- Helps track generation progress per specific ordinal

### `trait_overrides` Column
Stores custom trait configurations for generation:
- JSONB format for flexible trait data
- Example: `{"Background": "Blue", "Hat": "Crown"}`
- NULL when using random/default traits
- Allows users to specify exact traits for specific NFTs

---

## Where It's Used

### Admin Panel
- `app/api/admin/generation-jobs/route.ts` - Shows generation job details
- `app/admin/page.tsx` - Displays ordinal numbers in job listings

### Generation APIs
- `app/api/collections/[id]/generate/route.ts` - Creates jobs with ordinal numbers
- `app/api/lazy-mode/generate/route.ts` - Creates jobs (NULL for auto)

---

## Database Schema

### Before
```sql
CREATE TABLE generation_jobs (
  id UUID PRIMARY KEY,
  collection_id UUID NOT NULL,
  -- ordinal_number missing!
  status TEXT DEFAULT 'pending',
  trait_overrides JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);
```

### After (Migration 086)
```sql
CREATE TABLE generation_jobs (
  id UUID PRIMARY KEY,
  collection_id UUID NOT NULL,
  ordinal_number INTEGER,              -- NEW - Tracks specific NFT number
  trait_overrides JSONB,               -- NEW - Custom trait configurations
  status TEXT DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- NEW indexes for faster lookups
CREATE INDEX idx_generation_jobs_ordinal_number 
ON generation_jobs(collection_id, ordinal_number) 
WHERE ordinal_number IS NOT NULL;

CREATE INDEX idx_generation_jobs_trait_overrides 
ON generation_jobs USING GIN (trait_overrides)
WHERE trait_overrides IS NOT NULL;
```

---

## Usage Examples

### Creating a Job for Specific Ordinal with Custom Traits
```typescript
const traits = {
  "Background": "Blue Sky",
  "Hat": "Golden Crown",
  "Eyes": "Laser Eyes"
}

await sql`
  INSERT INTO generation_jobs (
    collection_id, 
    ordinal_number, 
    trait_overrides, 
    status
  )
  VALUES (
    ${collectionId}, 
    ${5},  -- Generate NFT #5
    ${JSON.stringify(traits)}::jsonb,  -- Custom traits
    'pending'
  )
`
```

### Creating Job with Auto-Assignment
```typescript
await sql`
  INSERT INTO generation_jobs (
    collection_id, 
    ordinal_number, 
    status
  )
  VALUES (
    ${collectionId}, 
    NULL,  -- System will auto-assign next number
    'pending'
  )
`
```

### Querying Jobs by Ordinal
```typescript
const jobs = await sql`
  SELECT * FROM generation_jobs
  WHERE collection_id = ${collectionId}
  AND ordinal_number = ${5}
`
```

### Querying Jobs with Trait Overrides
```typescript
const jobsWithTraits = await sql`
  SELECT * FROM generation_jobs
  WHERE collection_id = ${collectionId}
  AND trait_overrides IS NOT NULL
`
```

### Querying Jobs by Specific Trait
```typescript
const blueBackgrounds = await sql`
  SELECT * FROM generation_jobs
  WHERE collection_id = ${collectionId}
  AND trait_overrides->>'Background' = 'Blue Sky'
`
```

---

## Admin Panel Integration

Now the admin panel can display:
```
Job ID: abc123...
Collection: Cool Collection
Ordinal: #5                    ← Now shows correctly
Traits: Custom (3 overrides)   ← Now shows correctly
Status: completed
Created: 2024-01-29
```

Before this fix, it would error when trying to display ordinal numbers and trait overrides.

---

## Testing

### Verify Columns Exist
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'generation_jobs' 
AND column_name IN ('ordinal_number', 'trait_overrides')
ORDER BY column_name;
```

Should return:
```
ordinal_number    | integer | YES
trait_overrides   | jsonb   | YES
```

### Check Sample Jobs
```sql
SELECT id, collection_id, ordinal_number, status, created_at
FROM generation_jobs 
ORDER BY created_at DESC 
LIMIT 10;
```

### Test Admin Panel
1. Visit admin panel
2. Go to "Generation Jobs" section
3. Jobs should display without errors
4. Ordinal numbers should show (or "Auto" if NULL)

---

## Files Created

### Migration Files (3 files)
1. `scripts/migrations/086_add_generation_jobs_ordinal_number.sql` - Migration SQL
2. `scripts/run-generation-jobs-migration.js` - Migration script
3. `GENERATION_JOBS_FIX.md` - This documentation

### No Changes Needed To
- ✅ `app/api/admin/generation-jobs/route.ts` - Already querying ordinal_number
- ✅ `app/admin/page.tsx` - Already displaying ordinal_number
- ✅ `app/api/collections/[id]/generate/route.ts` - Already inserting ordinal_number

All code was already correct, just the database column was missing!

---

## Summary

✅ **Issue Fixed:**
- Column `ordinal_number` now exists in `generation_jobs` table
- Added as INTEGER, nullable (NULL = auto-assign)
- Index created for performance
- Admin panel generation jobs now work

✅ **Migration Complete:**
- Run: `node -r dotenv/config scripts/run-generation-jobs-migration.js dotenv_config_path=.env.local`
- Status: Successfully executed
- Column verified and ready

🎉 **Generation jobs tracking is ready to use!**

---

## Related Migrations

This complements these other recent migrations:
- **Migration 084** - Solana NFT system tables
- **Migration 085** - Credit costs columns (cost_per_unit, unit_name)
- **Migration 086** - Generation jobs ordinal_number (this one)

All part of the complete platform setup!
