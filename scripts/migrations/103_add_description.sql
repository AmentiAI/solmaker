-- Migration 103: Add description column to mint_phases table

ALTER TABLE mint_phases 
ADD COLUMN IF NOT EXISTS description TEXT;

CREATE INDEX IF NOT EXISTS idx_mint_phases_description 
ON mint_phases(description) 
WHERE description IS NOT NULL;

COMMENT ON COLUMN mint_phases.description IS 'Description of the mint phase for users';
