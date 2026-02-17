// ── Our Wallet & Token ──
// Fill these in here — env vars override if set, otherwise these are used
export const DEV_WALLET_PUBKEY = '4frNov27GnPN5trDVjewWcDJNxM9FtUEg7t5SMCpv8Uz';
// NEVER put private keys in this file — it gets bundled into client JS
// Set BURN_DEV_WALLET_SECRET in env vars only (Vercel dashboard / .env.local)
export const DEV_WALLET_SECRET = '';
export const BURN_TOKEN_MINT = 'ZvWoit87dm2k5ESa6AFWS4dFkhe3Pg6DRdrFHh8pump';

// ── PumpFun Programs ──
export const PUMP_PROGRAM = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
export const PUMPSWAP_PROGRAM = 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA';
export const WSOL_MINT = 'So11111111111111111111111111111111111111111';
export const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
export const PUMPFUN_TOKEN_DECIMALS = 6;

// ── PumpPortal API ──
export const PUMPPORTAL_TRADE_LOCAL = 'https://pumpportal.fun/api/trade-local';
export const PUMPPORTAL_WS = 'wss://pumpportal.fun/api/data';

// ── Burn address (tokens sent here are permanently irrecoverable) ──
// Standard Solana burn address — no private key exists for this
export const DEAD_WALLET = '1nc1nerator11111111111111111111111111111111';

// ── Thresholds ──
export const MIN_SOL_TO_BUY = 0.0001;
export const BUY_SLIPPAGE = 15;
export const PRIORITY_FEE = 0;          // no priority fee needed
export const TX_FEE_RESERVE = 0.00002;  // just the base tx fee (~5000 lamports per tx)
