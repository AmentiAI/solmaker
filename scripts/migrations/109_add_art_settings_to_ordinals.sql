-- Migration 109: Add art_settings column to generated_ordinals table

ALTER TABLE generated_ordinals 
ADD COLUMN IF NOT EXISTS art_settings JSONB;

CREATE INDEX IF NOT EXISTS idx_generated_ordinals_art_settings 
ON generated_ordinals USING GIN (art_settings)
WHERE art_settings IS NOT NULL;

COMMENT ON COLUMN generated_ordinals.art_settings IS 'Art generation settings used for this specific NFT (JSONB)';
