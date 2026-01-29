-- Migration: Optimize polling queries for high concurrency
-- Adds indexes and optimizations for real-time updates

-- =============================================================================
-- 1. OPTIMIZE PHASE_MINTED CALCULATION
-- =============================================================================

-- Add partial index for revealed mints (most common query in polling)
CREATE INDEX IF NOT EXISTS idx_mint_inscriptions_phase_revealed
ON mint_inscriptions(phase_id)
WHERE is_test_mint = false
  AND (
    reveal_tx_id IS NOT NULL 
    OR reveal_broadcast_at IS NOT NULL
    OR mint_status IN ('reveal_broadcast', 'reveal_confirming', 'completed')
  );

-- =============================================================================
-- 2. OPTIMIZE ACTIVE PHASE QUERIES
-- =============================================================================

-- Composite index for active phase lookup (used in every poll)
-- This covers the WHERE clause: collection_id, is_completed=false, start_time, end_time
CREATE INDEX IF NOT EXISTS idx_mint_phases_active_polling
ON mint_phases(collection_id, phase_order, start_time, end_time)
WHERE is_completed = false;

-- =============================================================================
-- 3. OPTIMIZE RESERVATION QUERIES
-- =============================================================================

-- Index for checking available ordinals (used in reservation)
-- Covers: collection_id, is_minted=false, and NOT EXISTS check
CREATE INDEX IF NOT EXISTS idx_reservations_active_lookup
ON ordinal_reservations(ordinal_id, status, expires_at)
WHERE status = 'reserved';

-- =============================================================================
-- 4. OPTIMIZE COUNT QUERIES
-- =============================================================================

-- Index for total_minted count (used in every poll)
-- Covers: collection_id, commit_tx_id IS NOT NULL, is_test_mint=false
CREATE INDEX IF NOT EXISTS idx_mint_inscriptions_collection_committed
ON mint_inscriptions(collection_id, commit_tx_id)
WHERE commit_tx_id IS NOT NULL
  AND LENGTH(TRIM(commit_tx_id)) > 0
  AND is_test_mint = false;

-- =============================================================================
-- 5. ANALYZE TABLES FOR QUERY PLANNER
-- =============================================================================

ANALYZE mint_inscriptions;
ANALYZE mint_phases;
ANALYZE ordinal_reservations;
ANALYZE generated_ordinals;

-- =============================================================================
-- 6. CREATE MATERIALIZED VIEW FOR PHASE COUNTS (OPTIONAL - for very high traffic)
-- =============================================================================

-- This can be refreshed periodically (e.g., every 10 seconds) instead of calculating on every poll
-- Uncomment if experiencing high DB load from phase_minted calculations

-- CREATE MATERIALIZED VIEW IF NOT EXISTS phase_mint_counts AS
-- SELECT 
--   phase_id,
--   COUNT(*) as phase_minted
-- FROM mint_inscriptions
-- WHERE is_test_mint = false
--   AND (
--     reveal_tx_id IS NOT NULL 
--     OR reveal_broadcast_at IS NOT NULL
--     OR mint_status IN ('reveal_broadcast', 'reveal_confirming', 'completed')
--   )
-- GROUP BY phase_id;

-- CREATE UNIQUE INDEX IF NOT EXISTS idx_phase_mint_counts_phase
-- ON phase_mint_counts(phase_id);

-- Note: Refresh with: REFRESH MATERIALIZED VIEW CONCURRENTLY phase_mint_counts;

