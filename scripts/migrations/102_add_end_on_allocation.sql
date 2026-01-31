-- Migration 102: Add end_on_allocation column to mint_phases table

ALTER TABLE mint_phases 
ADD COLUMN IF NOT EXISTS end_on_allocation BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_mint_phases_end_on_allocation 
ON mint_phases(end_on_allocation);

COMMENT ON COLUMN mint_phases.end_on_allocation IS 'Whether the phase should automatically end when all NFTs are allocated';
