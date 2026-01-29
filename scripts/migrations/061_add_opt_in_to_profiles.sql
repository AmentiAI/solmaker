-- Migration: Add opt_in column to profiles table
-- This allows users to opt-in to receive community revenue payouts

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS opt_in BOOLEAN DEFAULT false;

-- Create index for opt_in lookups
CREATE INDEX IF NOT EXISTS idx_profiles_opt_in 
ON profiles (opt_in) 
WHERE opt_in = true;

COMMENT ON COLUMN profiles.opt_in IS 'Whether the user has opted in to receive community revenue payouts';

