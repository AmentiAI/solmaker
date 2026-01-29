-- Migration: Ensure generation_jobs has started_at and completed_at fields
-- Also clean up any stuck "processing" jobs

-- Add started_at column if it doesn't exist
ALTER TABLE generation_jobs
ADD COLUMN IF NOT EXISTS started_at TIMESTAMP;

-- Add completed_at column if it doesn't exist  
ALTER TABLE generation_jobs
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;

-- Add error_message column if it doesn't exist
ALTER TABLE generation_jobs
ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Clean up any existing jobs that are stuck in "processing" status
-- These were likely interrupted and should be marked as failed
UPDATE generation_jobs
SET 
  status = 'failed',
  completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP),
  error_message = COALESCE(error_message, 'Job was stuck in processing state - cleaned up by migration')
WHERE status = 'processing';

-- For safety, also mark very old "pending" jobs as failed (older than 24 hours)
-- This prevents ancient jobs from suddenly trying to run
UPDATE generation_jobs
SET 
  status = 'failed',
  completed_at = CURRENT_TIMESTAMP,
  error_message = 'Job was pending for over 24 hours - cleaned up by migration'
WHERE status = 'pending'
  AND created_at < NOW() - INTERVAL '24 hours';

