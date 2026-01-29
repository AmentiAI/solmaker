-- Create credits table to track user credits
CREATE TABLE IF NOT EXISTS credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  credits INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for wallet address lookups
CREATE INDEX IF NOT EXISTS idx_credits_wallet_address 
ON credits (wallet_address);

-- Create credit transactions table to track purchases and usage
CREATE TABLE IF NOT EXISTS credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  amount INTEGER NOT NULL, -- positive for purchases, negative for usage
  transaction_type TEXT NOT NULL, -- 'purchase' or 'usage'
  description TEXT,
  payment_txid TEXT, -- Bitcoin transaction ID for purchases
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for wallet address lookups
CREATE INDEX IF NOT EXISTS idx_credit_transactions_wallet_address 
ON credit_transactions (wallet_address);

-- Create pending payments table for credit purchases
CREATE TABLE IF NOT EXISTS pending_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  credits_amount INTEGER NOT NULL,
  bitcoin_amount DECIMAL(18, 8) NOT NULL,
  payment_address TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'completed', 'expired'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL
);

-- Create index for payment address lookups
CREATE INDEX IF NOT EXISTS idx_pending_payments_payment_address 
ON pending_payments (payment_address);

-- Create index for wallet address lookups
CREATE INDEX IF NOT EXISTS idx_pending_payments_wallet_address 
ON pending_payments (wallet_address);

