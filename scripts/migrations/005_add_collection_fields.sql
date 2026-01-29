-- Add new fields to collections table
ALTER TABLE collections 
ADD COLUMN IF NOT EXISTS art_style TEXT,
ADD COLUMN IF NOT EXISTS border_requirements TEXT,
ADD COLUMN IF NOT EXISTS custom_rules TEXT;
