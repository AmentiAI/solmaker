-- Change credits column from INTEGER to DECIMAL to support fractional credits
-- This allows trait generation to charge 0.05 per trait (0.25 for 5 traits, etc.)

-- First, check if the column exists and what type it is
DO $$
BEGIN
  -- Change credits column to DECIMAL(10,2) to support fractional credits
  -- This allows values like 0.25, 0.05, etc.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'credits' AND column_name = 'credits' AND data_type = 'integer'
  ) THEN
    ALTER TABLE credits ALTER COLUMN credits TYPE DECIMAL(10, 2) USING credits::DECIMAL(10, 2);
  END IF;
  
  -- Also update credit_transactions amount column if it's integer
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'credit_transactions' AND column_name = 'amount' AND data_type = 'integer'
  ) THEN
    ALTER TABLE credit_transactions ALTER COLUMN amount TYPE DECIMAL(10, 2) USING amount::DECIMAL(10, 2);
  END IF;
END $$;

