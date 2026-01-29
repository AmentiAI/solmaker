-- Ordinal Marketplace Migration
-- Allows users to buy/sell individual ordinals (not whole collections) using Bitcoin PSBTs

-- 1. Ordinal Listings Table
-- Stores individual ordinal listings with partial PSBTs
CREATE TABLE IF NOT EXISTS ordinal_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ordinal info (from Magic Eden API or local data)
  inscription_id VARCHAR(255) NOT NULL UNIQUE, -- e.g., "abc123...i0"
  ordinal_number BIGINT, -- e.g., 1234567
  collection_symbol VARCHAR(255), -- Optional: from Magic Eden

  -- UTXO info (from Magic Eden location field)
  utxo_txid VARCHAR(255) NOT NULL,
  utxo_vout INTEGER NOT NULL,
  utxo_value BIGINT NOT NULL, -- satoshis (usually 330-546 for ordinals)

  -- Seller info
  seller_wallet VARCHAR(255) NOT NULL,
  seller_pubkey VARCHAR(255), -- For PSBT signing (tapInternalKey if p2tr)

  -- Pricing
  price_sats BIGINT NOT NULL CHECK (price_sats > 0),
  price_btc DECIMAL(16,8) NOT NULL CHECK (price_btc > 0),

  -- Partial PSBT (seller pre-signs input 0 = ordinal)
  -- Buyer will add their payment input and complete the PSBT
  partial_psbt_base64 TEXT NOT NULL,
  partial_psbt_hex TEXT,

  -- Metadata
  image_url TEXT,
  metadata_url TEXT,
  title VARCHAR(255),
  description TEXT,

  -- Status
  status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'sold', 'cancelled', 'expired', 'invalid')),

  -- Sale tracking
  sold_to_wallet VARCHAR(255),
  sold_tx_id VARCHAR(255),
  sold_at TIMESTAMPTZ,

  -- Expiration (optional - listings expire after N days)
  expires_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 days'),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

  -- Prevent duplicate UTXO listings
  CONSTRAINT unique_utxo UNIQUE (utxo_txid, utxo_vout)
);

-- 2. Ordinal Transactions Table
-- Tracks completed ordinal sales
CREATE TABLE IF NOT EXISTS ordinal_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES ordinal_listings(id) ON DELETE CASCADE,

  -- Transaction info
  inscription_id VARCHAR(255) NOT NULL,
  seller_wallet VARCHAR(255) NOT NULL,
  buyer_wallet VARCHAR(255) NOT NULL,

  -- Pricing
  price_sats BIGINT NOT NULL,
  price_btc DECIMAL(16,8) NOT NULL,

  -- Platform fee (2500 sats default)
  platform_fee_sats BIGINT DEFAULT 2500,

  -- Bitcoin transaction
  tx_id VARCHAR(255) NOT NULL,
  tx_hex TEXT,
  confirmations INTEGER DEFAULT 0,

  -- Status
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed')),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  confirmed_at TIMESTAMPTZ,

  -- Constraint: unique transaction ID
  CONSTRAINT unique_tx_id UNIQUE (tx_id)
);

-- 3. Ordinal Offers Table (for future: offer/bid system)
CREATE TABLE IF NOT EXISTS ordinal_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES ordinal_listings(id) ON DELETE CASCADE,

  -- Offer info
  inscription_id VARCHAR(255) NOT NULL,
  buyer_wallet VARCHAR(255) NOT NULL,
  offer_sats BIGINT NOT NULL CHECK (offer_sats > 0),
  offer_btc DECIMAL(16,8) NOT NULL,

  -- Offer PSBT (buyer pre-signs payment, seller can accept)
  offer_psbt_base64 TEXT NOT NULL,

  -- Status
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'expired', 'cancelled')),

  -- Expiration (offers expire after 24 hours by default)
  expires_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours'),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 4. Pending Ordinal Payments Table
-- Track pending purchases (similar to marketplace_pending_payments)
CREATE TABLE IF NOT EXISTS ordinal_pending_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES ordinal_listings(id) ON DELETE CASCADE,

  -- Buyer info
  buyer_wallet VARCHAR(255) NOT NULL,

  -- Payment tracking
  payment_address VARCHAR(255), -- Seller's address
  expected_amount_sats BIGINT NOT NULL,

  -- Status
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'expired', 'failed')),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP + INTERVAL '1 hour'),

  -- Verification
  tx_id VARCHAR(255),
  verified_at TIMESTAMPTZ
);

-- 5. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_ordinal_listings_status ON ordinal_listings(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ordinal_listings_seller ON ordinal_listings(seller_wallet);
CREATE INDEX IF NOT EXISTS idx_ordinal_listings_inscription ON ordinal_listings(inscription_id);
CREATE INDEX IF NOT EXISTS idx_ordinal_listings_collection ON ordinal_listings(collection_symbol) WHERE collection_symbol IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ordinal_listings_active ON ordinal_listings(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_ordinal_listings_price ON ordinal_listings(price_sats) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_ordinal_transactions_listing ON ordinal_transactions(listing_id);
CREATE INDEX IF NOT EXISTS idx_ordinal_transactions_buyer ON ordinal_transactions(buyer_wallet);
CREATE INDEX IF NOT EXISTS idx_ordinal_transactions_seller ON ordinal_transactions(seller_wallet);
CREATE INDEX IF NOT EXISTS idx_ordinal_transactions_tx ON ordinal_transactions(tx_id);
CREATE INDEX IF NOT EXISTS idx_ordinal_transactions_status ON ordinal_transactions(status);

CREATE INDEX IF NOT EXISTS idx_ordinal_offers_listing ON ordinal_offers(listing_id);
CREATE INDEX IF NOT EXISTS idx_ordinal_offers_buyer ON ordinal_offers(buyer_wallet);
CREATE INDEX IF NOT EXISTS idx_ordinal_offers_status ON ordinal_offers(status);

CREATE INDEX IF NOT EXISTS idx_ordinal_pending_payments_listing ON ordinal_pending_payments(listing_id);
CREATE INDEX IF NOT EXISTS idx_ordinal_pending_payments_buyer ON ordinal_pending_payments(buyer_wallet);

-- 6. Function to auto-expire listings
CREATE OR REPLACE FUNCTION expire_old_ordinal_listings()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE ordinal_listings
  SET status = 'expired',
      updated_at = CURRENT_TIMESTAMP
  WHERE status = 'active'
  AND expires_at < CURRENT_TIMESTAMP;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- 7. Function to check if ordinal is already listed
CREATE OR REPLACE FUNCTION is_ordinal_listed(p_inscription_id VARCHAR(255))
RETURNS BOOLEAN AS $$
DECLARE
  v_is_listed BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1
    FROM ordinal_listings
    WHERE inscription_id = p_inscription_id
    AND status = 'active'
  ) INTO v_is_listed;

  RETURN v_is_listed;
END;
$$ LANGUAGE plpgsql;

-- 8. Function to get floor price for a collection
CREATE OR REPLACE FUNCTION get_collection_floor_price(p_collection_symbol VARCHAR(255))
RETURNS BIGINT AS $$
DECLARE
  v_floor_price BIGINT;
BEGIN
  SELECT MIN(price_sats)
  INTO v_floor_price
  FROM ordinal_listings
  WHERE collection_symbol = p_collection_symbol
  AND status = 'active';

  RETURN COALESCE(v_floor_price, 0);
END;
$$ LANGUAGE plpgsql;

-- 9. Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_ordinal_listing_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ordinal_listings_update_timestamp
  BEFORE UPDATE ON ordinal_listings
  FOR EACH ROW
  EXECUTE FUNCTION update_ordinal_listing_timestamp();

CREATE TRIGGER ordinal_offers_update_timestamp
  BEFORE UPDATE ON ordinal_offers
  FOR EACH ROW
  EXECUTE FUNCTION update_ordinal_listing_timestamp();
