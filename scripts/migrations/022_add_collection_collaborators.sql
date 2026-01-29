-- Migration: Add collection collaborators table
-- This allows users to invite others to collaborate on collections

CREATE TABLE IF NOT EXISTS collection_collaborators (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'editor', -- 'owner', 'editor', 'viewer'
  invited_by TEXT NOT NULL, -- wallet address of person who invited
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(collection_id, wallet_address)
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_collaborators_collection_id ON collection_collaborators(collection_id);
CREATE INDEX IF NOT EXISTS idx_collaborators_wallet_address ON collection_collaborators(wallet_address);

-- Add comment
COMMENT ON TABLE collection_collaborators IS 'Stores collaborators for collections. Allows multiple users to work on the same collection.';

