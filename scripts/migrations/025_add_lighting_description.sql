-- Add lighting_description column to collections table
ALTER TABLE collections 
ADD COLUMN IF NOT EXISTS lighting_description TEXT;

   