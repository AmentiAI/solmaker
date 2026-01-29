-- Migration: Add aspect_ratio column to promotion_jobs table
-- Supports: square (1024x1024), portrait (1024x1536), landscape (1536x1024), story (1024x1792)

ALTER TABLE promotion_jobs
ADD COLUMN IF NOT EXISTS aspect_ratio TEXT DEFAULT 'square';

-- Add to promotions history table as well
ALTER TABLE promotions
ADD COLUMN IF NOT EXISTS aspect_ratio TEXT DEFAULT 'square';

-- Add comment for documentation
COMMENT ON COLUMN promotion_jobs.aspect_ratio IS 'Aspect ratio: square (1024x1024), portrait (1024x1536), landscape (1536x1024), story (1024x1792)';

