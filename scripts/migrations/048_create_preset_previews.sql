-- Create preset_previews table to store generated positioning preset preview images
-- This prevents regenerating the same preview images multiple times

CREATE TABLE IF NOT EXISTS preset_previews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  preset_id TEXT NOT NULL UNIQUE,
  image_url TEXT NOT NULL,
  prompt TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_preset_previews_preset_id ON preset_previews(preset_id);

-- Add comment
COMMENT ON TABLE preset_previews IS 'Stores generated preview images for character positioning presets to avoid regeneration';

