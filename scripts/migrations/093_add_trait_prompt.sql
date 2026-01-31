-- Migration 093: Add trait_prompt column to traits table

ALTER TABLE traits 
ADD COLUMN IF NOT EXISTS trait_prompt TEXT;

CREATE INDEX IF NOT EXISTS idx_traits_trait_prompt 
ON traits(trait_prompt) 
WHERE trait_prompt IS NOT NULL;
