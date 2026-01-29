-- Add minting-related columns to generated_ordinals table
ALTER TABLE generated_ordinals
ADD COLUMN IF NOT EXISTS is_minted BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS inscription_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS minter_address VARCHAR(255),
ADD COLUMN IF NOT EXISTS mint_tx_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS minted_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS inscription_data JSONB;

-- Create index for faster queries on minted status
CREATE INDEX IF NOT EXISTS idx_ordinals_is_minted ON generated_ordinals(is_minted);
CREATE INDEX IF NOT EXISTS idx_ordinals_inscription_id ON generated_ordinals(inscription_id);
CREATE INDEX IF NOT EXISTS idx_ordinals_minter_address ON generated_ordinals(minter_address);

-- Create mint_sessions table to track minting sessions
CREATE TABLE IF NOT EXISTS mint_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  ordinal_ids UUID[] NOT NULL,
  minter_address VARCHAR(255) NOT NULL,
  quantity INTEGER NOT NULL,
  fee_rate INTEGER NOT NULL,
  total_cost BIGINT NOT NULL,
  commit_tx_id VARCHAR(255),
  reveal_tx_id VARCHAR(255),
  inscription_priv_key TEXT NOT NULL, -- Encrypted
  inscription_pub_key TEXT NOT NULL,
  taproot_address TEXT NOT NULL,
  status VARCHAR(50) DEFAULT 'pending', -- pending, commit_signed, revealed, completed, failed
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for mint_sessions
CREATE INDEX IF NOT EXISTS idx_mint_sessions_collection ON mint_sessions(collection_id);
CREATE INDEX IF NOT EXISTS idx_mint_sessions_minter ON mint_sessions(minter_address);
CREATE INDEX IF NOT EXISTS idx_mint_sessions_status ON mint_sessions(status);
CREATE INDEX IF NOT EXISTS idx_mint_sessions_created ON mint_sessions(created_at DESC);

COMMENT ON TABLE mint_sessions IS 'Tracks minting sessions and inscription private keys for reveal transactions';
COMMENT ON COLUMN mint_sessions.inscription_priv_key IS 'Encrypted private key for signing reveal transactions';
COMMENT ON COLUMN mint_sessions.status IS 'pending: awaiting commit tx, commit_signed: commit tx broadcast, revealed: reveal tx broadcast, completed: confirmed, failed: error occurred';

