import { NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { getConnection } from '@/lib/solana/connection'

/**
 * POST /api/cron/monitor-solana-mints
 * Background job to monitor pending Solana mint transactions
 * Should run every 30-60 seconds via cron
 */
export async function POST() {
  if (!sql) {
    return NextResponse.json({ error: 'Database not available' }, { status: 500 })
  }

  try {
    console.log('🔍 Monitoring pending Solana mints...')

    // Get all pending/confirming mints
    const pendingMints = await sql`
      SELECT * FROM solana_nft_mints
      WHERE mint_status IN ('confirming', 'broadcasting')
      AND mint_tx_signature IS NOT NULL
      AND created_at > NOW() - INTERVAL '10 minutes'
      ORDER BY created_at ASC
      LIMIT 100
    ` as any[]

    if (!pendingMints.length) {
      return NextResponse.json({ 
        success: true, 
        message: 'No pending mints to check',
        checked: 0,
      })
    }

    console.log(`📋 Checking ${pendingMints.length} pending mints...`)

    const connection = getConnection()
    let confirmed = 0
    let failed = 0
    let stillPending = 0

    for (const mint of pendingMints) {
      try {
        // Check transaction status
        const txStatus = await connection.getSignatureStatus(mint.mint_tx_signature)

        if (!txStatus || !txStatus.value) {
          // Transaction not found yet, still pending
          stillPending++
          continue
        }

        if (txStatus.value.confirmationStatus === 'confirmed' || 
            txStatus.value.confirmationStatus === 'finalized') {
          // Transaction confirmed!
          
          if (txStatus.value.err) {
            // Transaction failed
            await sql`
              UPDATE solana_nft_mints
              SET 
                mint_status = 'failed',
                error_message = ${JSON.stringify(txStatus.value.err)},
                updated_at = NOW()
              WHERE id = ${mint.id}::uuid
            `

            if (mint.session_id) {
              await sql`
                UPDATE mint_sessions
                SET status = 'failed'
                WHERE id = ${mint.session_id}::uuid
              `
            }

            failed++
            console.log(`❌ Mint failed: ${mint.nft_mint_address}`)
          } else {
            // Transaction succeeded!
            await sql`
              UPDATE solana_nft_mints
              SET 
                mint_status = 'confirmed',
                confirmed_at = NOW(),
                updated_at = NOW()
              WHERE id = ${mint.id}::uuid
            `

            if (mint.session_id) {
              await sql`
                UPDATE mint_sessions
                SET status = 'completed'
                WHERE id = ${mint.session_id}::uuid
              `
            }

            // Mark ordinal as minted
            if (mint.ordinal_id) {
              await sql`
                UPDATE generated_ordinals
                SET is_minted = true
                WHERE id = ${mint.ordinal_id}::uuid
              `
            }

            confirmed++
            console.log(`✅ Mint confirmed: ${mint.nft_mint_address}`)
          }
        } else {
          // Still processing
          stillPending++
        }

      } catch (error: any) {
        console.error(`Error checking mint ${mint.id}:`, error.message)
        
        // If mint is older than 5 minutes and we can't check it, mark as failed
        const ageMinutes = (Date.now() - new Date(mint.created_at).getTime()) / 1000 / 60
        if (ageMinutes > 5) {
          await sql`
            UPDATE solana_nft_mints
            SET 
              mint_status = 'failed',
              error_message = 'Transaction not found after 5 minutes',
              updated_at = NOW()
            WHERE id = ${mint.id}::uuid
          `
          failed++
        }
      }
    }

    // Check for stuck mints (older than 10 minutes and still pending)
    const stuckMints = await sql`
      SELECT * FROM solana_nft_mints
      WHERE mint_status IN ('confirming', 'broadcasting', 'awaiting_signature')
      AND created_at < NOW() - INTERVAL '10 minutes'
      LIMIT 50
    ` as any[]

    if (stuckMints.length > 0) {
      console.log(`⚠️ Found ${stuckMints.length} stuck mints`)
      
      for (const stuckMint of stuckMints) {
        await sql`
          UPDATE solana_nft_mints
          SET 
            mint_status = 'failed',
            error_message = 'Transaction timeout - no confirmation after 10 minutes',
            updated_at = NOW()
          WHERE id = ${stuckMint.id}::uuid
        `
      }
      
      failed += stuckMints.length
    }

    console.log(`✅ Monitor complete: ${confirmed} confirmed, ${failed} failed, ${stillPending} still pending`)

    return NextResponse.json({
      success: true,
      checked: pendingMints.length,
      confirmed,
      failed,
      stillPending,
      stuck: stuckMints.length,
    })

  } catch (error: any) {
    console.error('[Monitor Solana Mints] Error:', error)
    return NextResponse.json({ 
      error: error.message || 'Failed to monitor mints',
      details: error.toString()
    }, { status: 500 })
  }
}

/**
 * GET /api/cron/monitor-solana-mints
 * Manual trigger for testing
 */
export async function GET() {
  return POST()
}
