-- Migration: Create user_payouts table to track individual payouts to users
-- This allows users to see their payout history with transaction IDs and amounts

-- First ensure community_payouts table exists (it should from migration 058)
CREATE TABLE IF NOT EXISTS community_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_taken_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  payout_tx_id VARCHAR(255),
  total_revenue_sats BIGINT NOT NULL,
  payout_amount_sats BIGINT NOT NULL,
  total_holders INTEGER NOT NULL,
  total_supply INTEGER NOT NULL DEFAULT 200,
  holders_data JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address VARCHAR(255) NOT NULL,
  payout_tx_id VARCHAR(255) NOT NULL,
  amount_sats BIGINT NOT NULL,
  ordmaker_count INTEGER NOT NULL, -- Number of ordmakers held at time of payout
  share_percentage DECIMAL(10, 4) NOT NULL, -- Percentage share (e.g., 0.50 for 0.50%)
  community_payout_id UUID REFERENCES community_payouts(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_payouts_wallet_address ON user_payouts(wallet_address);
CREATE INDEX IF NOT EXISTS idx_user_payouts_payout_tx_id ON user_payouts(payout_tx_id);
CREATE INDEX IF NOT EXISTS idx_user_payouts_created_at ON user_payouts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_payouts_community_payout_id ON user_payouts(community_payout_id);

COMMENT ON TABLE user_payouts IS 'Tracks individual payouts to users from community revenue distributions';
COMMENT ON COLUMN user_payouts.wallet_address IS 'Bitcoin wallet address that received the payout';
COMMENT ON COLUMN user_payouts.payout_tx_id IS 'Bitcoin transaction ID for the payout';
COMMENT ON COLUMN user_payouts.amount_sats IS 'Amount received in satoshis';
COMMENT ON COLUMN user_payouts.ordmaker_count IS 'Number of ordmakers held at the time of payout snapshot';
COMMENT ON COLUMN user_payouts.share_percentage IS 'Percentage share of total supply (e.g., 0.50 for 0.50%)';
COMMENT ON COLUMN user_payouts.community_payout_id IS 'Reference to the community_payouts record this payout belongs to';

