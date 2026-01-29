-- Create generation_errors table for tracking API errors during image generation
CREATE TABLE IF NOT EXISTS generation_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_job_id UUID NOT NULL REFERENCES generation_jobs(id) ON DELETE CASCADE,
  collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  ordinal_number INTEGER,
  error_type VARCHAR(50) NOT NULL, -- e.g., 'api_error', 'timeout', 'upload_error', 'download_error', 'compression_error', 'thumbnail_error', 'unknown'
  error_message TEXT NOT NULL,
  error_details JSONB, -- Full error object/details
  api_response JSONB, -- Full API response if available
  prompt TEXT, -- The prompt that was used for generation
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_generation_errors_job_id 
ON generation_errors (generation_job_id);

CREATE INDEX IF NOT EXISTS idx_generation_errors_collection_id 
ON generation_errors (collection_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_generation_errors_error_type 
ON generation_errors (error_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_generation_errors_created_at 
ON generation_errors (created_at DESC);

-- Add comment explaining the table
COMMENT ON TABLE generation_errors IS 'Stores detailed error information when image generation API calls fail';

