-- Add compression_format column to collections table
-- This allows users to specify the image format (webp, jpg, png) for compression

ALTER TABLE collections 
ADD COLUMN IF NOT EXISTS compression_format TEXT DEFAULT 'webp';

-- Add comment
COMMENT ON COLUMN collections.compression_format IS 'Image format for compression: webp, jpg, or png. Defaults to webp.';

