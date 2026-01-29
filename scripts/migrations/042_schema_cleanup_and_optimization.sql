-- =============================================================================
-- SCHEMA CLEANUP AND OPTIMIZATION
-- Fixes inconsistencies, adds missing indexes, and ensures proper constraints
-- =============================================================================

-- =============================================================================
-- 1. MINT_INSCRIPTIONS TABLE FIXES
-- =============================================================================

-- Ensure all critical columns exist
ALTER TABLE mint_inscriptions 
ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES mint_sessions(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS phase_id UUID REFERENCES mint_phases(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS commit_last_checked_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS reveal_last_checked_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS payment_address VARCHAR(255);

-- Add missing foreign key constraints (if not already present)
DO $$
BEGIN
  -- session_id foreign key (should already exist from migration 040)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'mint_inscriptions_session_id_fkey'
  ) THEN
    ALTER TABLE mint_inscriptions 
    ADD CONSTRAINT mint_inscriptions_session_id_fkey 
    FOREIGN KEY (session_id) REFERENCES mint_sessions(id) ON DELETE CASCADE;
  END IF;

  -- phase_id foreign key (should already exist from migration 041)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'mint_inscriptions_phase_id_fkey'
  ) THEN
    ALTER TABLE mint_inscriptions 
    ADD CONSTRAINT mint_inscriptions_phase_id_fkey 
    FOREIGN KEY (phase_id) REFERENCES mint_phases(id) ON DELETE SET NULL;
  END IF;
END $$;

-- =============================================================================
-- 2. MISSING INDEXES FOR MINT_INSCRIPTIONS
-- =============================================================================

-- Phase-related indexes (should exist from migration 041, but ensure they do)
CREATE INDEX IF NOT EXISTS idx_mint_inscriptions_phase_id 
ON mint_inscriptions(phase_id) 
WHERE phase_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mint_inscriptions_phase_collection_wallet 
ON mint_inscriptions(phase_id, collection_id, minter_wallet) 
WHERE phase_id IS NOT NULL AND is_test_mint = false;

-- Session index (should exist from migration 040)
CREATE INDEX IF NOT EXISTS idx_mint_inscriptions_session 
ON mint_inscriptions(session_id) 
WHERE session_id IS NOT NULL;

-- Transaction checking indexes (should exist from migration 041_add_tx_checking_fields)
CREATE INDEX IF NOT EXISTS idx_mint_inscriptions_commit_check 
ON mint_inscriptions(commit_last_checked_at) 
WHERE commit_tx_id IS NOT NULL AND commit_confirmed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_mint_inscriptions_reveal_check 
ON mint_inscriptions(reveal_last_checked_at) 
WHERE reveal_tx_id IS NOT NULL AND reveal_confirmed_at IS NULL;

-- Composite index for common query pattern: collection + phase + status
CREATE INDEX IF NOT EXISTS idx_mint_inscriptions_collection_phase_status 
ON mint_inscriptions(collection_id, phase_id, mint_status) 
WHERE is_test_mint = false;

-- Index for wallet + collection + phase lookups (user mint counts)
CREATE INDEX IF NOT EXISTS idx_mint_inscriptions_wallet_collection_phase 
ON mint_inscriptions(minter_wallet, collection_id, phase_id) 
WHERE is_test_mint = false AND commit_tx_id IS NOT NULL;

-- Index for commit_tx_id lookups (very common)
CREATE INDEX IF NOT EXISTS idx_mint_inscriptions_commit_tx_id 
ON mint_inscriptions(commit_tx_id) 
WHERE commit_tx_id IS NOT NULL;

-- Index for reveal_tx_id lookups
CREATE INDEX IF NOT EXISTS idx_mint_inscriptions_reveal_tx_id 
ON mint_inscriptions(reveal_tx_id) 
WHERE reveal_tx_id IS NOT NULL;

-- =============================================================================
-- 3. MINT_SESSIONS TABLE FIXES
-- =============================================================================

-- Ensure payment_address exists (should from migration 037)
ALTER TABLE mint_sessions 
ADD COLUMN IF NOT EXISTS payment_address VARCHAR(255),
ADD COLUMN IF NOT EXISTS reveal_data JSONB,
ADD COLUMN IF NOT EXISTS commit_tx_hex TEXT;

-- Add index for payment_address
CREATE INDEX IF NOT EXISTS idx_mint_sessions_payment_address 
ON mint_sessions(payment_address) 
WHERE payment_address IS NOT NULL;

-- =============================================================================
-- 4. ORDINAL_RESERVATIONS TABLE FIXES
-- =============================================================================

-- Ensure proper indexes exist
CREATE INDEX IF NOT EXISTS idx_reservations_phase_id 
ON ordinal_reservations(phase_id) 
WHERE phase_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reservations_collection_phase 
ON ordinal_reservations(collection_id, phase_id) 
WHERE phase_id IS NOT NULL;

-- Composite index for active reservations lookup
CREATE INDEX IF NOT EXISTS idx_reservations_active 
ON ordinal_reservations(collection_id, status, expires_at) 
WHERE status = 'reserved';

-- =============================================================================
-- 5. MINT_PHASES TABLE FIXES
-- =============================================================================

-- Ensure whitelist_id foreign key exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'fk_phase_whitelist'
  ) THEN
    ALTER TABLE mint_phases 
    ADD CONSTRAINT fk_phase_whitelist 
    FOREIGN KEY (whitelist_id) REFERENCES mint_phase_whitelists(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Index for active phase lookups (very common query)
CREATE INDEX IF NOT EXISTS idx_mint_phases_active_collection 
ON mint_phases(collection_id, is_active, start_time, end_time) 
WHERE is_active = true OR (start_time <= NOW() AND (end_time IS NULL OR end_time > NOW()));

-- =============================================================================
-- 6. GENERATED_ORDINALS TABLE FIXES
-- =============================================================================

-- Ensure is_minted index exists (very common query)
CREATE INDEX IF NOT EXISTS idx_generated_ordinals_collection_minted 
ON generated_ordinals(collection_id, is_minted) 
WHERE is_minted = false;

-- Index for ordinal_number lookups
CREATE INDEX IF NOT EXISTS idx_generated_ordinals_ordinal_number 
ON generated_ordinals(collection_id, ordinal_number) 
WHERE ordinal_number IS NOT NULL;

-- =============================================================================
-- 7. COLLECTIONS TABLE FIXES
-- =============================================================================

-- Ensure wallet_address index exists (for owner lookups)
CREATE INDEX IF NOT EXISTS idx_collections_wallet_address 
ON collections(wallet_address) 
WHERE wallet_address IS NOT NULL;

-- Index for locked collections
CREATE INDEX IF NOT EXISTS idx_collections_locked 
ON collections(is_locked, locked_at) 
WHERE is_locked = true;

-- =============================================================================
-- 8. DATA INTEGRITY CONSTRAINTS
-- =============================================================================

-- Ensure mint_status constraint is up to date (include reveal_broadcast, reveal_confirming)
DO $$
BEGIN
  -- Drop old constraint if it exists and doesn't include all statuses
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'valid_mint_status'
    AND conrelid = 'mint_inscriptions'::regclass
  ) THEN
    ALTER TABLE mint_inscriptions DROP CONSTRAINT valid_mint_status;
  END IF;
  
  -- Add updated constraint with all statuses
  ALTER TABLE mint_inscriptions 
  ADD CONSTRAINT valid_mint_status CHECK (mint_status IN (
    'pending', 'compressing', 'compressed',
    'commit_created', 'commit_signed', 'commit_broadcast', 'commit_confirming', 'commit_confirmed',
    'reveal_created', 'reveal_broadcast', 'reveal_confirming', 'reveal_confirmed',
    'completed', 'failed', 'stuck', 'refunded', 'cancelled'
  ));
EXCEPTION
  WHEN duplicate_object THEN NULL; -- Constraint already exists with correct values
END $$;

-- =============================================================================
-- 9. PERFORMANCE: ANALYZE TABLES
-- =============================================================================

ANALYZE mint_inscriptions;
ANALYZE mint_sessions;
ANALYZE ordinal_reservations;
ANALYZE mint_phases;
ANALYZE generated_ordinals;
ANALYZE collections;

-- =============================================================================
-- 10. VERIFICATION QUERIES (for manual checking)
-- =============================================================================

-- Uncomment to verify indexes were created:
-- SELECT indexname, indexdef 
-- FROM pg_indexes 
-- WHERE tablename = 'mint_inscriptions' 
-- ORDER BY indexname;

-- Uncomment to verify foreign keys:
-- SELECT conname, conrelid::regclass, confrelid::regclass 
-- FROM pg_constraint 
-- WHERE contype = 'f' 
-- AND conrelid = 'mint_inscriptions'::regclass;

