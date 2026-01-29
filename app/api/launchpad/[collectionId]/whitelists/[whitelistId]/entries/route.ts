import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'

/**
 * GET /api/launchpad/[collectionId]/whitelists/[whitelistId]/entries - Get all entries for a whitelist
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ collectionId: string; whitelistId: string }> }
) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const { collectionId, whitelistId } = await params

    // Verify the whitelist belongs to this collection
    const whitelistResult = await sql`
      SELECT id FROM mint_phase_whitelists
      WHERE id = ${whitelistId} AND collection_id = ${collectionId}
    `

    if (!Array.isArray(whitelistResult) || whitelistResult.length === 0) {
      return NextResponse.json({ error: 'Whitelist not found' }, { status: 404 })
    }

    // Get all entries
    const entriesResult = await sql`
      SELECT
        wallet_address,
        allocation,
        notes,
        added_at
      FROM whitelist_entries
      WHERE whitelist_id = ${whitelistId}
      ORDER BY added_at DESC
    `
    const entries = Array.isArray(entriesResult) ? entriesResult : []

    return NextResponse.json({ success: true, entries })
  } catch (error) {
    console.error('Error fetching whitelist entries:', error)
    return NextResponse.json({ error: 'Failed to fetch whitelist entries' }, { status: 500 })
  }
}
