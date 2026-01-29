-- Ordinal Collections Migration
-- Stores collection metadata for ordinal marketplaces (fetched from Magic Eden)

CREATE TABLE IF NOT EXISTS ordinal_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Collection identifier
  symbol VARCHAR(255) NOT NULL UNIQUE, -- Collection symbol/slug from Magic Eden
  
  -- Collection metadata (from Magic Eden API)
  name VARCHAR(255),
  description TEXT,
  image_uri TEXT, -- Collection image URL (from imageURI field)
  chain VARCHAR(50), -- Usually "btc" for Bitcoin ordinals
  
  -- Supply info
  supply INTEGER, -- Total supply
  min_inscription_number INTEGER, -- Minimum inscription number in collection
  max_inscription_number INTEGER, -- Maximum inscription number in collection
  
  -- Social links (from Magic Eden API)
  website_link TEXT, -- websiteLink
  twitter_link TEXT, -- twitterLink
  discord_link TEXT, -- discordLink
  telegram TEXT, -- May come from other endpoints
  instagram TEXT, -- May come from other endpoints
  
  -- Additional fields (may come from other Magic Eden endpoints)
  banner TEXT, -- Collection banner URL (from other endpoints)
  floor_price BIGINT, -- Floor price in sats (calculated from listings)
  volume BIGINT, -- Total volume in sats (calculated from transactions)
  
  -- Magic Eden timestamps
  magic_eden_created_at TIMESTAMPTZ, -- createdAt from Magic Eden
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ordinal_collections_symbol ON ordinal_collections(symbol);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_ordinal_collection_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ordinal_collections_update_timestamp
  BEFORE UPDATE ON ordinal_collections
  FOR EACH ROW
  EXECUTE FUNCTION update_ordinal_collection_timestamp();
