import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { calculateWhitelistRemaining } from '@/lib/minting-utils'

/**
 * GET /api/launchpad/[collectionId]/whitelist-status - Check if wallet is whitelisted for a phase
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ collectionId: string }> }
) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const { collectionId } = await params
    
    // Validate UUID format to prevent database errors from invalid IDs
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!collectionId || !uuidRegex.test(collectionId)) {
      return NextResponse.json({ error: 'Invalid collection ID' }, { status: 400 })
    }
    
    const { searchParams } = new URL(request.url)
    const walletAddress = searchParams.get('wallet_address')
    const phaseId = searchParams.get('phase_id')

    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet address required' }, { status: 400 })
    }

    if (!phaseId) {
      return NextResponse.json({ error: 'Phase ID required' }, { status: 400 })
    }

    // Get the phase details - need max_per_wallet for whitelist phases
    const phaseResult = await sql`
      SELECT whitelist_id, whitelist_only, max_per_wallet
      FROM mint_phases
      WHERE id = ${phaseId} AND collection_id = ${collectionId}
    ` as any[]
    const phase = phaseResult?.[0] || null

    if (!phase) {
      return NextResponse.json({ error: 'Phase not found' }, { status: 404 })
    }

    // If not whitelist only, everyone is allowed
    if (!phase.whitelist_only) {
      return NextResponse.json({
        success: true,
        is_whitelisted: true,
        allocation: null,
        minted_count: 0,
        remaining_allocation: null,
      })
    }

    // If whitelist_only is true but no whitelist_id is set, that's a configuration error
    // In this case, we should NOT allow everyone - we should require whitelist
    if (!phase.whitelist_id) {
      return NextResponse.json({
        success: true,
        is_whitelisted: false,
        allocation: null,
        minted_count: 0,
        remaining_allocation: null,
        error: 'Phase is configured as whitelist-only but no whitelist is assigned',
      })
    }

    // Check if wallet is in the whitelist
    const entryResult = await sql`
      SELECT
        allocation,
        minted_count,
        notes
      FROM whitelist_entries
      WHERE whitelist_id = ${phase.whitelist_id}
      AND wallet_address = ${walletAddress}
    ` as any[]
    const entry = entryResult?.[0] || null

    if (!entry) {
      return NextResponse.json({
        success: true,
        is_whitelisted: false,
        allocation: null,
        minted_count: 0,
        remaining_allocation: null,
      })
    }

    // Use shared utility to calculate remaining - use phase's max_per_wallet, not whitelist allocation
    const remainingResult = await calculateWhitelistRemaining(
      walletAddress,
      collectionId,
      phaseId,
      phase.whitelist_id,
      phase.max_per_wallet
    )

    if (!remainingResult) {
      return NextResponse.json({
        success: true,
        is_whitelisted: false,
        allocation: null,
        minted_count: 0,
        remaining_allocation: null,
      })
    }

    const entryAny = entry as any

    return NextResponse.json({
      success: true,
      is_whitelisted: true,
      allocation: remainingResult.maxAllowed!,
      minted_count: remainingResult.mintedCount,
      remaining_allocation: remainingResult.remaining,
      notes: entryAny?.notes || null,
    })
  } catch (error) {
    console.error('Error checking whitelist status:', error)
    return NextResponse.json({ error: 'Failed to check whitelist status' }, { status: 500 })
  }
}
