-- Add original_image_url column to store the original (unflipped) image URL
-- This allows users to restore flipped images to their original state

ALTER TABLE generated_ordinals 
ADD COLUMN IF NOT EXISTS original_image_url TEXT;

-- Add comment for documentation
COMMENT ON COLUMN generated_ordinals.original_image_url IS 'Stores the URL of the original image before any flips. Used for restoration.';

