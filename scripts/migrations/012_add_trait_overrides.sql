-- Add trait_overrides column to generation_jobs for filtered generation
ALTER TABLE generation_jobs
ADD COLUMN IF NOT EXISTS trait_overrides JSONB DEFAULT NULL;

-- Add index for querying jobs with overrides
CREATE INDEX IF NOT EXISTS idx_generation_jobs_trait_overrides 
ON generation_jobs(trait_overrides) 
WHERE trait_overrides IS NOT NULL;

-- Add comment explaining the column
COMMENT ON COLUMN generation_jobs.trait_overrides IS 'JSON object mapping layer names to specific trait names that should be used instead of random selection';

