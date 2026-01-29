-- Create generation_jobs table for queued ordinal generation
CREATE TABLE IF NOT EXISTS generation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL,
  ordinal_number INTEGER,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,
  result_ordinal_id UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP
);

-- Add foreign key constraint
ALTER TABLE generation_jobs 
ADD CONSTRAINT generation_jobs_collection_id_fkey 
FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE;

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_generation_jobs_status 
ON generation_jobs (status, created_at);

CREATE INDEX IF NOT EXISTS idx_generation_jobs_collection 
ON generation_jobs (collection_id, created_at DESC);
