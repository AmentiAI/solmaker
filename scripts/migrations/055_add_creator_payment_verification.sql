-- Migration: Add creator payment verification fields to mint_inscriptions
-- This allows tracking whether the creator payment wallet received payment for each mint

ALTER TABLE mint_inscriptions 
ADD COLUMN IF NOT EXISTS creator_payment_verified BOOLEAN,
ADD COLUMN IF NOT EXISTS creator_payment_amount BIGINT,
ADD COLUMN IF NOT EXISTS creator_payment_output_index INTEGER,
ADD COLUMN IF NOT EXISTS creator_payment_wallet VARCHAR(255);

COMMENT ON COLUMN mint_inscriptions.creator_payment_verified IS 'Whether the creator payment wallet received payment (checked via mempool.space API)';
COMMENT ON COLUMN mint_inscriptions.creator_payment_amount IS 'Amount paid to creator payment wallet in satoshis';
COMMENT ON COLUMN mint_inscriptions.creator_payment_output_index IS 'Output index in commit transaction where creator payment was found';
COMMENT ON COLUMN mint_inscriptions.creator_payment_wallet IS 'Creator payment wallet address that was checked';

