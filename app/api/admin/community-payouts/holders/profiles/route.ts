import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { isAdmin } from '@/lib/auth/access-control'

/**
 * POST /api/admin/community-payouts/holders/profiles
 * Fetch profiles (including paymentAddress) for multiple wallet addresses
 */
export async function POST(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const body = await request.json()
    const { wallet_address, holder_addresses } = body

    if (!wallet_address || !isAdmin(wallet_address)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    if (!Array.isArray(holder_addresses) || holder_addresses.length === 0) {
      return NextResponse.json({ 
        error: 'holder_addresses array is required',
        profiles: []
      }, { status: 400 })
    }

    // Fetch profiles for all holder addresses
    const profiles = await sql`
      SELECT wallet_address, payment_address, opt_in
      FROM profiles
      WHERE wallet_address = ANY(${holder_addresses})
    ` as any[]

    return NextResponse.json({
      success: true,
      profiles: profiles.map((p: any) => ({
        wallet_address: p.wallet_address,
        payment_address: p.payment_address || null,
        opt_in: p.opt_in || false,
      })),
      count: profiles.length,
    })
  } catch (error: any) {
    console.error('Error fetching holder profiles:', error)
    return NextResponse.json({ 
      error: 'Failed to fetch holder profiles',
      details: error.message,
      profiles: []
    }, { status: 500 })
  }
}

