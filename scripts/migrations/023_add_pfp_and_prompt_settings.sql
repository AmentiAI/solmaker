-- Add PFP collection and prompt customization settings
ALTER TABLE collections 
ADD COLUMN IF NOT EXISTS is_pfp_collection BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS facing_direction TEXT CHECK (facing_direction IN ('left', 'left-front', 'front', 'right-front', 'right')),
ADD COLUMN IF NOT EXISTS use_hyper_detailed BOOLEAN DEFAULT TRUE;

