-- Migration 107: Add art_settings column to collections table

ALTER TABLE collections 
ADD COLUMN IF NOT EXISTS art_settings JSONB;

CREATE INDEX IF NOT EXISTS idx_collections_art_settings 
ON collections USING GIN (art_settings)
WHERE art_settings IS NOT NULL;

COMMENT ON COLUMN collections.art_settings IS 'Art generation settings and parameters (JSONB)';
