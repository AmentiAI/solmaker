-- Migration 084: Solana NFT Minting System
-- Adds tables and columns for Candy Machine-based Solana NFT minting

-- =============================================================================
-- Add Solana-specific columns to collections table
-- =============================================================================
ALTER TABLE collections
ADD COLUMN IF NOT EXISTS candy_machine_address TEXT,
ADD COLUMN IF NOT EXISTS collection_mint_address TEXT,
ADD COLUMN IF NOT EXISTS collection_authority TEXT,
ADD COLUMN IF NOT EXISTS candy_guard_address TEXT,
ADD COLUMN IF NOT EXISTS metadata_uploaded BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS deployment_status TEXT DEFAULT 'not_deployed',
ADD COLUMN IF NOT EXISTS deployment_tx_signature TEXT,
ADD COLUMN IF NOT EXISTS deployed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS deployed_by TEXT;

-- Add constraint for deployment_status
DO $$ BEGIN
  ALTER TABLE collections 
  ADD CONSTRAINT valid_deployment_status 
  CHECK (deployment_status IN (
    'not_deployed', 
    'uploading_metadata', 
    'metadata_uploaded',
    'deploying_collection_nft',
    'deploying_candy_machine', 
    'deployed', 
    'failed'
  ));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Index for finding deployed collections
CREATE INDEX IF NOT EXISTS idx_collections_candy_machine 
ON collections(candy_machine_address) WHERE candy_machine_address IS NOT NULL;

-- =============================================================================
-- NFT Metadata URIs Table
-- Stores uploaded metadata URIs for each NFT in collection
-- =============================================================================
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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT valid_storage_provider CHECK (storage_provider IN (
    'vercel-blob', 'arweave', 'shadow-drive', 'ipfs'
  ))
);

CREATE INDEX idx_metadata_uris_collection ON nft_metadata_uris(collection_id);
CREATE INDEX idx_metadata_uris_ordinal ON nft_metadata_uris(ordinal_id);

-- =============================================================================
-- Solana NFT Mints Table
-- Tracks actual on-chain Solana NFT mints
-- =============================================================================
CREATE TABLE IF NOT EXISTS solana_nft_mints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- References
  collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  candy_machine_address TEXT NOT NULL,
  session_id UUID REFERENCES mint_sessions(id) ON DELETE SET NULL,
  phase_id UUID REFERENCES mint_phases(id) ON DELETE SET NULL,
  ordinal_id UUID REFERENCES generated_ordinals(id) ON DELETE SET NULL,
  
  -- NFT Details
  nft_mint_address TEXT, -- The actual NFT's mint address
  metadata_uri TEXT,
  token_account TEXT, -- User's token account holding the NFT
  
  -- User Info
  minter_wallet TEXT NOT NULL,
  
  -- Transaction Details
  mint_tx_signature TEXT UNIQUE,
  mint_price_lamports BIGINT NOT NULL DEFAULT 0,
  platform_fee_lamports BIGINT DEFAULT 0,
  total_paid_lamports BIGINT,
  
  -- Status Tracking
  mint_status TEXT DEFAULT 'pending',
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT valid_mint_status CHECK (mint_status IN (
    'pending', 
    'building', 
    'awaiting_signature',
    'broadcasting', 
    'confirming',
    'confirmed', 
    'failed',
    'cancelled'
  ))
);

-- Indexes for performance
CREATE INDEX idx_solana_mints_collection ON solana_nft_mints(collection_id);
CREATE INDEX idx_solana_mints_candy_machine ON solana_nft_mints(candy_machine_address);
CREATE INDEX idx_solana_mints_minter ON solana_nft_mints(minter_wallet);
CREATE INDEX idx_solana_mints_status ON solana_nft_mints(mint_status);
CREATE INDEX idx_solana_mints_tx_signature ON solana_nft_mints(mint_tx_signature) WHERE mint_tx_signature IS NOT NULL;

-- =============================================================================
-- Candy Machine Deployment Logs
-- Track deployment steps for debugging
-- =============================================================================
CREATE TABLE IF NOT EXISTS candy_machine_deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  
  -- Deployment steps
  step TEXT NOT NULL, -- 'upload_metadata', 'create_collection_nft', 'create_candy_machine', 'add_config_lines', 'configure_guards'
  status TEXT DEFAULT 'pending',
  
  -- Transaction info
  tx_signature TEXT,
  error_message TEXT,
  
  -- Data
  step_data JSONB, -- Store relevant data for each step
  
  -- Timestamps
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  
  CONSTRAINT valid_step_status CHECK (status IN (
    'pending', 'in_progress', 'completed', 'failed'
  ))
);

CREATE INDEX idx_cm_deployments_collection ON candy_machine_deployments(collection_id);
CREATE INDEX idx_cm_deployments_status ON candy_machine_deployments(status);

-- =============================================================================
-- Update generated_ordinals for Solana
-- =============================================================================
-- Add column to track if ordinal/NFT has metadata uploaded
ALTER TABLE generated_ordinals
ADD COLUMN IF NOT EXISTS metadata_uploaded BOOLEAN DEFAULT false;

-- =============================================================================
-- Views for Analytics
-- =============================================================================

-- View: Collection deployment status
CREATE OR REPLACE VIEW collection_deployment_stats AS
SELECT 
  c.id as collection_id,
  c.name,
  c.deployment_status,
  c.candy_machine_address,
  c.collection_mint_address,
  COUNT(DISTINCT nmu.id) as metadata_count,
  COUNT(DISTINCT snm.id) as mints_count,
  c.deployed_at
FROM collections c
LEFT JOIN nft_metadata_uris nmu ON c.id = nmu.collection_id
LEFT JOIN solana_nft_mints snm ON c.id = snm.collection_id
WHERE c.candy_machine_address IS NOT NULL
GROUP BY c.id;

-- View: Active Solana mints
CREATE OR REPLACE VIEW active_solana_mints AS
SELECT 
  snm.*,
  c.name as collection_name,
  c.candy_machine_address,
  mp.name as phase_name
FROM solana_nft_mints snm
JOIN collections c ON snm.collection_id = c.id
LEFT JOIN mint_phases mp ON snm.phase_id = mp.id
WHERE snm.mint_status IN ('pending', 'building', 'awaiting_signature', 'broadcasting', 'confirming')
ORDER BY snm.created_at DESC;

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to update solana_nft_mints updated_at timestamp
CREATE OR REPLACE FUNCTION update_solana_mint_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for auto-updating updated_at
DROP TRIGGER IF EXISTS trigger_update_solana_mint_timestamp ON solana_nft_mints;
CREATE TRIGGER trigger_update_solana_mint_timestamp
  BEFORE UPDATE ON solana_nft_mints
  FOR EACH ROW
  EXECUTE FUNCTION update_solana_mint_timestamp();

-- Function to mark ordinal as minted when Solana mint confirms
CREATE OR REPLACE FUNCTION mark_ordinal_minted_on_solana_confirm()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.mint_status = 'confirmed' AND (OLD.mint_status IS NULL OR OLD.mint_status != 'confirmed') THEN
    UPDATE generated_ordinals 
    SET is_minted = true 
    WHERE id = NEW.ordinal_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-mark ordinals as minted
DROP TRIGGER IF EXISTS trigger_mark_ordinal_minted ON solana_nft_mints;
CREATE TRIGGER trigger_mark_ordinal_minted
  AFTER UPDATE ON solana_nft_mints
  FOR EACH ROW
  EXECUTE FUNCTION mark_ordinal_minted_on_solana_confirm();

-- =============================================================================
-- Migration Complete
-- =============================================================================
