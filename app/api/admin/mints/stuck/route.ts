import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { isAdmin } from '@/lib/auth/access-control'

// Mempool API for checking transaction status
const MEMPOOL_API = process.env.MEMPOOL_API_URL || 'https://mempool.space/api'

/**
 * GET /api/admin/mints/stuck - Get stuck transactions and detection
 */
export async function GET(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const adminWallet = searchParams.get('wallet_address')
    const detect = searchParams.get('detect') === 'true' // Run detection

    if (!adminWallet || !isAdmin(adminWallet)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Get existing stuck transactions
    const stuckTransactions = await sql`
      SELECT 
        st.*,
        mi.minter_wallet,
        mi.receiving_wallet,
        mi.fee_rate as original_fee_rate,
        mi.total_cost_sats,
        mi.mint_status,
        mi.created_at as mint_created_at,
        c.name as collection_name
      FROM stuck_transactions st
      JOIN mint_inscriptions mi ON st.mint_inscription_id = mi.id
      LEFT JOIN collections c ON mi.collection_id = c.id
      ORDER BY st.detected_at DESC
    `

    // If detection is requested, scan for potentially stuck transactions
    let newlyDetected: any[] = []
    if (detect) {
      // Find inscriptions that have been in certain states too long
      const potentiallyStuck = await sql`
        SELECT 
          mi.id,
          mi.commit_tx_id,
          mi.reveal_tx_id,
          mi.mint_status,
          mi.fee_rate,
          mi.commit_broadcast_at,
          mi.reveal_broadcast_at,
          mi.created_at
        FROM mint_inscriptions mi
        WHERE mi.mint_status IN ('commit_broadcast', 'commit_confirming', 'reveal_broadcast', 'reveal_confirming')
        AND mi.stuck_since IS NULL
        AND (
          (mi.mint_status IN ('commit_broadcast', 'commit_confirming') 
           AND mi.commit_broadcast_at < NOW() - INTERVAL '30 minutes')
          OR
          (mi.mint_status IN ('reveal_broadcast', 'reveal_confirming') 
           AND mi.reveal_broadcast_at < NOW() - INTERVAL '30 minutes')
        )
      `

      const potentiallyStuckArray = (Array.isArray(potentiallyStuck) ? potentiallyStuck : []) as Record<string, any>[]
      for (const inscription of potentiallyStuckArray) {
        const txType = inscription.mint_status?.includes('commit') ? 'commit' : 'reveal'
        const txId = txType === 'commit' ? inscription.commit_tx_id : inscription.reveal_tx_id
        const broadcastAt = txType === 'commit' ? inscription.commit_broadcast_at : inscription.reveal_broadcast_at

        if (!txId) continue

        // Check transaction status on mempool
        let isConfirmed = false
        let currentFeeRate = inscription.fee_rate

        try {
          const mempoolResponse = await fetch(`${MEMPOOL_API}/tx/${txId}`)
          if (mempoolResponse.ok) {
            const txData = await mempoolResponse.json()
            isConfirmed = txData.status?.confirmed || false
            
            if (!isConfirmed) {
              // Calculate effective fee rate
              if (txData.fee && txData.weight) {
                currentFeeRate = (txData.fee / (txData.weight / 4)).toFixed(2)
              }
            }
          }
        } catch (e) {
          console.error('Error checking mempool:', e)
        }

        // If confirmed, update the inscription status
        if (isConfirmed) {
          if (txType === 'commit') {
            await sql`
              UPDATE mint_inscriptions
              SET commit_confirmed_at = CURRENT_TIMESTAMP, mint_status = 'commit_confirmed'
              WHERE id = ${inscription.id}
            `
          } else {
            await sql`
              UPDATE mint_inscriptions
              SET reveal_confirmed_at = CURRENT_TIMESTAMP, mint_status = 'reveal_confirmed'
              WHERE id = ${inscription.id}
            `
          }
          continue
        }

        // If not confirmed after 30+ minutes, mark as stuck
        const minutesStuck = Math.round((Date.now() - new Date(broadcastAt).getTime()) / 60000)

        // Get recommended fee rate
        let recommendedFeeRate = currentFeeRate
        try {
          const feesResponse = await fetch(`${MEMPOOL_API}/v1/fees/recommended`)
          if (feesResponse.ok) {
            const fees = await feesResponse.json()
            recommendedFeeRate = fees.fastestFee || fees.halfHourFee || currentFeeRate
          }
        } catch (e) {
          console.error('Error fetching recommended fees:', e)
        }

        // Create stuck transaction record
        const stuckRecordResult = await sql`
          INSERT INTO stuck_transactions (
            mint_inscription_id,
            tx_type,
            tx_id,
            stuck_duration_minutes,
            current_fee_rate,
            recommended_fee_rate
          )
          VALUES (
            ${inscription.id},
            ${txType},
            ${txId},
            ${minutesStuck},
            ${currentFeeRate},
            ${recommendedFeeRate}
          )
          ON CONFLICT DO NOTHING
          RETURNING *
        `
        const stuckRecord = Array.isArray(stuckRecordResult) ? stuckRecordResult[0] : null

        if (stuckRecord) {
          // Update mint inscription
          await sql`
            UPDATE mint_inscriptions
            SET mint_status = 'stuck', stuck_since = CURRENT_TIMESTAMP
            WHERE id = ${inscription.id}
          `

          newlyDetected.push({
            ...(stuckRecord as Record<string, any>),
            minter_wallet: inscription.minter_wallet,
          })
        }
      }

      // Log detection activity
      if (newlyDetected.length > 0) {
        await sql`
          INSERT INTO mint_activity_log (
            actor_wallet,
            actor_type,
            action_type,
            action_data,
            success
          ) VALUES (
            ${adminWallet},
            'admin',
            'stuck_detection_run',
            ${JSON.stringify({ newly_detected: newlyDetected.length })}::jsonb,
            true
          )
        `
      }
    }

    // Get summary stats
    const statsResult = await sql`
      SELECT
        COUNT(*) as total_stuck,
        COUNT(*) FILTER (WHERE resolution_status = 'detected') as pending_resolution,
        COUNT(*) FILTER (WHERE resolution_status = 'rbf_sent') as rbf_pending,
        COUNT(*) FILTER (WHERE resolution_status = 'cpfp_sent') as cpfp_pending,
        COUNT(*) FILTER (WHERE resolution_status = 'resolved') as resolved,
        COUNT(*) FILTER (WHERE resolution_status = 'abandoned') as abandoned,
        AVG(stuck_duration_minutes) as avg_stuck_duration
      FROM stuck_transactions
    `
    const stats = Array.isArray(statsResult) ? statsResult[0] : statsResult
    const statsData = stats as Record<string, any>

    return NextResponse.json({
      success: true,
      stuck_transactions: stuckTransactions,
      newly_detected: newlyDetected,
      stats: {
        total_stuck: parseInt(statsData?.total_stuck) || 0,
        pending_resolution: parseInt(statsData?.pending_resolution) || 0,
        rbf_pending: parseInt(statsData?.rbf_pending) || 0,
        cpfp_pending: parseInt(statsData?.cpfp_pending) || 0,
        resolved: parseInt(statsData?.resolved) || 0,
        abandoned: parseInt(statsData?.abandoned) || 0,
        avg_stuck_duration: Math.round(parseFloat(statsData?.avg_stuck_duration) || 0),
      },
    })
  } catch (error) {
    console.error('Error fetching stuck transactions:', error)
    return NextResponse.json({ error: 'Failed to fetch stuck transactions' }, { status: 500 })
  }
}

/**
 * POST /api/admin/mints/stuck - Take action on stuck transactions
 */
export async function POST(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const body = await request.json()
    const { admin_wallet, stuck_tx_id, action, new_fee_rate, admin_notes } = body

    if (!admin_wallet || !isAuthorized(admin_wallet)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    if (!stuck_tx_id || !action) {
      return NextResponse.json({ error: 'stuck_tx_id and action are required' }, { status: 400 })
    }

    // Get stuck transaction
    const stuckTxResult = await sql`
      SELECT st.*, mi.reveal_data, mi.minter_wallet
      FROM stuck_transactions st
      JOIN mint_inscriptions mi ON st.mint_inscription_id = mi.id
      WHERE st.id = ${stuck_tx_id}
    `
    const stuckTx = (Array.isArray(stuckTxResult) ? stuckTxResult[0] : null) as Record<string, any> | null

    if (!stuckTx) {
      return NextResponse.json({ error: 'Stuck transaction not found' }, { status: 404 })
    }

    let updatedStuckTx
    let actionType = ''

    switch (action) {
      case 'mark_resolved':
        updatedStuckTx = await sql`
          UPDATE stuck_transactions
          SET 
            resolution_status = 'resolved',
            resolved_at = CURRENT_TIMESTAMP,
            resolved_by = ${admin_wallet},
            admin_notes = ${admin_notes}
          WHERE id = ${stuck_tx_id}
          RETURNING *
        `
        
        // Update mint inscription
        await sql`
          UPDATE mint_inscriptions
          SET mint_status = 'completed', stuck_since = NULL
          WHERE id = ${stuckTx.mint_inscription_id}
        `
        actionType = 'stuck_marked_resolved'
        break

      case 'abandon':
        updatedStuckTx = await sql`
          UPDATE stuck_transactions
          SET 
            resolution_status = 'abandoned',
            resolved_at = CURRENT_TIMESTAMP,
            resolved_by = ${admin_wallet},
            admin_notes = ${admin_notes || 'Abandoned by admin'}
          WHERE id = ${stuck_tx_id}
          RETURNING *
        `
        
        // Update mint inscription
        await sql`
          UPDATE mint_inscriptions
          SET 
            mint_status = 'failed',
            stuck_since = NULL,
            error_message = 'Transaction abandoned - stuck too long'
          WHERE id = ${stuckTx.mint_inscription_id}
        `
        actionType = 'stuck_abandoned'
        break

      case 'request_rbf':
        // Mark as RBF requested (actual RBF would need PSBT signed by user)
        updatedStuckTx = await sql`
          UPDATE stuck_transactions
          SET 
            resolution_status = 'rbf_sent',
            recommended_fee_rate = ${new_fee_rate || stuckTx.recommended_fee_rate},
            admin_notes = ${admin_notes || 'RBF requested'}
          WHERE id = ${stuck_tx_id}
          RETURNING *
        `
        actionType = 'rbf_requested'
        break

      case 'request_cpfp':
        // Mark as CPFP requested
        updatedStuckTx = await sql`
          UPDATE stuck_transactions
          SET 
            resolution_status = 'cpfp_sent',
            recommended_fee_rate = ${new_fee_rate || stuckTx.recommended_fee_rate},
            admin_notes = ${admin_notes || 'CPFP requested'}
          WHERE id = ${stuck_tx_id}
          RETURNING *
        `
        actionType = 'cpfp_requested'
        break

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    // Log activity
    await sql`
      INSERT INTO mint_activity_log (
        mint_inscription_id,
        actor_wallet,
        actor_type,
        action_type,
        action_data,
        success
      ) VALUES (
        ${stuckTx.mint_inscription_id},
        ${admin_wallet},
        'admin',
        ${actionType},
        ${JSON.stringify({ 
          stuck_tx_id, 
          action, 
          tx_id: stuckTx.tx_id,
          new_fee_rate 
        })}::jsonb,
        true
      )
    `

    return NextResponse.json({
      success: true,
      stuck_transaction: Array.isArray(updatedStuckTx) ? updatedStuckTx[0] : updatedStuckTx,
      message: `Action '${action}' completed successfully`,
    })
  } catch (error) {
    console.error('Error handling stuck transaction:', error)
    return NextResponse.json({ error: 'Failed to handle stuck transaction' }, { status: 500 })
  }
}

