-- Marketplace System Migration
-- Allows users to sell entire collections (as image collections, not inscribed) for credits

-- 1. Collection Marketplace Listings Table
CREATE TABLE IF NOT EXISTS collection_marketplace_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  seller_wallet VARCHAR(255) NOT NULL,

  -- Pricing
  price_credits DECIMAL(10,2) NOT NULL CHECK (price_credits > 0),

  -- Listing details
  title VARCHAR(255) NOT NULL,
  description TEXT,

  -- Promotional materials included in the sale
  included_promo_urls TEXT[], -- Array of promotion image URLs

  -- Terms and conditions
  terms_accepted BOOLEAN DEFAULT FALSE NOT NULL,
  terms_accepted_at TIMESTAMPTZ,

  -- Status
  status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'sold', 'cancelled', 'removed')),

  -- Sale tracking
  sold_to_wallet VARCHAR(255),
  sold_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

  -- Constraints
  CONSTRAINT collection_must_be_locked CHECK (
    -- We'll enforce this in application logic, but document it here
    -- The collection must be locked before listing
    TRUE
  ),
  CONSTRAINT unique_active_listing UNIQUE NULLS NOT DISTINCT (collection_id, status)
    WHERE (status = 'active')
);

-- 2. Marketplace Transactions Table
CREATE TABLE IF NOT EXISTS marketplace_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES collection_marketplace_listings(id) ON DELETE CASCADE,
  collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,

  -- Parties
  seller_wallet VARCHAR(255) NOT NULL,
  buyer_wallet VARCHAR(255) NOT NULL,

  -- Transaction details
  price_credits DECIMAL(10,2) NOT NULL,

  -- Credits tracking
  seller_credits_before DECIMAL(10,2) NOT NULL,
  seller_credits_after DECIMAL(10,2) NOT NULL,
  buyer_credits_before DECIMAL(10,2) NOT NULL,
  buyer_credits_after DECIMAL(10,2) NOT NULL,

  -- Status
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ,
  error_message TEXT
);

-- 3. Marketplace Fraud Prevention Table
-- Track sellers who try to sell collections multiple times
CREATE TABLE IF NOT EXISTS marketplace_seller_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_wallet VARCHAR(255) NOT NULL,
  collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,

  -- Violation details
  violation_type VARCHAR(100) NOT NULL, -- 'multiple_sales', 'fraudulent_listing', etc.
  description TEXT,

  -- Ban status
  is_banned BOOLEAN DEFAULT FALSE,
  banned_at TIMESTAMPTZ,
  banned_until TIMESTAMPTZ, -- NULL = permanent

  -- Metadata
  detected_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  reported_by VARCHAR(255), -- Admin or system
  notes TEXT
);

-- 4. Add marketplace_status to collections table
ALTER TABLE collections ADD COLUMN IF NOT EXISTS marketplace_listing_id UUID REFERENCES collection_marketplace_listings(id) ON DELETE SET NULL;
ALTER TABLE collections ADD COLUMN IF NOT EXISTS marketplace_status VARCHAR(50) DEFAULT NULL CHECK (marketplace_status IN (NULL, 'listed', 'sold'));

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_status ON collection_marketplace_listings(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_seller ON collection_marketplace_listings(seller_wallet);
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_collection ON collection_marketplace_listings(collection_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_active ON collection_marketplace_listings(status) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_marketplace_transactions_listing ON marketplace_transactions(listing_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_transactions_buyer ON marketplace_transactions(buyer_wallet);
CREATE INDEX IF NOT EXISTS idx_marketplace_transactions_seller ON marketplace_transactions(seller_wallet);
CREATE INDEX IF NOT EXISTS idx_marketplace_transactions_status ON marketplace_transactions(status);

CREATE INDEX IF NOT EXISTS idx_marketplace_violations_seller ON marketplace_seller_violations(seller_wallet);
CREATE INDEX IF NOT EXISTS idx_marketplace_violations_banned ON marketplace_seller_violations(is_banned) WHERE is_banned = TRUE;

-- Function to check if seller is banned
CREATE OR REPLACE FUNCTION is_seller_banned(p_seller_wallet VARCHAR(255))
RETURNS BOOLEAN AS $$
DECLARE
  v_is_banned BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1
    FROM marketplace_seller_violations
    WHERE seller_wallet = p_seller_wallet
    AND is_banned = TRUE
    AND (banned_until IS NULL OR banned_until > NOW())
  ) INTO v_is_banned;

  RETURN v_is_banned;
END;
$$ LANGUAGE plpgsql;

-- Function to handle collection ownership transfer
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

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Trigger to prevent collection modification while listed
CREATE OR REPLACE FUNCTION prevent_listed_collection_modification()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.marketplace_status = 'listed' THEN
    -- Allow only status updates and ownership transfers
    IF NEW.marketplace_status != OLD.marketplace_status
       OR NEW.wallet_address != OLD.wallet_address
       OR NEW.marketplace_listing_id != OLD.marketplace_listing_id THEN
      -- These changes are allowed (for selling)
      RETURN NEW;
    ELSE
      RAISE EXCEPTION 'Cannot modify collection while listed on marketplace';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_listed_collection_changes
  BEFORE UPDATE ON collections
  FOR EACH ROW
  WHEN (OLD.marketplace_status = 'listed')
  EXECUTE FUNCTION prevent_listed_collection_modification();
