import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { getConnection } from '@/lib/solana/connection'

/**
 * POST /api/launchpad/[collectionId]/mint/confirm
 * Confirm a mint transaction after user broadcasts it
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ collectionId: string }> }
) {
  if (!sql) {
    return NextResponse.json({ error: 'Database not available' }, { status: 500 })
  }

  try {
    const { collectionId } = await params
    const body = await request.json()
    const { signature, nft_mint_address, wallet_address } = body

    if (!signature || !nft_mint_address) {
      return NextResponse.json({ 
        error: 'signature and nft_mint_address required' 
      }, { status: 400 })
    }

    // Find the mint record
    const mints = await sql`
      SELECT * FROM solana_nft_mints
      WHERE collection_id = ${collectionId}::uuid
      AND nft_mint_address = ${nft_mint_address}
      AND minter_wallet = ${wallet_address}
      AND mint_status = 'awaiting_signature'
    ` as any[]

    if (!mints.length) {
      return NextResponse.json({ 
        error: 'Mint record not found',
      }, { status: 404 })
    }

    const mint = mints[0]

    // Update mint record with signature
    await sql`
      UPDATE solana_nft_mints
      SET 
        mint_tx_signature = ${signature},
        mint_status = 'confirming'
      WHERE id = ${mint.id}::uuid
    `

    // Update session
    if (mint.session_id) {
      await sql`
        UPDATE mint_sessions
        SET status = 'confirming'
        WHERE id = ${mint.session_id}::uuid
      `
    }

    console.log(`⏳ Confirming mint transaction: ${signature}`)

    // Try to verify transaction immediately (quick check)
    const connection = getConnection()
    try {
      const confirmed = await connection.confirmTransaction(signature, 'confirmed')
      
      if (!confirmed.value.err) {
        // Transaction confirmed!
        await sql`
          UPDATE solana_nft_mints
          SET 
            mint_status = 'confirmed',
            confirmed_at = NOW()
          WHERE id = ${mint.id}::uuid
        `

        if (mint.session_id) {
          await sql`
            UPDATE mint_sessions
            SET status = 'completed'
            WHERE id = ${mint.session_id}::uuid
          `
        }

        // Mark ordinal as minted if linked
        if (mint.ordinal_id) {
          await sql`
            UPDATE generated_ordinals
            SET is_minted = true
            WHERE id = ${mint.ordinal_id}::uuid
          `
        }

        console.log(`✅ Mint confirmed: ${nft_mint_address}`)

        return NextResponse.json({
          success: true,
          confirmed: true,
          nftMint: nft_mint_address,
          signature,
          message: 'NFT minted successfully!',
        })
      }
    } catch (confirmError) {
      // Transaction not yet confirmed, will be picked up by cron
      console.log(`⏳ Transaction pending confirmation: ${signature}`)
    }

    return NextResponse.json({
      success: true,
      confirmed: false,
      nftMint: nft_mint_address,
      signature,
      message: 'Transaction submitted. Confirmation pending...',
    })

  } catch (error: any) {
    console.error('[Confirm Mint] Error:', error)
    return NextResponse.json({ 
      error: error.message || 'Failed to confirm mint',
      details: error.toString()
    }, { status: 500 })
  }
}

/**
 * GET /api/launchpad/[collectionId]/mint/confirm?signature=xxx
 * Check status of a pending mint
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ collectionId: string }> }
) {
  if (!sql) {
    return NextResponse.json({ error: 'Database not available' }, { status: 500 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const signature = searchParams.get('signature')
    const nftMint = searchParams.get('nft_mint')

    if (!signature && !nftMint) {
      return NextResponse.json({ 
        error: 'signature or nft_mint parameter required' 
      }, { status: 400 })
    }

    let mints
    if (signature) {
      mints = await sql`
        SELECT * FROM solana_nft_mints
        WHERE mint_tx_signature = ${signature}
      ` as any[]
    } else {
      mints = await sql`
        SELECT * FROM solana_nft_mints
        WHERE nft_mint_address = ${nftMint}
      ` as any[]
    }

    if (!mints.length) {
      return NextResponse.json({ 
        error: 'Mint not found',
      }, { status: 404 })
    }

    const mint = mints[0]

    return NextResponse.json({
      success: true,
      mint: {
        nftMint: mint.nft_mint_address,
        signature: mint.mint_tx_signature,
        status: mint.mint_status,
        confirmed: mint.mint_status === 'confirmed',
        confirmedAt: mint.confirmed_at,
        createdAt: mint.created_at,
      },
    })

  } catch (error: any) {
    console.error('[Check Mint Status] Error:', error)
    return NextResponse.json({ 
      error: error.message || 'Failed to check mint status',
    }, { status: 500 })
  }
}
