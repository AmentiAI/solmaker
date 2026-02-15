-- Expand mint_type to support agent mint modes
ALTER TABLE collections DROP CONSTRAINT IF EXISTS check_mint_type;

ALTER TABLE collections ADD CONSTRAINT check_mint_type
  CHECK (mint_type IN ('hidden', 'choices', 'agent_only', 'agent_and_human'));

-- Store the thirdPartySigner public key for agent mint collections
ALTER TABLE collections ADD COLUMN IF NOT EXISTS agent_signer_pubkey VARCHAR(64);
