-- Migration 095: Add is_ignored column to traits table

ALTER TABLE traits 
ADD COLUMN IF NOT EXISTS is_ignored BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_traits_is_ignored 
ON traits(is_ignored);
