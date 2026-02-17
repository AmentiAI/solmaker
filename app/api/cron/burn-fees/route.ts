import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, getAccount } from '@solana/spl-token';
import { sql } from '@/lib/database';
import {
  DEV_WALLET_PUBKEY,
  PUMP_PROGRAM,
  PUMPSWAP_PROGRAM,
  WSOL_MINT,
} from '@/lib/burn/constants';

const RENT_EXEMPT = 890880;

export const maxDuration = 15;

export async function GET(req: NextRequest) { return handleFeeSnapshot(req); }
export async function POST(req: NextRequest) { return handleFeeSnapshot(req); }

async function handleFeeSnapshot(_req: NextRequest) {

  const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');
  const creator = new PublicKey(DEV_WALLET_PUBKEY);

  let bcFees = 0, swapFees = 0, walletBal = 0;

  try {
    walletBal = (await connection.getBalance(creator)) / LAMPORTS_PER_SOL;
  } catch {}

  try {
    const [v] = PublicKey.findProgramAddressSync(
      [Buffer.from('creator-vault'), creator.toBuffer()],
      new PublicKey(PUMP_PROGRAM)
    );
    bcFees = Math.max(0, (await connection.getBalance(v)) - RENT_EXEMPT) / LAMPORTS_PER_SOL;
  } catch {}

  try {
    const [a] = PublicKey.findProgramAddressSync(
      [Buffer.from('creator_vault'), creator.toBuffer()],
      new PublicKey(PUMPSWAP_PROGRAM)
    );
    const ata = getAssociatedTokenAddressSync(new PublicKey(WSOL_MINT), a, true);
    swapFees = Number((await getAccount(connection, ata)).amount) / LAMPORTS_PER_SOL;
  } catch {}

  await sql!`
    UPDATE burn_fee_snapshots
    SET pending_bc_fees = ${bcFees}, pending_swap_fees = ${swapFees},
        wallet_balance = ${walletBal}, updated_at = NOW()
    WHERE id = 1
  `;

  return NextResponse.json({ bcFees, swapFees, walletBal });
}
