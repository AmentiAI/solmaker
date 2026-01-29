-- Create admin_visits table to track who visits the admin page
CREATE TABLE IF NOT EXISTS admin_visits (
  id SERIAL PRIMARY KEY,
  wallet_address TEXT,
  user_agent TEXT,
  ip_address TEXT,
  visited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index on wallet_address for faster queries
CREATE INDEX IF NOT EXISTS idx_admin_visits_wallet_address ON admin_visits(wallet_address);

-- Create index on visited_at for time-based queries
CREATE INDEX IF NOT EXISTS idx_admin_visits_visited_at ON admin_visits(visited_at);

