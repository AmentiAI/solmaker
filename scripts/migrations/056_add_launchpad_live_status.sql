-- Add 'launchpad_live' status to collection_status CHECK constraint
-- This enables the final launch flag that makes collections visible on /launchpad

-- Drop existing constraint
ALTER TABLE collections
DROP CONSTRAINT IF EXISTS chk_collection_status;

-- Add new constraint with launchpad_live status
ALTER TABLE collections
ADD CONSTRAINT chk_collection_status 
CHECK (collection_status IN ('draft', 'launchpad', 'launchpad_live', 'self_inscribe', 'marketplace', 'deleted'));

-- Update comment to include launchpad_live status
COMMENT ON COLUMN collections.collection_status IS 'Collection status: draft, launchpad, launchpad_live, self_inscribe, marketplace, or deleted';

