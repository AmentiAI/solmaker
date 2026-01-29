import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'

/**
 * POST /api/mint/pending-inscriptions - Get pending mint status for given ordinal IDs
 * Returns mints that are pending or confirmed (NOT failed/expired)
 */
export async function POST(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const body = await request.json()
    const { ordinal_ids } = body

    if (!ordinal_ids || !Array.isArray(ordinal_ids) || ordinal_ids.length === 0) {
      return NextResponse.json({ error: 'ordinal_ids array is required' }, { status: 400 })
    }

    const mints = await sql`
      SELECT
        mn.id,
        mn.ordinal_id,
        mn.session_id,
        mn.mint_address,
        mn.tx_signature,
        mn.mint_status,
        mn.error_message,
        mn.created_at,
        mn.confirmed_at
      FROM mint_nfts mn
      WHERE mn.ordinal_id = ANY(${ordinal_ids})
        AND mn.mint_status NOT IN ('failed', 'expired')
      ORDER BY mn.created_at DESC
    `

    return NextResponse.json({
      success: true,
      mints: Array.isArray(mints) ? mints : [],
    })
  } catch (error: any) {
    console.error('Error fetching pending mints:', error)
    return NextResponse.json({
      error: 'Failed to fetch pending mints',
      details: error.message
    }, { status: 500 })
  }
}
