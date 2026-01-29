# Test Results for Collection ddaa4e7c-0a00-4d07-ab41-06ee3991a2f8

## Database Test Results

### Collection Info
- **Name**: Creator Pass
- **Total Supply**: 222
- **Total Minted**: 2
- **Available**: 220
- **Status**: launchpad_live
- **Locked**: true

### Active Phase: "A"
- **Phase ID**: 962bd65a-8ca0-40cc-982e-78c1ae1663af
- **Max per Wallet**: 22 ✅
- **Max per Transaction**: 1
- **Price**: 0 sats (FREE)
- **Whitelist Only**: Yes ✅
- **Whitelist ID**: 00b6f0a8-228d-4836-82ba-c2d8104adc98
- **Phase Minted**: 1
- **Start Time**: Wed Dec 24 2025 14:32:00 GMT-0500
- **End Time**: Wed Dec 24 2025 21:32:00 GMT-0500

### All Phases
1. **Blessed** (Order 0) - Max per Wallet: 1, Whitelist Only: Yes
2. **B2** (Order 1) - Max per Wallet: 1, Whitelist Only: Yes
3. **A** (Order 2) - Max per Wallet: 22, Whitelist Only: Yes ✅ ACTIVE

## API Test Results

### GET /api/launchpad/[collectionId]
✅ Returns correct data:
- `active_phase.max_per_wallet`: 22 ✅
- `active_phase.whitelist_only`: true ✅
- `active_phase.phase_minted`: 1 ✅

### GET /api/launchpad/[collectionId]/poll
✅ Returns correct data:
- `active_phase.max_per_wallet`: 22 ✅
- `active_phase.whitelist_only`: true ✅
- `active_phase.phase_minted`: 1 ✅

## Issue Analysis

### Problem
User reports seeing:
- **Max/Wallet**: 22 ✅ (correct)
- **Your Mints**: 0 / 1 ❌ (should be 0 / 22 or 0 / [whitelist allocation])

### Root Cause
Since the phase is **whitelist_only: true**, the "Your Mints" display should use:
- `whitelistStatus.allocation` (the user's whitelist allocation)
- NOT `activePhase.max_per_wallet` (which is 22)

The display logic is checking:
```javascript
activePhase.whitelist_only && whitelistStatus?.is_whitelisted && whitelistStatus.allocation !== undefined
  ? `${whitelistStatus.minted_count || 0} / ${whitelistStatus.allocation}`
```

If `whitelistStatus.allocation` is 1, then "0 / 1" is correct for that user's whitelist allocation.

### Expected Behavior
- If user is on whitelist with allocation = 1: Show "0 / 1" ✅
- If user is on whitelist with allocation = 22: Show "0 / 22" ✅
- If user is NOT on whitelist: Show error message ❌

### Next Steps
1. Check what the user's actual whitelist allocation is
2. Verify the whitelistStatus API response
3. If the user should have allocation = 22, check the whitelist_entries table

## Test Scripts Created

### Individual Test Scripts

1. **scripts/test-whitelist-entries.js** - Tests whitelist entries in database
   - Checks whitelist configuration
   - Verifies entries and allocations
   - Compares DB counts vs entry counts

2. **scripts/test-mint-availability.js** - Tests mint availability calculations
   - Database queries and calculations
   - Phase status verification
   - Wallet mint status checking

3. **scripts/test-api-responses.js** - Tests API endpoint responses
   - Main collection endpoint
   - Poll endpoint
   - Response data validation

4. **scripts/test-whitelist-mint-flow.js** - Comprehensive end-to-end flow testing
   - Database state verification
   - Whitelist status testing
   - API endpoint testing
   - Reserve endpoint validation
   - Mint count calculations
   - Complete flow verification

### Running Tests

#### Run Individual Tests
```bash
# Test whitelist entries
node scripts/test-whitelist-entries.js

# Test mint availability
node scripts/test-mint-availability.js

# Test API responses
node scripts/test-api-responses.js

# Test complete flow (comprehensive)
node scripts/test-whitelist-mint-flow.js
```

#### Run All Tests
```bash
# Run all tests in sequence
node scripts/run-all-tests.js
```

### Configuration

To test with a specific wallet, set these in `.env.local`:
```env
TEST_WALLET=bc1qyourwalletaddress...
TEST_COLLECTION_ID=ddaa4e7c-0a00-4d07-ab41-06ee3991a2f8
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

### Test Coverage

The comprehensive test script (`test-whitelist-mint-flow.js`) covers:

1. ✅ **Database State Verification**
   - Collection existence and status
   - Phase configuration
   - Active phase detection

2. ✅ **Whitelist Status Testing**
   - Whitelist-status API endpoint
   - Database whitelist entry verification
   - Allocation and remaining count validation

3. ✅ **API Endpoint Testing**
   - Main collection endpoint (`/api/launchpad/[collectionId]`)
   - Poll endpoint (`/api/launchpad/[collectionId]/poll`)
   - Response data consistency

4. ✅ **Reserve Endpoint Testing**
   - Validation logic
   - Eligibility checking
   - Error handling

5. ✅ **Mint Count Calculations**
   - Actual mint counting
   - Remaining mints calculation
   - Whitelist vs public phase logic

### Expected Test Results

When running tests, you should see:
- ✅ All database queries succeed
- ✅ API endpoints return correct data
- ✅ Whitelist status matches database
- ✅ Mint counts are accurate
- ✅ Remaining calculations are correct

If tests fail, check:
1. Database connection (NEON_DATABASE or DATABASE_URL)
2. Test wallet is whitelisted (for whitelist phases)
3. Server is running (for API tests)
4. Collection ID is correct

