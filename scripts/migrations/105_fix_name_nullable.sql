-- Migration 105: Fix name column to allow NULL values

ALTER TABLE mint_phases 
ALTER COLUMN name DROP NOT NULL;

COMMENT ON COLUMN mint_phases.name IS 'Name of the mint phase (e.g., Early Bird, Whitelist, Public Mint) - nullable';
