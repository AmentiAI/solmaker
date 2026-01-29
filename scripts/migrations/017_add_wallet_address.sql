-- Add wallet_address column to collections table
ALTER TABLE collections
ADD COLUMN IF NOT EXISTS wallet_address TEXT;

-- Create index for faster queries by wallet
CREATE INDEX IF NOT EXISTS idx_collections_wallet_address 
ON collections (wallet_address);

-- Add wallet_address column to ordinals table for tracking
ALTER TABLE ordinals
ADD COLUMN IF NOT EXISTS wallet_address TEXT;

-- Create index for ordinals wallet queries
CREATE INDEX IF NOT EXISTS idx_ordinals_wallet_address 
ON ordinals (wallet_address);

