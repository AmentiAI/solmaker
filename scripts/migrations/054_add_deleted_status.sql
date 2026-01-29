-- Add 'deleted' status to collection_status and add CHECK constraint
-- This enables soft deletes for collections

-- First, add CHECK constraint to ensure only valid statuses
ALTER TABLE collections
DROP CONSTRAINT IF EXISTS chk_collection_status;

ALTER TABLE collections
ADD CONSTRAINT chk_collection_status 
CHECK (collection_status IN ('draft', 'launchpad', 'self_inscribe', 'marketplace', 'deleted'));

-- Update comment to include deleted status
COMMENT ON COLUMN collections.collection_status IS 'Collection status: draft, launchpad, self_inscribe, marketplace, or deleted';

