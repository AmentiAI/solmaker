-- Migration 100: Add max_fee_rate column to mint_phases table

ALTER TABLE mint_phases 
ADD COLUMN IF NOT EXISTS max_fee_rate DECIMAL(10,2) DEFAULT 500;

CREATE INDEX IF NOT EXISTS idx_mint_phases_max_fee_rate 
ON mint_phases(max_fee_rate);

COMMENT ON COLUMN mint_phases.max_fee_rate IS 'Maximum allowed fee rate in sat/vB for minting';
