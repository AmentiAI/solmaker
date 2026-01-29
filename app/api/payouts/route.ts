import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'

/**
 * GET /api/payouts
 * Get payout history for the authenticated user's wallet address
 */
export async function GET(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const walletAddress = searchParams.get('wallet_address')

    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 })
    }

    // Fetch all payouts for this wallet address
    // Only show payouts that have a corresponding community_payouts record
    const payouts = await sql`
      SELECT 
        up.id,
        up.wallet_address,
        up.payout_tx_id,
        up.amount_sats,
        up.ordmaker_count,
        up.share_percentage,
        up.created_at,
        cp.total_revenue_sats,
        cp.payout_amount_sats as total_payout_amount_sats,
        cp.payout_tx_id as community_payout_tx_id
      FROM user_payouts up
      INNER JOIN community_payouts cp ON up.community_payout_id = cp.id
      WHERE up.wallet_address = ${walletAddress}
      ORDER BY up.created_at DESC
    ` as any[]

    // Filter out test transactions by verifying they exist on mempool.space
    // Test transactions (not broadcasted) won't exist on mempool.space
    // Check all transactions in parallel for better performance
    const verificationPromises = payouts.map(async (payout: any) => {
      const txId = payout.community_payout_tx_id || payout.payout_tx_id
      if (!txId) return null
      
      try {
        // Check if transaction exists on mempool.space
        const checkResponse = await fetch(`https://mempool.space/api/tx/${txId}`, {
          signal: AbortSignal.timeout(3000),
        })
        
        // If transaction exists (200 OK), it was broadcasted - include it
        if (checkResponse.ok) {
          return payout
        } else {
          // Transaction doesn't exist - it's a test transaction, skip it
          console.log(`Skipping test transaction ${txId} (not found on mempool.space)`)
          return null
        }
      } catch (error) {
        // If check fails, assume it's a test transaction and skip it
        console.log(`Skipping transaction ${txId} (verification failed)`)
        return null
      }
    })
    
    const verificationResults = await Promise.all(verificationPromises)
    const verifiedPayouts = verificationResults.filter((p): p is any => p !== null)

    // Format the response
    const formattedPayouts = verifiedPayouts.map((payout: any) => ({
      id: payout.id,
      wallet_address: payout.wallet_address,
      tx_id: payout.payout_tx_id,
      amount_sats: Number(payout.amount_sats),
      ordmaker_count: payout.ordmaker_count,
      share_percentage: parseFloat(payout.share_percentage),
      created_at: payout.created_at,
      total_revenue_sats: payout.total_revenue_sats ? Number(payout.total_revenue_sats) : null,
      total_payout_amount_sats: payout.total_payout_amount_sats ? Number(payout.total_payout_amount_sats) : null,
    }))

    // Calculate totals
    const totalReceived = formattedPayouts.reduce((sum, p) => sum + p.amount_sats, 0)
    const totalPayouts = formattedPayouts.length

    return NextResponse.json({
      success: true,
      payouts: formattedPayouts,
      total_received_sats: totalReceived,
      total_payouts: totalPayouts,
    })
  } catch (error: any) {
    console.error('Error fetching payouts:', error)
    return NextResponse.json({ 
      error: 'Failed to fetch payouts',
      details: error.message 
    }, { status: 500 })
  }
}

