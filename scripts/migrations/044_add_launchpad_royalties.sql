-- Migration: Add royalty and payment settings to launchpad system
-- This adds creator payment/deposit addresses and platform fee configuration

-- 1. Add royalty/payment fields to collections table (for launchpad settings)
ALTER TABLE collections ADD COLUMN IF NOT EXISTS creator_royalty_wallet VARCHAR(255);
ALTER TABLE collections ADD COLUMN IF NOT EXISTS creator_royalty_percent DECIMAL(5,2) DEFAULT 0;

-- 2. Add payment fields to mint_phases (each phase can have its own payment config)
ALTER TABLE mint_phases ADD COLUMN IF NOT EXISTS creator_payment_wallet VARCHAR(255);
ALTER TABLE mint_phases ADD COLUMN IF NOT EXISTS platform_fee_sats BIGINT DEFAULT 2500; -- 0.00002500 BTC = 2500 sats

-- 3. Update collection_mint_launches with royalty fields
ALTER TABLE collection_mint_launches ADD COLUMN IF NOT EXISTS creator_royalty_percent DECIMAL(5,2) DEFAULT 0;

-- Comments for clarity
COMMENT ON COLUMN collections.creator_royalty_wallet IS 'BTC address where creator receives mint payments';
COMMENT ON COLUMN collections.creator_royalty_percent IS 'Percentage of mint price going to creator (0-100)';
COMMENT ON COLUMN mint_phases.creator_payment_wallet IS 'Override payment wallet for this specific phase';
COMMENT ON COLUMN mint_phases.platform_fee_sats IS 'Platform fee in satoshis added to each mint (default 2500 = 0.00002500 BTC)';

