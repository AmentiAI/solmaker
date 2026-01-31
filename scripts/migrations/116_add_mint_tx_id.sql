-- Migration 116: Add mint_tx_id column to generated_ordinals table

ALTER TABLE generated_ordinals 
ADD COLUMN IF NOT EXISTS mint_tx_id TEXT;

CREATE INDEX IF NOT EXISTS idx_generated_ordinals_mint_tx_id 
ON generated_ordinals(mint_tx_id) 
WHERE mint_tx_id IS NOT NULL;

COMMENT ON COLUMN generated_ordinals.mint_tx_id IS 'Transaction ID/signature for the mint transaction';
