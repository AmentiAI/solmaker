-- =============================================================================
-- ADD TRANSACTION CHECKING FIELDS TO MINT_INSCRIPTIONS
-- Tracks when transactions were last checked and their confirmation status
-- =============================================================================

-- Add last checked timestamps for commit and reveal transactions
ALTER TABLE mint_inscriptions
ADD COLUMN IF NOT EXISTS commit_last_checked_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS reveal_last_checked_at TIMESTAMPTZ;

-- Add index for efficient cron queries
CREATE INDEX IF NOT EXISTS idx_mint_inscriptions_commit_check ON mint_inscriptions(commit_last_checked_at) 
  WHERE commit_tx_id IS NOT NULL AND commit_confirmed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_mint_inscriptions_reveal_check ON mint_inscriptions(reveal_last_checked_at) 
  WHERE reveal_tx_id IS NOT NULL AND reveal_confirmed_at IS NULL;

COMMENT ON COLUMN mint_inscriptions.commit_last_checked_at IS 'Last time commit transaction was checked for confirmation status';
COMMENT ON COLUMN mint_inscriptions.reveal_last_checked_at IS 'Last time reveal transaction was checked for confirmation status';



