-- Migration 085: Add missing columns to credit_costs table
-- Adds cost_per_unit, unit_name, and updated_by columns

-- Add cost_per_unit column (copy from credit_cost if exists)
ALTER TABLE credit_costs 
ADD COLUMN IF NOT EXISTS cost_per_unit DECIMAL(10,2);

-- Add unit_name column
ALTER TABLE credit_costs 
ADD COLUMN IF NOT EXISTS unit_name TEXT DEFAULT 'unit';

-- Add updated_by column
ALTER TABLE credit_costs 
ADD COLUMN IF NOT EXISTS updated_by TEXT;

-- Copy data from credit_cost to cost_per_unit if cost_per_unit is null
UPDATE credit_costs 
SET cost_per_unit = credit_cost 
WHERE cost_per_unit IS NULL AND credit_cost IS NOT NULL;

-- Set default cost_per_unit to 1.0 if still null
UPDATE credit_costs 
SET cost_per_unit = 1.0 
WHERE cost_per_unit IS NULL;

-- Make cost_per_unit NOT NULL after filling in values
ALTER TABLE credit_costs 
ALTER COLUMN cost_per_unit SET NOT NULL;

-- Add default values for existing rows
UPDATE credit_costs 
SET unit_name = CASE 
  WHEN action_type = 'image_generation' THEN 'image'
  WHEN action_type = 'trait_generation' THEN 'trait'
  WHEN action_type = 'collection_generation' THEN 'collection'
  ELSE 'unit'
END
WHERE unit_name IS NULL OR unit_name = 'unit';

-- Create index on action_type for faster lookups
CREATE INDEX IF NOT EXISTS idx_credit_costs_action_type ON credit_costs(action_type);
