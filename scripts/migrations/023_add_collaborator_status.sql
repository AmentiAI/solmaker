-- Migration: Add status field to collection_collaborators
-- This allows invitations to be pending, accepted, or declined

ALTER TABLE collection_collaborators
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'accepted';

-- Update existing records to be 'accepted' (backward compatibility)
UPDATE collection_collaborators
SET status = 'accepted'
WHERE status IS NULL OR status = '';

-- Add constraint to ensure status is one of the valid values
ALTER TABLE collection_collaborators
ADD CONSTRAINT check_status CHECK (status IN ('pending', 'accepted', 'declined'));

-- Create index for faster lookups of pending invitations
CREATE INDEX IF NOT EXISTS idx_collaborators_status ON collection_collaborators(status);

-- Add comment
COMMENT ON COLUMN collection_collaborators.status IS 'Invitation status: pending (awaiting response), accepted (active collaborator), declined (rejected invitation)';

