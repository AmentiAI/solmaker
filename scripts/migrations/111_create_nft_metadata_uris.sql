-- Migration 111: Create nft_metadata_uris table (if missing from migration 084)

CREATE TABLE IF NOT EXISTS nft_metadata_uris (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  ordinal_id UUID REFERENCES generated_ordinals(id) ON DELETE SET NULL,
  
  -- Metadata URIs
  image_uri TEXT NOT NULL,
  metadata_uri TEXT NOT NULL,
  
  -- Storage info
  storage_provider TEXT DEFAULT 'vercel-blob',
  
  -- NFT metadata
  nft_name TEXT,
  nft_number INTEGER,
  metadata_json JSONB,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  
  -- Unique constraint: one metadata per ordinal
  UNIQUE(ordinal_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_metadata_uris_collection ON nft_metadata_uris(collection_id);
CREATE INDEX IF NOT EXISTS idx_metadata_uris_ordinal ON nft_metadata_uris(ordinal_id);
CREATE INDEX IF NOT EXISTS idx_metadata_uris_created ON nft_metadata_uris(created_at DESC);

-- Comments
COMMENT ON TABLE nft_metadata_uris IS 'Stores uploaded NFT metadata URIs for Solana deployment';
COMMENT ON COLUMN nft_metadata_uris.image_uri IS 'Uploaded image URI (e.g., Vercel Blob URL)';
COMMENT ON COLUMN nft_metadata_uris.metadata_uri IS 'Uploaded metadata JSON URI';
