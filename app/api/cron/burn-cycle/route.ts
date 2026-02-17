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

// Vercel cron sends GET, manual testing can use POST
export async function GET(req: NextRequest) {
  return handleBurnCycle(req);
}

export async function POST(req: NextRequest) {
  return handleBurnCycle(req);
}

async function handleBurnCycle(req: NextRequest) {
  // Auth - check cron secret, Vercel cron header, or query param for local testing
  const authHeader = req.headers.get('authorization');
  const vercelCron = req.headers.get('x-vercel-cron');
  const querySecret = req.nextUrl.searchParams.get('secret');
  const isLocal = process.env.NODE_ENV === 'development';
  const isAuthed = authHeader === `Bearer ${process.env.CRON_SECRET}`
    || !!vercelCron
    || querySecret === process.env.CRON_SECRET
    || isLocal;
  if (!isAuthed) {
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

    const claimErrors: string[] = [];

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
        // Replace blockhash — PumpPortal's can be stale
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
        tx.message.recentBlockhash = blockhash;
        tx.sign([devWallet]);
        claimTxSig = await connection.sendTransaction(tx, { skipPreflight: true });
        const confirmation = await connection.confirmTransaction({ signature: claimTxSig, blockhash, lastValidBlockHeight }, 'confirmed');
        if (confirmation.value.err) {
          claimErrors.push(`pump tx failed on-chain: ${JSON.stringify(confirmation.value.err)}`);
          claimTxSig = null;
        } else {
          claimSource = 'pump';
        }
      } else {
        const errText = await res.text();
        claimErrors.push(`pump ${res.status}: ${errText}`);
        console.log('Bonding curve claim failed:', res.status, errText);
      }
    } catch (e) {
      claimErrors.push(`pump exception: ${(e as Error).message}`);
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
        const { blockhash: bh2, lastValidBlockHeight: lvbh2 } = await connection.getLatestBlockhash('confirmed');
        tx.message.recentBlockhash = bh2;
        tx.sign([devWallet]);
        const sig = await connection.sendTransaction(tx, { skipPreflight: true });
        await connection.confirmTransaction({ signature: sig, blockhash: bh2, lastValidBlockHeight: lvbh2 }, 'confirmed');
        claimTxSig = claimTxSig || sig;
        claimSource = claimSource === 'pump' ? 'both' : 'pump-amm';
      } else {
        const errText = await res.text();
        claimErrors.push(`pump-amm ${res.status}: ${errText}`);
        console.log('PumpSwap claim failed:', res.status, errText);
      }
    } catch (e) {
      claimErrors.push(`pump-amm exception: ${(e as Error).message}`);
      console.log('No PumpSwap fees to claim:', (e as Error).message);
    }

    // Figure out how much SOL was claimed by parsing the claim tx
    let feesClaimedSol = 0;
    if (claimTxSig) {
      // Wait a moment for balance to settle, then get confirmed balance
      await new Promise(r => setTimeout(r, 2000));
      const balanceAfter = await connection.getBalance(devWallet.publicKey, 'confirmed');
      feesClaimedSol = Math.max(0, (balanceAfter - balanceBefore)) / LAMPORTS_PER_SOL;

      // If balance diff is 0 (RPC lag), estimate from what was in the vault
      if (feesClaimedSol === 0) {
        // Vault is now empty, so whatever was there got claimed (minus tx fee)
        // Use the pre-snapshot vault balance as estimate
        const [bcVault] = PublicKey.findProgramAddressSync(
          [Buffer.from('creator-vault'), devWallet.publicKey.toBuffer()],
          new PublicKey(PUMP_PROGRAM)
        );
        const vaultNow = await connection.getBalance(bcVault, 'confirmed');
        const rentExempt = 890880;
        const vaultEmpty = (vaultNow - rentExempt) <= 0;
        if (vaultEmpty) {
          // Vault was drained — estimate claim as balanceAfter - balanceBefore would be
          // but since RPC is stale, just use current balance minus what we started with minus tx fees
          const freshBalance = await connection.getBalance(devWallet.publicKey, 'finalized');
          feesClaimedSol = Math.max(0, (freshBalance - balanceBefore)) / LAMPORTS_PER_SOL;
        }
      }
    }

    await sql`
      UPDATE burn_cycles SET
        fees_claimed_sol = ${feesClaimedSol},
        claim_tx_sig = ${claimTxSig},
        claim_source = ${claimSource},
        status = 'buying'
      WHERE id = ${cycleId}
    `;

    // If no claim happened at all, skip
    if (claimSource === 'none') {
      const snap = await snapshotPendingFees(connection, devWallet.publicKey);
      await sql`
        UPDATE burn_cycles SET status = 'skipped',
        error_message = ${'No fees to claim. Errors: ' + (claimErrors.join(' | ') || 'none')},
        pending_bc_fees = ${snap.bcFees},
        pending_swap_fees = ${snap.swapFees},
        wallet_balance = ${snap.walletBal}
        WHERE id = ${cycleId}
      `;
      return NextResponse.json({
        status: 'skipped',
        cycleId,
        feesClaimedSol: 0,
        claimSource,
        claimErrors,
        pendingFees: snap,
      });
    }

    // ═══════════════════════════════════════════
    // STEP 2: Buy token with the claimed SOL
    // ═══════════════════════════════════════════
    // Use actual wallet balance minus a reserve for tx fees (more reliable than balance diff)
    const currentBalance = await connection.getBalance(devWallet.publicKey, 'confirmed');
    const solReserve = 0.005 * LAMPORTS_PER_SOL; // keep 0.005 SOL for burn tx + future fees
    const solToBuy = Math.max(0, (currentBalance - solReserve)) / LAMPORTS_PER_SOL;

    if (solToBuy < MIN_SOL_TO_BUY) {
      const snap = await snapshotPendingFees(connection, devWallet.publicKey);
      await sql`
        UPDATE burn_cycles SET status = 'skipped',
        error_message = ${'Wallet balance too low to buy: ' + solToBuy.toFixed(9) + ' SOL available'},
        pending_bc_fees = ${snap.bcFees}, pending_swap_fees = ${snap.swapFees}, wallet_balance = ${snap.walletBal}
        WHERE id = ${cycleId}
      `;
      return NextResponse.json({ status: 'skipped', cycleId, solToBuy, currentBalance });
    }

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
    const { blockhash: buyBh, lastValidBlockHeight: buyLvbh } = await connection.getLatestBlockhash('confirmed');
    buyTx.message.recentBlockhash = buyBh;
    buyTx.sign([devWallet]);
    const buyTxSig = await connection.sendTransaction(buyTx, { skipPreflight: true });
    await connection.confirmTransaction({ signature: buyTxSig, blockhash: buyBh, lastValidBlockHeight: buyLvbh }, 'confirmed');

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
