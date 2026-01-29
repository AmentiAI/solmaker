-- SolMaker.fun - Fresh Solana NFT Platform Schema
-- This is a consolidated migration for fresh deployment

-- ============================================================
-- PROFILES & CREDITS
-- ============================================================

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE,
  display_name TEXT,
  bio TEXT,
  avatar_url TEXT,
  twitter_url TEXT,
  payment_address TEXT,
  opt_in_payouts BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT UNIQUE NOT NULL,
  credits DECIMAL(20,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  amount DECIMAL(20,2) NOT NULL,
  transaction_type TEXT NOT NULL, -- purchase, spend, refund, transfer, bonus
  description TEXT,
  payment_txid TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pending_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  payment_type TEXT DEFAULT 'sol',
  payment_amount DECIMAL(20,9), -- SOL amount
  payment_usd DECIMAL(10,2),
  credits_amount DECIMAL(20,2),
  payment_address TEXT,
  payment_txid TEXT,
  confirmations INT DEFAULT 0,
  status TEXT DEFAULT 'pending', -- pending, completed, expired, cancelled
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS credit_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type TEXT UNIQUE NOT NULL,
  credit_cost DECIMAL(10,2) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- COLLECTIONS & GENERATION
-- ============================================================

CREATE TABLE IF NOT EXISTS collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  wallet_address TEXT,
  total_supply INT DEFAULT 0,
  minted_count INT DEFAULT 0,
  collection_mode TEXT DEFAULT 'advanced',
  collection_status TEXT DEFAULT 'draft', -- draft, active, locked, launched, completed, deleted

  -- Solana-specific
  candy_machine_address VARCHAR(64),
  collection_mint_address VARCHAR(64),

  -- Launch settings
  launch_status TEXT DEFAULT 'not_launched',
  is_launchpad_collection BOOLEAN DEFAULT false,
  is_launchpad_live BOOLEAN DEFAULT false,
  force_show_on_homepage_ticker BOOLEAN DEFAULT false,

  -- Media
  banner_image_url TEXT,
  banner_video_url TEXT,
  mobile_image_url TEXT,
  audio_url TEXT,

  -- Generation settings
  art_style TEXT,
  background_color TEXT DEFAULT 'transparent',
  body_style TEXT,
  pixel_perfect_bodies BOOLEAN DEFAULT false,
  pfp_enabled BOOLEAN DEFAULT false,
  pfp_canvas_size INT,
  pfp_head_position_y INT,
  pfp_body_style TEXT,
  wireframe_config JSONB,
  prompt_template TEXT,
  colors_description TEXT,
  lighting_description TEXT,

  -- Compression
  compression_enabled BOOLEAN DEFAULT false,
  compression_quality INT DEFAULT 80,
  compression_target_kb INT,
  compression_format TEXT DEFAULT 'webp',

  -- Social
  twitter_url TEXT,
  discord_url TEXT,
  website_url TEXT,

  -- Royalties
  royalty_bps INT DEFAULT 0,
  royalty_wallet TEXT,

  -- Cap/Supply
  cap_supply INT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS collection_collaborators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID REFERENCES collections(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  role TEXT DEFAULT 'editor',
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS layers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID REFERENCES collections(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  layer_order INT DEFAULT 0,
  is_optional BOOLEAN DEFAULT false,
  probability DECIMAL(5,2) DEFAULT 100,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS traits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  layer_id UUID REFERENCES layers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  rarity TEXT DEFAULT 'common',
  rarity_weight DECIMAL(5,2) DEFAULT 1,
  image_url TEXT,
  trait_hash TEXT,
  description TEXT,
  trait_overrides JSONB,
  trait_selections JSONB,
  ignore_in_generation BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS generated_ordinals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID REFERENCES collections(id) ON DELETE CASCADE,
  ordinal_number INT,
  prompt TEXT,
  image_url TEXT,
  thumbnail_url TEXT,
  compressed_image_url TEXT,
  original_image_url TEXT,
  file_size_bytes INT,
  compressed_size_kb DECIMAL(10,2),
  image_size_kb DECIMAL(10,2),
  original_size_kb DECIMAL(10,2),
  traits JSONB,
  trait_overrides JSONB,
  trait_selections JSONB,
  art_style TEXT,
  is_minted BOOLEAN DEFAULT false,
  minted_at TIMESTAMPTZ,
  mint_address VARCHAR(64),
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS generation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID REFERENCES collections(id) ON DELETE CASCADE,
  wallet_address TEXT,
  status TEXT DEFAULT 'pending', -- pending, processing, completed, failed
  total_count INT DEFAULT 1,
  completed_count INT DEFAULT 0,
  failed_count INT DEFAULT 0,
  error_message TEXT,
  image_model TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS generation_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID,
  job_id UUID,
  ordinal_number INT,
  error_type TEXT,
  error_message TEXT,
  error_details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- MINTING SYSTEM (Solana NFTs)
-- ============================================================

CREATE TABLE IF NOT EXISTS mint_phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID REFERENCES collections(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phase_order INT DEFAULT 0,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  mint_price_lamports BIGINT DEFAULT 0,
  mint_price_sol DECIMAL(16,9),
  whitelist_only BOOLEAN DEFAULT false,
  phase_allocation INT,
  phase_minted INT DEFAULT 0,
  max_per_wallet INT,
  is_active BOOLEAN DEFAULT false,
  guard_group VARCHAR(64),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mint_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL,
  wallet_address TEXT NOT NULL,
  quantity INT DEFAULT 1,
  status TEXT DEFAULT 'pending', -- pending, completed, expired, failed
  session_data JSONB,
  payment_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mint_nfts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES mint_sessions(id),
  collection_id UUID NOT NULL,
  ordinal_id UUID REFERENCES generated_ordinals(id),
  phase_id UUID REFERENCES mint_phases(id),
  wallet_address TEXT NOT NULL,
  mint_status TEXT DEFAULT 'pending', -- pending, uploading, minting, confirmed, failed, expired
  mint_address VARCHAR(64),
  metadata_uri TEXT,
  image_uri TEXT,
  tx_signature VARCHAR(128),
  mint_data JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS ordinal_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL,
  ordinal_id UUID NOT NULL,
  phase_id UUID,
  reserved_by TEXT NOT NULL,
  status TEXT DEFAULT 'reserved', -- reserved, completed, expired, cancelled
  expires_at TIMESTAMPTZ NOT NULL,
  mint_address VARCHAR(64),
  reserved_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS whitelists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID REFERENCES collections(id) ON DELETE CASCADE,
  phase_id UUID REFERENCES mint_phases(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS whitelist_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  whitelist_id UUID REFERENCES whitelists(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  allocation INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- MARKETPLACE (Solana NFT Trading)
-- ============================================================

CREATE TABLE IF NOT EXISTS nft_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mint_address VARCHAR(64) NOT NULL,
  collection_id UUID,
  seller_wallet VARCHAR(64) NOT NULL,
  price_lamports BIGINT NOT NULL,
  price_sol DECIMAL(16,9),
  listing_tx_signature VARCHAR(128),
  escrow_token_account VARCHAR(64),
  image_url TEXT,
  title TEXT,
  description TEXT,
  content_type TEXT,
  metadata JSONB,
  status TEXT DEFAULT 'active', -- active, sold, cancelled, expired
  sold_to_wallet VARCHAR(64),
  sold_tx_signature VARCHAR(128),
  sold_at TIMESTAMPTZ,
  platform_fee_lamports BIGINT DEFAULT 0,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nft_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID REFERENCES nft_listings(id),
  mint_address VARCHAR(64) NOT NULL,
  seller_wallet VARCHAR(64),
  buyer_wallet VARCHAR(64),
  price_lamports BIGINT,
  price_sol DECIMAL(16,9),
  platform_fee_lamports BIGINT,
  tx_signature VARCHAR(128),
  status TEXT DEFAULT 'pending', -- pending, confirmed, failed
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nft_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  floor_price_lamports BIGINT,
  total_volume_lamports BIGINT DEFAULT 0,
  total_listings INT DEFAULT 0,
  total_sales INT DEFAULT 0,
  verified BOOLEAN DEFAULT false,
  collection_id UUID REFERENCES collections(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS marketplace_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID,
  reviewer_wallet TEXT NOT NULL,
  seller_wallet TEXT NOT NULL,
  rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PROMOTIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID,
  wallet_address TEXT NOT NULL,
  image_url TEXT,
  video_url TEXT,
  prompt TEXT,
  aspect_ratio TEXT DEFAULT '1:1',
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS promotion_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id UUID REFERENCES promotions(id),
  task_id TEXT,
  status TEXT DEFAULT 'pending',
  result_url TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- COMMUNITY PAYOUTS
-- ============================================================

CREATE TABLE IF NOT EXISTS community_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID REFERENCES collections(id),
  total_amount_lamports BIGINT,
  total_amount_sol DECIMAL(16,9),
  holder_count INT,
  tx_signature VARCHAR(128),
  status TEXT DEFAULT 'pending',
  last_payout_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id UUID REFERENCES community_payouts(id),
  wallet_address TEXT NOT NULL,
  amount_lamports BIGINT,
  amount_sol DECIMAL(16,9),
  nft_count INT DEFAULT 1,
  tx_signature VARCHAR(128),
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SUPPORT & ADMIN
-- ============================================================

CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT DEFAULT 'open', -- open, in_progress, resolved, closed
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_wallet TEXT NOT NULL,
  message TEXT NOT NULL,
  is_admin BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  page TEXT,
  visited_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS site_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS front_page_thumbnails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ordinal_id UUID,
  collection_id UUID,
  image_url TEXT,
  thumbnail_url TEXT,
  position INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS preset_previews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  preset_name TEXT NOT NULL,
  preview_url TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reward_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  reward_type TEXT NOT NULL,
  amount DECIMAL(20,2),
  claimed BOOLEAN DEFAULT false,
  claimed_at TIMESTAMPTZ,
  tx_signature VARCHAR(128),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CUSTOM RULES
-- ============================================================

CREATE TABLE IF NOT EXISTS custom_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID REFERENCES collections(id) ON DELETE CASCADE,
  rule_type TEXT NOT NULL,
  rule_config JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TRANSACTIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  tx_type TEXT NOT NULL, -- mint, purchase, listing, transfer, credit_purchase
  tx_signature VARCHAR(128),
  amount_lamports BIGINT,
  amount_sol DECIMAL(16,9),
  status TEXT DEFAULT 'pending',
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================

-- Profiles
CREATE INDEX IF NOT EXISTS idx_profiles_wallet ON profiles(wallet_address);
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);

-- Credits
CREATE INDEX IF NOT EXISTS idx_credits_wallet ON credits(wallet_address);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_wallet ON credit_transactions(wallet_address);
CREATE INDEX IF NOT EXISTS idx_pending_payments_wallet ON pending_payments(wallet_address);
CREATE INDEX IF NOT EXISTS idx_pending_payments_status ON pending_payments(status);

-- Collections
CREATE INDEX IF NOT EXISTS idx_collections_wallet ON collections(wallet_address);
CREATE INDEX IF NOT EXISTS idx_collections_status ON collections(collection_status);
CREATE INDEX IF NOT EXISTS idx_collections_launch_status ON collections(launch_status);
CREATE INDEX IF NOT EXISTS idx_collections_launchpad ON collections(is_launchpad_collection) WHERE is_launchpad_collection = true;

-- Layers & Traits
CREATE INDEX IF NOT EXISTS idx_layers_collection ON layers(collection_id);
CREATE INDEX IF NOT EXISTS idx_traits_layer ON traits(layer_id);

-- Generated ordinals/NFTs
CREATE INDEX IF NOT EXISTS idx_generated_ordinals_collection ON generated_ordinals(collection_id);
CREATE INDEX IF NOT EXISTS idx_generated_ordinals_collection_minted ON generated_ordinals(collection_id, is_minted);
CREATE INDEX IF NOT EXISTS idx_generated_ordinals_minted ON generated_ordinals(is_minted);

-- Generation jobs
CREATE INDEX IF NOT EXISTS idx_generation_jobs_collection ON generation_jobs(collection_id);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_status ON generation_jobs(status);

-- Mint system
CREATE INDEX IF NOT EXISTS idx_mint_phases_collection ON mint_phases(collection_id);
CREATE INDEX IF NOT EXISTS idx_mint_phases_active ON mint_phases(collection_id, is_active);
CREATE INDEX IF NOT EXISTS idx_mint_sessions_collection ON mint_sessions(collection_id);
CREATE INDEX IF NOT EXISTS idx_mint_sessions_wallet ON mint_sessions(wallet_address);
CREATE INDEX IF NOT EXISTS idx_mint_nfts_session ON mint_nfts(session_id);
CREATE INDEX IF NOT EXISTS idx_mint_nfts_collection ON mint_nfts(collection_id);
CREATE INDEX IF NOT EXISTS idx_mint_nfts_wallet ON mint_nfts(wallet_address);
CREATE INDEX IF NOT EXISTS idx_mint_nfts_status ON mint_nfts(mint_status);
CREATE INDEX IF NOT EXISTS idx_mint_nfts_ordinal ON mint_nfts(ordinal_id);

-- Reservations
CREATE INDEX IF NOT EXISTS idx_reservations_collection ON ordinal_reservations(collection_id);
CREATE INDEX IF NOT EXISTS idx_reservations_ordinal ON ordinal_reservations(ordinal_id);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON ordinal_reservations(status);
CREATE INDEX IF NOT EXISTS idx_reservations_expires ON ordinal_reservations(expires_at) WHERE status = 'reserved';

-- Whitelists
CREATE INDEX IF NOT EXISTS idx_whitelists_collection ON whitelists(collection_id);
CREATE INDEX IF NOT EXISTS idx_whitelist_entries_whitelist ON whitelist_entries(whitelist_id);
CREATE INDEX IF NOT EXISTS idx_whitelist_entries_wallet ON whitelist_entries(wallet_address);

-- Marketplace
CREATE INDEX IF NOT EXISTS idx_nft_listings_status ON nft_listings(status);
CREATE INDEX IF NOT EXISTS idx_nft_listings_seller ON nft_listings(seller_wallet);
CREATE INDEX IF NOT EXISTS idx_nft_listings_collection ON nft_listings(collection_id);
CREATE INDEX IF NOT EXISTS idx_nft_listings_mint ON nft_listings(mint_address);
CREATE INDEX IF NOT EXISTS idx_nft_transactions_listing ON nft_transactions(listing_id);
CREATE INDEX IF NOT EXISTS idx_nft_transactions_buyer ON nft_transactions(buyer_wallet);

-- Transactions
CREATE INDEX IF NOT EXISTS idx_transactions_wallet ON transactions(wallet_address);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(tx_type);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);

-- Collaborators
CREATE INDEX IF NOT EXISTS idx_collaborators_collection ON collection_collaborators(collection_id);
CREATE INDEX IF NOT EXISTS idx_collaborators_wallet ON collection_collaborators(wallet_address);
