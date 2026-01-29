-- Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
  wallet_address TEXT PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  display_name VARCHAR(100),
  bio TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for username lookups
CREATE INDEX IF NOT EXISTS idx_profiles_username 
ON profiles (username);

-- Create index for wallet address (already primary key, but useful for queries)
CREATE INDEX IF NOT EXISTS idx_profiles_wallet_address 
ON profiles (wallet_address);

