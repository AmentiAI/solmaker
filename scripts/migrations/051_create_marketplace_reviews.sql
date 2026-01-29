-- Marketplace Reviews and Ratings System
-- Allows buyers to leave reviews and ratings (1-5 stars) for sellers after completing a purchase

-- 1. Marketplace Reviews Table
CREATE TABLE IF NOT EXISTS marketplace_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Transaction reference
  transaction_id UUID NOT NULL REFERENCES marketplace_transactions(id) ON DELETE CASCADE,
  listing_id UUID NOT NULL REFERENCES collection_marketplace_listings(id) ON DELETE CASCADE,
  collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  
  -- Parties
  seller_wallet VARCHAR(255) NOT NULL,
  buyer_wallet VARCHAR(255) NOT NULL,
  
  -- Review content
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text TEXT,
  
  -- Buyer info (for display)
  buyer_username VARCHAR(255), -- Denormalized for performance
  
  -- Status
  is_visible BOOLEAN DEFAULT TRUE,
  is_edited BOOLEAN DEFAULT FALSE,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  
  -- Constraints
  CONSTRAINT one_review_per_transaction UNIQUE (transaction_id),
  CONSTRAINT one_review_per_buyer_listing UNIQUE (listing_id, buyer_wallet)
);

-- 2. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_marketplace_reviews_seller ON marketplace_reviews(seller_wallet);
CREATE INDEX IF NOT EXISTS idx_marketplace_reviews_buyer ON marketplace_reviews(buyer_wallet);
CREATE INDEX IF NOT EXISTS idx_marketplace_reviews_listing ON marketplace_reviews(listing_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_reviews_collection ON marketplace_reviews(collection_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_reviews_transaction ON marketplace_reviews(transaction_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_reviews_visible ON marketplace_reviews(is_visible) WHERE is_visible = TRUE;
CREATE INDEX IF NOT EXISTS idx_marketplace_reviews_rating ON marketplace_reviews(rating);

-- 3. Comments
COMMENT ON TABLE marketplace_reviews IS 'Buyer reviews and ratings for marketplace purchases';
COMMENT ON COLUMN marketplace_reviews.rating IS 'Star rating from 1 to 5';
COMMENT ON COLUMN marketplace_reviews.buyer_username IS 'Denormalized username for display performance';
COMMENT ON COLUMN marketplace_reviews.is_visible IS 'Whether the review is visible to the public';

