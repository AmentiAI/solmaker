-- Migration 086: Add ordinal_number and trait_overrides columns to generation_jobs table
-- These columns track which specific ordinal/NFT number is being generated and custom traits

-- Add ordinal_number column (nullable since some jobs may not have a specific number)
ALTER TABLE generation_jobs 
ADD COLUMN IF NOT EXISTS ordinal_number INTEGER;

-- Add trait_overrides column (JSONB for custom trait configurations)
ALTER TABLE generation_jobs 
ADD COLUMN IF NOT EXISTS trait_overrides JSONB;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_generation_jobs_ordinal_number 
ON generation_jobs(collection_id, ordinal_number) 
WHERE ordinal_number IS NOT NULL;

-- Add index for trait_overrides queries
CREATE INDEX IF NOT EXISTS idx_generation_jobs_trait_overrides 
ON generation_jobs USING GIN (trait_overrides)
WHERE trait_overrides IS NOT NULL;

-- Add comments
COMMENT ON COLUMN generation_jobs.ordinal_number IS 'Specific ordinal/NFT number being generated (NULL for auto-assigned)';
COMMENT ON COLUMN generation_jobs.trait_overrides IS 'Custom trait configurations for this generation job (JSONB)';
