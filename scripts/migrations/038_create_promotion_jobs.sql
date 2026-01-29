-- Create promotion_jobs table for queued promotional flyer generation (processed by cron)
CREATE TABLE IF NOT EXISTS promotion_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  -- inputs
  flyer_text TEXT,
  no_text BOOLEAN DEFAULT FALSE,
  subject_type TEXT DEFAULT 'character',
  subject_count INTEGER NOT NULL DEFAULT 1,
  subject_actions JSONB,
  -- output
  image_url TEXT
);

CREATE INDEX IF NOT EXISTS idx_promotion_jobs_status_created ON promotion_jobs(status, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_promotion_jobs_wallet_created ON promotion_jobs(wallet_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_promotion_jobs_collection_created ON promotion_jobs(collection_id, created_at DESC);


