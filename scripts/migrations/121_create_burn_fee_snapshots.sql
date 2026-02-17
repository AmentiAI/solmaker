CREATE TABLE IF NOT EXISTS burn_fee_snapshots (
  id INTEGER PRIMARY KEY DEFAULT 1,
  pending_bc_fees NUMERIC DEFAULT 0,
  pending_swap_fees NUMERIC DEFAULT 0,
  wallet_balance NUMERIC DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (id = 1)
);

INSERT INTO burn_fee_snapshots (id) VALUES (1) ON CONFLICT DO NOTHING;
