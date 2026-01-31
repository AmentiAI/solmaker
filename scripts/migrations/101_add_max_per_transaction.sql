-- Migration 101: Add max_per_transaction column to mint_phases table

ALTER TABLE mint_phases 
ADD COLUMN IF NOT EXISTS max_per_transaction INTEGER DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_mint_phases_max_per_transaction 
ON mint_phases(max_per_transaction);

COMMENT ON COLUMN mint_phases.max_per_transaction IS 'Maximum number of NFTs that can be minted in a single transaction';
