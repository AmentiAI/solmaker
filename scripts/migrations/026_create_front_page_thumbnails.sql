-- Create front_page_thumbnails table for 200x200 homepage ticker images
CREATE TABLE IF NOT EXISTS front_page_thumbnails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ordinal_id UUID NOT NULL REFERENCES generated_ordinals(id) ON DELETE CASCADE,
  thumbnail_url TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(ordinal_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_front_page_thumbnails_ordinal_id ON front_page_thumbnails(ordinal_id);

