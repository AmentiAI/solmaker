-- =============================================================================
-- ADD SESSION_ID TO MINT_INSCRIPTIONS FOR BATCH SUPPORT
-- Links individual inscription records to their parent mint session
-- Enables efficient batch inscriptions: 1 commit tx with N outputs → N reveals
-- =============================================================================

-- Add session_id column to link inscriptions to their batch session
-- Nullable for backward compatibility with existing records
ALTER TABLE mint_inscriptions
ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES mint_sessions(id) ON DELETE CASCADE;

-- Create index for fast lookups by session
CREATE INDEX IF NOT EXISTS idx_mint_inscriptions_session ON mint_inscriptions(session_id);

-- Add commit_tx_hex to mint_sessions for transaction recovery
ALTER TABLE mint_sessions
ADD COLUMN IF NOT EXISTS commit_tx_hex TEXT;

COMMENT ON COLUMN mint_inscriptions.session_id IS 'Links to parent mint_session for batch inscriptions. NULL for legacy single-inscription mints.';
COMMENT ON COLUMN mint_sessions.commit_tx_hex IS 'Signed commit transaction hex for recovery purposes';

