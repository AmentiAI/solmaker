-- Add is_launchpad_collection flag to explicitly mark collections as launchpad collections
-- This replaces the vague "is_locked" check and provides clear launchpad tracking

ALTER TABLE collections 
ADD COLUMN IF NOT EXISTS is_launchpad_collection BOOLEAN DEFAULT FALSE;

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_collections_is_launchpad 
ON collections(is_launchpad_collection) 
WHERE is_launchpad_collection = TRUE;

-- Backfill: Mark existing collections as launchpad if they have mint phases and are locked
UPDATE collections c
SET is_launchpad_collection = TRUE
WHERE c.is_locked = TRUE
  AND EXISTS (
    SELECT 1 FROM mint_phases mp 
    WHERE mp.collection_id = c.id
  )
  AND c.is_launchpad_collection = FALSE;

-- Add comment for documentation
COMMENT ON COLUMN collections.is_launchpad_collection IS 'If true, this collection is officially marked as a launchpad collection and will appear on launchpad pages';



