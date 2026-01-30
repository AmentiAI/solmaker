-- Migration 092: Add telegram_url column to collections table

ALTER TABLE collections 
ADD COLUMN IF NOT EXISTS telegram_url TEXT;

CREATE INDEX IF NOT EXISTS idx_collections_telegram_url 
ON collections(telegram_url) 
WHERE telegram_url IS NOT NULL;
