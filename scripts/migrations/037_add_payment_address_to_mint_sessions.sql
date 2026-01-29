-- Add payment_address column to mint_sessions table
-- This tracks the actual funding address (paymentAddress) separately from receiving address (minter_address)
ALTER TABLE mint_sessions
ADD COLUMN IF NOT EXISTS payment_address VARCHAR(255);

-- Add reveal_data column if it doesn't exist (needed for reveal transaction data)
ALTER TABLE mint_sessions
ADD COLUMN IF NOT EXISTS reveal_data JSONB;

-- Create index for faster queries on payment address
CREATE INDEX IF NOT EXISTS idx_mint_sessions_payment_address ON mint_sessions(payment_address);
