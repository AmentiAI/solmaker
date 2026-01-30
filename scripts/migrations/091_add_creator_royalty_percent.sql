-- Migration 091: Add creator_royalty_percent column to collections table

ALTER TABLE collections 
ADD COLUMN IF NOT EXISTS creator_royalty_percent NUMERIC(5, 2);

CREATE INDEX IF NOT EXISTS idx_collections_creator_royalty_percent 
ON collections(creator_royalty_percent) 
WHERE creator_royalty_percent IS NOT NULL;
