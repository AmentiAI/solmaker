-- Add generation mode to collections table
-- Allows collections to be either trait-based or prompt-based

-- Add generation_mode column (defaults to 'trait' for existing collections)
ALTER TABLE collections 
ADD COLUMN IF NOT EXISTS generation_mode TEXT DEFAULT 'trait' CHECK (generation_mode IN ('trait', 'prompt'));

-- Note: art_style and border_requirements columns may already exist
-- Add prompt_description to generation_jobs for prompt-based collections
ALTER TABLE generation_jobs 
ADD COLUMN IF NOT EXISTS prompt_description TEXT;

-- Create index for faster filtering by mode
CREATE INDEX IF NOT EXISTS idx_collections_generation_mode 
ON collections (generation_mode);

-- Update existing collections to have trait mode explicitly set
UPDATE collections 
SET generation_mode = 'trait' 
WHERE generation_mode IS NULL;

