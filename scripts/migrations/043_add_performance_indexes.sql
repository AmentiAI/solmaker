-- Migration: Add performance indexes for common queries
-- These indexes improve query performance for frequently accessed patterns

-- Index for ordinals by collection (heavily used in counts and fetches)
CREATE INDEX IF NOT EXISTS idx_generated_ordinals_collection_id 
ON generated_ordinals(collection_id);

-- Index for ordinals with image_url filtering
CREATE INDEX IF NOT EXISTS idx_generated_ordinals_collection_image 
ON generated_ordinals(collection_id) 
WHERE image_url IS NOT NULL AND image_url != '';

-- Index for collections by wallet (ownership lookups)
CREATE INDEX IF NOT EXISTS idx_collections_wallet_address 
ON collections(wallet_address);

-- Index for generation jobs status + collection (job polling)
CREATE INDEX IF NOT EXISTS idx_generation_jobs_status_collection 
ON generation_jobs(collection_id, status);

-- Index for pending/processing jobs (cron job queries)
CREATE INDEX IF NOT EXISTS idx_generation_jobs_pending 
ON generation_jobs(status) 
WHERE status IN ('pending', 'processing');

-- Index for credit transactions by wallet
CREATE INDEX IF NOT EXISTS idx_credit_transactions_wallet 
ON credit_transactions(wallet_address);

-- Index for marketplace listings status
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_status 
ON collection_marketplace_listings(status);

-- Index for traits by layer (trait fetching)
CREATE INDEX IF NOT EXISTS idx_traits_layer_id 
ON traits(layer_id);

-- Index for layers by collection
CREATE INDEX IF NOT EXISTS idx_layers_collection_id 
ON layers(collection_id);

-- Analyze tables to update query planner statistics
ANALYZE generated_ordinals;
ANALYZE collections;
ANALYZE generation_jobs;
ANALYZE credit_transactions;
ANALYZE traits;
ANALYZE layers;

