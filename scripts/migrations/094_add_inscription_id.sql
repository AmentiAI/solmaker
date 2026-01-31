-- Migration 094: Add inscription_id column to generated_ordinals table

ALTER TABLE generated_ordinals 
ADD COLUMN IF NOT EXISTS inscription_id TEXT;

CREATE INDEX IF NOT EXISTS idx_generated_ordinals_inscription_id 
ON generated_ordinals(inscription_id) 
WHERE inscription_id IS NOT NULL;
