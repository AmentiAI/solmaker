# Database Schema Review & Cleanup

## Issues Found & Fixed

### 🔴 Critical Issues

1. **Missing Foreign Keys**
   - `mint_inscriptions.session_id` → `mint_sessions.id` (should cascade delete)
   - `mint_inscriptions.phase_id` → `mint_phases.id` (should set null on delete)
   - `mint_phases.whitelist_id` → `mint_phase_whitelists.id` (should set null on delete)
   - **Status**: Fixed in migration 042

2. **Missing Critical Indexes**
   - No index on `mint_inscriptions.commit_tx_id` (very common lookup)
   - No index on `mint_inscriptions.reveal_tx_id` (very common lookup)
   - Missing composite index for `(collection_id, phase_id, mint_status)`
   - Missing composite index for `(minter_wallet, collection_id, phase_id)` (user mint counts)
   - Missing index on `ordinal_reservations.phase_id`
   - Missing index on `mint_phases` for active phase queries
   - **Status**: Fixed in migration 042

3. **Inconsistent Column Existence**
   - `mint_inscriptions.payment_address` - used in code but may not exist
   - `mint_sessions.payment_address` - should exist but verify
   - `mint_inscriptions.commit_last_checked_at` - used in cron but may not exist
   - `mint_inscriptions.reveal_last_checked_at` - used in cron but may not exist
   - **Status**: Fixed in migration 042

### ⚠️ Medium Priority Issues

4. **Missing Composite Indexes for Common Queries**
   - User mint count queries: `(minter_wallet, collection_id, phase_id)`
   - Active phase lookups: `(collection_id, is_active, start_time, end_time)`
   - Available ordinals: `(collection_id, is_minted)`
   - **Status**: Fixed in migration 042

5. **Data Type Inconsistencies**
   - `mint_sessions.fee_rate` is INTEGER but should be DECIMAL(10,4) to match mint_inscriptions
   - **Status**: ⚠️ Not fixed (would require data migration, low priority)

6. **Missing Constraints**
   - `mint_status` constraint may be missing `reveal_broadcast` and `reveal_confirming`
   - **Status**: Fixed in migration 042

### ✅ Good Practices Already in Place

- Proper CASCADE deletes on collection relationships
- Unique constraints where needed (whitelist entries, phase_wallet_mints)
- Check constraints for status values
- Timestamp defaults and update triggers
- Proper UUID primary keys

## Schema Structure Overview

### Core Tables

1. **collections** - Main collection metadata
   - ✅ Good: Has wallet_address, is_locked, launch_status
   - ⚠️ Could add: creator_royalty_wallet, creator_royalty_percent indexes

2. **generated_ordinals** - AI-generated ordinal images
   - ✅ Good: Has is_minted flag, ordinal_number
   - ⚠️ Missing: Index on (collection_id, is_minted) for available count queries

3. **mint_inscriptions** - Individual mint records
   - ✅ Good: Comprehensive transaction tracking
   - ✅ Good: Has session_id, phase_id (after migrations)
   - ⚠️ Missing: Some indexes for common queries

4. **mint_sessions** - Batch mint containers
   - ✅ Good: Links multiple inscriptions together
   - ⚠️ Issue: fee_rate is INTEGER, should be DECIMAL

5. **mint_phases** - Launchpad phase configuration
   - ✅ Good: Proper timing, allocation, whitelist support
   - ✅ Good: Has phase_minted counter

6. **ordinal_reservations** - Prevents duplicate mints
   - ✅ Good: Expiration handling, status tracking
   - ⚠️ Missing: Index on phase_id

7. **whitelist_entries** - Phase whitelist management
   - ✅ Good: Allocation tracking, minted_count
   - ✅ Good: Unique constraint on (whitelist_id, wallet_address)

8. **phase_wallet_mints** - Per-wallet mint counts per phase
   - ✅ Good: Tracks mint_count, last_mint_at
   - ✅ Good: Unique constraint on (phase_id, wallet_address)

## Recommendations

### Immediate Actions (Migration 042)
1. ✅ Run migration 042 to add missing indexes and constraints
2. ✅ Verify all foreign keys are in place
3. ✅ Ensure all columns used in code actually exist

### Future Improvements
1. **Consider Normalization**
   - `mint_inscriptions` has both `launch_id` and `phase_id` - decide which is primary
   - Currently using `phase_id` for launchpad, `launch_id` for legacy - this is fine

2. **Add Missing Indexes**
   - Index on `collections.wallet_address` for owner lookups
   - Index on `mint_phases` for active phase queries
   - Composite indexes for common query patterns

3. **Data Type Consistency**
   - Consider migrating `mint_sessions.fee_rate` from INTEGER to DECIMAL(10,4)
   - Low priority since it works, but inconsistent

4. **Add Constraints**
   - Check constraint: `phase_minted <= phase_allocation` (if phase_allocation is set)
   - Check constraint: `minted_count <= allocation` in whitelist_entries

5. **Consider Partitioning** (Future)
   - If `mint_inscriptions` grows very large, consider partitioning by `created_at`
   - Only needed if table exceeds millions of rows

## Migration Status

- ✅ Migration 040: session_id added
- ✅ Migration 041: phase_id added  
- ✅ Migration 041_add_tx_checking_fields: commit/reveal_last_checked_at added
- ✅ Migration 042: Schema cleanup and optimization (NEW)

## Testing Checklist

After running migration 042, verify:
- [ ] All indexes created successfully
- [ ] Foreign keys are in place
- [ ] User mint count queries are fast (< 100ms)
- [ ] Phase lookup queries are fast
- [ ] No duplicate indexes (check pg_indexes)
- [ ] ANALYZE ran successfully

