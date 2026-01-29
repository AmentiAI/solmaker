-- Migration: Create reward_attempts table to track gambling attempts on rewards page
-- Allows holders with > 1 ordmaker to try to win ordinals from the payout wallet

CREATE TABLE IF NOT EXISTS reward_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address VARCHAR(255) NOT NULL,
  ordmaker_count INTEGER NOT NULL,
  luck INTEGER NOT NULL, -- ordmaker_count * 30
  win_chance DECIMAL(10, 6) NOT NULL, -- Calculated win chance (e.g., 0.002 for 0.2%)
  result VARCHAR(20) NOT NULL CHECK (result IN ('win', 'lose')),
  won_ordinal_id VARCHAR(255), -- If they won, the ordinal ID from the payout wallet
  won_ordinal_inscription_id VARCHAR(255), -- Inscription ID if available
  won_ordinal_inscription_number INTEGER, -- Inscription number if available
  attempt_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reward_attempts_wallet_address ON reward_attempts(wallet_address);

CREATE INDEX IF NOT EXISTS idx_reward_attempts_attempt_timestamp ON reward_attempts(attempt_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_reward_attempts_wallet_timestamp ON reward_attempts(wallet_address, attempt_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_reward_attempts_result ON reward_attempts(result);

COMMENT ON TABLE reward_attempts IS 'Tracks gambling attempts on rewards page - holders can try to win ordinals from payout wallet';
COMMENT ON COLUMN reward_attempts.wallet_address IS 'Bitcoin wallet address of the user attempting';
COMMENT ON COLUMN reward_attempts.ordmaker_count IS 'Number of ordmakers held at time of attempt';
COMMENT ON COLUMN reward_attempts.luck IS 'Calculated luck value (ordmaker_count * 30)';
COMMENT ON COLUMN reward_attempts.win_chance IS 'Calculated win chance percentage (e.g., 0.002 for 0.2%)';
COMMENT ON COLUMN reward_attempts.result IS 'Result of the attempt: win or lose';
COMMENT ON COLUMN reward_attempts.won_ordinal_id IS 'If won, the ordinal ID from the payout wallet';
COMMENT ON COLUMN reward_attempts.won_ordinal_inscription_id IS 'If won, the inscription ID';
COMMENT ON COLUMN reward_attempts.won_ordinal_inscription_number IS 'If won, the inscription number';
