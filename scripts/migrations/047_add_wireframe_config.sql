-- Add wireframe_config column to collections table
-- This stores custom positioning coordinates for pixel-perfect PFP collections
ALTER TABLE collections
ADD COLUMN IF NOT EXISTS wireframe_config JSONB;

-- Add comment
COMMENT ON COLUMN collections.wireframe_config IS 'Custom wireframe positioning configuration for pixel-perfect PFP collections. Stores anchor points (head top, eye line, nose, mouth, shoulders, etc.) as percentages of canvas dimensions.';

