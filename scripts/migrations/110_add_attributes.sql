-- Migration 110: Add attributes column to generated_ordinals table

ALTER TABLE generated_ordinals 
ADD COLUMN IF NOT EXISTS attributes JSONB;

CREATE INDEX IF NOT EXISTS idx_generated_ordinals_attributes 
ON generated_ordinals USING GIN (attributes)
WHERE attributes IS NOT NULL;

COMMENT ON COLUMN generated_ordinals.attributes IS 'NFT attributes/traits in metadata format (JSONB)';
