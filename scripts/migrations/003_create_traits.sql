-- Create traits table
CREATE TABLE IF NOT EXISTS traits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  layer_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  trait_prompt TEXT, -- AI-generated description
  rarity_weight INTEGER DEFAULT 1 CHECK (rarity_weight > 0),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add foreign key constraint after table creation
-- Note: This will fail if constraint already exists, but that's handled by the script
ALTER TABLE traits 
ADD CONSTRAINT traits_layer_id_fkey 
FOREIGN KEY (layer_id) REFERENCES layers(id) ON DELETE CASCADE;

-- Add unique constraint for trait names within a layer
CREATE UNIQUE INDEX IF NOT EXISTS idx_traits_layer_name 
ON traits (layer_id, name);

-- Note: Triggers will be added in a separate migration after basic structure is working
