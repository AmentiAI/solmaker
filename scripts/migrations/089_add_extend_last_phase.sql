-- Migration 089: Add extend_last_phase column to collections table

ALTER TABLE collections 
ADD COLUMN IF NOT EXISTS extend_last_phase BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_collections_extend_last_phase 
ON collections(extend_last_phase);
