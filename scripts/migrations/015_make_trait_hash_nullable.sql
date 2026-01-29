-- Make trait_combination_hash nullable to support prompt-based collections
ALTER TABLE generated_ordinals 
ALTER COLUMN trait_combination_hash DROP NOT NULL;

