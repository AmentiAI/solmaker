-- Migration 104: Add name column to mint_phases table

ALTER TABLE mint_phases 
ADD COLUMN IF NOT EXISTS name TEXT;

CREATE INDEX IF NOT EXISTS idx_mint_phases_name 
ON mint_phases(name) 
WHERE name IS NOT NULL;

COMMENT ON COLUMN mint_phases.name IS 'Name of the mint phase (e.g., Early Bird, Whitelist, Public Mint)';
