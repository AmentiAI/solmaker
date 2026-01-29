-- Migration: Add BTC payment support to marketplace
-- Allows sellers to list collections for BTC and buyers to pay with BTC

-- 1. Add BTC pricing columns to marketplace listings
ALTER TABLE collection_marketplace_listings 
ADD COLUMN IF NOT EXISTS price_btc DECIMAL(18, 8) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS seller_btc_address VARCHAR(255) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS payment_type VARCHAR(20) DEFAULT 'credits' CHECK (payment_type IN ('credits', 'btc', 'both'));

-- Update existing rows to have 'credits' payment type
UPDATE collection_marketplace_listings SET payment_type = 'credits' WHERE payment_type IS NULL;

-- 2. Create marketplace pending payments table (similar to credit purchase pending_payments)
CREATE TABLE IF NOT EXISTS marketplace_pending_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES collection_marketplace_listings(id) ON DELETE CASCADE,
  buyer_wallet VARCHAR(255) NOT NULL,
  seller_wallet VARCHAR(255) NOT NULL,
  
  -- Payment details
  btc_amount DECIMAL(18, 8) NOT NULL,
  btc_amount_sats BIGINT NOT NULL,
  payment_address VARCHAR(255) NOT NULL, -- seller's BTC address
  
  -- Transaction tracking
  payment_txid VARCHAR(255),
  confirmations INTEGER DEFAULT 0,
  
  -- Status
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'expired', 'cancelled')),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ
);

-- 3. Add BTC transaction tracking to marketplace_transactions
ALTER TABLE marketplace_transactions 
ADD COLUMN IF NOT EXISTS payment_type VARCHAR(20) DEFAULT 'credits',
ADD COLUMN IF NOT EXISTS btc_amount DECIMAL(18, 8),
ADD COLUMN IF NOT EXISTS btc_txid VARCHAR(255);

-- 4. Indexes for marketplace_pending_payments
CREATE INDEX IF NOT EXISTS idx_marketplace_pending_status ON marketplace_pending_payments(status);
CREATE INDEX IF NOT EXISTS idx_marketplace_pending_listing ON marketplace_pending_payments(listing_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_pending_buyer ON marketplace_pending_payments(buyer_wallet);
CREATE INDEX IF NOT EXISTS idx_marketplace_pending_txid ON marketplace_pending_payments(payment_txid) WHERE payment_txid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_marketplace_pending_expires ON marketplace_pending_payments(expires_at) WHERE status = 'pending';

-- 5. Update the transfer_collection_ownership function to handle promotions and collaborators
CREATE OR REPLACE FUNCTION transfer_collection_ownership(
  p_collection_id UUID,
  p_from_wallet VARCHAR(255),
  p_to_wallet VARCHAR(255),
  p_listing_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  -- Update collection ownership
  UPDATE collections
  SET wallet_address = p_to_wallet,
      marketplace_status = 'sold',
      marketplace_listing_id = NULL,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = p_collection_id
  AND wallet_address = p_from_wallet;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Mark listing as sold
  UPDATE collection_marketplace_listings
  SET status = 'sold',
      sold_to_wallet = p_to_wallet,
      sold_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = p_listing_id
  AND seller_wallet = p_from_wallet;

  -- Transfer promotions to new owner
  UPDATE promotions
  SET wallet_address = p_to_wallet
  WHERE collection_id = p_collection_id::text::integer
  AND wallet_address = p_from_wallet;

  -- Remove all collaborators (new owner starts fresh)
  DELETE FROM collection_collaborators
  WHERE collection_id = p_collection_id::text;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

