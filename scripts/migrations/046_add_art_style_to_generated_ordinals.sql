-- Add art_style column to generated_ordinals table
-- This stores the art style used when generating each ordinal
ALTER TABLE generated_ordinals
ADD COLUMN IF NOT EXISTS art_style TEXT;

-- Add comment
COMMENT ON COLUMN generated_ordinals.art_style IS 'Art style used for generating this ordinal (e.g., "chibi", "anime", "pixel art", etc.)';

-- Add index for faster queries by art style
CREATE INDEX IF NOT EXISTS idx_generated_ordinals_art_style 
ON generated_ordinals (collection_id, art_style);

