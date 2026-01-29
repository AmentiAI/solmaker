-- Add unique constraint to credits table on wallet_address
CREATE UNIQUE INDEX IF NOT EXISTS idx_credits_wallet_address_unique 
ON credits (wallet_address);

