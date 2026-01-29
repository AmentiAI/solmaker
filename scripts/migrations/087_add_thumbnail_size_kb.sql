-- Migration 087: Add thumbnail_size_kb column to generated_ordinals table

ALTER TABLE generated_ordinals 
ADD COLUMN IF NOT EXISTS thumbnail_size_kb NUMERIC(10, 2);

CREATE INDEX IF NOT EXISTS idx_generated_ordinals_thumbnail_size 
ON generated_ordinals(thumbnail_size_kb) 
WHERE thumbnail_size_kb IS NOT NULL;
