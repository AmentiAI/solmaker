-- Migration: Create community_payouts table to track revenue payouts
-- This tracks when we take snapshots and distribute 30% of revenue to holders

CREATE TABLE IF NOT EXISTS community_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_taken_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  payout_tx_id VARCHAR(255),
  total_revenue_sats BIGINT NOT NULL,
  payout_amount_sats BIGINT NOT NULL, -- 30% of revenue
  total_holders INTEGER NOT NULL,
  total_supply INTEGER NOT NULL DEFAULT 200,
  holders_data JSONB, -- Store the snapshot of holders and their amounts
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_community_payouts_snapshot_taken_at ON community_payouts(snapshot_taken_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_payouts_payout_tx_id ON community_payouts(payout_tx_id);

COMMENT ON TABLE community_payouts IS 'Tracks community revenue payouts to ordmaker collection holders';
COMMENT ON COLUMN community_payouts.total_revenue_sats IS 'Total revenue accumulated since last payout';
COMMENT ON COLUMN community_payouts.payout_amount_sats IS '30% of total revenue to be distributed';
COMMENT ON COLUMN community_payouts.holders_data IS 'JSON snapshot of all holders with their wallet addresses and ordmaker counts';

