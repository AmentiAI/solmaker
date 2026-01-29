-- Launchpad System Migration
-- Creates tables for mint phases, whitelists, reservations, and collection launch settings

-- 1. Collection Launch Settings (extends collections table)
ALTER TABLE collections ADD COLUMN IF NOT EXISTS banner_image_url TEXT;
ALTER TABLE collections ADD COLUMN IF NOT EXISTS mobile_image_url TEXT;
ALTER TABLE collections ADD COLUMN IF NOT EXISTS audio_url TEXT;
ALTER TABLE collections ADD COLUMN IF NOT EXISTS video_url TEXT;
ALTER TABLE collections ADD COLUMN IF NOT EXISTS extend_last_phase BOOLEAN DEFAULT FALSE;
ALTER TABLE collections ADD COLUMN IF NOT EXISTS launch_status VARCHAR(50) DEFAULT 'draft';
ALTER TABLE collections ADD COLUMN IF NOT EXISTS launched_at TIMESTAMPTZ;
ALTER TABLE collections ADD COLUMN IF NOT EXISTS mint_ended_at TIMESTAMPTZ;
ALTER TABLE collections ADD COLUMN IF NOT EXISTS total_minted INTEGER DEFAULT 0;

-- 2. Mint Phases Table
CREATE TABLE IF NOT EXISTS mint_phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  phase_name VARCHAR(255) NOT NULL,
  phase_order INTEGER NOT NULL DEFAULT 0,
  
  -- Timing
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  
  -- Pricing (phases have their own prices, not global)
  mint_price_sats BIGINT NOT NULL DEFAULT 0,
  
  -- Gas/Fee settings
  min_fee_rate DECIMAL(10,2) DEFAULT 1,
  max_fee_rate DECIMAL(10,2) DEFAULT 500,
  suggested_fee_rate DECIMAL(10,2) DEFAULT 10,
  
  -- Allocation limits
  max_per_wallet INTEGER DEFAULT NULL, -- NULL = unlimited
  max_per_transaction INTEGER DEFAULT 1,
  phase_allocation INTEGER DEFAULT NULL, -- NULL = unlimited, total for this phase
  phase_minted INTEGER DEFAULT 0,
  
  -- Whitelist settings
  whitelist_only BOOLEAN DEFAULT FALSE,
  whitelist_id UUID, -- Reference to mint_phase_whitelists
  
  -- Phase behavior
  end_on_allocation BOOLEAN DEFAULT TRUE, -- End phase when allocation hit
  is_active BOOLEAN DEFAULT FALSE,
  is_completed BOOLEAN DEFAULT FALSE,
  
  -- Metadata
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT valid_phase_times CHECK (end_time IS NULL OR end_time > start_time)
);

-- 3. Mint Phase Whitelists
CREATE TABLE IF NOT EXISTS mint_phase_whitelists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Settings
  max_entries INTEGER DEFAULT NULL, -- NULL = unlimited
  entries_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255)
);

-- 4. Whitelist Entries
CREATE TABLE IF NOT EXISTS whitelist_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  whitelist_id UUID NOT NULL REFERENCES mint_phase_whitelists(id) ON DELETE CASCADE,
  wallet_address VARCHAR(255) NOT NULL,
  
  -- Per-wallet allocation for this whitelist
  allocation INTEGER DEFAULT 1,
  minted_count INTEGER DEFAULT 0,
  
  -- Metadata
  added_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  added_by VARCHAR(255),
  notes TEXT,
  
  UNIQUE(whitelist_id, wallet_address)
);

-- 5. Ordinal Reservations (prevents duplicates during concurrent mints)
CREATE TABLE IF NOT EXISTS ordinal_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  ordinal_id UUID NOT NULL REFERENCES generated_ordinals(id) ON DELETE CASCADE,
  phase_id UUID REFERENCES mint_phases(id) ON DELETE SET NULL,
  
  -- Reservation info
  reserved_by VARCHAR(255) NOT NULL, -- wallet address
  reserved_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL, -- Auto-release if not completed
  
  -- Status
  status VARCHAR(50) DEFAULT 'reserved',
  
  -- If completed, link to inscription
  inscription_id UUID REFERENCES mint_inscriptions(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  
  CONSTRAINT valid_reservation_status CHECK (status IN ('reserved', 'completed', 'expired', 'cancelled')),
  UNIQUE(ordinal_id, status) -- Only one active reservation per ordinal
);

-- 6. Mint Queue (for processing mints in order)
CREATE TABLE IF NOT EXISTS mint_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  phase_id UUID REFERENCES mint_phases(id) ON DELETE SET NULL,
  ordinal_id UUID NOT NULL REFERENCES generated_ordinals(id) ON DELETE CASCADE,
  reservation_id UUID REFERENCES ordinal_reservations(id) ON DELETE SET NULL,
  
  -- Minter info
  minter_wallet VARCHAR(255) NOT NULL,
  receiving_wallet VARCHAR(255) NOT NULL,
  
  -- Pricing
  mint_price_sats BIGINT NOT NULL DEFAULT 0,
  fee_rate DECIMAL(10,4) NOT NULL DEFAULT 1,
  
  -- Queue position
  queue_position INTEGER,
  queued_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  
  -- Processing status
  status VARCHAR(50) DEFAULT 'queued',
  processing_started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  
  -- Link to actual inscription
  inscription_id UUID REFERENCES mint_inscriptions(id) ON DELETE SET NULL,
  
  CONSTRAINT valid_queue_status CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'cancelled'))
);

-- 7. Phase Wallet Mints (track mints per wallet per phase)
CREATE TABLE IF NOT EXISTS phase_wallet_mints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id UUID NOT NULL REFERENCES mint_phases(id) ON DELETE CASCADE,
  wallet_address VARCHAR(255) NOT NULL,
  mint_count INTEGER DEFAULT 0,
  last_mint_at TIMESTAMPTZ,
  
  UNIQUE(phase_id, wallet_address)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_mint_phases_collection ON mint_phases(collection_id);
CREATE INDEX IF NOT EXISTS idx_mint_phases_active ON mint_phases(is_active, start_time);
CREATE INDEX IF NOT EXISTS idx_mint_phases_order ON mint_phases(collection_id, phase_order);

CREATE INDEX IF NOT EXISTS idx_whitelist_entries_whitelist ON whitelist_entries(whitelist_id);
CREATE INDEX IF NOT EXISTS idx_whitelist_entries_wallet ON whitelist_entries(wallet_address);

CREATE INDEX IF NOT EXISTS idx_reservations_collection ON ordinal_reservations(collection_id);
CREATE INDEX IF NOT EXISTS idx_reservations_ordinal ON ordinal_reservations(ordinal_id);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON ordinal_reservations(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_reservations_wallet ON ordinal_reservations(reserved_by);

CREATE INDEX IF NOT EXISTS idx_mint_queue_collection ON mint_queue(collection_id);
CREATE INDEX IF NOT EXISTS idx_mint_queue_status ON mint_queue(status, queue_position);
CREATE INDEX IF NOT EXISTS idx_mint_queue_minter ON mint_queue(minter_wallet);

CREATE INDEX IF NOT EXISTS idx_phase_wallet_mints ON phase_wallet_mints(phase_id, wallet_address);

CREATE INDEX IF NOT EXISTS idx_collections_launch_status ON collections(launch_status);
CREATE INDEX IF NOT EXISTS idx_collections_launched ON collections(launched_at DESC);

-- Add foreign key from mint_phases to whitelists
ALTER TABLE mint_phases 
ADD CONSTRAINT IF NOT EXISTS fk_phase_whitelist 
FOREIGN KEY (whitelist_id) REFERENCES mint_phase_whitelists(id) ON DELETE SET NULL;

-- Function to automatically release expired reservations
CREATE OR REPLACE FUNCTION release_expired_reservations()
RETURNS INTEGER AS $$
DECLARE
  released_count INTEGER;
BEGIN
  UPDATE ordinal_reservations 
  SET status = 'expired'
  WHERE status = 'reserved' 
  AND expires_at < NOW();
  
  GET DIAGNOSTICS released_count = ROW_COUNT;
  RETURN released_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get next available ordinal for a collection (prevents duplicates)
CREATE OR REPLACE FUNCTION get_next_available_ordinal(
  p_collection_id UUID,
  p_wallet_address VARCHAR(255),
  p_reservation_minutes INTEGER DEFAULT 10
)
RETURNS UUID AS $$
DECLARE
  v_ordinal_id UUID;
  v_reservation_id UUID;
BEGIN
  -- First, release any expired reservations
  PERFORM release_expired_reservations();
  
  -- Find an available ordinal (not minted and not reserved)
  SELECT go.id INTO v_ordinal_id
  FROM generated_ordinals go
  WHERE go.collection_id = p_collection_id
  AND go.is_minted = FALSE
  AND NOT EXISTS (
    SELECT 1 FROM ordinal_reservations r 
    WHERE r.ordinal_id = go.id 
    AND r.status = 'reserved'
  )
  ORDER BY RANDOM()
  LIMIT 1
  FOR UPDATE SKIP LOCKED; -- Important: skip locked rows to prevent race conditions
  
  IF v_ordinal_id IS NULL THEN
    RETURN NULL; -- No available ordinals
  END IF;
  
  -- Create reservation
  INSERT INTO ordinal_reservations (
    collection_id, 
    ordinal_id, 
    reserved_by, 
    expires_at
  ) VALUES (
    p_collection_id,
    v_ordinal_id,
    p_wallet_address,
    NOW() + (p_reservation_minutes || ' minutes')::INTERVAL
  )
  RETURNING id INTO v_reservation_id;
  
  RETURN v_ordinal_id;
END;
$$ LANGUAGE plpgsql;

