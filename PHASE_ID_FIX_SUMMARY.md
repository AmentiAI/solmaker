# Phase ID Implementation Fix - Summary

## Issues Found

### 1. **Inconsistent Phase ID Tracking** ❌
- **Problem**: `mint_inscriptions` table was supposed to have `phase_id` but:
  - Original table creation didn't include it
  - Migration script existed but might not have been run
  - Code was setting `phase_id` but queries were still using `ordinal_reservations` JOINs
  - Existing mints might not have `phase_id` set

### 2. **Sloppy Query Pattern** ❌
- **Problem**: Queries were using `LEFT JOIN ordinal_reservations` and checking `COALESCE(mi.phase_id, r.phase_id)`
- **Why it's sloppy**: 
  - Relies on a JOIN that might not exist
  - Creates unnecessary complexity
  - Performance impact from JOINs
  - Data inconsistency risk

### 3. **Batch Mint Issue** ❌
- **Problem**: Only checking reservation for first ordinal in batch (`ordinal_ids[0]`)
- **Why it's sloppy**: Batch mints could have different phase_ids or missing reservations

## Fixes Applied

### 1. **Proper Phase ID Assignment** ✅
- Modified `create-commit/route.ts` to:
  - Get reservations for ALL ordinals in batch (not just first one)
  - Validate all reservations match the phase
  - Use reservation's `phase_id` as source of truth
  - Store `phase_id` directly in `mint_inscriptions` table

### 2. **Database Migration** ✅
- Created `041_ensure_phase_id_in_mint_inscriptions.sql`:
  - Adds `phase_id` column if missing
  - Creates proper indexes for performance
  - Backfills existing records from `ordinal_reservations`
  - Handles both completed and pending reservations

### 3. **Simplified Queries** ✅
- Removed unnecessary JOINs to `ordinal_reservations`
- Queries now use `mi.phase_id` directly
- Much faster and cleaner queries
- Updated in:
  - `poll/route.ts` - User mint count
  - `whitelist-status/route.ts` - Whitelist mint count
  - `my-transactions/route.ts` - Already had phase_id in SELECT

## Migration Steps

1. **Run the migration**:
   ```bash
   # Apply the migration
   psql $DATABASE_URL -f scripts/migrations/041_ensure_phase_id_in_mint_inscriptions.sql
   ```

2. **Verify**:
   ```sql
   -- Check how many records have phase_id
   SELECT 
     COUNT(*) FILTER (WHERE phase_id IS NOT NULL) as with_phase,
     COUNT(*) FILTER (WHERE phase_id IS NULL AND is_test_mint = false) as without_phase
   FROM mint_inscriptions;
   ```

## Future-Proofing

### ✅ Good Practices Now:
- `phase_id` is always set at creation time
- Direct column access (no JOINs needed)
- Proper indexes for performance
- Single source of truth

### ⚠️ Things to Watch:
- Ensure `phase_id` is always passed when creating launchpad mints
- Don't rely on `ordinal_reservations` for phase lookups anymore
- Use `mi.phase_id` directly in all queries

## Testing

After migration, test:
1. Create a new mint - verify `phase_id` is set
2. Check user mint count - should show correct number
3. Check phase_minted count - should match actual mints
4. Verify history modal shows correct phases

