-- Migration 090: Add creator_royalty_wallet column to collections table

ALTER TABLE collections 
ADD COLUMN IF NOT EXISTS creator_royalty_wallet TEXT;

CREATE INDEX IF NOT EXISTS idx_collections_creator_royalty_wallet 
ON collections(creator_royalty_wallet) 
WHERE creator_royalty_wallet IS NOT NULL;
