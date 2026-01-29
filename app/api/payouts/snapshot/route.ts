import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'

/**
 * GET /api/payouts/snapshot
 * Get the user's payout data from the latest community payout snapshot
 * This ensures the numbers match exactly with the admin snapshot
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

    // Get user's profile to find their payment address (watching wallet)
    const profile = await sql`
      SELECT wallet_address, payment_address, opt_in
      FROM profiles
      WHERE wallet_address = ${walletAddress}
      LIMIT 1
    ` as any[]

    if (!profile || profile.length === 0) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    const userProfile = profile[0]
    const watchingWallet = userProfile.payment_address || userProfile.wallet_address

    // Get the latest community payout snapshot
    const latestPayout = await sql`
      SELECT 
        id,
        snapshot_taken_at,
        payout_tx_id,
        total_revenue_sats,
        payout_amount_sats,
        total_holders,
        total_supply,
        holders_data
      FROM community_payouts
      ORDER BY snapshot_taken_at DESC, created_at DESC
      LIMIT 1
    ` as any[]

    if (!latestPayout || latestPayout.length === 0) {
      // No snapshot yet - return empty data
      return NextResponse.json({
        success: true,
        has_snapshot: false,
        wallet_address: walletAddress,
        watching_wallet: watchingWallet,
        opt_in: userProfile.opt_in || false,
        message: 'No payout snapshot has been taken yet'
      })
    }

    const payout = latestPayout[0]
    const holdersData = payout.holders_data || {}
    const holders = holdersData.holders || []

    // Find the user's wallet in the snapshot
    // The snapshot stores holders by wallet_address (the address that holds ordmakers on Magic Eden)
    // The admin display shows the user's wallet_address with their payment_address (watching wallet)
    // We need to find the holder whose wallet_address matches the user's payment_address (watching wallet)
    // because that's the address that actually holds the ordmakers
    let userHolder = null
    
    // Priority: 1. payment_address (watching wallet) - this is the address that holds ordmakers
    //           2. wallet_address (fallback - in case they hold ordmakers directly)
    // The snapshot stores the wallet_address that holds ordmakers, which is typically the payment_address
    
    // First, try to find by payment_address (watching wallet) - this is the primary match
    // The snapshot's wallet_address field contains the address that holds ordmakers (usually the payment_address)
    if (watchingWallet) {
      userHolder = holders.find((h: any) => 
        h.wallet_address?.toLowerCase() === watchingWallet.toLowerCase()
      )
    }
    
    // If not found by payment_address, try wallet_address as fallback
    if (!userHolder) {
      userHolder = holders.find((h: any) => 
        h.wallet_address?.toLowerCase() === walletAddress.toLowerCase()
      )
    }
    
    // Debug logging to help diagnose mismatches
    if (userHolder) {
      console.log(`[Payout Snapshot] Found holder: wallet=${userHolder.wallet_address}, count=${userHolder.count}, requested_wallet=${walletAddress}, watching_wallet=${watchingWallet}`)
    } else {
      console.log(`[Payout Snapshot] Holder not found: requested_wallet=${walletAddress}, watching_wallet=${watchingWallet}, total_holders=${holders.length}`)
      // Log first few holders for debugging
      if (holders.length > 0) {
        console.log(`[Payout Snapshot] Sample holders:`, holders.slice(0, 3).map((h: any) => ({ wallet: h.wallet_address?.substring(0, 20), count: h.count })))
      }
    }

    if (!userHolder) {
      // User not in snapshot (not a holder at snapshot time)
      // Provide detailed message about what was searched
      const searchedWallets = [watchingWallet, walletAddress].filter(Boolean).map((w: string) => w.toLowerCase())
      const message = `Wallet not found in snapshot. Searched for: ${searchedWallets.join(', ')}. ` +
        `Snapshot contains ${holders.length} holders. ` +
        `If you believe this is an error, please verify your payment address matches the wallet that holds your ordmakers.`
      
      return NextResponse.json({
        success: true,
        has_snapshot: true,
        wallet_address: walletAddress,
        watching_wallet: watchingWallet,
        opt_in: userProfile.opt_in || false,
        in_snapshot: false,
        snapshot_data: {
          snapshot_taken_at: payout.snapshot_taken_at,
          total_revenue_sats: Number(payout.total_revenue_sats),
          payout_amount_sats: Number(payout.payout_amount_sats),
          total_holders: holdersData.total_holders || 0,
          total_ordmakers: holdersData.total_ordmakers || 0,
        },
        user_data: {
          ordmaker_count: 0,
          amount_sats: 0,
          share_percentage: 0,
        },
        message,
        debug_info: {
          searched_wallets: searchedWallets,
          total_holders_in_snapshot: holders.length,
          sample_holder_wallets: holders.slice(0, 3).map((h: any) => h.wallet_address?.toLowerCase() || 'N/A')
        }
      })
    }

    // User is in snapshot - use the pre-calculated amount from the snapshot
    // The snapshot already contains the correct amount_sats calculated by the admin
    // using TOTAL_SUPPLY = 168, so we should NOT recalculate it
    const userOrdmakerCount = userHolder.count || 0
    const userAmountSats = userHolder.amount_sats || 0 // Use pre-calculated amount from snapshot
    const totalOrdmakers = holdersData.total_ordmakers || 0
    
    // Calculate share percentage for display (using snapshot's total_ordmakers)
    const sharePercentage = totalOrdmakers > 0
      ? (userOrdmakerCount / totalOrdmakers) * 100
      : 0

    return NextResponse.json({
      success: true,
      has_snapshot: true,
      wallet_address: walletAddress,
      watching_wallet: watchingWallet,
      opt_in: userProfile.opt_in || false,
      in_snapshot: true,
      snapshot_data: {
        snapshot_taken_at: payout.snapshot_taken_at,
        payout_tx_id: payout.payout_tx_id,
        total_revenue_sats: Number(payout.total_revenue_sats),
        payout_amount_sats: Number(payout.payout_amount_sats),
        total_holders: holdersData.total_holders || 0,
        total_ordmakers: holdersData.total_ordmakers || 0,
      },
      user_data: {
        ordmaker_count: userOrdmakerCount,
        amount_sats: userAmountSats,
        share_percentage: sharePercentage,
      }
    })
  } catch (error: any) {
    console.error('Error fetching snapshot data:', error)
    return NextResponse.json({ 
      error: 'Failed to fetch snapshot data',
      details: error.message 
    }, { status: 500 })
  }
}
