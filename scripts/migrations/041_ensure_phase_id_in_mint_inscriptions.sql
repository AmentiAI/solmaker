-- Migration: Ensure phase_id column exists and is properly indexed
-- This migration ensures phase_id is always available for mint_inscriptions

-- Add phase_id column if it doesn't exist
ALTER TABLE mint_inscriptions 
ADD COLUMN IF NOT EXISTS phase_id UUID REFERENCES mint_phases(id) ON DELETE SET NULL;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_mint_inscriptions_phase_id 
ON mint_inscriptions(phase_id) 
WHERE phase_id IS NOT NULL;

-- Create composite index for common queries (phase + collection + wallet)
CREATE INDEX IF NOT EXISTS idx_mint_inscriptions_phase_collection_wallet 
ON mint_inscriptions(phase_id, collection_id, minter_wallet) 
WHERE phase_id IS NOT NULL AND is_test_mint = false;

-- Backfill phase_id from ordinal_reservations for existing records
UPDATE mint_inscriptions mi
SET phase_id = r.phase_id
FROM ordinal_reservations r
WHERE mi.ordinal_id = r.ordinal_id
  AND mi.phase_id IS NULL
  AND r.phase_id IS NOT NULL
  AND r.status = 'completed';

-- Also backfill from reservations that are still reserved (in case of pending mints)
UPDATE mint_inscriptions mi
SET phase_id = r.phase_id
FROM ordinal_reservations r
WHERE mi.ordinal_id = r.ordinal_id
  AND mi.phase_id IS NULL
  AND r.phase_id IS NOT NULL
  AND r.status = 'reserved'
  AND r.expires_at > NOW();

-- Log the results
DO $$
DECLARE
  total_with_phase INTEGER;
  total_without_phase INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_with_phase 
  FROM mint_inscriptions 
  WHERE phase_id IS NOT NULL;
  
  SELECT COUNT(*) INTO total_without_phase 
  FROM mint_inscriptions 
  WHERE phase_id IS NULL 
  AND is_test_mint = false;
  
  RAISE NOTICE 'Migration complete: % records with phase_id, % records without phase_id', 
    total_with_phase, total_without_phase;
END $$;

