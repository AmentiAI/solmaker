-- Add social links columns to collections table
-- Twitter, Discord, Telegram, and Website URLs

ALTER TABLE collections 
ADD COLUMN IF NOT EXISTS twitter_url TEXT,
ADD COLUMN IF NOT EXISTS discord_url TEXT,
ADD COLUMN IF NOT EXISTS telegram_url TEXT,
ADD COLUMN IF NOT EXISTS website_url TEXT;

-- Add comments for documentation
COMMENT ON COLUMN collections.twitter_url IS 'Twitter/X profile URL';
COMMENT ON COLUMN collections.discord_url IS 'Discord server invite URL';
COMMENT ON COLUMN collections.telegram_url IS 'Telegram channel/group URL';
COMMENT ON COLUMN collections.website_url IS 'Official website URL';

