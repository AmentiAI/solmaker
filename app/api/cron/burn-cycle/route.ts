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
} from '@/lib/burn/constants';
import bs58 from 'bs58';

async function snapshotPendingFees(
  connection: Connection,
  creatorPubkey: PublicKey
): Promise<{ bcFees: number; swapFees: number; walletBal: number }> {
  let bcFees = 0;
  let swapFees = 0;
  let walletBal = 0;

  try {
    walletBal = (await connection.getBalance(creatorPubkey)) / LAMPORTS_PER_SOL;
  } catch {}

  // Bonding curve vault (SOL)
  try {
    const [bcVault] = PublicKey.findProgramAddressSync(
      [Buffer.from('creator-vault'), creatorPubkey.toBuffer()],
      new PublicKey(PUMP_PROGRAM)
    );
    const balance = await connection.getBalance(bcVault);
    const rentExempt = 890880;
    bcFees = Math.max(0, (balance - rentExempt)) / LAMPORTS_PER_SOL;
  } catch {}

  // PumpSwap vault (WSOL)
  try {
    const [swapAuth] = PublicKey.findProgramAddressSync(
      [Buffer.from('creator_vault'), creatorPubkey.toBuffer()],
      new PublicKey(PUMPSWAP_PROGRAM)
    );
    const wsolMint = new PublicKey(WSOL_MINT);
    const vaultAta = getAssociatedTokenAddressSync(wsolMint, swapAuth, true);
    const account = await getAccount(connection, vaultAta);
    swapFees = Number(account.amount) / LAMPORTS_PER_SOL;
  } catch {}

  return { bcFees, swapFees, walletBal };
}

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  // Auth - check cron secret or Vercel cron header
  const authHeader = req.headers.get('authorization');
  const vercelCron = req.headers.get('x-vercel-cron');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && !vercelCron) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');
  const devWallet = Keypair.fromSecretKey(bs58.decode(process.env.BURN_DEV_WALLET_SECRET!));
  const tokenMint = new PublicKey(process.env.BURN_TOKEN_MINT || DEFAULT_TOKEN_MINT);

  // Create cycle record
  const cycles = await sql`
    INSERT INTO burn_cycles (status, dev_wallet, token_mint)
    VALUES ('claiming', ${devWallet.publicKey.toString()}, ${tokenMint.toString()})
    RETURNING id
  `;
  const cycleId = cycles[0].id;

  try {
    // ═══════════════════════════════════════════
    // STEP 1: Claim creator fees (both vaults)
    // ═══════════════════════════════════════════
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
          priorityFee: PRIORITY_FEE,
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
          priorityFee: PRIORITY_FEE,
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
      const snap = await snapshotPendingFees(connection, devWallet.publicKey);
      await sql`
        UPDATE burn_cycles SET status = 'skipped',
        error_message = ${'Fees below minimum: ' + feesClaimedSol.toFixed(9) + ' SOL'},
        pending_bc_fees = ${snap.bcFees},
        pending_swap_fees = ${snap.swapFees},
        wallet_balance = ${snap.walletBal}
        WHERE id = ${cycleId}
      `;
      return NextResponse.json({ status: 'skipped', cycleId, feesClaimedSol });
    }

    // ═══════════════════════════════════════════
    // STEP 2: Buy token with the claimed SOL
    // ═══════════════════════════════════════════
    const solToBuy = feesClaimedSol - TX_FEE_RESERVE;

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
        pool: 'auto',
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

    // ═══════════════════════════════════════════
    // STEP 3: Burn ALL tokens in the wallet
    // ═══════════════════════════════════════════
    const burnAmount = accountInfo.amount;

    // Detect token program (Token vs Token 2022)
    const mintAccountInfo = await connection.getAccountInfo(tokenMint);
    const tokenProgramId = mintAccountInfo?.owner.toString() === 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'
      ? new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb')
      : TOKEN_PROGRAM_ID;

    const burnIx = createBurnCheckedInstruction(
      tokenAccount,
      tokenMint,
      devWallet.publicKey,
      BigInt(burnAmount.toString()),
      PUMPFUN_TOKEN_DECIMALS,
      [],
      tokenProgramId
    );

    const burnTx = new Transaction().add(burnIx);
    burnTx.feePayer = devWallet.publicKey;
    burnTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    const burnTxSig = await sendAndConfirmTransaction(connection, burnTx, [devWallet]);

    const tokensBurned = Number(burnAmount) / (10 ** PUMPFUN_TOKEN_DECIMALS);

    // Snapshot pending fees after burn completes
    const snap = await snapshotPendingFees(connection, devWallet.publicKey);

    await sql`
      UPDATE burn_cycles SET
        tokens_burned = ${tokensBurned},
        burn_tx_sig = ${burnTxSig},
        status = 'complete',
        pending_bc_fees = ${snap.bcFees},
        pending_swap_fees = ${snap.swapFees},
        wallet_balance = ${snap.walletBal}
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

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    // Still snapshot fees on error so frontend stays fresh
    let snap = { bcFees: 0, swapFees: 0, walletBal: 0 };
    try {
      snap = await snapshotPendingFees(connection, devWallet.publicKey);
    } catch {}
    await sql`
      UPDATE burn_cycles SET status = 'error', error_message = ${message},
        pending_bc_fees = ${snap.bcFees},
        pending_swap_fees = ${snap.swapFees},
        wallet_balance = ${snap.walletBal}
      WHERE id = ${cycleId}
    `;
    return NextResponse.json({ error: message, cycleId }, { status: 500 });
  }
}
