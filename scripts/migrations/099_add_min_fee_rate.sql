-- Migration 099: Add min_fee_rate column to mint_phases table

ALTER TABLE mint_phases 
ADD COLUMN IF NOT EXISTS min_fee_rate DECIMAL(10,2) DEFAULT 0.1;

CREATE INDEX IF NOT EXISTS idx_mint_phases_min_fee_rate 
ON mint_phases(min_fee_rate);

COMMENT ON COLUMN mint_phases.min_fee_rate IS 'Minimum allowed fee rate in sat/vB for minting';
