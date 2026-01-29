-- Migration: Add claim tracking columns to reward_attempts table
-- Tracks when a won ordinal has been claimed/transferred to the winner

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'reward_attempts' AND column_name = 'claimed') THEN
    ALTER TABLE reward_attempts ADD COLUMN claimed BOOLEAN DEFAULT FALSE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'reward_attempts' AND column_name = 'claim_txid') THEN
    ALTER TABLE reward_attempts ADD COLUMN claim_txid VARCHAR(255);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'reward_attempts' AND column_name = 'claim_timestamp') THEN
    ALTER TABLE reward_attempts ADD COLUMN claim_timestamp TIMESTAMP;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_reward_attempts_claimed ON reward_attempts(claimed);

CREATE INDEX IF NOT EXISTS idx_reward_attempts_claim_txid ON reward_attempts(claim_txid);

COMMENT ON COLUMN reward_attempts.claimed IS 'Whether the won ordinal has been claimed/transferred';

COMMENT ON COLUMN reward_attempts.claim_txid IS 'Transaction ID of the claim/transfer transaction';

COMMENT ON COLUMN reward_attempts.claim_timestamp IS 'Timestamp when the ordinal was claimed';
