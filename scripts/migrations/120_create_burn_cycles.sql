CREATE TABLE IF NOT EXISTS burn_cycles (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Step 1: Claim fees
  fees_claimed_sol NUMERIC(20, 9) NOT NULL DEFAULT 0,
  claim_tx_sig TEXT,
  claim_source TEXT NOT NULL DEFAULT 'pump',

  -- Step 2: Buy token
  tokens_bought NUMERIC(20, 6) NOT NULL DEFAULT 0,
  buy_price_sol NUMERIC(20, 12),
  buy_tx_sig TEXT,

  -- Step 3: Burn tokens
  tokens_burned NUMERIC(20, 6) NOT NULL DEFAULT 0,
  burn_tx_sig TEXT,

  -- Status
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  dev_wallet TEXT NOT NULL,
  token_mint TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_burn_cycles_created_at ON burn_cycles(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_burn_cycles_status ON burn_cycles(status);
