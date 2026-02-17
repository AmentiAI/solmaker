# PumpFun Auto-Burn System — Implementation Reference

> Build a `/burn` page that visually shows a cron job claiming PumpFun creator fees, buying the token, and burning it — every minute.

## Quick Reference

| | Value |
|---|---|
| **Dev/Creator Wallet** | `HvAbxGwvimzVymcMXK1maY979c4PXtYeb8CD5HT987sT` |
| **Token Mint** | `TBD` — launch token on PumpFun with the wallet above, then provide the mint address |
| **Cron Endpoint** | `POST /api/cron/burn-cycle` |
| **Burn Page** | `/burn` |
| **History API** | `GET /api/burn/history` |

### After Token Launch
1. Provide the token mint address
2. Set `BURN_TOKEN_MINT` and `NEXT_PUBLIC_BURN_TOKEN_MINT` env vars
3. Deploy — cron starts the claim→buy→burn cycle automatically

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  Cron Job (Vercel Cron / 1 min)                         │
│  POST /api/cron/burn-cycle                              │
│                                                         │
│  1. Claim creator fees (SOL) from PumpFun               │
│  2. Buy token with the claimed SOL                      │
│  3. Burn the purchased tokens                           │
│  4. Log cycle to database                               │
└──────────────────────┬──────────────────────────────────┘
                       │ writes to
                       ▼
              ┌─────────────────┐
              │  burn_cycles DB  │
              │  table           │
              └────────┬────────┘
                       │ reads from
                       ▼
┌─────────────────────────────────────────────────────────┐
│  /burn page (Next.js)                                   │
│                                                         │
│  - Live feed of burn events (poll every 5s)             │
│  - Running totals: SOL claimed, tokens burned           │
│  - Animated fire / burn visualizations                  │
│  - Transaction links to Solscan                         │
│  - Current token price & supply deflation tracker       │
└─────────────────────────────────────────────────────────┘
```

---

## 1. Wallet & Environment Variables

### Dev Wallet (Token Creator)

| | Value |
|---|---|
| **Public Key** | `HvAbxGwvimzVymcMXK1maY979c4PXtYeb8CD5HT987sT` |
| **Token Mint** | `TBD` — *will be set after token launch on PumpFun* |

> This wallet MUST be the wallet that creates the token on PumpFun — that's what makes it the "creator" eligible to claim fees.

### `.env.local`

```env
# Existing
NEON_DATABASE=postgresql://...
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# Burn system — ADD THESE
BURN_DEV_WALLET_SECRET=<base58 private key for HvAbx...987sT>   # NEVER commit this
BURN_TOKEN_MINT=<token mint address>                              # Set after PumpFun launch
CRON_SECRET=<random string>                                       # Protects the cron endpoint
PUMPPORTAL_API_KEY=<optional>                                     # Only if using Lightning API
```

> **IMPORTANT:** Store the private key ONLY in Vercel env vars and `.env.local` (which is gitignored). The public key `HvAbxGwvimzVymcMXK1maY979c4PXtYeb8CD5HT987sT` is safe to reference in code.

---

## 2. Database Table

```sql
-- scripts/migrations/120_create_burn_cycles.sql
CREATE TABLE IF NOT EXISTS burn_cycles (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Step 1: Claim fees
  fees_claimed_sol NUMERIC(20, 9) NOT NULL DEFAULT 0,    -- SOL claimed
  claim_tx_sig TEXT,                                       -- claim tx signature
  claim_source TEXT NOT NULL DEFAULT 'pump',               -- 'pump' or 'pump-amm'

  -- Step 2: Buy token
  tokens_bought NUMERIC(20, 6) NOT NULL DEFAULT 0,        -- tokens acquired
  buy_price_sol NUMERIC(20, 12),                           -- price per token
  buy_tx_sig TEXT,                                         -- buy tx signature

  -- Step 3: Burn tokens
  tokens_burned NUMERIC(20, 6) NOT NULL DEFAULT 0,        -- tokens burned
  burn_tx_sig TEXT,                                        -- burn tx signature

  -- Status
  status TEXT NOT NULL DEFAULT 'pending',                  -- pending | claiming | buying | burning | complete | error | skipped
  error_message TEXT,
  dev_wallet TEXT NOT NULL,                                -- wallet address used
  token_mint TEXT NOT NULL                                 -- which token
);

CREATE INDEX idx_burn_cycles_created_at ON burn_cycles(created_at DESC);
CREATE INDEX idx_burn_cycles_status ON burn_cycles(status);
```

---

## 3. Key Program IDs & Constants

```typescript
// lib/burn/constants.ts

// ── Our Wallet ──
export const DEV_WALLET_PUBKEY = 'HvAbxGwvimzVymcMXK1maY979c4PXtYeb8CD5HT987sT';

// ── PumpFun Programs ──
export const PUMP_PROGRAM = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
export const PUMPSWAP_PROGRAM = 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA';
export const WSOL_MINT = 'So11111111111111111111111111111111111111111';
export const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
export const PUMPFUN_TOKEN_DECIMALS = 6;

// ── PumpPortal API (handles both bonding curve & graduated) ──
export const PUMPPORTAL_TRADE_LOCAL = 'https://pumpportal.fun/api/trade-local';
export const PUMPPORTAL_TRADE_LIGHTNING = 'https://pumpportal.fun/api/trade';
export const PUMPPORTAL_WS = 'wss://pumpportal.fun/api/data';

// ── Thresholds ──
export const MIN_SOL_TO_BUY = 0.001;  // skip cycle if claimed fees < this
export const BUY_SLIPPAGE = 15;        // percent
export const PRIORITY_FEE = 0.0001;    // SOL
export const TX_FEE_RESERVE = 0.001;   // SOL reserved for burn tx fee
```

---

## 4. PumpFun Technical Reference

### 4.1 Creator Fee Claiming

There are **two fee vaults** depending on token lifecycle stage:

| Stage | Program | Vault Type | Instruction |
|-------|---------|-----------|-------------|
| **Bonding curve** (pre-graduation) | Pump Program | SOL in PDA `["creator-vault", creator]` | `collect_creator_fee` |
| **Graduated** (PumpSwap AMM) | PumpSwap | WSOL in ATA owned by PDA `["creator_vault", creator]` | `collect_coin_creator_fee` |

**PDA derivations (for our wallet `HvAbxGwvimzVymcMXK1maY979c4PXtYeb8CD5HT987sT`):**
```typescript
import { PublicKey } from '@solana/web3.js';
import { DEV_WALLET_PUBKEY, PUMP_PROGRAM, PUMPSWAP_PROGRAM } from '@/lib/burn/constants';

const creator = new PublicKey(DEV_WALLET_PUBKEY);

// Bonding curve creator vault (SOL accumulates here pre-graduation)
const [bcCreatorVault] = PublicKey.findProgramAddressSync(
  [Buffer.from('creator-vault'), creator.toBuffer()],
  new PublicKey(PUMP_PROGRAM)
);

// PumpSwap creator vault authority (WSOL accumulates here post-graduation)
const [swapVaultAuthority] = PublicKey.findProgramAddressSync(
  [Buffer.from('creator_vault'), creator.toBuffer()],
  new PublicKey(PUMPSWAP_PROGRAM)
);
```

**Creator fee rates (PumpSwap, dynamic by market cap):**

| Market Cap | Creator Fee |
|-----------|-------------|
| $88K–$300K | 0.95% |
| $300K–$1M | ~0.50–0.70% |
| $1M–$20M | ~0.20–0.05% |
| >$20M | 0.05% |

Bonding curve fee: flat 1% (100 bps) on all trades.

### 4.2 Buying a Token

**Bonding curve price formula (constant product):**
```typescript
// product = virtualSolReserves * virtualTokenReserves
// newSolReserves = virtualSolReserves + solAmount
// newTokenReserves = product / newSolReserves
// tokensOut = virtualTokenReserves - newTokenReserves
// actualTokensOut = min(tokensOut, realTokenReserves)
```

**Bonding curve account layout:**
```
Offset  Field                     Type
0x00    discriminator             u64
0x08    virtual_token_reserves    u64
0x10    virtual_sol_reserves      u64
0x18    real_token_reserves       u64
0x20    real_sol_reserves         u64
0x28    token_total_supply        u64
0x30    complete                  bool    ← true = graduated
0x31    creator                   Pubkey
```

**Check if graduated:**
```typescript
const [bondingCurve] = PublicKey.findProgramAddressSync(
  [Buffer.from('bonding-curve'), mintPubkey.toBuffer()],
  new PublicKey(PUMP_PROGRAM)
);
const info = await connection.getAccountInfo(bondingCurve);
const isGraduated = info ? info.data[0x30] === 1 : true;
```

### 4.3 SPL Token Burning

```typescript
import { createBurnCheckedInstruction, getAssociatedTokenAddressSync } from '@solana/spl-token';

const tokenAccount = getAssociatedTokenAddressSync(mintPubkey, walletPubkey);
const burnIx = createBurnCheckedInstruction(
  tokenAccount,     // token account to burn FROM
  mintPubkey,       // mint
  walletPubkey,     // owner (signer)
  amountRaw,        // amount in smallest units (token_amount * 10^6)
  6                 // PumpFun tokens always have 6 decimals
);
// NOTE: If the token uses Token 2022 (create_v2 tokens), pass TOKEN_2022_PROGRAM as last arg
```

---

## 5. Cron Endpoint Implementation

### `app/api/cron/burn-cycle/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { Connection, Keypair, VersionedTransaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import {
  getAssociatedTokenAddressSync,
  createBurnCheckedInstruction,
  getAccount,
} from '@solana/spl-token';
import { PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { sql } from '@/lib/database';
import { MIN_SOL_TO_BUY, PUMPPORTAL_TRADE_LOCAL, PUMPFUN_TOKEN_DECIMALS } from '@/lib/burn/constants';
import bs58 from 'bs58';

export const maxDuration = 60; // Vercel function timeout

export async function POST(req: NextRequest) {
  // ── Auth ──
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const connection = new Connection(process.env.SOLANA_RPC_URL!);
  const devWallet = Keypair.fromSecretKey(bs58.decode(process.env.BURN_DEV_WALLET_SECRET!));
  const tokenMint = new PublicKey(process.env.BURN_TOKEN_MINT!);

  // Create cycle record
  const [cycle] = await sql`
    INSERT INTO burn_cycles (status, dev_wallet, token_mint)
    VALUES ('claiming', ${devWallet.publicKey.toString()}, ${tokenMint.toString()})
    RETURNING id
  `;
  const cycleId = cycle.id;

  try {
    // ═══════════════════════════════════════════════════
    // STEP 1: Claim creator fees (both vaults)
    // ═══════════════════════════════════════════════════
    const balanceBefore = await connection.getBalance(devWallet.publicKey);
    let claimSource = 'none';
    let claimTxSig: string | null = null;

    // Try bonding curve claim
    try {
      const res = await fetch(PUMPPORTAL_TRADE_LOCAL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicKey: devWallet.publicKey.toString(),
          action: 'collectCreatorFee',
          priorityFee: 0.0001,
          pool: 'pump',
        }),
      });
      if (res.ok) {
        const txBytes = new Uint8Array(await res.arrayBuffer());
        const tx = VersionedTransaction.deserialize(txBytes);
        tx.sign([devWallet]);
        claimTxSig = await connection.sendTransaction(tx, { skipPreflight: false });
        await connection.confirmTransaction(claimTxSig, 'confirmed');
        claimSource = 'pump';
      }
    } catch (e) {
      console.log('No bonding curve fees to claim:', (e as Error).message);
    }

    // Try PumpSwap (graduated) claim
    try {
      const res = await fetch(PUMPPORTAL_TRADE_LOCAL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicKey: devWallet.publicKey.toString(),
          action: 'collectCreatorFee',
          priorityFee: 0.0001,
          pool: 'pump-amm',
        }),
      });
      if (res.ok) {
        const txBytes = new Uint8Array(await res.arrayBuffer());
        const tx = VersionedTransaction.deserialize(txBytes);
        tx.sign([devWallet]);
        const sig = await connection.sendTransaction(tx, { skipPreflight: false });
        await connection.confirmTransaction(sig, 'confirmed');
        claimTxSig = claimTxSig || sig;
        claimSource = claimSource === 'pump' ? 'both' : 'pump-amm';
      }
    } catch (e) {
      console.log('No PumpSwap fees to claim:', (e as Error).message);
    }

    // Calculate how much SOL was claimed
    const balanceAfter = await connection.getBalance(devWallet.publicKey);
    const feesClaimedLamports = balanceAfter - balanceBefore;
    const feesClaimedSol = feesClaimedLamports / LAMPORTS_PER_SOL;

    await sql`
      UPDATE burn_cycles SET
        fees_claimed_sol = ${feesClaimedSol},
        claim_tx_sig = ${claimTxSig},
        claim_source = ${claimSource},
        status = 'buying'
      WHERE id = ${cycleId}
    `;

    // Skip if fees too small
    if (feesClaimedSol < MIN_SOL_TO_BUY) {
      await sql`
        UPDATE burn_cycles SET status = 'skipped',
        error_message = ${'Fees below minimum threshold: ' + feesClaimedSol + ' SOL'}
        WHERE id = ${cycleId}
      `;
      return NextResponse.json({ status: 'skipped', feesClaimedSol });
    }

    // ═══════════════════════════════════════════════════
    // STEP 2: Buy token with the claimed SOL
    // ═══════════════════════════════════════════════════
    // Reserve some SOL for the burn tx fee
    const solToBuy = feesClaimedSol - 0.001; // keep 0.001 SOL for burn tx fees

    const buyRes = await fetch(PUMPPORTAL_TRADE_LOCAL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        publicKey: devWallet.publicKey.toString(),
        action: 'buy',
        mint: tokenMint.toString(),
        amount: solToBuy,
        denominatedInSol: 'true',
        slippage: 15,            // 15% slippage tolerance
        priorityFee: 0.0001,
        pool: 'auto',            // auto-detect bonding curve vs PumpSwap
      }),
    });

    if (!buyRes.ok) {
      const errText = await buyRes.text();
      throw new Error(`Buy failed: ${errText}`);
    }

    const buyTxBytes = new Uint8Array(await buyRes.arrayBuffer());
    const buyTx = VersionedTransaction.deserialize(buyTxBytes);
    buyTx.sign([devWallet]);
    const buyTxSig = await connection.sendTransaction(buyTx, { skipPreflight: false });
    await connection.confirmTransaction(buyTxSig, 'confirmed');

    // Check how many tokens we now hold
    const tokenAccount = getAssociatedTokenAddressSync(tokenMint, devWallet.publicKey);
    const accountInfo = await getAccount(connection, tokenAccount);
    const tokensBought = Number(accountInfo.amount) / (10 ** PUMPFUN_TOKEN_DECIMALS);
    const buyPrice = tokensBought > 0 ? solToBuy / tokensBought : 0;

    await sql`
      UPDATE burn_cycles SET
        tokens_bought = ${tokensBought},
        buy_price_sol = ${buyPrice},
        buy_tx_sig = ${buyTxSig},
        status = 'burning'
      WHERE id = ${cycleId}
    `;

    // ═══════════════════════════════════════════════════
    // STEP 3: Burn ALL tokens in the wallet
    // ═══════════════════════════════════════════════════
    const burnAmount = accountInfo.amount; // raw u64 bigint
    const burnIx = createBurnCheckedInstruction(
      tokenAccount,
      tokenMint,
      devWallet.publicKey,
      BigInt(burnAmount.toString()),
      PUMPFUN_TOKEN_DECIMALS
    );

    const burnTx = new Transaction().add(burnIx);
    burnTx.feePayer = devWallet.publicKey;
    burnTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    const burnTxSig = await sendAndConfirmTransaction(connection, burnTx, [devWallet]);

    const tokensBurned = Number(burnAmount) / (10 ** PUMPFUN_TOKEN_DECIMALS);

    await sql`
      UPDATE burn_cycles SET
        tokens_burned = ${tokensBurned},
        burn_tx_sig = ${burnTxSig},
        status = 'complete'
      WHERE id = ${cycleId}
    `;

    return NextResponse.json({
      status: 'complete',
      cycleId,
      feesClaimedSol,
      tokensBought,
      tokensBurned,
      txs: { claim: claimTxSig, buy: buyTxSig, burn: burnTxSig },
    });

  } catch (error: any) {
    await sql`
      UPDATE burn_cycles SET status = 'error', error_message = ${error.message}
      WHERE id = ${cycleId}
    `;
    return NextResponse.json({ error: error.message, cycleId }, { status: 500 });
  }
}
```

### Vercel Cron Config

```json
// vercel.json (add to existing crons array)
{
  "crons": [
    {
      "path": "/api/cron/burn-cycle",
      "schedule": "* * * * *"
    }
  ]
}
```

> **Note:** Vercel Hobby plan only supports crons down to every 1 hour. For true 1-minute crons you need Vercel Pro, or use an external cron service (cron-job.org, Upstash QStash, GitHub Actions) that POSTs to your endpoint with the `CRON_SECRET` bearer token.

---

## 6. API — Burn History Endpoint

### `app/api/burn/history/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/database';

export async function GET(req: NextRequest) {
  const limit = Number(req.nextUrl.searchParams.get('limit') || '50');
  const offset = Number(req.nextUrl.searchParams.get('offset') || '0');

  const cycles = await sql`
    SELECT * FROM burn_cycles
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const [stats] = await sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'complete') as total_cycles,
      COALESCE(SUM(fees_claimed_sol) FILTER (WHERE status = 'complete'), 0) as total_sol_claimed,
      COALESCE(SUM(tokens_burned) FILTER (WHERE status = 'complete'), 0) as total_tokens_burned,
      COALESCE(SUM(tokens_burned) FILTER (WHERE status = 'complete' AND created_at > NOW() - INTERVAL '24 hours'), 0) as burned_24h,
      COALESCE(SUM(fees_claimed_sol) FILTER (WHERE status = 'complete' AND created_at > NOW() - INTERVAL '24 hours'), 0) as sol_claimed_24h
    FROM burn_cycles
  `;

  return NextResponse.json({ cycles, stats });
}
```

---

## 7. Frontend — `/burn` Page

### `app/burn/page.tsx`

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatDistanceToNow } from 'date-fns';

interface BurnCycle {
  id: number;
  created_at: string;
  fees_claimed_sol: number;
  claim_tx_sig: string | null;
  claim_source: string;
  tokens_bought: number;
  buy_price_sol: number | null;
  buy_tx_sig: string | null;
  tokens_burned: number;
  burn_tx_sig: string | null;
  status: string;
  error_message: string | null;
}

interface BurnStats {
  total_cycles: number;
  total_sol_claimed: number;
  total_tokens_burned: number;
  burned_24h: number;
  sol_claimed_24h: number;
}

const SOLSCAN_TX = 'https://solscan.io/tx/';
const POLL_INTERVAL = 5000; // 5 seconds

export default function BurnPage() {
  const [cycles, setCycles] = useState<BurnCycle[]>([]);
  const [stats, setStats] = useState<BurnStats | null>(null);
  const [isLive, setIsLive] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/burn/history?limit=50');
      const data = await res.json();
      setCycles(data.cycles);
      setStats(data.stats);
    } catch (e) {
      console.error('Failed to fetch burn data:', e);
    }
  }, []);

  // Poll for updates
  useEffect(() => {
    fetchData();
    if (!isLive) return;
    const interval = setInterval(fetchData, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchData, isLive]);

  const statusColor = (status: string) => {
    switch (status) {
      case 'complete': return 'text-green-400';
      case 'error': return 'text-red-400';
      case 'skipped': return 'text-zinc-500';
      case 'claiming': case 'buying': case 'burning': return 'text-yellow-400 animate-pulse';
      default: return 'text-zinc-400';
    }
  };

  const statusEmoji = (status: string) => {
    switch (status) {
      case 'complete': return '🔥';
      case 'error': return '❌';
      case 'skipped': return '⏭️';
      case 'claiming': return '💰';
      case 'buying': return '🛒';
      case 'burning': return '🔥';
      default: return '⏳';
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      {/* ── Animated Background ── */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-t from-orange-950/20 via-black to-black" />
        {/* Fire particle CSS animation placeholder */}
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-4 py-8">
        {/* ── Header ── */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold mb-2 bg-gradient-to-r from-orange-400 via-red-500 to-orange-400 bg-clip-text text-transparent">
            TOKEN BURN
          </h1>
          <p className="text-zinc-400 text-lg">
            Creator fees → Buy → Burn. Every minute. Forever.
          </p>
          <div className="mt-4 flex items-center justify-center gap-2">
            <span className={`inline-block w-2 h-2 rounded-full ${isLive ? 'bg-green-400 animate-pulse' : 'bg-zinc-600'}`} />
            <button onClick={() => setIsLive(!isLive)} className="text-sm text-zinc-400 hover:text-white">
              {isLive ? 'LIVE' : 'PAUSED'}
            </button>
          </div>
        </div>

        {/* ── Stats Cards ── */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <StatCard
              label="Total Burned"
              value={formatNumber(stats.total_tokens_burned)}
              sub="tokens"
              color="text-orange-400"
            />
            <StatCard
              label="Total SOL Claimed"
              value={stats.total_sol_claimed.toFixed(4)}
              sub="SOL"
              color="text-purple-400"
            />
            <StatCard
              label="Burned (24h)"
              value={formatNumber(stats.burned_24h)}
              sub="tokens"
              color="text-red-400"
            />
            <StatCard
              label="Burn Cycles"
              value={stats.total_cycles.toString()}
              sub="completed"
              color="text-green-400"
            />
          </div>
        )}

        {/* ── Live Feed ── */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Burn Feed</h2>
            <span className="text-xs text-zinc-500">Updates every 5s</span>
          </div>

          <div className="divide-y divide-zinc-800/50">
            {cycles.map((cycle) => (
              <div key={cycle.id} className="px-6 py-4 hover:bg-zinc-800/30 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  {/* Left: status + info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">{statusEmoji(cycle.status)}</span>
                      <span className={`text-sm font-mono font-semibold ${statusColor(cycle.status)}`}>
                        {cycle.status.toUpperCase()}
                      </span>
                      <span className="text-xs text-zinc-600">
                        #{cycle.id}
                      </span>
                    </div>

                    {cycle.status === 'complete' && (
                      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                        <span className="text-zinc-400">
                          Claimed <span className="text-purple-400 font-mono">{cycle.fees_claimed_sol.toFixed(6)}</span> SOL
                        </span>
                        <span className="text-zinc-400">
                          Bought <span className="text-blue-400 font-mono">{formatNumber(cycle.tokens_bought)}</span> tokens
                        </span>
                        <span className="text-zinc-400">
                          Burned <span className="text-orange-400 font-mono">{formatNumber(cycle.tokens_burned)}</span> tokens
                        </span>
                      </div>
                    )}

                    {cycle.status === 'error' && (
                      <p className="text-xs text-red-400/70 truncate">{cycle.error_message}</p>
                    )}

                    {cycle.status === 'skipped' && (
                      <p className="text-xs text-zinc-500">{cycle.error_message}</p>
                    )}
                  </div>

                  {/* Right: time + tx links */}
                  <div className="text-right shrink-0">
                    <p className="text-xs text-zinc-500 mb-1">
                      {formatDistanceToNow(new Date(cycle.created_at), { addSuffix: true })}
                    </p>
                    <div className="flex gap-2 justify-end">
                      {cycle.claim_tx_sig && (
                        <TxLink sig={cycle.claim_tx_sig} label="Claim" />
                      )}
                      {cycle.buy_tx_sig && (
                        <TxLink sig={cycle.buy_tx_sig} label="Buy" />
                      )}
                      {cycle.burn_tx_sig && (
                        <TxLink sig={cycle.burn_tx_sig} label="Burn" />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {cycles.length === 0 && (
              <div className="px-6 py-12 text-center text-zinc-500">
                No burn cycles yet. Waiting for first cron run...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
      <p className="text-xs text-zinc-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold font-mono ${color}`}>{value}</p>
      <p className="text-xs text-zinc-600">{sub}</p>
    </div>
  );
}

function TxLink({ sig, label }: { sig: string; label: string }) {
  return (
    <a
      href={`${SOLSCAN_TX}${sig}`}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
    >
      {label}
    </a>
  );
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toFixed(2);
}
```

---

## 8. Optional Enhancements

### 8.1 WebSocket Real-Time Updates (Instead of Polling)

Use PumpPortal's WebSocket to show live trades as they happen:

```typescript
// lib/burn/websocket.ts (client-side)
import { DEV_WALLET_PUBKEY, PUMPPORTAL_WS } from '@/lib/burn/constants';

const ws = new WebSocket(PUMPPORTAL_WS);

ws.onopen = () => {
  // Watch trades on our token (set BURN_TOKEN_MINT after launch)
  ws.send(JSON.stringify({
    method: 'subscribeTokenTrade',
    keys: [process.env.NEXT_PUBLIC_BURN_TOKEN_MINT],  // needs NEXT_PUBLIC_ for client
  }));
  // Watch our dev wallet's buy+burn activity
  ws.send(JSON.stringify({
    method: 'subscribeAccountTrade',
    keys: [DEV_WALLET_PUBKEY],  // HvAbxGwvimzVymcMXK1maY979c4PXtYeb8CD5HT987sT
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  // data includes: signature, mint, traderPublicKey, tokenAmount, solAmount, isBuy, etc.
  // Filter for our wallet's burns: data.traderPublicKey === DEV_WALLET_PUBKEY
};
```

> **Important:** Only open ONE WebSocket connection. Multiple connections = hourly ban.

### 8.2 Fire Particle Animation (CSS)

```css
/* app/burn/burn-particles.css */
@keyframes rise {
  0% { transform: translateY(0) scale(1); opacity: 1; }
  100% { transform: translateY(-100vh) scale(0); opacity: 0; }
}

.fire-particle {
  position: fixed;
  bottom: -10px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: radial-gradient(circle, #ff6b00, #ff0000);
  animation: rise linear infinite;
  pointer-events: none;
}

/* Spawn multiple particles with varying delays/positions in JS */
```

### 8.3 Supply Deflation Tracker

Add a counter showing what % of total supply has been burned:

```typescript
// In the cron endpoint or a separate API, track:
// burned_total / 1_000_000_000 * 100 = burn percentage
// Show as a progress bar on the /burn page
```

### 8.4 Cumulative Burn Chart

Use a lightweight chart library (recharts, lightweight-charts) to show burn history over time:

```tsx
// Burns per hour, cumulative burn total, SOL claimed per day, etc.
```

### 8.5 Sound Effects

Play a fire crackle sound on each new completed burn cycle appearing in the feed.

---

## 9. Security Considerations

1. **Dev wallet secret key** — Store ONLY in Vercel environment variables, never in code or git. The cron endpoint runs server-side only.
2. **CRON_SECRET** — Prevents anyone from triggering burns manually. Verify on every request.
3. **Slippage protection** — The buy uses 15% slippage which is generous. For high-liquidity tokens, reduce to 5%. For very low liquidity, increase.
4. **Rent exemption** — The claim instruction leaves rent-exempt minimum in the vault. Don't expect to claim 100% of the vault balance.
5. **Token 2022 detection** — Newer PumpFun tokens (created with `create_v2`) use Token 2022 program. The burn instruction needs the correct program ID. Check the mint account's owner to determine which program to use:
   ```typescript
   const mintInfo = await connection.getAccountInfo(tokenMint);
   const tokenProgram = mintInfo?.owner.equals(TOKEN_2022_PROGRAM_ID)
     ? TOKEN_2022_PROGRAM_ID
     : TOKEN_PROGRAM_ID;
   ```
6. **PumpPortal fees** — The local transaction API charges 0.5% per trade. This is deducted from the trade itself. Factor this into expected burn amounts.

---

## 10. File Structure

```
app/
  burn/
    page.tsx                          # The visual burn tracker page
  api/
    cron/
      burn-cycle/
        route.ts                      # Cron endpoint: claim → buy → burn
    burn/
      history/
        route.ts                      # GET burn history + stats
lib/
  burn/
    constants.ts                      # Program IDs, min thresholds
scripts/
  migrations/
    120_create_burn_cycles.sql        # Database table
```

---

## 11. Setup & Testing Checklist

### Pre-launch (do now)
- [ ] Run migration to create `burn_cycles` table
- [ ] Add `BURN_DEV_WALLET_SECRET` to `.env.local` and Vercel env vars
- [ ] Add `CRON_SECRET` to `.env.local` and Vercel env vars
- [ ] Fund `HvAbxGwvimzVymcMXK1maY979c4PXtYeb8CD5HT987sT` with ~0.05 SOL for tx fees
- [ ] Build the `/burn` page and API endpoints
- [ ] Verify `/burn` page loads with empty state

### Post-launch (after you provide token mint)
- [ ] Launch token on PumpFun using wallet `HvAbxGwvimzVymcMXK1maY979c4PXtYeb8CD5HT987sT`
- [ ] Set `BURN_TOKEN_MINT=<mint address>` in `.env.local` and Vercel
- [ ] Set `NEXT_PUBLIC_BURN_TOKEN_MINT=<mint address>` (for client-side WebSocket)
- [ ] Test cron manually: `curl -X POST -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/burn-cycle`
- [ ] Verify claim/buy/burn transactions on Solscan
- [ ] Test `/burn` page shows live cycles updating
- [ ] Test error handling (no fees to claim → skipped status)
- [ ] Deploy cron to Vercel (or external cron service for 1-min interval)
- [ ] Monitor first few live cycles

---

## Key Dependencies

```bash
npm install @solana/web3.js @solana/spl-token bs58 date-fns
# Already in project: @neondatabase/serverless, next
```
