-- Migration 088: Add locked_at and locked_by columns to collections table

ALTER TABLE collections 
ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;

ALTER TABLE collections 
ADD COLUMN IF NOT EXISTS locked_by TEXT;

CREATE INDEX IF NOT EXISTS idx_collections_locked_at 
ON collections(locked_at) 
WHERE locked_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_collections_locked_by 
ON collections(locked_by) 
WHERE locked_by IS NOT NULL;
