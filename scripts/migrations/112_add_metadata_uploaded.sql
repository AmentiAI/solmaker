-- Migration 112: Add metadata_uploaded column to generated_ordinals table

ALTER TABLE generated_ordinals 
ADD COLUMN IF NOT EXISTS metadata_uploaded BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_generated_ordinals_metadata_uploaded 
ON generated_ordinals(collection_id, metadata_uploaded);

COMMENT ON COLUMN generated_ordinals.metadata_uploaded IS 'Whether metadata has been uploaded to storage for Solana deployment';
