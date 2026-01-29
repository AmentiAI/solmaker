-- Performance optimization: Add indexes for frequently queried columns
-- This migration adds indexes to reduce database compute costs

-- Ensure indexes exist for generated_ordinals table
-- Index for collection_id + created_at (for ORDER BY queries)
CREATE INDEX IF NOT EXISTS idx_generated_ordinals_collection_created_desc 
ON generated_ordinals (collection_id, created_at DESC);

-- Index for collection_id + ordinal_number (for ordering by number)
CREATE INDEX IF NOT EXISTS idx_generated_ordinals_collection_number 
ON generated_ordinals (collection_id, ordinal_number ASC);

-- Index for collection_id + is_minted (for filtering unminted ordinals)
CREATE INDEX IF NOT EXISTS idx_generated_ordinals_collection_minted 
ON generated_ordinals (collection_id, is_minted) 
WHERE is_minted IS FALSE OR is_minted IS NULL;

-- Index for COUNT queries on collection_id
CREATE INDEX IF NOT EXISTS idx_generated_ordinals_collection_id 
ON generated_ordinals (collection_id);

-- Index for trait_combination_hash lookups (duplicate detection)
CREATE INDEX IF NOT EXISTS idx_generated_ordinals_hash 
ON generated_ordinals (collection_id, trait_combination_hash);

-- Ensure indexes exist for generation_jobs table
-- Composite index for status + collection_id + created_at queries
CREATE INDEX IF NOT EXISTS idx_generation_jobs_status_collection 
ON generation_jobs (status, collection_id, created_at);

-- Index for collection_id + status (for GROUP BY queries)
CREATE INDEX IF NOT EXISTS idx_generation_jobs_collection_status 
ON generation_jobs (collection_id, status);

-- Index for pending jobs query (most common)
CREATE INDEX IF NOT EXISTS idx_generation_jobs_pending 
ON generation_jobs (status, created_at ASC) 
WHERE status = 'pending';

-- Analyze tables to update statistics after index creation
ANALYZE generated_ordinals;
ANALYZE generation_jobs;

