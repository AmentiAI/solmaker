-- Create collections table
CREATE TABLE IF NOT EXISTS collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add constraint to ensure only one active collection
CREATE UNIQUE INDEX IF NOT EXISTS idx_collections_active 
ON collections (is_active) 
WHERE is_active = TRUE;

-- Note: Triggers will be added in a separate migration after basic structure is working
