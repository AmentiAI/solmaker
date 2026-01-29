-- Migration: Add mint_type field to collections for Ordinal Choices Mint
-- This allows collections to choose between "hidden" (default) and "choices" mint modes

-- Add mint_type column to collections table
ALTER TABLE collections ADD COLUMN IF NOT EXISTS mint_type VARCHAR(20) DEFAULT 'hidden';

-- Drop constraint if it exists (PostgreSQL doesn't support IF NOT EXISTS for constraints)
ALTER TABLE collections DROP CONSTRAINT IF EXISTS check_mint_type;

-- Add constraint to ensure valid values
ALTER TABLE collections ADD CONSTRAINT check_mint_type 
  CHECK (mint_type IN ('hidden', 'choices'));

-- Add comment
COMMENT ON COLUMN collections.mint_type IS 'Mint type: hidden (default random mint) or choices (paginated selection)';

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_collections_mint_type ON collections(mint_type) WHERE mint_type = 'choices';

