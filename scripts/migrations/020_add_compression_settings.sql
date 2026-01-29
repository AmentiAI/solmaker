-- Add compression settings to collections table
ALTER TABLE collections 
ADD COLUMN IF NOT EXISTS compression_quality INTEGER DEFAULT 100,
ADD COLUMN IF NOT EXISTS compression_dimensions INTEGER DEFAULT 1024;

-- Add compressed_image_url to generated_ordinals for storing compressed versions
ALTER TABLE generated_ordinals
ADD COLUMN IF NOT EXISTS compressed_image_url TEXT;

