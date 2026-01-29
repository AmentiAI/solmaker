-- Add thumbnail_url column for optimized display images
ALTER TABLE generated_ordinals
ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_ordinals_thumbnail ON generated_ordinals(thumbnail_url);

-- Leave thumbnail_url as NULL for existing records
-- They will be auto-generated on-demand when users visit the mint page

