-- =============================================================================
-- MINT LAUNCH & TRACKING SYSTEM
-- Complete database schema for collection mint launches and inscription tracking
-- =============================================================================

-- =============================================================================
-- 1. Collection Mint Launches Table
-- Tracks when a collection is launched for public minting
-- =============================================================================
CREATE TABLE IF NOT EXISTS collection_mint_launches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  
  -- Launch settings
  launch_name VARCHAR(255),
  mint_price_sats BIGINT NOT NULL DEFAULT 0, -- Price per mint in satoshis (0 = free)
  max_per_wallet INTEGER DEFAULT NULL, -- NULL = unlimited
  total_supply INTEGER NOT NULL, -- Total available to mint
  minted_count INTEGER DEFAULT 0, -- Current minted count
  reserved_count INTEGER DEFAULT 0, -- Reserved for creator/team
  
  -- Wallet addresses
  creator_wallet VARCHAR(255) NOT NULL, -- Creator's receiving wallet
  platform_fee_wallet VARCHAR(255), -- Platform fee wallet (if applicable)
  platform_fee_percent DECIMAL(5,2) DEFAULT 0, -- Platform fee percentage
  
  -- Launch timing
  launch_status VARCHAR(50) DEFAULT 'draft', -- draft, scheduled, active, paused, completed, cancelled
  scheduled_start TIMESTAMPTZ,
  scheduled_end TIMESTAMPTZ,
  actual_start TIMESTAMPTZ,
  actual_end TIMESTAMPTZ,
  
  -- Configuration
  allow_public_mint BOOLEAN DEFAULT TRUE,
  whitelist_only BOOLEAN DEFAULT FALSE,
  reveal_on_mint BOOLEAN DEFAULT TRUE, -- Immediate reveal or delayed
  shuffle_on_mint BOOLEAN DEFAULT TRUE, -- Random assignment
  
  -- Fee settings  
  default_fee_rate DECIMAL(10,2) DEFAULT 1.0, -- Default sat/vB
  min_fee_rate DECIMAL(10,2) DEFAULT 0.5, -- Minimum allowed fee rate
  max_fee_rate DECIMAL(10,2) DEFAULT 500, -- Maximum allowed fee rate
  
  -- Analytics
  total_revenue_sats BIGINT DEFAULT 0,
  total_fees_collected BIGINT DEFAULT 0,
  unique_minters INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT valid_launch_status CHECK (launch_status IN ('draft', 'scheduled', 'active', 'paused', 'completed', 'cancelled'))
);

-- =============================================================================
-- 2. Mint Inscriptions Table (Enhanced from existing)
-- Tracks individual mint/inscription records
-- =============================================================================
CREATE TABLE IF NOT EXISTS mint_inscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- References
  launch_id UUID REFERENCES collection_mint_launches(id) ON DELETE SET NULL,
  collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  ordinal_id UUID REFERENCES generated_ordinals(id) ON DELETE SET NULL,
  
  -- User info
  minter_wallet VARCHAR(255) NOT NULL, -- User's wallet address
  payment_wallet VARCHAR(255), -- Payment address if different
  receiving_wallet VARCHAR(255) NOT NULL, -- Where inscription goes
  
  -- Transaction details (Commit)
  commit_tx_id VARCHAR(255),
  commit_psbt TEXT, -- Stored PSBT for debugging
  commit_output_index INTEGER DEFAULT 0,
  commit_output_value BIGINT, -- Sats in commit output
  commit_fee_sats BIGINT,
  commit_broadcast_at TIMESTAMPTZ,
  commit_confirmed_at TIMESTAMPTZ,
  commit_confirmations INTEGER DEFAULT 0,
  
  -- Transaction details (Reveal)
  reveal_tx_id VARCHAR(255),
  reveal_hex TEXT, -- Stored tx hex for debugging
  reveal_fee_sats BIGINT,
  reveal_broadcast_at TIMESTAMPTZ,
  reveal_confirmed_at TIMESTAMPTZ,
  reveal_confirmations INTEGER DEFAULT 0,
  
  -- Inscription details
  inscription_id VARCHAR(255), -- Final inscription ID (txid:i0)
  inscription_number BIGINT, -- Ordinal inscription number
  
  -- Content info
  original_image_url TEXT,
  compressed_image_url TEXT,
  compressed_base64 TEXT, -- For re-creating reveal if needed
  content_size_bytes INTEGER,
  content_type VARCHAR(100) DEFAULT 'image/webp',
  
  -- Tapscript data (for reveal transaction recreation)
  reveal_data JSONB, -- Complete reveal data blob
  inscription_priv_key TEXT, -- Encrypted private key for signing reveal
  taproot_address VARCHAR(255),
  
  -- Fee information
  fee_rate DECIMAL(10,4), -- sat/vB
  total_cost_sats BIGINT,
  mint_price_paid BIGINT DEFAULT 0, -- Price paid for mint
  
  -- Status tracking
  mint_status VARCHAR(50) DEFAULT 'pending',
  error_message TEXT,
  error_code VARCHAR(50),
  retry_count INTEGER DEFAULT 0,
  last_retry_at TIMESTAMPTZ,
  
  -- Admin flags
  is_test_mint BOOLEAN DEFAULT FALSE,
  is_admin_mint BOOLEAN DEFAULT FALSE,
  flagged_for_review BOOLEAN DEFAULT FALSE,
  admin_notes TEXT,
  
  -- Loss prevention
  stuck_since TIMESTAMPTZ, -- When detected as stuck
  recovery_attempted BOOLEAN DEFAULT FALSE,
  recovery_tx_id VARCHAR(255),
  refund_status VARCHAR(50), -- pending_refund, refunded, no_refund_needed
  refund_tx_id VARCHAR(255),
  refund_amount_sats BIGINT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ,
  
  CONSTRAINT valid_mint_status CHECK (mint_status IN (
    'pending', 'compressing', 'compressed',
    'commit_created', 'commit_signed', 'commit_broadcast', 'commit_confirming', 'commit_confirmed',
    'reveal_created', 'reveal_broadcast', 'reveal_confirming', 'reveal_confirmed',
    'completed', 'failed', 'stuck', 'refunded', 'cancelled'
  ))
);

-- =============================================================================
-- 3. Mint Whitelist Table
-- For whitelist-only launches
-- =============================================================================
CREATE TABLE IF NOT EXISTS mint_whitelist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  launch_id UUID NOT NULL REFERENCES collection_mint_launches(id) ON DELETE CASCADE,
  wallet_address VARCHAR(255) NOT NULL,
  max_mints INTEGER DEFAULT 1, -- Max mints for this wallet
  mints_used INTEGER DEFAULT 0,
  added_by VARCHAR(255), -- Admin who added this
  added_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(launch_id, wallet_address)
);

-- =============================================================================
-- 4. Mint Activity Log Table
-- Detailed log of all mint-related actions for audit trail
-- =============================================================================
CREATE TABLE IF NOT EXISTS mint_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- References
  launch_id UUID REFERENCES collection_mint_launches(id) ON DELETE SET NULL,
  mint_inscription_id UUID REFERENCES mint_inscriptions(id) ON DELETE SET NULL,
  
  -- Actor
  actor_wallet VARCHAR(255), -- Who performed the action
  actor_type VARCHAR(50) DEFAULT 'user', -- user, admin, system
  
  -- Action details
  action_type VARCHAR(100) NOT NULL, -- e.g., 'mint_started', 'commit_broadcast', 'admin_refund'
  action_data JSONB, -- Additional action-specific data
  
  -- Context
  ip_address VARCHAR(45),
  user_agent TEXT,
  
  -- Result
  success BOOLEAN DEFAULT TRUE,
  error_message TEXT,
  
  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- 5. Stuck Transaction Detection Table
-- Tracks transactions that may be stuck
-- =============================================================================
CREATE TABLE IF NOT EXISTS stuck_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mint_inscription_id UUID NOT NULL REFERENCES mint_inscriptions(id) ON DELETE CASCADE,
  
  -- Transaction info
  tx_type VARCHAR(20) NOT NULL, -- 'commit' or 'reveal'
  tx_id VARCHAR(255) NOT NULL,
  tx_hex TEXT,
  
  -- Detection info
  detected_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  stuck_duration_minutes INTEGER,
  mempool_position INTEGER,
  current_fee_rate DECIMAL(10,4),
  recommended_fee_rate DECIMAL(10,4),
  
  -- Resolution
  resolution_status VARCHAR(50) DEFAULT 'detected', -- detected, rbf_sent, cpfp_sent, resolved, abandoned
  resolution_tx_id VARCHAR(255),
  resolution_fee_sats BIGINT,
  resolved_at TIMESTAMPTZ,
  resolved_by VARCHAR(255), -- Admin wallet who resolved
  
  -- Notes
  admin_notes TEXT,
  
  CONSTRAINT valid_tx_type CHECK (tx_type IN ('commit', 'reveal')),
  CONSTRAINT valid_resolution_status CHECK (resolution_status IN ('detected', 'rbf_sent', 'cpfp_sent', 'resolved', 'abandoned'))
);

-- =============================================================================
-- 6. Indexes for Performance
-- =============================================================================

-- Collection Mint Launches indexes
CREATE INDEX IF NOT EXISTS idx_mint_launches_collection ON collection_mint_launches(collection_id);
CREATE INDEX IF NOT EXISTS idx_mint_launches_status ON collection_mint_launches(launch_status);
CREATE INDEX IF NOT EXISTS idx_mint_launches_creator ON collection_mint_launches(creator_wallet);
CREATE INDEX IF NOT EXISTS idx_mint_launches_scheduled ON collection_mint_launches(scheduled_start) WHERE launch_status = 'scheduled';

-- Mint Inscriptions indexes
CREATE INDEX IF NOT EXISTS idx_mint_inscriptions_launch ON mint_inscriptions(launch_id);
CREATE INDEX IF NOT EXISTS idx_mint_inscriptions_collection ON mint_inscriptions(collection_id);
CREATE INDEX IF NOT EXISTS idx_mint_inscriptions_ordinal ON mint_inscriptions(ordinal_id);
CREATE INDEX IF NOT EXISTS idx_mint_inscriptions_minter ON mint_inscriptions(minter_wallet);
CREATE INDEX IF NOT EXISTS idx_mint_inscriptions_status ON mint_inscriptions(mint_status);
CREATE INDEX IF NOT EXISTS idx_mint_inscriptions_commit_tx ON mint_inscriptions(commit_tx_id);
CREATE INDEX IF NOT EXISTS idx_mint_inscriptions_reveal_tx ON mint_inscriptions(reveal_tx_id);
CREATE INDEX IF NOT EXISTS idx_mint_inscriptions_inscription ON mint_inscriptions(inscription_id);
CREATE INDEX IF NOT EXISTS idx_mint_inscriptions_created ON mint_inscriptions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mint_inscriptions_stuck ON mint_inscriptions(mint_status, stuck_since) WHERE stuck_since IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mint_inscriptions_test ON mint_inscriptions(is_test_mint) WHERE is_test_mint = TRUE;
CREATE INDEX IF NOT EXISTS idx_mint_inscriptions_flagged ON mint_inscriptions(flagged_for_review) WHERE flagged_for_review = TRUE;

-- Mint Activity Log indexes
CREATE INDEX IF NOT EXISTS idx_mint_activity_launch ON mint_activity_log(launch_id);
CREATE INDEX IF NOT EXISTS idx_mint_activity_inscription ON mint_activity_log(mint_inscription_id);
CREATE INDEX IF NOT EXISTS idx_mint_activity_actor ON mint_activity_log(actor_wallet);
CREATE INDEX IF NOT EXISTS idx_mint_activity_type ON mint_activity_log(action_type);
CREATE INDEX IF NOT EXISTS idx_mint_activity_created ON mint_activity_log(created_at DESC);

-- Stuck Transactions indexes
CREATE INDEX IF NOT EXISTS idx_stuck_tx_mint ON stuck_transactions(mint_inscription_id);
CREATE INDEX IF NOT EXISTS idx_stuck_tx_status ON stuck_transactions(resolution_status);
CREATE INDEX IF NOT EXISTS idx_stuck_tx_detected ON stuck_transactions(detected_at DESC);

-- =============================================================================
-- 7. Trigger Functions
-- =============================================================================

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = CURRENT_TIMESTAMP;
   RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply to tables
DROP TRIGGER IF EXISTS update_mint_launches_updated_at ON collection_mint_launches;
CREATE TRIGGER update_mint_launches_updated_at
  BEFORE UPDATE ON collection_mint_launches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_mint_inscriptions_updated_at ON mint_inscriptions;
CREATE TRIGGER update_mint_inscriptions_updated_at
  BEFORE UPDATE ON mint_inscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Update minted_count on mint completion
CREATE OR REPLACE FUNCTION update_launch_minted_count()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.mint_status = 'completed' AND OLD.mint_status != 'completed' THEN
    UPDATE collection_mint_launches
    SET minted_count = minted_count + 1
    WHERE id = NEW.launch_id;
  END IF;
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS trigger_update_minted_count ON mint_inscriptions;
CREATE TRIGGER trigger_update_minted_count
  AFTER UPDATE ON mint_inscriptions
  FOR EACH ROW
  WHEN (NEW.launch_id IS NOT NULL)
  EXECUTE FUNCTION update_launch_minted_count();

-- =============================================================================
-- 8. Add is_locked column to collections (for locking before launch)
-- =============================================================================
ALTER TABLE collections ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT FALSE;
ALTER TABLE collections ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;
ALTER TABLE collections ADD COLUMN IF NOT EXISTS locked_by VARCHAR(255);

-- Add launch reference to collections
ALTER TABLE collections ADD COLUMN IF NOT EXISTS active_launch_id UUID REFERENCES collection_mint_launches(id) ON DELETE SET NULL;

COMMENT ON TABLE collection_mint_launches IS 'Tracks collection mint launches with pricing, supply, and configuration';
COMMENT ON TABLE mint_inscriptions IS 'Tracks individual mint inscription records with full transaction history';
COMMENT ON TABLE mint_whitelist IS 'Whitelist entries for whitelist-only mint launches';
COMMENT ON TABLE mint_activity_log IS 'Audit log for all mint-related activities';
COMMENT ON TABLE stuck_transactions IS 'Tracks stuck transactions for loss prevention and recovery';

