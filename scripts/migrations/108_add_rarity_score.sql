-- Migration 108: Add rarity_score column to generated_ordinals table

ALTER TABLE generated_ordinals 
ADD COLUMN IF NOT EXISTS rarity_score NUMERIC(10, 2);

CREATE INDEX IF NOT EXISTS idx_generated_ordinals_rarity_score 
ON generated_ordinals(collection_id, rarity_score) 
WHERE rarity_score IS NOT NULL;

COMMENT ON COLUMN generated_ordinals.rarity_score IS 'Calculated rarity score for the NFT based on trait combinations';
