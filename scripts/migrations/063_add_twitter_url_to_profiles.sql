-- Migration: Add twitter_url column to profiles table
-- This stores the Twitter/X profile URL for user profiles
-- Example format: https://x.com/username or https://twitter.com/username

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS twitter_url TEXT;

-- Create index for twitter_url lookups (optional, for future queries)
CREATE INDEX IF NOT EXISTS idx_profiles_twitter_url 
ON profiles (twitter_url) 
WHERE twitter_url IS NOT NULL;

