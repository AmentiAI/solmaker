-- Add KB size fields for better size tracking
-- These store the file sizes in KB (as DECIMAL for precision) for original, compressed, and thumbnail images

ALTER TABLE generated_ordinals
ADD COLUMN IF NOT EXISTS original_size_kb DECIMAL(10, 2);

ALTER TABLE generated_ordinals
ADD COLUMN IF NOT EXISTS compressed_size_kb DECIMAL(10, 2);

ALTER TABLE generated_ordinals
ADD COLUMN IF NOT EXISTS thumbnail_size_kb DECIMAL(10, 2);

-- Add comments
COMMENT ON COLUMN generated_ordinals.original_size_kb IS 'Size of the original image in KB';
COMMENT ON COLUMN generated_ordinals.compressed_size_kb IS 'Size of the compressed image in KB (if compression was applied)';
COMMENT ON COLUMN generated_ordinals.thumbnail_size_kb IS 'Size of the thumbnail image in KB';

