-- Add colors_description column to collections table
ALTER TABLE collections 
ADD COLUMN IF NOT EXISTS colors_description TEXT;

