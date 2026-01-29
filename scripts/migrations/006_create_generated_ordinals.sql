-- Create generated_ordinals table to store AI-generated images
CREATE TABLE IF NOT EXISTS generated_ordinals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL,
  ordinal_number INTEGER NOT NULL,
  image_url TEXT NOT NULL,
  metadata_url TEXT,
  prompt TEXT NOT NULL,
  traits JSONB NOT NULL,
  trait_combination_hash VARCHAR(64) NOT NULL,
  rarity_score DECIMAL(10, 2),
  rarity_tier VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add foreign key constraint after table creation
ALTER TABLE generated_ordinals 
ADD CONSTRAINT generated_ordinals_collection_id_fkey 
FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_generated_ordinals_collection 
ON generated_ordinals (collection_id, created_at DESC);

-- Add index for duplicate detection
CREATE INDEX IF NOT EXISTS idx_generated_ordinals_hash 
ON generated_ordinals (collection_id, trait_combination_hash);
