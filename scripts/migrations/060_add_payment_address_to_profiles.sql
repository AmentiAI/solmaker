-- Migration: Add payment_address column to profiles table
-- This stores the P2SH-P2WPKH payment address from LaserEyes wallets
-- which is different from the main wallet address (usually taproot)

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS payment_address VARCHAR(255);

-- Create index for payment_address lookups
CREATE INDEX IF NOT EXISTS idx_profiles_payment_address 
ON profiles (payment_address) 
WHERE payment_address IS NOT NULL;

COMMENT ON COLUMN profiles.payment_address IS 'P2SH-P2WPKH payment address from LaserEyes wallet (different from main wallet_address)';

