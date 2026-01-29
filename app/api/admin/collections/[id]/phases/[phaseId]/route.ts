import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { checkAuthorizationServer } from '@/lib/auth/access-control'

/**
 * PATCH /api/admin/collections/[id]/phases/[phaseId] - Update a phase (admin only)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; phaseId: string }> }
) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const { id, phaseId } = await params
    const { searchParams } = new URL(request.url)
    const walletAddress = searchParams.get('wallet_address')

    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet address required' }, { status: 401 })
    }

    const authResult = await checkAuthorizationServer(request, sql)
    if (!authResult.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized. Admin access only.' }, { status: 403 })
    }

    const body = await request.json()
    const { updates } = body

    if (!updates || typeof updates !== 'object') {
      return NextResponse.json({ error: 'Updates object required' }, { status: 400 })
    }

    // Verify phase exists and belongs to collection
    const phaseCheck = await sql`
      SELECT id, collection_id FROM mint_phases WHERE id = ${phaseId} AND collection_id = ${id}
    ` as any[]

    if (!phaseCheck || phaseCheck.length === 0) {
      return NextResponse.json({ error: 'Phase not found' }, { status: 404 })
    }

    // If activating this phase, deactivate others first
    if (updates.is_active === true) {
      await sql`
        UPDATE mint_phases SET is_active = false WHERE collection_id = ${id}
      `
    }

    // Build dynamic update query
    const allowedFields = [
      'phase_name', 'start_time', 'end_time', 'mint_price_sats',
      'min_fee_rate', 'max_fee_rate', 'suggested_fee_rate',
      'max_per_wallet', 'max_per_transaction', 'phase_allocation',
      'whitelist_only', 'whitelist_id', 'end_on_allocation',
      'description', 'is_active', 'is_completed'
    ]

    // Build SQL update using COALESCE pattern
    await sql`
      UPDATE mint_phases SET
        phase_name = COALESCE(${updates.phase_name ?? null}, phase_name),
        start_time = COALESCE(${updates.start_time ?? null}, start_time),
        end_time = COALESCE(${updates.end_time ?? null}, end_time),
        mint_price_sats = COALESCE(${updates.mint_price_sats ?? null}, mint_price_sats),
        min_fee_rate = COALESCE(${updates.min_fee_rate ?? null}, min_fee_rate),
        max_fee_rate = COALESCE(${updates.max_fee_rate ?? null}, max_fee_rate),
        suggested_fee_rate = COALESCE(${updates.suggested_fee_rate ?? null}, suggested_fee_rate),
        max_per_wallet = COALESCE(${updates.max_per_wallet ?? null}, max_per_wallet),
        max_per_transaction = COALESCE(${updates.max_per_transaction ?? null}, max_per_transaction),
        phase_allocation = ${updates.phase_allocation !== undefined ? updates.phase_allocation : null},
        whitelist_only = COALESCE(${updates.whitelist_only ?? null}, whitelist_only),
        whitelist_id = ${updates.whitelist_id !== undefined ? updates.whitelist_id : null},
        end_on_allocation = COALESCE(${updates.end_on_allocation ?? null}, end_on_allocation),
        description = COALESCE(${updates.description ?? null}, description),
        is_active = COALESCE(${updates.is_active ?? null}, is_active),
        is_completed = COALESCE(${updates.is_completed ?? null}, is_completed),
        updated_at = NOW()
      WHERE id = ${phaseId}
    `

    return NextResponse.json({
      success: true,
      message: 'Phase updated successfully',
    })
  } catch (error: any) {
    console.error('Error updating phase:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update phase' },
      { status: 500 }
    )
  }
}
