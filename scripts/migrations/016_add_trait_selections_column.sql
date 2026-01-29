ALTER TABLE collections
ADD COLUMN IF NOT EXISTS trait_selections JSONB DEFAULT '{}'::jsonb;

-- Ensure existing rows have an object value
UPDATE collections
SET trait_selections = COALESCE(trait_selections, '{}'::jsonb);

-- Optional: enforce NOT NULL if desired
ALTER TABLE collections
ALTER COLUMN trait_selections SET DEFAULT '{}'::jsonb;

