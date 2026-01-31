-- Migration 113: Add metadata_uploaded column to collections table

ALTER TABLE collections 
ADD COLUMN IF NOT EXISTS metadata_uploaded BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_collections_metadata_uploaded 
ON collections(metadata_uploaded);

COMMENT ON COLUMN collections.metadata_uploaded IS 'Whether all NFT metadata has been uploaded for Solana deployment';
