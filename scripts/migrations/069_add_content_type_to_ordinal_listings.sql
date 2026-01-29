-- Add content_type column to ordinal_listings table
-- This allows proper display of HTML, video, audio, and other content types

ALTER TABLE ordinal_listings
ADD COLUMN IF NOT EXISTS content_type VARCHAR(255);

-- Add index for content_type queries
CREATE INDEX IF NOT EXISTS idx_ordinal_listings_content_type ON ordinal_listings(content_type) WHERE content_type IS NOT NULL;
