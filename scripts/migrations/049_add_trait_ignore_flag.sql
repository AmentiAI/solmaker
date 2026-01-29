-- Add is_ignored column to traits table
-- This allows traits to be disabled from generation without deleting them

ALTER TABLE traits
ADD COLUMN IF NOT EXISTS is_ignored BOOLEAN DEFAULT FALSE;

-- Add index for faster filtering during generation
CREATE INDEX IF NOT EXISTS idx_traits_is_ignored ON traits(layer_id, is_ignored)
WHERE is_ignored = FALSE;

-- Add comment
COMMENT ON COLUMN traits.is_ignored IS 'If true, this trait will be excluded from ordinal generation but not deleted';

