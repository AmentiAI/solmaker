-- Migration 114: Add rarity_tier column to generated_ordinals table

ALTER TABLE generated_ordinals 
ADD COLUMN IF NOT EXISTS rarity_tier TEXT;

CREATE INDEX IF NOT EXISTS idx_generated_ordinals_rarity_tier 
ON generated_ordinals(collection_id, rarity_tier) 
WHERE rarity_tier IS NOT NULL;

COMMENT ON COLUMN generated_ordinals.rarity_tier IS 'Rarity tier classification (e.g., Common, Rare, Epic, Legendary)';
