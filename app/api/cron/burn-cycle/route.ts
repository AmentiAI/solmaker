import { NextRequest, NextResponse } from 'next/server';
import {
  Connection,
  Keypair,
  VersionedTransaction,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddressSync,
  createBurnCheckedInstruction,
  createTransferCheckedInstruction,
  createAssociatedTokenAccountInstruction,
  getAccount,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { sql } from '@/lib/database';
import {
  MIN_SOL_TO_BUY,
  PUMPPORTAL_TRADE_LOCAL,
  PUMPFUN_TOKEN_DECIMALS,
  BUY_SLIPPAGE,
  PRIORITY_FEE,
  TX_FEE_RESERVE,
  BURN_TOKEN_MINT as DEFAULT_TOKEN_MINT,
  PUMP_PROGRAM,
  PUMPSWAP_PROGRAM,
  WSOL_MINT,
  DEAD_WALLET,
} from '@/lib/burn/constants';
import bs58 from 'bs58';

const TOKEN_2022 = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
const RENT_EXEMPT = 890880;

// ── Helpers ──

async function snapshotPendingFees(connection: Connection, creator: PublicKey) {
  let bcFees = 0, swapFees = 0, walletBal = 0;
  try { walletBal = (await connection.getBalance(creator)) / LAMPORTS_PER_SOL; } catch {}
  try {
    const [v] = PublicKey.findProgramAddressSync([Buffer.from('creator-vault'), creator.toBuffer()], new PublicKey(PUMP_PROGRAM));
    bcFees = Math.max(0, (await connection.getBalance(v)) - RENT_EXEMPT) / LAMPORTS_PER_SOL;
  } catch {}
  try {
    const [a] = PublicKey.findProgramAddressSync([Buffer.from('creator_vault'), creator.toBuffer()], new PublicKey(PUMPSWAP_PROGRAM));
    const ata = getAssociatedTokenAddressSync(new PublicKey(WSOL_MINT), a, true);
    swapFees = Number((await getAccount(connection, ata)).amount) / LAMPORTS_PER_SOL;
  } catch {}
  return { bcFees, swapFees, walletBal };
}

async function getVaultBalance(connection: Connection, creator: PublicKey): Promise<number> {
  try {
    const [v] = PublicKey.findProgramAddressSync([Buffer.from('creator-vault'), creator.toBuffer()], new PublicKey(PUMP_PROGRAM));
    return Math.max(0, (await connection.getBalance(v, 'confirmed')) - RENT_EXEMPT);
  } catch { return 0; }
}

async function findTokenAccount(connection: Connection, mint: PublicKey, owner: PublicKey) {
  // Scan all token accounts for this mint owned by this wallet
  const accounts = await connection.getTokenAccountsByOwner(owner, { mint });
  for (const { pubkey, account } of accounts.value) {
    const info = await getAccount(connection, pubkey, 'confirmed', account.owner);
    // Return even zero-balance accounts so we can track the address/program
    return { address: pubkey, programId: account.owner, amount: info.amount };
  }
  return null;
}

function getTokenBalance(info: { amount: bigint } | null): bigint {
  return info ? info.amount : BigInt(0);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    let msg = error.message;
    if ('logs' in error && Array.isArray((error as any).logs)) {
      msg += ' | Logs: ' + (error as any).logs.join('; ');
    }
    return msg;
  }
  return String(error);
}

// ── Route handlers ──

export const maxDuration = 60;

export async function GET(req: NextRequest) { return handleBurnCycle(req); }
export async function POST(req: NextRequest) { return handleBurnCycle(req); }

async function handleBurnCycle(req: NextRequest) {
  // Auth
  const authHeader = req.headers.get('authorization');
  const isAuthed = authHeader === `Bearer ${process.env.CRON_SECRET}`
    || !!req.headers.get('x-vercel-cron')
    || req.nextUrl.searchParams.get('secret') === process.env.CRON_SECRET
    || process.env.NODE_ENV === 'development';
  if (!isAuthed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');
  const devWallet = Keypair.fromSecretKey(bs58.decode(process.env.BURN_DEV_WALLET_SECRET!));
  const tokenMint = new PublicKey(process.env.BURN_TOKEN_MINT || DEFAULT_TOKEN_MINT);

  // Create cycle record
  const rows = await sql`
    INSERT INTO burn_cycles (status, dev_wallet, token_mint)
    VALUES ('claiming', ${devWallet.publicKey.toString()}, ${tokenMint.toString()})
    RETURNING id
  `;
  const cycleId = rows[0].id;

  try {
    // ═══════════════════════════════════════════
    // STEP 1: Check vault & claim creator fees
    // ═══════════════════════════════════════════
    const vaultLamports = await getVaultBalance(connection, devWallet.publicKey);
    const vaultSol = vaultLamports / LAMPORTS_PER_SOL;

    // No fees in vault → skip (don't waste a tx)
    if (vaultLamports === 0) {
      const snap = await snapshotPendingFees(connection, devWallet.publicKey);
      await sql`
        UPDATE burn_cycles SET status = 'skipped', error_message = 'No fees in vault',
        pending_bc_fees = ${snap.bcFees}, pending_swap_fees = ${snap.swapFees}, wallet_balance = ${snap.walletBal}
        WHERE id = ${cycleId}
      `;
      return NextResponse.json({ status: 'skipped', cycleId, reason: 'vault empty' });
    }

    // Vault has fees — claim them
    let claimTxSig: string | null = null;
    const claimRes = await fetch(PUMPPORTAL_TRADE_LOCAL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        publicKey: devWallet.publicKey.toString(),
        action: 'collectCreatorFee',
        priorityFee: PRIORITY_FEE,
        pool: 'pump',
      }),
    });

    if (!claimRes.ok) {
      const errText = await claimRes.text();
      throw new Error(`Claim API failed (${claimRes.status}): ${errText}`);
    }

    const claimTxBytes = new Uint8Array(await claimRes.arrayBuffer());
    const claimTx = VersionedTransaction.deserialize(claimTxBytes);
    const { blockhash: claimBh, lastValidBlockHeight: claimLvbh } = await connection.getLatestBlockhash('confirmed');
    claimTx.message.recentBlockhash = claimBh;
    claimTx.sign([devWallet]);
    claimTxSig = await connection.sendTransaction(claimTx, { skipPreflight: true });
    const claimConf = await connection.confirmTransaction({ signature: claimTxSig, blockhash: claimBh, lastValidBlockHeight: claimLvbh }, 'confirmed');

    if (claimConf.value.err) {
      throw new Error(`Claim tx failed on-chain: ${JSON.stringify(claimConf.value.err)}`);
    }

    // feesClaimedSol = what was in the vault (reliable, no RPC lag issues)
    const feesClaimedSol = vaultSol;
    const solToBuy = Math.max(0, feesClaimedSol - TX_FEE_RESERVE);

    await sql`
      UPDATE burn_cycles SET fees_claimed_sol = ${feesClaimedSol}, claim_tx_sig = ${claimTxSig},
      claim_source = 'pump', status = 'buying' WHERE id = ${cycleId}
    `;

    if (solToBuy < MIN_SOL_TO_BUY) {
      const snap = await snapshotPendingFees(connection, devWallet.publicKey);
      await sql`
        UPDATE burn_cycles SET status = 'skipped',
        error_message = ${'Claimed ' + feesClaimedSol.toFixed(6) + ' SOL but too small after tx reserve'},
        pending_bc_fees = ${snap.bcFees}, pending_swap_fees = ${snap.swapFees}, wallet_balance = ${snap.walletBal}
        WHERE id = ${cycleId}
      `;
      return NextResponse.json({ status: 'skipped', cycleId, feesClaimedSol, solToBuy });
    }

    // ═══════════════════════════════════════════
    // STEP 2: Buy token with ONLY the claimed SOL
    // ═══════════════════════════════════════════
    // Wait for claim to settle
    await new Promise(r => setTimeout(r, 3000));

    // SAFETY: Record token balance BEFORE the buy so we can verify it increased
    const preBuyInfo = await findTokenAccount(connection, tokenMint, devWallet.publicKey);
    const preBuyBalance = getTokenBalance(preBuyInfo);

    const buyRes = await fetch(PUMPPORTAL_TRADE_LOCAL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        publicKey: devWallet.publicKey.toString(),
        action: 'buy',
        mint: tokenMint.toString(),
        amount: solToBuy,
        denominatedInSol: 'true',
        slippage: BUY_SLIPPAGE,
        priorityFee: PRIORITY_FEE,
        pool: 'pump',
      }),
    });

    if (!buyRes.ok) {
      throw new Error(`Buy API failed (${buyRes.status}): ${await buyRes.text()}`);
    }

    const buyTxBytes = new Uint8Array(await buyRes.arrayBuffer());
    const buyTx = VersionedTransaction.deserialize(buyTxBytes);
    const { blockhash: buyBh, lastValidBlockHeight: buyLvbh } = await connection.getLatestBlockhash('confirmed');
    buyTx.message.recentBlockhash = buyBh;
    buyTx.sign([devWallet]);
    const buyTxSig = await connection.sendTransaction(buyTx, { skipPreflight: true });
    await connection.confirmTransaction({ signature: buyTxSig, blockhash: buyBh, lastValidBlockHeight: buyLvbh }, 'confirmed');

    // Wait for buy to settle
    await new Promise(r => setTimeout(r, 3000));

    // SAFETY: Verify tokens actually INCREASED after buy
    const postBuyInfo = await findTokenAccount(connection, tokenMint, devWallet.publicKey);
    const postBuyBalance = getTokenBalance(postBuyInfo);

    if (postBuyBalance <= preBuyBalance) {
      // PumpPortal returned a bad tx (possibly a sell) — abort immediately
      throw new Error(
        `SAFETY ABORT: Token balance did not increase after "buy". ` +
        `Pre: ${preBuyBalance.toString()}, Post: ${postBuyBalance.toString()}. ` +
        `PumpPortal may have returned a sell tx. Buy sig: ${buyTxSig}`
      );
    }

    if (!postBuyInfo) {
      throw new Error('Buy confirmed but no token account found');
    }

    // Only count the NET purchased tokens (not any pre-existing balance)
    const netPurchased = postBuyBalance - preBuyBalance;
    const tokensBought = Number(netPurchased) / (10 ** PUMPFUN_TOKEN_DECIMALS);
    const buyPrice = tokensBought > 0 ? solToBuy / tokensBought : 0;

    await sql`
      UPDATE burn_cycles SET tokens_bought = ${tokensBought}, buy_price_sol = ${buyPrice},
      buy_tx_sig = ${buyTxSig}, status = 'burning' WHERE id = ${cycleId}
    `;

    // ═══════════════════════════════════════════
    // STEP 3: Burn/transfer ONLY the net purchased tokens
    // ═══════════════════════════════════════════
    // Check if graduated → real burn, else transfer to dead wallet
    const [bondingCurvePda] = PublicKey.findProgramAddressSync(
      [Buffer.from('bonding-curve'), tokenMint.toBuffer()],
      new PublicKey(PUMP_PROGRAM)
    );
    let isGraduated = false;
    try {
      const bcInfo = await connection.getAccountInfo(bondingCurvePda);
      if (bcInfo && bcInfo.data.length > 0x30) isGraduated = bcInfo.data[0x30] === 1;
    } catch {}

    // Only burn what we just bought — never touch pre-existing balance
    const amountToBurn = netPurchased;
    const burnTx = new Transaction();

    if (isGraduated) {
      // Real burn — reduces total supply
      burnTx.add(createBurnCheckedInstruction(
        postBuyInfo.address, tokenMint, devWallet.publicKey,
        amountToBurn, PUMPFUN_TOKEN_DECIMALS, [], postBuyInfo.programId
      ));
    } else {
      // Pre-graduation — transfer to dead wallet
      const deadWallet = new PublicKey(DEAD_WALLET);
      const deadAta = getAssociatedTokenAddressSync(tokenMint, deadWallet, true, postBuyInfo.programId);

      try {
        await getAccount(connection, deadAta, 'confirmed', postBuyInfo.programId);
      } catch {
        burnTx.add(createAssociatedTokenAccountInstruction(
          devWallet.publicKey, deadAta, deadWallet, tokenMint, postBuyInfo.programId
        ));
      }

      burnTx.add(createTransferCheckedInstruction(
        postBuyInfo.address, tokenMint, deadAta, devWallet.publicKey,
        amountToBurn, PUMPFUN_TOKEN_DECIMALS, [], postBuyInfo.programId
      ));
    }

    burnTx.feePayer = devWallet.publicKey;
    burnTx.recentBlockhash = (await connection.getLatestBlockhash('confirmed')).blockhash;
    const burnTxSig = await sendAndConfirmTransaction(connection, burnTx, [devWallet]);

    const tokensBurned = Number(amountToBurn) / (10 ** PUMPFUN_TOKEN_DECIMALS);
    const snap = await snapshotPendingFees(connection, devWallet.publicKey);

    await sql`
      UPDATE burn_cycles SET tokens_burned = ${tokensBurned}, burn_tx_sig = ${burnTxSig},
      status = 'complete', pending_bc_fees = ${snap.bcFees}, pending_swap_fees = ${snap.swapFees},
      wallet_balance = ${snap.walletBal} WHERE id = ${cycleId}
    `;

    return NextResponse.json({
      status: 'complete', cycleId, feesClaimedSol, tokensBought, tokensBurned,
      method: isGraduated ? 'burn' : 'transfer-to-dead',
      txs: { claim: claimTxSig, buy: buyTxSig, burn: burnTxSig },
    });

  } catch (error: unknown) {
    const message = getErrorMessage(error);
    let snap = { bcFees: 0, swapFees: 0, walletBal: 0 };
    try { snap = await snapshotPendingFees(connection, devWallet.publicKey); } catch {}
    await sql`
      UPDATE burn_cycles SET status = 'error', error_message = ${message},
      pending_bc_fees = ${snap.bcFees}, pending_swap_fees = ${snap.swapFees}, wallet_balance = ${snap.walletBal}
      WHERE id = ${cycleId}
    `;
    return NextResponse.json({ error: message, cycleId }, { status: 500 });
  }
}
