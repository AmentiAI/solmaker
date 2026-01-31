-- Migration 117: Add Solana network setting to site_settings table

INSERT INTO site_settings (setting_key, setting_value, description)
VALUES (
  'solana_network',
  '"devnet"'::jsonb,
  'Solana network to use for deployments and minting (devnet or mainnet-beta)'
)
ON CONFLICT (setting_key) DO NOTHING;

INSERT INTO site_settings (setting_key, setting_value, description)
VALUES (
  'solana_rpc_mainnet',
  '"https://api.mainnet-beta.solana.com"'::jsonb,
  'Solana RPC endpoint for mainnet-beta'
)
ON CONFLICT (setting_key) DO NOTHING;

INSERT INTO site_settings (setting_key, setting_value, description)
VALUES (
  'solana_rpc_devnet',
  '"https://api.devnet.solana.com"'::jsonb,
  'Solana RPC endpoint for devnet'
)
ON CONFLICT (setting_key) DO NOTHING;
