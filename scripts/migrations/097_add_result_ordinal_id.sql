-- Migration 097: Add result_ordinal_id column to generation_jobs table

ALTER TABLE generation_jobs 
ADD COLUMN IF NOT EXISTS result_ordinal_id UUID;

CREATE INDEX IF NOT EXISTS idx_generation_jobs_result_ordinal_id 
ON generation_jobs(result_ordinal_id) 
WHERE result_ordinal_id IS NOT NULL;

-- Add foreign key constraint
ALTER TABLE generation_jobs 
ADD CONSTRAINT fk_generation_jobs_result_ordinal 
FOREIGN KEY (result_ordinal_id) 
REFERENCES generated_ordinals(id) 
ON DELETE SET NULL;
