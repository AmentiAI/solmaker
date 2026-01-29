-- Add performance indexes

-- Collections indexes
CREATE INDEX IF NOT EXISTS idx_collections_name ON collections(name);
CREATE INDEX IF NOT EXISTS idx_collections_created_at ON collections(created_at);

-- Layers indexes
CREATE INDEX IF NOT EXISTS idx_layers_collection_id ON layers(collection_id);
CREATE INDEX IF NOT EXISTS idx_layers_display_order ON layers(display_order);

-- Traits indexes
CREATE INDEX IF NOT EXISTS idx_traits_layer_id ON traits(layer_id);
CREATE INDEX IF NOT EXISTS idx_traits_name ON traits(name);
CREATE INDEX IF NOT EXISTS idx_traits_rarity_weight ON traits(rarity_weight);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_layers_collection_order ON layers(collection_id, display_order);
CREATE INDEX IF NOT EXISTS idx_traits_layer_rarity ON traits(layer_id, rarity_weight);
