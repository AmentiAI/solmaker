-- Add cap_supply column to collections table
-- This allows collections to set a maximum mint count that's less than total_supply
-- If cap_supply is NULL, the total_supply is used as the limit

ALTER TABLE collections 
ADD COLUMN IF NOT EXISTS cap_supply INTEGER NULL;

COMMENT ON COLUMN collections.cap_supply IS 'Maximum number of mints allowed. If NULL, total_supply is used as the limit.';

