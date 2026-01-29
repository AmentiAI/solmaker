-- Add file_size_bytes column for inscription cost calculation
ALTER TABLE generated_ordinals
ADD COLUMN IF NOT EXISTS file_size_bytes INTEGER;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_ordinals_file_size ON generated_ordinals(file_size_bytes);

-- Add comment explaining the column
COMMENT ON COLUMN generated_ordinals.file_size_bytes IS 'Size of the image file in bytes, used for inscription cost estimation';

