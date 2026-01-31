-- Migration 098: Add minter_address column to generated_ordinals table

ALTER TABLE generated_ordinals 
ADD COLUMN IF NOT EXISTS minter_address TEXT;

CREATE INDEX IF NOT EXISTS idx_generated_ordinals_minter_address 
ON generated_ordinals(minter_address) 
WHERE minter_address IS NOT NULL;
