-- Migration 096: Add trait_combination_hash column to generated_ordinals table

ALTER TABLE generated_ordinals 
ADD COLUMN IF NOT EXISTS trait_combination_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_generated_ordinals_trait_hash 
ON generated_ordinals(collection_id, trait_combination_hash) 
WHERE trait_combination_hash IS NOT NULL;
