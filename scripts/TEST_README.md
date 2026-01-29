# Whitelist & Mint Phase Testing

This directory contains comprehensive test scripts for verifying the whitelist and mint phase functionality.

## Overview

These test scripts verify:
- ✅ Whitelist configuration and entries
- ✅ Mint availability calculations
- ✅ API endpoint responses
- ✅ Complete mint flow (reserve → mint)
- ✅ Database consistency
- ✅ Phase status and timing

## Prerequisites

1. **Environment Variables** - Set in `.env.local`:
   ```env
   NEON_DATABASE=your_database_url
   TEST_WALLET=bc1qyourwalletaddress...
   TEST_COLLECTION_ID=ddaa4e7c-0a00-4d07-ab41-06ee3991a2f8
   NEXT_PUBLIC_BASE_URL=http://localhost:3000
   ```

2. **Server Running** (for API tests):
   ```bash
   npm run dev
   ```

## Test Scripts

### 1. `test-whitelist-entries.js`
Tests whitelist entries in the database.

**What it tests:**
- Active phase detection
- Whitelist configuration
- Whitelist entries and allocations
- Mint count consistency (DB vs entry)

**Run:**
```bash
node scripts/test-whitelist-entries.js
```

**Output:**
- Active phase information
- Whitelist entries with allocations
- Mint count comparisons
- Summary of allocations

---

### 2. `test-mint-availability.js`
Tests mint availability calculations and database queries.

**What it tests:**
- Collection data
- All phases configuration
- Active phase detection
- Phase minted counts
- Wallet mint status (whitelist and public phases)
- API endpoint responses

**Run:**
```bash
node scripts/test-mint-availability.js
```

**Output:**
- Collection statistics
- Phase details
- Wallet mint status
- Remaining mints calculation
- API response validation

---

### 3. `test-api-responses.js`
Tests API endpoint responses match database data.

**What it tests:**
- `GET /api/launchpad/[collectionId]` - Main collection endpoint
- `GET /api/launchpad/[collectionId]/poll` - Poll endpoint
- Response data structure
- Active phase data
- User mint status
- User whitelist status

**Run:**
```bash
node scripts/test-api-responses.js
```

**Output:**
- API response JSON
- Active phase data
- User-specific status
- Data consistency checks

---

### 4. `test-whitelist-mint-flow.js` ⭐ **Comprehensive**
Complete end-to-end flow testing.

**What it tests:**
1. **Database State Verification**
   - Collection existence and status
   - Phase configuration
   - Active phase detection

2. **Whitelist Status Testing**
   - Whitelist-status API endpoint
   - Database whitelist entry verification
   - Allocation validation

3. **API Endpoint Testing**
   - Main collection endpoint
   - Poll endpoint
   - Response consistency

4. **Reserve Endpoint Testing**
   - Validation logic
   - Eligibility checking

5. **Mint Count Calculations**
   - Actual mint counting
   - Remaining mints calculation

**Run:**
```bash
node scripts/test-whitelist-mint-flow.js
```

**Output:**
- Detailed test results for each phase
- Pass/fail status for each test
- Summary with pass/fail counts
- Warnings for non-critical issues

---

### 5. `run-all-tests.js` 🚀 **Run Everything**
Runs all test scripts in sequence.

**Run:**
```bash
node scripts/run-all-tests.js
```

**Output:**
- Results from all test scripts
- Summary of passed/failed tests
- Total execution time

---

## Test Results

Test results are displayed in the console. For detailed analysis, see:
- `TEST_RESULTS.md` - Previous test results and analysis
- Console output - Real-time test results

## Understanding Test Results

### ✅ Passed Tests
- All checks passed
- Data is consistent
- No issues found

### ❌ Failed Tests
- Critical issue found
- Data inconsistency
- API error or missing data

### ⚠️ Warnings
- Non-critical issues
- Potential problems
- Recommendations

## Common Issues

### "No database URL found"
- Set `NEON_DATABASE` or `DATABASE_URL` in `.env.local`

### "TEST_WALLET not set"
- Set `TEST_WALLET` in `.env.local` with a valid wallet address

### "Server may not be running"
- Start the Next.js server: `npm run dev`
- Check `NEXT_PUBLIC_BASE_URL` matches your server URL

### "Wallet not found on whitelist"
- For whitelist phases, ensure the test wallet is added to the whitelist
- Check `whitelist_entries` table in database

### "No active phase found"
- Ensure at least one phase is active (start_time <= now < end_time)
- Check phase `is_completed` flag is false

## Test Workflow

1. **Before Testing:**
   ```bash
   # Set environment variables
   cp .env.example .env.local
   # Edit .env.local with your values
   ```

2. **Run Tests:**
   ```bash
   # Quick test (single script)
   node scripts/test-whitelist-mint-flow.js
   
   # Full test suite
   node scripts/run-all-tests.js
   ```

3. **Review Results:**
   - Check console output for pass/fail status
   - Review warnings for recommendations
   - Fix any failed tests

4. **Verify Fixes:**
   - Re-run tests after fixes
   - Ensure all tests pass

## Best Practices

1. **Test Before Deploying**
   - Run tests before deploying changes
   - Verify all tests pass

2. **Test with Real Data**
   - Use actual collection IDs
   - Test with whitelisted wallets
   - Test with non-whitelisted wallets

3. **Monitor Test Results**
   - Keep track of test results
   - Document any issues found
   - Update `TEST_RESULTS.md` with findings

4. **Regular Testing**
   - Run tests after database changes
   - Test after API changes
   - Test after phase configuration changes

## Troubleshooting

### Database Connection Issues
```bash
# Verify database URL
echo $NEON_DATABASE

# Test connection
node -e "require('dotenv').config({path:'.env.local'}); console.log(process.env.NEON_DATABASE)"
```

### API Connection Issues
```bash
# Verify server is running
curl http://localhost:3000/api/launchpad/[collectionId]

# Check base URL
echo $NEXT_PUBLIC_BASE_URL
```

### Test Wallet Issues
```bash
# Verify wallet is set
echo $TEST_WALLET

# Check if wallet is whitelisted (run test script)
node scripts/test-whitelist-entries.js
```

## Support

For issues or questions:
1. Check test output for error messages
2. Review `TEST_RESULTS.md` for known issues
3. Check database and API logs
4. Verify environment variables are set correctly


