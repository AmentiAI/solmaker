-- Migration: Add compression_target_kb column to collections table
-- This allows users to compress images to a target file size in KB

ALTER TABLE collections
ADD COLUMN IF NOT EXISTS compression_target_kb INTEGER;

-- Add comment
COMMENT ON COLUMN collections.compression_target_kb IS 'Target file size in KB for image compression. If set, overrides compression_quality and compression_dimensions. NULL means use quality/dimensions instead.';

