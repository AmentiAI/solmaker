-- Create promotions table to track promotional flyer history
CREATE TABLE IF NOT EXISTS promotions (
  id SERIAL PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  collection_id INTEGER NOT NULL,
  collection_name TEXT,
  image_url TEXT NOT NULL,
  flyer_text TEXT,
  character_count INTEGER NOT NULL,
  character_actions JSONB,
  no_text BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
);

-- Index for faster lookups by wallet
CREATE INDEX IF NOT EXISTS idx_promotions_wallet ON promotions(wallet_address);

-- Index for faster lookups by collection
CREATE INDEX IF NOT EXISTS idx_promotions_collection ON promotions(collection_id);

-- Index for sorting by creation date
CREATE INDEX IF NOT EXISTS idx_promotions_created_at ON promotions(created_at DESC);
