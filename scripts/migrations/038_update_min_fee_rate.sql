-- Update min_fee_rate default and existing values to support low fee rates
-- Change default from 1.0 to 0.1 sat/vB to allow low-fee minting

-- Update the default value for new rows
ALTER TABLE mint_phases
  ALTER COLUMN min_fee_rate SET DEFAULT 0.1;

-- Update existing rows that have min_fee_rate = 1.0 to 0.1
-- (Only update if it's exactly 1.0, to not override custom values)
UPDATE mint_phases
SET min_fee_rate = 0.1
WHERE min_fee_rate = 1.0;
