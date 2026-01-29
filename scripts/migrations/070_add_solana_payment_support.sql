-- Migration: Add Solana payment support to credits system
-- This adds the necessary columns to support SOL, ETH, and other payment methods

-- 1. Add payment_type column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'pending_payments' AND column_name = 'payment_type'
  ) THEN
    ALTER TABLE pending_payments ADD COLUMN payment_type TEXT DEFAULT 'btc';
  END IF;
END $$;

-- 2. Add network column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'pending_payments' AND column_name = 'network'
  ) THEN
    ALTER TABLE pending_payments ADD COLUMN network TEXT DEFAULT 'bitcoin';
  END IF;
END $$;

-- 3. Add payment_amount column if it doesn't exist (for storing crypto amount in native units)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'pending_payments' AND column_name = 'payment_amount'
  ) THEN
    ALTER TABLE pending_payments ADD COLUMN payment_amount DECIMAL(20,9);
    -- Migrate existing bitcoin_amount to payment_amount
    UPDATE pending_payments SET payment_amount = bitcoin_amount WHERE payment_amount IS NULL;
  END IF;
END $$;

-- 4. Add payment_usd column if it doesn't exist (for storing USD value)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'pending_payments' AND column_name = 'payment_usd'
  ) THEN
    ALTER TABLE pending_payments ADD COLUMN payment_usd DECIMAL(10,2);
  END IF;
END $$;

-- 5. Update existing records to set payment_type and network based on existing data
UPDATE pending_payments 
SET payment_type = 'btc', network = 'bitcoin' 
WHERE payment_type IS NULL OR network IS NULL;

-- 6. Create index on payment_type for faster queries
CREATE INDEX IF NOT EXISTS idx_pending_payments_payment_type ON pending_payments(payment_type);

-- 7. Create index on network for faster queries
CREATE INDEX IF NOT EXISTS idx_pending_payments_network ON pending_payments(network);

-- 8. Create index on status and payment_type combination for pending payment lookups
CREATE INDEX IF NOT EXISTS idx_pending_payments_status_type ON pending_payments(status, payment_type);

-- 9. Add comment to table
COMMENT ON TABLE pending_payments IS 'Tracks pending credit purchases via BTC, SOL, ETH or other payment methods';
COMMENT ON COLUMN pending_payments.payment_type IS 'Payment method: btc, sol, eth, etc.';
COMMENT ON COLUMN pending_payments.network IS 'Blockchain network: bitcoin, solana, ethereum, etc.';
COMMENT ON COLUMN pending_payments.payment_amount IS 'Amount in native blockchain units (BTC, SOL, ETH)';
COMMENT ON COLUMN pending_payments.payment_usd IS 'USD value at time of payment creation';
COMMENT ON COLUMN pending_payments.bitcoin_amount IS 'Legacy field - kept for backwards compatibility';
