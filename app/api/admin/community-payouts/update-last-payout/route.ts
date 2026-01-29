import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { isAdmin } from '@/lib/auth/access-control'

/**
 * POST /api/admin/community-payouts/update-last-payout
 * Manually update the most recent payout's snapshot_taken_at to current timestamp
 * This is useful for fixing cases where the timestamp didn't update correctly
 */
export async function POST(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const adminWallet = searchParams.get('wallet_address')

    if (!adminWallet || !isAdmin(adminWallet)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // First, get the most recent payout ID
    const latestPayout = await sql`
      SELECT id, snapshot_taken_at, payout_tx_id, created_at
      FROM community_payouts
      ORDER BY snapshot_taken_at DESC, created_at DESC
      LIMIT 1
    ` as any[]
    
    if (!latestPayout || latestPayout.length === 0) {
      return NextResponse.json({ 
        error: 'No payout records found to update',
        success: false 
      }, { status: 404 })
    }
    
    const payoutId = latestPayout[0].id
    const oldTimestamp = latestPayout[0].snapshot_taken_at
    console.log(`📅 Current last payout timestamp: ${oldTimestamp}`)
    console.log(`   Payout ID: ${payoutId}`)
    
    // Update the most recent payout's snapshot_taken_at to current timestamp
    const updateResult = await sql`
      UPDATE community_payouts
      SET snapshot_taken_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${payoutId}
      RETURNING id, snapshot_taken_at, payout_tx_id, created_at
    ` as any[]

    if (!updateResult || updateResult.length === 0) {
      return NextResponse.json({ 
        error: 'No payout records found to update',
        success: false 
      }, { status: 404 })
    }

    const updatedRecord = updateResult[0]
    const timestamp = updatedRecord.snapshot_taken_at
    const timestampISO = timestamp instanceof Date 
      ? timestamp.toISOString() 
      : new Date(timestamp).toISOString()

    console.log(`✅ Updated last payout timestamp to: ${timestampISO}`)
    console.log(`   Payout ID: ${updatedRecord.id}`)
    console.log(`   Transaction ID: ${updatedRecord.payout_tx_id || 'N/A'}`)

    return NextResponse.json({
      success: true,
      message: 'Last payout timestamp updated successfully',
      payout_id: updatedRecord.id,
      snapshot_taken_at: timestampISO,
      payout_tx_id: updatedRecord.payout_tx_id,
      previous_created_at: updatedRecord.created_at,
    })
  } catch (error: any) {
    console.error('Error updating last payout timestamp:', error)
    return NextResponse.json({ 
      error: 'Failed to update last payout timestamp',
      details: error.message 
    }, { status: 500 })
  }
}

