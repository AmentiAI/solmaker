-- Create layers table
CREATE TABLE IF NOT EXISTS layers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  display_order INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add foreign key constraint after table creation
-- Note: This will fail if constraint already exists, but that's handled by the script
ALTER TABLE layers 
ADD CONSTRAINT layers_collection_id_fkey 
FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE;

-- Add unique constraint for display order within a collection
CREATE UNIQUE INDEX IF NOT EXISTS idx_layers_collection_order 
ON layers (collection_id, display_order);

-- Note: Triggers will be added in a separate migration after basic structure is working
