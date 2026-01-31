-- Migration 106: Add deployment_status column to collections table

ALTER TABLE collections 
ADD COLUMN IF NOT EXISTS deployment_status TEXT DEFAULT 'not_deployed';

CREATE INDEX IF NOT EXISTS idx_collections_deployment_status 
ON collections(deployment_status);

COMMENT ON COLUMN collections.deployment_status IS 'Solana deployment status: not_deployed, uploading_metadata, creating_collection_nft, deploying_candy_machine, deployed, failed';
