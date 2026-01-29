-- Add collection_status column to replace is_launchpad_collection
-- Status values: 'draft', 'launchpad', 'self_inscribe', 'marketplace'

ALTER TABLE collections 
ADD COLUMN IF NOT EXISTS collection_status VARCHAR(50) DEFAULT 'draft';

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_collections_status 
ON collections(collection_status) 
WHERE collection_status IS NOT NULL;

-- Backfill: Set status based on existing is_launchpad_collection and marketplace listings
UPDATE collections c
SET collection_status = CASE
  WHEN EXISTS (
    SELECT 1 FROM collection_marketplace_listings ml 
    WHERE ml.collection_id = c.id AND ml.status = 'active'
  ) THEN 'marketplace'
  WHEN c.is_launchpad_collection = TRUE THEN 'launchpad'
  WHEN c.launch_status IS NOT NULL AND c.launch_status != 'draft' AND c.is_launchpad_collection = FALSE THEN 'self_inscribe'
  ELSE 'draft'
END
WHERE collection_status IS NULL OR collection_status = 'draft';

-- Add comment for documentation
COMMENT ON COLUMN collections.collection_status IS 'Collection status: draft, launchpad, self_inscribe, or marketplace';

