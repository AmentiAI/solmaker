# Minting System Audit Report
## Phases, Whitelists, Minted Counts, Max Per Wallet, and Transaction Limits

**Date:** 2025-12-24  
**Scope:** Complete audit of minting system for consistency and correctness

---

## 1. MAX_PER_TRANSACTION (10) Enforcement

### ✅ **Frontend Enforcement**
- **Location:** `app/launchpad/[collectionId]/page.tsx`
- **Constant:** `MAX_PER_TRANSACTION = 10` (line 10)
- **Enforcement Points:**
  - ✅ `handleMint` validation (line 424-426)
  - ✅ Quantity input `onChange` handler (line 1144)
  - ✅ Quantity input `onBlur` handler (line 1164)
  - ✅ "Max" button click handler (line 1185)
  - ✅ Input `max` attribute set to `MAX_PER_TRANSACTION` (line 1173)

### ✅ **Backend Enforcement**
- **Location:** `app/api/mint/create-commit/route.ts`
- **Enforcement:**
  - ✅ Line 73-74: Bulk inscribe limited to 10
  - ✅ Line 78-79: Launchpad mints limited to 10 when `phase_id` present
  - **Status:** ✅ Consistent - both enforce 10 limit

### ✅ **Reserve Endpoint**
- **Location:** `app/api/launchpad/[collectionId]/reserve/route.ts`
- **Enforcement:**
  - ✅ Line 26: `quantity < 1 || quantity > 10` validation
  - **Status:** ✅ Consistent with global limit

### ⚠️ **Potential Issue**
- The reserve endpoint accepts `quantity` up to 10, but the frontend should also validate this before calling reserve
- **Recommendation:** Frontend already validates, but ensure reserve endpoint is the source of truth

---

## 2. Max Per Wallet Enforcement

### ✅ **Frontend Calculation**
- **Location:** `app/launchpad/[collectionId]/page.tsx`
- **Logic:**
  - For whitelist phases: Uses `whitelistStatus.remaining_allocation` (from DB)
  - For public phases: Calculates `activePhase.max_per_wallet - userMintStatus.minted_count`
  - **Status:** ✅ Correct - uses actual DB counts

### ✅ **Backend Reserve Validation**
- **Location:** `app/api/launchpad/[collectionId]/reserve/route.ts`
- **Whitelist Phases (lines 92-111):**
  - ✅ Queries `mint_inscriptions` with `commit_tx_id IS NOT NULL`
  - ✅ Counts ALL mints (pending + completed) for the phase
  - ✅ Validates: `currentMints + quantity > whitelistEntry.allocation`
  - **Status:** ✅ Correct - prevents over-minting

- **Public Phases (lines 115-133):**
  - ✅ Queries `mint_inscriptions` with `commit_tx_id IS NOT NULL`
  - ✅ Counts ALL mints (pending + completed) for the phase
  - ✅ Validates: `currentMints + quantity > phase.max_per_wallet`
  - **Status:** ✅ Correct - prevents over-minting

### ✅ **API User Mint Status**
- **Location:** `app/api/launchpad/[collectionId]/route.ts` (lines 211-220)
- **Query:**
  ```sql
  SELECT COUNT(DISTINCT mi.id) as count
  FROM mint_inscriptions mi
  WHERE mi.minter_wallet = ${walletAddress}
    AND mi.collection_id = ${collectionId}
    AND mi.phase_id = ${activePhase.id}
    AND mi.commit_tx_id IS NOT NULL
    AND LENGTH(TRIM(mi.commit_tx_id)) > 0
    AND mi.is_test_mint = false
  ```
- **Status:** ✅ Correct - counts actual mints with commit_tx_id

### ✅ **Poll Endpoint**
- **Location:** `app/api/launchpad/[collectionId]/poll/route.ts`
- **Whitelist Phases (lines 108-117):**
  - ✅ Same query pattern as main route
  - ✅ Calculates `remaining_allocation = allocation - actualMinted`
  - **Status:** ✅ Consistent

- **Public Phases (lines 156-165):**
  - ✅ Same query pattern as main route
  - ✅ Calculates `remaining = maxPerWallet - mintedCount`
  - **Status:** ✅ Consistent

### ⚠️ **Issue Found: Reserve Query Uses JOIN**
- **Location:** `app/api/launchpad/[collectionId]/reserve/route.ts` (lines 93-103, 116-126)
- **Problem:** Uses `JOIN ordinal_reservations` which may not be necessary
- **Current Query:**
  ```sql
  SELECT COUNT(DISTINCT mi.id) as count
  FROM mint_inscriptions mi
  JOIN ordinal_reservations r ON mi.ordinal_id = r.ordinal_id
  WHERE mi.minter_wallet = ${wallet_address}
    AND mi.collection_id = ${collectionId}
    AND r.phase_id = ${phase_id}  -- Using reservation phase_id
  ```
- **Issue:** Should use `mi.phase_id` directly, not `r.phase_id`
- **Impact:** May count mints from wrong phase if reservation phase_id differs
- **Recommendation:** Change to use `mi.phase_id = ${phase_id}` instead of `r.phase_id`

---

## 3. Whitelist Allocation Tracking

### ✅ **Whitelist Status Endpoint**
- **Location:** `app/api/launchpad/[collectionId]/whitelist-status/route.ts`
- **Query (lines 89-98):**
  ```sql
  SELECT COUNT(DISTINCT mi.id) as count
  FROM mint_inscriptions mi
  WHERE mi.minter_wallet = ${walletAddress}
    AND mi.collection_id = ${collectionId}
    AND mi.phase_id = ${phaseId}  -- ✅ Correct: uses mi.phase_id
    AND mi.commit_tx_id IS NOT NULL
    AND LENGTH(TRIM(mi.commit_tx_id)) > 0
    AND mi.is_test_mint = false
  ```
- **Calculation:**
  - ✅ `allocation = entry.allocation || 1`
  - ✅ `remaining_allocation = Math.max(0, allocation - totalMintedCount)`
  - **Status:** ✅ Correct

### ✅ **Poll Endpoint Whitelist**
- **Location:** `app/api/launchpad/[collectionId]/poll/route.ts` (lines 108-117)
- **Query:** Same pattern as whitelist-status endpoint
- **Status:** ✅ Consistent

### ⚠️ **Issue: Reserve Endpoint Query**
- **Location:** `app/api/launchpad/[collectionId]/reserve/route.ts` (lines 93-103)
- **Problem:** Uses `JOIN ordinal_reservations` and `r.phase_id` instead of `mi.phase_id`
- **Should be:**
  ```sql
  SELECT COUNT(DISTINCT mi.id) as count
  FROM mint_inscriptions mi
  WHERE mi.minter_wallet = ${wallet_address}
    AND mi.collection_id = ${collectionId}
    AND mi.phase_id = ${phase_id}  -- Use mi.phase_id directly
    AND mi.commit_tx_id IS NOT NULL
    AND LENGTH(TRIM(mi.commit_tx_id)) > 0
    AND mi.is_test_mint = false
  ```

---

## 4. Phase Minted Count Tracking

### ✅ **Phase Minted Calculation**
- **Location:** `app/api/launchpad/[collectionId]/route.ts` (lines 119-129)
- **Query:**
  ```sql
  COALESCE((
    SELECT COUNT(*)
    FROM mint_inscriptions mi
    WHERE mi.phase_id = mp.id
      AND mi.is_test_mint = false
      AND (
        mi.reveal_tx_id IS NOT NULL 
        OR mi.reveal_broadcast_at IS NOT NULL
        OR mi.mint_status IN ('reveal_broadcast', 'reveal_confirming', 'completed')
      )
  ), 0) as phase_minted
  ```
- **Status:** ✅ Correct - counts revealed mints only (not just committed)

### ✅ **Phase Minted Updates**
- **Location:** `app/api/mint/reveal/route.ts` (line 330)
- **Update:** `UPDATE mint_phases SET phase_minted = phase_minted + 1`
- **Status:** ✅ Correct - increments on reveal broadcast

- **Location:** `app/api/launchpad/[collectionId]/reserve/route.ts` (line 329)
- **Update:** `UPDATE mint_phases SET phase_minted = phase_minted + 1`
- **Status:** ⚠️ **ISSUE** - This increments on reservation completion, but the query counts revealed mints
- **Problem:** Inconsistency - updates on completion but query counts reveals
- **Recommendation:** Should only update on reveal, or change query to count completed reservations

### ⚠️ **Inconsistency Found**
The `phase_minted` field is updated in two places:
1. On reveal broadcast (`app/api/mint/reveal/route.ts:330`)
2. On reservation completion (`app/api/launchpad/[collectionId]/reserve/route.ts:329`)

But the query counts only revealed mints. This creates a mismatch.

**Recommendation:** 
- Option 1: Remove update from reserve completion, only update on reveal
- Option 2: Change query to count `commit_tx_id IS NOT NULL` instead of reveal status

---

## 5. Whitelist Entry Minted Count Updates

### ✅ **Update on Reveal**
- **Location:** `app/api/mint/reveal/route.ts` (lines 348-354)
- **Update:** `UPDATE whitelist_entries SET minted_count = minted_count + 1`
- **Status:** ✅ Correct - updates when reveal is broadcast

### ⚠️ **Update on Reservation Completion**
- **Location:** `app/api/launchpad/[collectionId]/reserve/route.ts` (lines 348-351)
- **Update:** `UPDATE whitelist_entries SET minted_count = minted_count + 1`
- **Status:** ⚠️ **ISSUE** - This may cause double-counting

### ⚠️ **Double Counting Risk**
The `whitelist_entries.minted_count` field is updated:
1. On reservation completion (PATCH /reserve)
2. On reveal broadcast (POST /reveal)

But the actual count query uses `mint_inscriptions` table, not `whitelist_entries.minted_count`. This means:
- The `minted_count` field in `whitelist_entries` may be inaccurate
- The actual checks use the `mint_inscriptions` query, which is correct
- **Recommendation:** Either remove the `whitelist_entries.minted_count` updates (rely on query), or ensure they're only updated once

---

## 6. Summary of Issues Found

### 🔴 **Critical Issues**

1. **Reserve Endpoint Query Uses Wrong Phase ID**
   - **File:** `app/api/launchpad/[collectionId]/reserve/route.ts`
   - **Lines:** 93-103, 116-126
   - **Issue:** Uses `r.phase_id` from JOIN instead of `mi.phase_id`
   - **Impact:** May count mints from wrong phase
   - **Fix:** Change to use `mi.phase_id = ${phase_id}` directly

2. **Phase Minted Count Inconsistency**
   - **File:** `app/api/launchpad/[collectionId]/reserve/route.ts` (line 329)
   - **Issue:** Updates `phase_minted` on reservation completion, but query counts only revealed mints
   - **Impact:** `phase_minted` may be higher than actual revealed count
   - **Fix:** Remove update from reserve completion, only update on reveal

3. **Whitelist Minted Count Double Updates**
   - **Files:** 
     - `app/api/launchpad/[collectionId]/reserve/route.ts` (line 349)
     - `app/api/mint/reveal/route.ts` (line 350)
   - **Issue:** Both update `whitelist_entries.minted_count`, but actual checks use query
   - **Impact:** Field may be inaccurate, but doesn't affect functionality (checks use query)
   - **Fix:** Remove update from reserve completion, only update on reveal

### ✅ **Working Correctly**

1. ✅ MAX_PER_TRANSACTION (10) is consistently enforced in frontend and backend
2. ✅ Max per wallet calculations use actual DB queries
3. ✅ Whitelist allocation calculations use actual DB queries
4. ✅ All mint count queries use `commit_tx_id IS NOT NULL` to include pending mints
5. ✅ Frontend properly calculates remaining mints from phase max_per_wallet

---

## 7. Recommendations

### ✅ **FIXES APPLIED:**

1. **✅ Fixed Reserve Endpoint Queries**
   - ✅ Removed `JOIN ordinal_reservations`
   - ✅ Now uses `mi.phase_id` directly instead of `r.phase_id`
   - **File:** `app/api/launchpad/[collectionId]/reserve/route.ts`

2. **✅ Fixed Phase Minted Updates**
   - ✅ Removed `phase_minted` update from reserve completion
   - ✅ Only updates on reveal broadcast now
   - **File:** `app/api/launchpad/[collectionId]/reserve/route.ts`

3. **✅ Fixed Whitelist Minted Count Updates**
   - ✅ Removed `whitelist_entries.minted_count` update from reserve completion
   - ✅ Only updates on reveal broadcast now
   - **File:** `app/api/launchpad/[collectionId]/reserve/route.ts`

4. **✅ Created Shared Constants**
   - ✅ Created `lib/minting-constants.ts` with `MAX_PER_TRANSACTION = 10`
   - ✅ Updated frontend to import from constants
   - ✅ Updated backend to import from constants
   - **Files:** 
     - `lib/minting-constants.ts` (new)
     - `app/launchpad/[collectionId]/page.tsx`
     - `app/api/mint/create-commit/route.ts`
     - `app/api/launchpad/[collectionId]/reserve/route.ts`

### Code Quality Improvements:

1. **Create Shared Constants File**
   - Move `MAX_PER_TRANSACTION = 10` to a shared constants file
   - Import in both frontend and backend

2. **Create Shared Query Functions**
   - Extract mint count queries to shared utility functions
   - Ensure consistency across all endpoints

3. **Documentation**
   - Document that mint counts include pending mints (commit_tx_id IS NOT NULL)
   - Document that phase_minted counts only revealed mints

---

## 8. Testing Checklist

- [ ] Test max per wallet enforcement with multiple transactions
- [ ] Test whitelist allocation enforcement
- [ ] Test 10 per transaction limit enforcement
- [ ] Test phase minted count accuracy
- [ ] Test whitelist minted count accuracy
- [ ] Test cross-phase mint counting (should be separate)
- [ ] Test pending mint counting (commit_tx_id but no reveal)

