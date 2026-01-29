-- Add pixel_perfect column to collections table
ALTER TABLE collections
ADD COLUMN IF NOT EXISTS pixel_perfect BOOLEAN DEFAULT FALSE;

-- Add comment explaining the column
COMMENT ON COLUMN collections.pixel_perfect IS 'When true, character body/skin traits include pixel-perfect positioning prompts for consistent body alignment';
