import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { getConnection } from '@/lib/solana/connection'

// POST /api/mint/confirm-mint - Confirm NFT mint after transaction is signed
export async function POST(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database not available' }, { status: 500 })
  }

  try {
    const body = await request.json()
    const { session_id, wallet_address, tx_signature, mint_address, ordinal_id } = body

    if (!session_id || !wallet_address || !tx_signature) {
      return NextResponse.json({ error: 'session_id, wallet_address, and tx_signature are required' }, { status: 400 })
    }

    // Verify session exists
    const sessions = await sql`
      SELECT id, collection_id, status FROM mint_sessions
      WHERE id = ${session_id}::uuid AND wallet_address = ${wallet_address}
    ` as any[]

    if (!sessions.length) {
      return NextResponse.json({ error: 'Mint session not found' }, { status: 404 })
    }

    const session = sessions[0]

    // Verify transaction on-chain
    const connection = getConnection()
    let confirmed = false
    try {
      const txResult = await connection.getTransaction(tx_signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      })
      confirmed = txResult !== null && txResult.meta !== null && !txResult.meta.err
    } catch {
      // Transaction may not be confirmed yet
    }

    // Update mint_nft record
    if (ordinal_id) {
      await sql`
        UPDATE mint_nfts
        SET mint_status = ${confirmed ? 'confirmed' : 'minting'},
            tx_signature = ${tx_signature},
            mint_address = ${mint_address || null},
            confirmed_at = ${confirmed ? new Date().toISOString() : null}
        WHERE session_id = ${session_id}::uuid AND ordinal_id = ${ordinal_id}::uuid
      `
    }

    // Update session status
    await sql`
      UPDATE mint_sessions SET status = ${confirmed ? 'completed' : 'pending'}
      WHERE id = ${session_id}::uuid
    `

    // If confirmed, mark ordinal as minted
    if (confirmed && ordinal_id) {
      await sql`
        UPDATE generated_ordinals
        SET is_minted = true, minted_at = CURRENT_TIMESTAMP
        WHERE id = ${ordinal_id}::uuid
      `
    }

    return NextResponse.json({
      success: true,
      confirmed,
      txSignature: tx_signature,
      mintAddress: mint_address,
      explorerUrl: `https://solscan.io/tx/${tx_signature}`,
    })
  } catch (error: any) {
    console.error('[Confirm Mint] Error:', error)
    return NextResponse.json({ error: error.message || 'Failed to confirm mint' }, { status: 500 })
  }
}
